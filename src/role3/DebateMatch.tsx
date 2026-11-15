import React, { useEffect, useRef, useState } from "react";
import { AppState, Platform, Text, View } from "react-native";
import type { DebateSession, DebateStage } from "../../shared/debate.mjs";
import { C, T, ErrorNote, Field } from "../components/ui";
import AudioInput, { type RecordedAudio } from "../components/AudioInput";
import { PrivateRecordingPlayback } from "../components/PrivateRecording";
import { RecordingConsent } from "../components/RecordingConsent";
import { LayeredAvatar } from "../avatar/LayeredAvatar";
import type { AvatarSelection } from "../avatar/pack";
import { api, ApiError, deleteDraft, isDraftOwner, loadDraft, saveDraft, uploadAudio } from "../lib/api";
import { useApp } from "../lib/state";
import { Action, R, errorMessage, requestId } from "./common";
import { SoftTownBackdrop, TurnProgress, VoiceMark } from "./DebateVisuals";
import { debateApi, type DebateCatalog } from "./debate-api";
import { opponentLook } from "./DebateStreet";

function TurnTimer({ seconds }: { seconds: number }) {
  const [remaining, setRemaining] = useState(seconds); const [running, setRunning] = useState(false);
  useEffect(() => {
    const stop = () => setRunning(false);
    const subscription = AppState.addEventListener("change", next => { if (next !== "active") stop(); });
    const hidden = () => { if (document.hidden) stop(); };
    if (Platform.OS === "web") document.addEventListener("visibilitychange", hidden);
    return () => { subscription.remove(); if (Platform.OS === "web") document.removeEventListener("visibilitychange", hidden); };
  }, []);
  useEffect(() => {
    if (!running || remaining <= 0) return;
    const timer = setInterval(() => setRemaining(value => Math.max(0, value - 1)), 1000);
    return () => clearInterval(timer);
  }, [running, remaining]);
  return <View style={{ gap: 5, alignItems: "center" }}>
    <Text style={[T.title, { fontSize: 28 }]} accessibilityLabel={`${remaining} seconds remaining`}>{Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, "0")}</Text>
    <Action label={remaining === 0 ? "Reset timer" : running ? "Pause timer" : "Start timer"} onPress={() => { if (!remaining) { setRemaining(seconds); setRunning(false); } else setRunning(!running); }} />
    {!remaining && <Text style={[T.small, { textAlign: "center" }]}>Take your time. Submit when ready.</Text>}
  </View>;
}

