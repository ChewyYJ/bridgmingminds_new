import React, { useCallback, useEffect, useRef, useState } from "react";
import { AppState, BackHandler, Platform, Text, View } from "react-native";
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
import { DebateSteps, JudgingLabel } from "./DebateVisuals";
import { debateApi, type DebateCatalog } from "./debate-api";
import { opponentLook } from "./DebateStreet";

type PendingTurn = { requestId: string; stage: DebateStage; text: string; audioId?: string };

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
  return <View style={{ gap: 7 }}>
    <Action label={`${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, "0")} · ${remaining === 0 ? "Reset timer" : running ? "Pause timer" : "Optional timer"}`} icon="clock" onPress={() => { if (!remaining) { setRemaining(seconds); setRunning(false); } else setRunning(!running); }} />
    {(!remaining || running) && <Text style={[T.small, { fontSize: 12 }]}>For your pace only. No time penalty.</Text>}
  </View>;
}

export function DebateMatch({ session, selection, catalog, onSession, onFinish, onRecover, onLeave, busy: parentBusy, error: parentError }: {
  session: DebateSession; selection: AvatarSelection; catalog: DebateCatalog; onSession: (session: DebateSession) => void;
  onFinish: () => void; onRecover: () => void; onLeave: () => void; busy: boolean; error: string;
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
  const [saveState, setSaveState] = useState<"saving" | "saved" | "error">("saving");
  const [savedValue, setSavedValue] = useState("");
  const [submissionSnapshot, setSubmissionSnapshot] = useState<PendingTurn | null>(null);
  const lock = useRef(false);
  const submission = useRef<PendingTurn | null>(null);
  const draftQueue = useRef<Promise<void>>(Promise.resolve());
  const submitted = useRef(false); const live = useRef(true); const savedSnapshot = useRef("");
  const upload = useRef<{ uri: string; id: string } | null>(null);
  const draftKey = `debate-turn-${session.id}-${session.stage}`;
  const stage = catalog.stages.find(entry => entry.id === session.stage);
  const waiting = session.status === "awaiting_reply";
  const readyToJudge = session.status === "ready_to_judge";
  const working = busy || parentBusy;
  const snapshot = JSON.stringify({ text, audioId, prepared, submission: submissionSnapshot });
  const latestSnapshot = useRef(snapshot);
  useEffect(() => { latestSnapshot.current = snapshot; }, [snapshot]);
  const saveSnapshot = useCallback((value: string) => {
    draftQueue.current = draftQueue.current.catch(() => undefined).then(async () => {
      if (!isDraftOwner(owner)) throw new Error("This account changed. Your draft was not moved to another account.");
      await saveDraft(draftKey, value);
      savedSnapshot.current = value;
    });
    return draftQueue.current;
  }, [draftKey, owner]);
  useEffect(() => { live.current = true; return () => { live.current = false; }; }, []);
  useEffect(() => {
    let live = true;
    void loadDraft(draftKey).then(raw => {
      if (!live || !isDraftOwner(owner)) return;
      if (raw) { try { const value = JSON.parse(raw); if (typeof value.text === "string") setText(value.text.slice(0, 6000)); if (typeof value.audioId === "string") setAudioId(value.audioId); if (value.prepared || value.text || value.audioId) setPrepared(true);
        if (value.submission?.stage === session.stage && typeof value.submission.requestId === "string" && typeof value.submission.text === "string") { submission.current = value.submission; setSubmissionSnapshot(value.submission); setPending(true); }
      } catch { /* A corrupt draft never replaces the saved match. */ } }
    }).catch(() => { if (live) setNote("The local draft could not be restored. Your submitted turns are still saved."); }).finally(() => { if (live) setHydrated(true); });
    return () => { live = false; };
  }, [draftKey, owner, session.stage]);
  useEffect(() => {
    if (!hydrated || session.status !== "ready" || !isDraftOwner(owner)) return;
    const value = snapshot;
    const timer = setTimeout(() => {
      if (submitted.current) return;
      setSaveState("saving");
      void saveSnapshot(value).then(() => { if (live.current && isDraftOwner(owner) && latestSnapshot.current === value) { setSavedValue(value); setSaveState("saved"); } })
        .catch(() => { if (live.current && isDraftOwner(owner)) setSaveState("error"); });
    }, 250);
    return () => clearTimeout(timer);
  }, [snapshot, hydrated, owner, session.status, saveSnapshot]);
  const saveAndLeave = useCallback(async () => {
    if (captureActive) { setNote("Finish and save your recording, or cancel it explicitly, before leaving."); return; }
    if (lock.current || parentBusy || !hydrated) return;
    lock.current = true; setBusy(true); setError("");
    try {
      if (session.status === "ready") await saveSnapshot(snapshot);
      else await draftQueue.current;
      if (isDraftOwner(owner)) onLeave();
    } catch (cause) { if (isDraftOwner(owner)) { setError(errorMessage(cause)); setSaveState("error"); } }
    finally { lock.current = false; if (live.current && isDraftOwner(owner)) setBusy(false); }
  }, [captureActive, hydrated, onLeave, owner, parentBusy, saveSnapshot, session.status, snapshot]);
  useEffect(() => {
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => { void saveAndLeave(); return true; });
    return () => subscription.remove();
  }, [saveAndLeave]);
  useEffect(() => {
    if (Platform.OS !== "web") return;
    const warn = (event: BeforeUnloadEvent) => { if (captureActive || working || savedSnapshot.current !== latestSnapshot.current) { event.preventDefault(); event.returnValue = ""; } };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [captureActive, working]);
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
    try {
      const media = upload.current?.uri === audio.uri ? upload.current : await uploadAudio(audio.uri, audio.mime);
      if (!isDraftOwner(owner)) return;
      upload.current = { uri: audio.uri, id: media.id };
      await saveSnapshot(JSON.stringify({ text, audioId: media.id, prepared: true, submission: null }));
      if (!isDraftOwner(owner)) return;
      setAudioId(media.id); setInput("write"); await transcribe(media.id);
    }
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
    submission.current = payload; setSubmissionSnapshot(payload);
    try {
      await saveSnapshot(JSON.stringify({ text: payload.text, audioId: payload.audioId || "", prepared, submission: payload }));
      if (!isDraftOwner(owner)) return;
      const next = await debateApi.turn(session.id, payload);
      if (!isDraftOwner(owner)) return;
      submitted.current = true;
      await draftQueue.current.catch(() => undefined);
      await deleteDraft(draftKey).catch(() => undefined); onSession(next);
    } catch (cause) {
      if (!isDraftOwner(owner)) return;
      setError(errorMessage(cause));
      if (cause instanceof ApiError && cause.status === 400) { submission.current = null; setSubmissionSnapshot(null); setPending(false); }
      try { const saved = await debateApi.session(session.id); if (isDraftOwner(owner) && (saved.status !== "ready" || saved.stage !== session.stage)) onSession(saved); } catch { /* Retry keeps the same submission key and recording. */ }
    } finally { lock.current = false; if (isDraftOwner(owner)) setBusy(false); }
  }
  const userTurns = session.turns.filter(turn => turn.speaker === "user").length;
  const aiTurns = session.turns.filter(turn => turn.speaker === "ai");
  const latestReply = aiTurns[aiTurns.length - 1];
  const local = session.providerMode === "local";
  const draftSaved = saveState === "saved" && savedValue === snapshot;
  return <View style={{ gap: 16, maxWidth: 680, width: "100%", alignSelf: "center" }} testID="debate-match">
    <View style={[R.row, { justifyContent: "space-between", alignItems: "center" }]}>
      <Action label="Save & leave" icon="arrow-left" disabled={working || !hydrated} onPress={() => void saveAndLeave()} testID="save-leave-debate" />
      <JudgingLabel local={local} />
    </View>
    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 24 }} testID="debate-arena">
      <View style={{ alignItems: "center" }}><LayeredAvatar selection={selection} variant="chibi" animation={captureActive ? "speak" : "idle"} scale={0.3} /><Text style={T.h3}>You</Text></View>
      <Text style={[T.small, { fontFamily: "DMBold" }]}>with</Text>
      <View style={{ alignItems: "center" }}><LayeredAvatar selection={opponentLook(session.opponent)} variant="chibi" animation={waiting ? "speak" : "idle"} facing="left" scale={0.3} /><Text style={T.h3}>{session.opponent.name}</Text></View>
    </View>
    {session.mode === "tournament" && <Text style={[T.small, { textAlign: "center", backgroundColor: C.sage, borderRadius: 10, padding: 8 }]}>{session.opponent.boss ? "Final match" : "Cup match"} · {session.round} of 3</Text>}
    <DebateSteps completed={userTurns} />
    <View style={{ gap: 6 }}><Text accessibilityRole="header" style={[T.h2, { fontSize: 21, lineHeight: 28 }]}>{session.topic.title}</Text><Text style={T.small}>Your stance · {session.position === "for" ? "For" : "Against"}</Text></View>
    <ErrorNote message={error || parentError} />
    {stage && !prepared ? <View style={[R.smallCard, { gap: 12 }]} testID="debate-preparation">
      <Text style={T.h3}>Prepare your opening</Text><Text style={T.body}>One claim. One reason. One example.</Text>
      <Text style={T.small}>{session.topic.context}</Text><Action label="Start opening" primary onPress={() => setPrepared(true)} testID="start-debate-opening" />
    </View> : <>
      {latestReply && <View style={[R.smallCard, { padding: 14, gap: 7 }]}><Text style={T.h3}>{session.opponent.name}</Text><Text selectable style={[T.body, { fontSize: 14, lineHeight: 22 }]}>{latestReply.text}</Text></View>}
      {waiting ? <View style={R.card}><Text style={T.h3}>Your turn is submitted</Text><Text style={T.body}>{session.recovery?.message || "The opponent’s reply needs another try. Your submitted turn is safe."}</Text><Action label="Retry opponent reply" primary busy={working} onPress={onRecover} /></View>
        : readyToJudge ? <View style={R.card}><Text style={T.h3}>All three turns are submitted</Text><Text style={T.small}>{local ? "Get an unscored reflection on your practice." : "A separate AI judge reviews both sides using the same six criteria."}</Text><Action label={local ? "Get practice reflection" : "Evaluate match"} primary busy={working} onPress={onFinish} testID="finish-debate" /></View>
          : stage && <View style={[R.card, { padding: 16, gap: 12 }]} testID="debate-response-panel">
            <Text accessibilityRole="header" style={T.h3}>Your turn · {stage.label}</Text>
            <View style={{ flexDirection: "row", gap: 8 }}>
              <Action label="Record" icon="mic" primary={input === "record"} selected={input === "record"} disabled={working || captureActive || pending || !!audioId} onPress={() => setInput("record")} testID="debate-input-record" style={{ flex: 1 }} />
              <Action label="Write" icon="edit-3" primary={input === "write"} selected={input === "write"} disabled={working || captureActive || pending} onPress={() => setInput("write")} testID="debate-input-write" style={{ flex: 1 }} />
            </View>
            <Text style={T.small}>{stage.instruction}</Text>
            {input === "record" && !audioId ? allowed ? <AudioInput appearance="reading" onRecorded={recorded} onCancel={() => { setInput("write"); setNote(""); }} onCaptureActive={setCaptureActive} busy={working} reviewActionLabel="Save and transcribe" /> : <RecordingConsent busy={working} onAllow={() => void allowRecording()} onWrite={() => setInput("write")} /> : <>
              {!!audioId && <><PrivateRecordingPlayback id={audioId} /><Action label="Retry transcription" disabled={working || pending} onPress={() => void retryTranscript()} /><Text style={[T.small, { fontSize: 12 }]}>Private recording saved. Review the text before submitting.</Text></>}
              <Field label={audioId ? "Review your transcript" : "Your argument"} value={text} onChangeText={value => { setText(value); setSaveState("saving"); setError(""); }} multiline maxLength={6000} editable={hydrated && !working && !pending} placeholder="Make a point, explain why, and add an example." />
              <Text style={[T.small, { fontSize: 12 }]}>{text.length} / 6,000 characters</Text>
              {pending && !working && <Text style={T.small}>Retry sends the same saved turn once. Your text and recording are kept.</Text>}
              <Action label={pending ? "Retry submission" : `Submit ${stage.label.toLowerCase()}`} primary busy={working} disabled={!hydrated || !text.trim()} onPress={() => void submit()} testID="submit-debate-turn" />
            </>}
            {!!note && <Text accessibilityLiveRegion="polite" style={T.small}>{note}</Text>}
            <TurnTimer seconds={stage.seconds} />
          </View>}
    </>}
    <Text accessibilityLiveRegion="polite" style={[T.small, { fontSize: 12 }]} testID="debate-save-status">
      {captureActive ? "Finish and save this recording before leaving." : working ? "Saving your work…" : session.status !== "ready" ? "Submitted turns saved to your account." : saveState === "error" ? "Draft not saved. Save & leave will retry; your text is still here." : draftSaved ? "Draft saved on this device. Submit to save this turn to your account." : "Saving draft on this device…"}
    </Text>
    {!!session.turns.length && <Action label={showEarlier ? "Hide earlier turns" : "Earlier turns"} selected={showEarlier} onPress={() => setShowEarlier(!showEarlier)} />}
    {showEarlier && session.turns.map(turn => <View key={turn.id} style={R.smallCard}><Text style={T.label}>{turn.speaker === "user" ? "You" : session.opponent.name} · {turn.stage}</Text><Text selectable style={T.body}>{turn.text}</Text>{!!turn.audioId && <PrivateRecordingPlayback id={turn.audioId} playLabel="Play this spoken turn" />}</View>)}
  </View>;
}
