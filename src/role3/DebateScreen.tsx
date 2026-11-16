import React, { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";
import type { DebateOpponent, DebateProficiency, DebateSession, DebateTournament } from "../../shared/debate.mjs";
import { C, T, Icon, ErrorNote } from "../components/ui";
import { LayeredAvatar } from "../avatar/LayeredAvatar";
import { normalizeSelection } from "../avatar/pack";
import { useApp } from "../lib/state";
import { deleteDraft, isDraftOwner, loadDraft, saveDraft } from "../lib/api";
import { Action, LoadState, R, ScreenHeader, errorMessage, requestId, useGamification } from "./common";
import { debateApi, type DebateCatalog, type DebateHistory } from "./debate-api";
import { DebateStreet, opponentLook } from "./DebateStreet";
import { DebatePreparation } from "./DebatePreparation";
import { DebateMatch } from "./DebateMatch";
import { DebateResults } from "./DebateResults";
import { DebateSetup, TournamentLobby } from "./TournamentLobby";
import { JudgingLabel } from "./DebateVisuals";

type Tab = "street" | "lobby" | "practice" | "history";
export function DebateScreen({ onBack, onScrollTop, initialTab = "street", onFocusChange, onOpenFriends }: { onBack: () => void; onScrollTop?: () => void; initialTab?: "street" | "lobby"; onFocusChange?: (focused: boolean) => void; onOpenFriends?: () => void }) {
  const summary = useGamification(); const { refresh } = useApp(); const owner = summary.owner;
  const [catalog, setCatalog] = useState<DebateCatalog | null>(null);
  const [history, setHistory] = useState<DebateHistory>({ sessions: [], tournaments: [] });
  const [loadedOwner, setLoadedOwner] = useState(""); const [loadError, setLoadError] = useState(""); const [revision, setRevision] = useState(0);
  const [tab, setTab] = useState<Tab>(initialTab); const [opponentId, setOpponentId] = useState(""); const [topicId, setTopicId] = useState("");
  const [proficiency, setProficiency] = useState<DebateProficiency>("beginner");
  const [session, setSession] = useState<DebateSession | null>(null); const [run, setRun] = useState<DebateTournament | null>(null);
  const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  const [deleting, setDeleting] = useState<{ id: string; tournament: boolean } | null>(null); const [notice, setNotice] = useState("");
  const lock = useRef(false); const creation = useRef({ signature: "", id: requestId() }); const advanceKey = useRef(requestId());
  const activeSession = useRef<string | null>(null);
  const focused = Boolean(session);
  useEffect(() => { onFocusChange?.(focused); }, [focused, onFocusChange]);
  useEffect(() => () => onFocusChange?.(false), [onFocusChange]);
  useEffect(() => {
    const abort = new AbortController();
    void Promise.all([debateApi.catalog(abort.signal), debateApi.history(0, abort.signal), loadDraft("debate-active-preparation").catch(() => "")]).then(([nextCatalog, nextHistory, preparationId]) => {
      if (abort.signal.aborted || !isDraftOwner(owner)) return;
      setCatalog(nextCatalog); setHistory(nextHistory); setLoadedOwner(owner); setLoadError("");
      const preparing = nextHistory.sessions.find(entry => entry.id === preparationId && entry.preparation && !entry.preparation.completedAt);
      if (preparing && !activeSession.current) { activeSession.current = preparing.id; setSession(preparing); }
    }).catch(cause => { if (!abort.signal.aborted) { setLoadError(errorMessage(cause)); setLoadedOwner(owner); } });
    return () => abort.abort();
  }, [owner, revision]);
  const updateHistory = useCallback(async () => {
    try { const next = await debateApi.history(); if (isDraftOwner(owner)) setHistory(next); } catch { /* The match remains usable if history refresh is temporarily unavailable. */ }
  }, [owner]);
  function navigate(next: Tab) { setTab(next); setError(""); onScrollTop?.(); }
  function meet(opponent: DebateOpponent) { setOpponentId(opponent.id); navigate("practice"); }
  function receive(next: DebateSession) {
    activeSession.current = next.id;
    setSession(next); onScrollTop?.(); void updateHistory();
    void (next.preparation && !next.preparation.completedAt ? saveDraft("debate-active-preparation", next.id) : deleteDraft("debate-active-preparation")).catch(() => undefined);
    void Promise.all(next.turns.filter(turn => turn.speaker === "user").map(turn => deleteDraft(`debate-turn-${next.id}-${turn.stage}`))).catch(() => undefined);
    if (next.status === "completed") { summary.reload(); void refresh().catch(() => undefined); }
    if (next.tournamentId) void debateApi.run(next.tournamentId).then(value => { if (isDraftOwner(owner) && activeSession.current === next.id) setRun(value.run); }).catch(() => undefined);
  }
  async function start(tournament: boolean, bossPractice = false) {
    if (!catalog || lock.current) return;
    const topics = tournament || bossPractice ? catalog.tournamentTopics : catalog.topics;
    const chosenTopic = topics.find(entry => entry.id === topicId)?.id || topics[0]?.id;
    const chosenOpponent = bossPractice ? catalog.boss.id : opponentId || catalog.opponents[0]?.id;
    if (!chosenTopic || !chosenOpponent) return;
    const signature = JSON.stringify({ tournament, chosenTopic, chosenOpponent, position: "random", proficiency });
    if (creation.current.signature !== signature) creation.current = { signature, id: requestId() };
    lock.current = true; setBusy(true); setError("");
    try {
      const briefing = { requestId: creation.current.id, topicId: chosenTopic, position: "random" as const, proficiency };
      if (tournament) { const next = await debateApi.tournament(briefing); if (!isDraftOwner(owner)) return; setRun(next.run); receive(next.session); }
      else { const next = await debateApi.create({ ...briefing, opponentId: chosenOpponent }); if (!isDraftOwner(owner)) return; setRun(null); receive(next); }
      creation.current = { signature: "", id: requestId() };
    } catch (cause) { if (isDraftOwner(owner)) setError(errorMessage(cause)); }
    finally { lock.current = false; if (isDraftOwner(owner)) setBusy(false); }
  }
  async function openSession(id: string) {
    if (lock.current) return; lock.current = true; setBusy(true); setError("");
    try { const next = await debateApi.session(id); if (!isDraftOwner(owner)) return; setRun(null); receive(next); }
    catch (cause) { if (isDraftOwner(owner)) setError(errorMessage(cause)); }
    finally { lock.current = false; if (isDraftOwner(owner)) setBusy(false); }
  }
  async function sessionAction(action: "recover" | "finish") {
    if (!session || lock.current) return; lock.current = true; setBusy(true); setError("");
    try {
      const next = await debateApi[action](session.id);
      if (isDraftOwner(owner)) {
        if (activeSession.current === session.id) receive(next);
        else { void updateHistory(); if (next.status === "completed") { summary.reload(); void refresh().catch(() => undefined); } }
      }
    }
    catch (cause) { if (isDraftOwner(owner)) setError(errorMessage(cause)); }
    finally { lock.current = false; if (isDraftOwner(owner)) setBusy(false); }
  }
  async function advance() {
    if (!run || lock.current) return; lock.current = true; setBusy(true); setError("");
    const previous = activeSession.current;
    try { const next = await debateApi.advance(run.id, advanceKey.current); if (!isDraftOwner(owner)) return; if (activeSession.current === previous) { setRun(next.run); receive(next.session); } else void updateHistory(); advanceKey.current = requestId(); }
    catch (cause) { if (isDraftOwner(owner)) setError(errorMessage(cause)); }
    finally { lock.current = false; if (isDraftOwner(owner)) setBusy(false); }
  }
  async function moreHistory() {
    if (lock.current || history.nextOffset == null) return; lock.current = true; setBusy(true); setError("");
    try { const next = await debateApi.history(history.nextOffset); if (isDraftOwner(owner)) setHistory(current => ({ ...next, sessions: [...current.sessions, ...next.sessions.filter(entry => !current.sessions.some(saved => saved.id === entry.id))], tournaments: [...current.tournaments, ...next.tournaments.filter(entry => !current.tournaments.some(saved => saved.id === entry.id))] })); }
    catch (cause) { if (isDraftOwner(owner)) setError(errorMessage(cause)); }
    finally { lock.current = false; if (isDraftOwner(owner)) setBusy(false); }
  }
  async function removeHistory() {
    if (!deleting || lock.current) return; lock.current = true; setBusy(true); setError("");
    try { const result = await debateApi.remove(deleting.id, deleting.tournament); if (!isDraftOwner(owner)) return; setDeleting(null); setNotice(result.audioNotice); await updateHistory(); }
    catch (cause) { if (isDraftOwner(owner)) setError(errorMessage(cause)); }
    finally { lock.current = false; if (isDraftOwner(owner)) setBusy(false); }
  }
  function leaveMatch(next: Tab) { void deleteDraft("debate-active-preparation").catch(() => undefined); activeSession.current = null; setSession(null); navigate(next); void updateHistory(); }
  const ready = loadedOwner === owner && catalog && summary.data;
  if (!ready) return <View style={R.page}><ScreenHeader title="Debate street" onBack={onBack} /><LoadState loading={!loadError && (loadedOwner !== owner || summary.loading)} error={loadError || summary.error} onRetry={() => { setLoadError(""); setRevision(value => value + 1); summary.reload(); }} /></View>;
  const data = summary.data!; const configuration = catalog!;
  const currentOpponent = configuration.opponents.find(entry => entry.id === opponentId) ?? configuration.opponents[0];
  const currentTopic = configuration.topics.find(entry => entry.id === topicId) ?? configuration.topics[0];
  const currentRun = history.tournaments.find(entry => entry.status === "active") ?? null;
  const unfinished = history.sessions.find(entry => entry.status !== "completed");
  if (session) return <View style={{ gap: 14, width: "100%", maxWidth: 680, alignSelf: "center" }}>
    {session.status === "completed" ? <><ErrorNote message={error} /><DebateResults session={session} summary={data} run={run} busy={busy} onAdvance={() => void advance()} onHistory={() => leaveMatch("history")} onNew={() => leaveMatch("street")} /></>
      : session.preparation && !session.preparation.completedAt ? <DebatePreparation key={session.id} session={session} owner={owner} onSession={next => { if (activeSession.current === next.id) receive(next); }} onLeave={() => leaveMatch("street")} />
      : <DebateMatch key={`${session.id}-${session.stage}`} session={session} selection={normalizeSelection(data.avatar.selection)} catalog={configuration} onSession={next => { if (activeSession.current === next.id) receive(next); else void updateHistory(); }} onFinish={() => void sessionAction("finish")} onRecover={() => void sessionAction("recover")} onLeave={() => leaveMatch("street")} busy={busy} error={error} />}
  </View>;
  return <View style={[R.page, { maxWidth: 760, width: "100%", alignSelf: "center", gap: 16 }]} testID="debate-screen">
    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
      <Text accessibilityRole="header" style={[T.h2, { flex: 1, fontSize: 26 }]}>{tab === "history" ? "My debate record" : tab === "practice" ? "Meet your challenger" : "Debate street"}</Text>
      <Pressable accessibilityRole="button" accessibilityLabel="My record" onPress={() => { navigate("history"); void updateHistory(); }} style={{ minWidth: 44, minHeight: 44, justifyContent: "center", alignItems: "center" }}><Icon name="clock" size={23} color={C.ink} /></Pressable>
    </View>
    {tab === "street" && unfinished && <View style={[R.smallCard, { gap: 7 }]} testID="debate-resume-card"><Text style={T.h3}>Pick up where you left off</Text><Text numberOfLines={2} style={T.small}>{unfinished.topic.title}</Text><Action label={`Resume ${unfinished.preparation && !unfinished.preparation.completedAt ? "preparation" : unfinished.stage} with ${unfinished.opponent.name}`} primary busy={busy} onPress={() => void openSession(unfinished.id)} /></View>}
    <View style={{ flexDirection: "row", gap: 8 }}><Action label="Street" selected={tab === "street"} onPress={() => navigate("street")} style={{ flex: 1 }} /><Action label="Tournament" selected={tab === "lobby"} onPress={() => navigate("lobby")} style={{ flex: 1 }} /></View>
    {tab !== "lobby" && <JudgingLabel local={configuration.providerMode === "local"} />}
    <ErrorNote message={error || loadError} />
    {tab === "street" && <><DebateStreet selection={normalizeSelection(data.avatar.selection)} opponents={configuration.opponents} onMeet={meet} />
      <Action label={configuration.rules.title} icon="award" onPress={() => navigate("lobby")} />
      {onOpenFriends && <View style={R.smallCard}><Action label="Debate with friends" icon="users" onPress={onOpenFriends} /><Text style={T.small}>Private conversation · no AI scores or Coin rewards</Text></View>}
    </>}
    {tab === "lobby" && <TournamentLobby catalog={configuration} topic={configuration.tournamentTopics.find(entry => entry.id === topicId) || configuration.tournamentTopics[0]} proficiency={proficiency} currentRun={currentRun} busy={busy} onTopic={setTopicId} onProficiency={setProficiency} onStart={() => void start(true)} onBossPractice={() => void start(false, true)} onResume={() => currentRun && void openSession(currentRun.currentSessionId)} onHistory={() => navigate("history")} />}
    {tab === "practice" && <View style={{ gap: 16, maxWidth: 660, width: "100%", alignSelf: "center" }}>
      <View style={[R.card, { flexDirection: "row", alignItems: "center", gap: 14 }]}><LayeredAvatar selection={opponentLook(currentOpponent)} variant="chibi" scale={0.38} /><View style={{ flex: 1, gap: 6 }}><Text style={T.h2}>{currentOpponent.name}</Text><Text style={T.small}>{currentOpponent.title} · {currentOpponent.difficulty}</Text><Text style={T.small}>{currentOpponent.style}</Text></View></View>
      <DebateSetup fixedTopic topics={configuration.topics} topic={currentTopic} proficiency={proficiency} busy={busy} onTopic={setTopicId} onProficiency={setProficiency} />
      <Action label="Roll my position" icon="shuffle" primary busy={busy} onPress={() => void start(false)} testID="start-debate-practice" />
      <Text style={T.small}>Get a random side. Prepare for 5 minutes, then take on {currentOpponent.name}.</Text>
      <Text style={T.small}>Eligible completion: +{configuration.rewardPreview?.coins || 0} Coins · +{configuration.rewardPreview?.xp || 0} XP.</Text>
    </View>}
    {tab === "history" && <>
      {!!notice && <Text accessibilityLiveRegion="polite" style={T.small}>{notice}</Text>}
      {deleting && <View style={R.card}><Text style={T.h3}>Delete this {deleting.tournament ? "tournament and its matches" : "match"}?</Text><Text style={T.body}>Its saved turns and feedback will leave your history. Earned rewards stay in your account. Recordings follow the private recording controls and retention policy.</Text><View style={R.row}><Action label="Cancel deletion" disabled={busy} onPress={() => setDeleting(null)} /><Action label="Confirm delete record" primary busy={busy} onPress={() => void removeHistory()} /></View></View>}
      {!history.sessions.length && <View style={R.card}><Text style={T.h3}>Your first exchange is ahead.</Text><Text style={T.body}>Meet someone on the street to start a practice match. Your turns and feedback will be saved here.</Text><Action label="Explore the street" onPress={() => navigate("street")} /></View>}
      {history.tournaments.map(entry => <View key={entry.id} style={R.card}><Text style={T.h3}>{entry.title} · {entry.status}</Text><Text style={T.small}>{entry.topic.title}</Text>{entry.bracket.map((opponent, index) => { const match = [...entry.matches].reverse().find(value => value.round === index + 1); return <Text key={opponent.id} style={T.body}>Round {index + 1} · {opponent.name} · {match?.outcome || (entry.round === index + 1 && entry.status === "active" ? "Current match" : "Upcoming")}</Text>; })}<Action label="Open latest match" disabled={busy} onPress={() => void openSession(entry.currentSessionId)} /><Action label="Delete tournament record" disabled={busy} onPress={() => { setDeleting({ id: entry.id, tournament: true }); onScrollTop?.(); }} /></View>)}
      {history.sessions.map(entry => <View key={entry.id} style={R.card}><View style={[R.row, { justifyContent: "space-between" }]}><Text style={T.h3}>{entry.opponent.name} · {entry.mode === "tournament" ? `Round ${entry.round}` : "Practice"}</Text><Text style={T.small}>{new Date(entry.createdAt).toLocaleDateString()}</Text></View><Text style={T.body}>{entry.topic.title}</Text><Text style={T.small}>{entry.status === "completed" ? entry.evaluation?.provider === "local" ? "Unscored practice" : entry.evaluation?.uncertain ? "Uncertain draw" : entry.evaluation?.outcome : `Saved · ${entry.preparation && !entry.preparation.completedAt ? "Preparation" : entry.stage}`}</Text><Action label={entry.status === "completed" ? "View result" : "Resume match"} disabled={busy} onPress={() => void openSession(entry.id)} />{!entry.tournamentId && <Action label="Delete match record" disabled={busy} onPress={() => { setDeleting({ id: entry.id, tournament: false }); onScrollTop?.(); }} />}</View>)}
      {history.hasMore && <Action label="Load more matches" busy={busy} onPress={() => void moreHistory()} />}
    </>}
  </View>;
}