export function DebateMatch({ session, selection, catalog, onSession, onFinish, onRecover, busy: parentBusy, error: parentError }: {
  session: DebateSession; selection: AvatarSelection; catalog: DebateCatalog; onSession: (session: DebateSession) => void;
  onFinish: () => void; onRecover: () => void; busy: boolean; error: string;
}) {
  const { state, refresh } = useApp(); const owner = state?.profile.id ?? "guest";
  const [text, setText] = useState(""); const [audioId, setAudioId] = useState("");
  const [input, setInput] = useState<"write" | "record">("write");
  const [allowed, setAllowed] = useState(!!state?.profile.consent?.recording);
  const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const [note, setNote] = useState("");
  const [hydrated, setHydrated] = useState(false); const [captureActive, setCaptureActive] = useState(false);
  const [prepared, setPrepared] = useState(session.stage !== "opening" || session.turns.length > 0);
  const [pending, setPending] = useState(false);
  const [showEarlier, setShowEarlier] = useState(false);
  const [arenaWidth, setArenaWidth] = useState(350);
  const lock = useRef(false);
  const submission = useRef<{ requestId: string; stage: DebateStage; text: string; audioId?: string } | null>(null);
  const draftKey = `debate-turn-${session.id}-${session.stage}`;
  const stage = catalog.stages.find(entry => entry.id === session.stage);
  const waiting = session.status === "awaiting_reply";
  const readyToJudge = session.status === "ready_to_judge";
  const working = busy || parentBusy;
  useEffect(() => {
    let live = true;
    void loadDraft(draftKey).then(raw => {
      if (!live || !isDraftOwner(owner)) return;
      if (raw) { try { const value = JSON.parse(raw); if (typeof value.text === "string") setText(value.text.slice(0, 6000)); if (typeof value.audioId === "string") setAudioId(value.audioId); if (value.prepared || value.text || value.audioId) setPrepared(true); } catch { /* A corrupt draft never replaces the saved match. */ } }
    }).catch(() => { if (live) setNote("The local draft could not be restored. Your submitted turns are still saved."); }).finally(() => { if (live) setHydrated(true); });
    return () => { live = false; };
  }, [draftKey, owner]);
  useEffect(() => {
    if (!hydrated || session.status !== "ready" || !isDraftOwner(owner)) return;
    const timer = setTimeout(() => { void saveDraft(draftKey, JSON.stringify({ text, audioId, prepared })).catch(() => undefined); }, 350);
    return () => clearTimeout(timer);
  }, [text, audioId, prepared, hydrated, draftKey, owner, session.status]);
  async function allowRecording() {
    if (lock.current) return; lock.current = true; setBusy(true); setError("");
    try { await api("/me", { method: "PATCH", body: { consent: { recording: true } } }); if (isDraftOwner(owner)) { setAllowed(true); await refresh(); } }
    catch (cause) { if (isDraftOwner(owner)) setError(errorMessage(cause)); }
    finally { lock.current = false; if (isDraftOwner(owner)) setBusy(false); }
  }
  async function transcribe(id: string) {
    const result = await api<{ text: string; requiresManualTranscription?: boolean; message?: string }>(`/audio/${encodeURIComponent(id)}/transcribe`, { method: "POST", body: {} });
    if (!isDraftOwner(owner)) return;
    if (result.text) setText(result.text);
    setNote(result.requiresManualTranscription ? "Your recording is saved. Transcription is unavailable here; type what you said before submitting." : "Review the transcript before submitting your turn.");
  }
  async function recorded(audio: RecordedAudio) {
    if (lock.current) return; lock.current = true; setBusy(true); setError("");
    try { const media = await uploadAudio(audio.uri, audio.mime); if (!isDraftOwner(owner)) return; setAudioId(media.id); setInput("write"); await transcribe(media.id); }
    catch (cause) { if (isDraftOwner(owner)) setError(errorMessage(cause)); }
    finally { lock.current = false; if (isDraftOwner(owner)) setBusy(false); }
  }
  async function retryTranscript() {
    if (lock.current) return; lock.current = true; setBusy(true); setError("");
    try { await transcribe(audioId); } catch (cause) { if (isDraftOwner(owner)) setError(errorMessage(cause)); }
    finally { lock.current = false; if (isDraftOwner(owner)) setBusy(false); }
  }
  async function submit() {
    if (lock.current || !stage || !text.trim()) return;
    lock.current = true; setBusy(true); setError(""); setPending(true);
    const payload = submission.current ?? { requestId: requestId(), stage: stage.id, text: text.trim(), ...(audioId ? { audioId } : {}) };
    submission.current = payload;
    try {
      const next = await debateApi.turn(session.id, payload);
      if (!isDraftOwner(owner)) return;
      await deleteDraft(draftKey).catch(() => undefined); onSession(next);
    } catch (cause) {
      if (!isDraftOwner(owner)) return;
      setError(errorMessage(cause));
      if (cause instanceof ApiError && cause.status === 400) { submission.current = null; setPending(false); }
      try { const saved = await debateApi.session(session.id); if (isDraftOwner(owner) && (saved.status !== "ready" || saved.stage !== session.stage)) onSession(saved); } catch { /* Retry keeps the same submission key and recording. */ }
    } finally { lock.current = false; if (isDraftOwner(owner)) setBusy(false); }
  }
  const userTurns = session.turns.filter(turn => turn.speaker === "user").length;
  const aiTurns = session.turns.filter(turn => turn.speaker === "ai");
  const latestReply = aiTurns[aiTurns.length - 1];
  return <View style={{ gap: 14 }} testID="debate-match">
    <View onLayout={event => setArenaWidth(event.nativeEvent.layout.width)} style={[R.card, { padding: arenaWidth < 500 ? 14 : 24, overflow: "hidden", gap: 20 }]} testID="debate-arena">
      <SoftTownBackdrop />
      <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
        <View style={{ flex: 1, gap: 6 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 5, height: 62 }}>
            <LayeredAvatar selection={selection} variant="chibi" animation={captureActive ? "speak" : "idle"} scale={0.2} />
            <View style={{ flex: 1, minWidth: 0 }}><Text style={[T.h3, { fontSize: 13 }]}>You</Text><Text style={[T.small, { fontSize: 10 }]}>Lv. {state?.gamification?.level || 1}</Text></View>
          </View>
          <TurnProgress value={userTurns} label="Your completed turns" />
        </View>
        <View style={{ alignItems: "center", gap: 5, paddingTop: 8 }}>
          <Text style={[T.small, { fontFamily: "DMBold", color: C.ink, backgroundColor: "#EDE3D8", borderRadius: 12, paddingHorizontal: 10, paddingVertical: 5 }]}>Turn {Math.min(userTurns + 1, 3)} / 3</Text>
          <Text style={[T.small, { fontSize: 10 }]}>{session.mode === "tournament" ? session.opponent.boss ? "Final · Match 3" : `Cup match ${session.round}` : "Practice"}</Text>
        </View>
        <View style={{ flex: 1, gap: 6 }}>
          <View style={{ flexDirection: "row-reverse", alignItems: "center", gap: 5, height: 62 }}>
            <LayeredAvatar selection={opponentLook(session.opponent)} variant="chibi" animation={working ? "speak" : "idle"} facing="left" scale={0.2} />
            <View style={{ flex: 1, minWidth: 0 }}><Text numberOfLines={2} style={[T.h3, { textAlign: "right", fontSize: 12, lineHeight: 16 }]}>{session.opponent.name}</Text><Text style={[T.small, { textAlign: "right", fontSize: 9 }]}>{session.opponent.difficulty}</Text></View>
          </View>
          <TurnProgress value={aiTurns.length} label="Opponent completed turns" />
        </View>
      </View>
      <View style={{ alignItems: "center", gap: 0 }}>
        <Text style={[T.small, { fontFamily: "DMBold", color: "#FFFFFF", backgroundColor: "#6F5C4C", paddingHorizontal: 20, paddingVertical: 4, borderRadius: 12, zIndex: 1 }]}>Topic</Text>
        <View style={{ backgroundColor: "rgba(245,237,227,0.96)", borderRadius: 14, padding: 16, marginTop: -4, width: "100%", gap: 5 }}>
          <Text accessibilityRole="header" style={[T.h3, { textAlign: "center", fontSize: 17 }]}>{session.topic.title}</Text>
          <Text style={[T.small, { textAlign: "center", fontSize: 11 }]}>Your stance · {session.position === "for" ? "For" : "Against"}</Text>
        </View>
      </View>
      {stage && !prepared ? <View style={[R.smallCard, { gap: 12 }]} testID="debate-preparation">
        <Text style={T.h2}>Prepare your opening</Text><Text style={T.body}>One claim. One reason. One example.</Text>
        <Text style={T.small}>{session.topic.context}</Text><Action label="Start opening" primary onPress={() => setPrepared(true)} testID="start-debate-opening" />
      </View> : <View style={{ flexDirection: "row", gap: 10, alignItems: "stretch" }}>
        <View style={[R.smallCard, { flex: 1, padding: 12, alignItems: "center", gap: 9, backgroundColor: "rgba(255,252,248,0.96)" }]}>
          <Text accessibilityRole="header" style={[T.h3, { fontSize: 14, textAlign: "center" }]}>{waiting || working ? "Your turn is saved" : readyToJudge ? "All turns complete" : `Your turn · ${stage?.label}`}</Text>
          {stage && !waiting && !readyToJudge && <TurnTimer seconds={stage.seconds} />}
          <VoiceMark active={captureActive} />
          {stage && !waiting && !readyToJudge && <Action label="Speak" icon="mic" primary selected={input === "record"} disabled={working || captureActive || pending || !!audioId} onPress={() => setInput("record")} style={{ minWidth: 104, borderRadius: 24 }} />}
          <Text style={[T.small, { textAlign: "center", fontSize: 10 }]}>{captureActive ? "Recording your voice" : readyToJudge ? "Ready for feedback" : "Timer is optional"}</Text>
        </View>
        <View style={[R.smallCard, { flex: 1, padding: 12, justifyContent: "center", backgroundColor: "rgba(255,252,248,0.96)" }]}>
          <Text style={[T.h3, { fontSize: 14, textAlign: "center" }]}>{session.opponent.name}</Text>
          <Text selectable style={[T.body, { fontSize: arenaWidth < 500 ? 12 : 15, lineHeight: arenaWidth < 500 ? 19 : 24, textAlign: latestReply ? "left" : "center" }]}>{working ? "Preparing a response…" : latestReply?.text || "Share your opening. I’ll respond to your argument."}</Text>
          {!latestReply && <Text accessible={false} style={{ textAlign: "center", color: "#A18B77", letterSpacing: 8 }}>• • •</Text>}
        </View>
      </View>}
      <Text style={[T.small, { textAlign: "center", fontSize: 11 }]}>{session.providerLabel} · Bars show completed turns.</Text>
    </View>
    <ErrorNote message={error || parentError} />
    {waiting ? <View style={R.card}><Text style={T.h3}>Your turn is saved</Text><Text style={T.body}>{session.recovery?.message || "The opponent’s reply needs another try. Your match has not been lost."}</Text><Action label="Retry opponent reply" primary busy={working} onPress={onRecover} /></View>
      : readyToJudge ? <View style={R.card}><Text style={T.h3}>Ready for your result</Text><Text style={T.small}>{session.providerMode === "local" ? "Get an unscored reflection on your practice." : "A separate judge reviews both sides using the same six criteria."}</Text><Action label={session.providerMode === "local" ? "Get practice reflection" : "Evaluate match"} primary busy={working} onPress={onFinish} testID="finish-debate" /></View>
        : stage && prepared && <View style={[R.card, { gap: 12 }]}>
          <View style={[R.row, { justifyContent: "space-between" }]}><Text style={T.h3}>{input === "record" ? "Your spoken argument" : "Put your case into words"}</Text><Action label="Write" selected={input === "write"} disabled={working || captureActive || pending} onPress={() => setInput("write")} /></View>
          <Text style={T.small}>{stage.instruction}</Text>
          {input === "record" && !audioId ? allowed ? <AudioInput appearance="daily" onRecorded={recorded} onCancel={() => setInput("write")} onCaptureActive={setCaptureActive} busy={working} reviewActionLabel="Save and transcribe" /> : <RecordingConsent busy={working} onAllow={() => void allowRecording()} onWrite={() => setInput("write")} /> : <>
            {!!audioId && <><PrivateRecordingPlayback id={audioId} /><Action label="Retry transcription" disabled={working || pending} onPress={() => void retryTranscript()} /><Text style={T.small}>Manage private recordings and retention in Settings.</Text></>}
            {!!note && <Text accessibilityLiveRegion="polite" style={T.small}>{note}</Text>}
            <Field label={audioId ? "Review your transcript" : "Your argument"} value={text} onChangeText={value => { setText(value); setError(""); }} multiline maxLength={6000} editable={hydrated && !working && !pending} placeholder="Make a point, explain why, and add an example." />
            <Text style={T.small}>{text.length} / 6,000 characters</Text>
            {pending && !working && <Text style={T.small}>Retry sends the same saved turn once. Your text and recording are kept.</Text>}
            <Action label={pending ? "Retry submission" : `Submit ${stage.label.toLowerCase()}`} primary busy={working} disabled={!hydrated || !text.trim()} onPress={() => void submit()} testID="submit-debate-turn" />
          </>}
        </View>}
    {!!session.turns.length && <Action label={showEarlier ? "Hide earlier turns" : "Earlier turns"} selected={showEarlier} onPress={() => setShowEarlier(!showEarlier)} />}
    {showEarlier && session.turns.map(turn => <View key={turn.id} style={R.smallCard}><Text style={T.label}>{turn.speaker === "user" ? "You" : session.opponent.name} · {turn.stage}</Text><Text selectable style={T.body}>{turn.text}</Text>{!!turn.audioId && <PrivateRecordingPlayback id={turn.audioId} playLabel="Play this spoken turn" />}</View>)}
  </View>;
}
