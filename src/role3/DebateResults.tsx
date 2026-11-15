import React, { useState } from "react";
import { Text, View } from "react-native";
import type { DebateSession, DebateTournament } from "../../shared/debate.mjs";
import type { GamificationSummary } from "../../shared/gamification.mjs";
import { C, T, Icon } from "../components/ui";
import { LayeredAvatar } from "../avatar/LayeredAvatar";
import { normalizeSelection } from "../avatar/pack";
import { Action, R } from "./common";
import { Laurels, SoftTownBackdrop } from "./DebateVisuals";

export function DebateResults({ session, summary, run, busy, onAdvance, onHistory, onNew }: {
  session: DebateSession; summary: GamificationSummary; run: DebateTournament | null; busy: boolean;
  onAdvance: () => void; onHistory: () => void; onNew: () => void;
}) {
  const [feedback, setFeedback] = useState(false);
  const [width, setWidth] = useState(350);
  const result = session.evaluation;
  if (!result) return null;
  const local = result.provider === "local";
  const won = !local && result.outcome === "win" && !result.uncertain;
  const title = local ? "Practice complete" : result.uncertain ? "Result uncertain" : won ? "Victory!" : result.outcome === "draw" ? "Well matched!" : "Keep growing";
  const canAdvance = !!run && run.status === "active" && run.currentSessionId === session.id && !local && (result.outcome === "win" || result.outcome === "draw");
  const unlocked = (session.reward?.unlockedItems || []).map(id => summary.catalog.find(item => item.id === id)).filter(item => !!item);
  const featured = unlocked.find(item => item.collection === summary.avatar.selection.collection && item.category === "jacket") || unlocked.find(item => item.collection === summary.avatar.selection.collection) || unlocked[0];
  return <View style={R.page} testID="debate-results">
    <View onLayout={event => setWidth(event.nativeEvent.layout.width)} style={[R.card, { padding: 18, overflow: "hidden", gap: 18 }]} testID={won ? "debate-victory" : "debate-completion"}>
      <SoftTownBackdrop />
      <Laurels title={title} celebrate={won} />
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 12 }}>
        <View style={{ alignItems: "center", flex: 1 }}>
          {won && <Text accessible={false} style={{ color: "#C79B48", fontSize: 25, letterSpacing: 16 }}>✦ ✧</Text>}
          <LayeredAvatar selection={normalizeSelection(summary.avatar.selection)} variant="chibi" animation={won ? "celebrate" : "greet"} scale={width < 500 ? 0.5 : 0.83} />
        </View>
        {session.reward && <View style={{ flex: 1, gap: 9 }}>
          <View style={[R.smallCard, { padding: 10, flexDirection: "row", alignItems: "center", gap: 8 }]}><Text style={{ fontSize: 22 }}>🪙</Text><Text style={[T.h3, { fontSize: 14, flexShrink: 1 }]}>+{session.reward.coinsGranted} Coins</Text></View>
          <View style={[R.smallCard, { padding: 10, flexDirection: "row", alignItems: "center", gap: 8 }]}><Text style={{ color: "#9B7034", fontFamily: "DMBold", fontSize: 17 }}>XP</Text><Text style={[T.h3, { fontSize: 14 }]}>+{session.reward.xpGranted} XP</Text></View>
          {featured && <View style={[R.smallCard, { padding: 10, gap: 4 }]}><Icon name="gift" size={21} /><Text style={[T.small, { color: C.ink, fontFamily: "DMBold" }]}>New item unlocked!</Text><Text style={T.small}>{featured.name}</Text>{unlocked.length > 1 && <Text style={[T.small, { fontSize: 10 }]}>+{unlocked.length - 1} more · see feedback</Text>}</View>}
        </View>}
      </View>
      <Text style={[T.body, { textAlign: "center", fontSize: 14 }]}>{local ? "Rule-based practice complete. Your reflection is unscored; no competitive win or loss was recorded." : won ? result.strengths[0] || "Your argument made a strong case." : result.explanation}</Text>
      {!local && result.totals.user !== null && result.totals.ai !== null && <View style={{ gap: 9, backgroundColor: "rgba(255,252,248,0.94)", padding: 14, borderRadius: 12 }}>
        {result.criteria.map(criterion => <View key={criterion.key} style={[R.row, { justifyContent: "space-between" }]}><Text style={[T.small, { color: C.ink, flex: 1 }]}>{criterion.label}</Text><View style={{ flexDirection: "row", gap: 4 }} accessibilityLabel={`${criterion.label}: ${criterion.user.score ?? "not scored"} out of 4`}>{[1, 2, 3, 4].map(point => <View key={point} style={{ width: 10, height: 10, borderRadius: 5, borderWidth: 1, borderColor: "#BCA98D", backgroundColor: (criterion.user.score ?? -1) >= point ? "#CFAE7B" : "transparent" }} />)}</View></View>)}
        <Text style={[T.small, { textAlign: "center" }]}>Your case {result.totals.user} · {session.opponent.name} {result.totals.ai}</Text>
      </View>}
      <View style={R.row}>
        <Action label={feedback ? "Hide feedback" : "View feedback"} selected={feedback} onPress={() => setFeedback(!feedback)} testID="view-debate-feedback" style={{ flex: 1 }} />
        <Action label={canAdvance ? result.outcome === "draw" ? "Replay round" : "Next match" : "Back to street"} primary busy={busy} onPress={canAdvance ? onAdvance : onNew} style={{ flex: 1 }} />
      </View>
      <Text style={[T.small, { textAlign: "center", fontSize: 11 }]}>Rewards saved automatically · no extra charge or grant on reopening</Text>
      {session.reward?.coinsGranted === 0 && session.reward?.xpGranted === 0 && <Text style={T.small}>{typeof session.reward.reason === "string" ? session.reward.reason : "No additional Coins or XP for this completion."} You can keep practising.</Text>}
    </View>
    {feedback && <View style={{ gap: 14 }}>
      <View style={R.smallCard}><Text style={T.h3}>About this result</Text><Text style={T.body}>{result.explanation}</Text></View>
      {!!unlocked.length && <View style={R.card}><Text style={T.h3}>Your new wardrobe pieces</Text>{unlocked.map(item => <Text key={item.id} style={T.body}>{item.name} · {item.collection} collection</Text>)}</View>}
      {!!result.strengths.length && <View style={R.card}><Text style={T.h3}>What worked</Text>{result.strengths.map((value, index) => <Text key={index} style={T.body}>• {value}</Text>)}</View>}
      {!!result.improvements.length && <View style={R.card}><Text style={T.h3}>Try next time</Text>{result.improvements.map((value, index) => <Text key={index} style={T.body}>• {value}</Text>)}</View>}
      {result.criteria.map(criterion => <View key={criterion.key} style={R.card}>
        <Text style={T.h3}>{criterion.label}</Text>
        {([ ["Your case", criterion.user], [session.opponent.name, criterion.ai] ] as const).map(([label, side]) => <View key={label} style={{ gap: 6 }}>
          <Text style={[T.small, { fontFamily: "DMBold" }]}>{label} · {side.score === null ? "Not scored" : `${side.score}/4`} · {side.confidence} confidence</Text>
          {!!side.strength && <Text style={T.body}>{side.strength}</Text>}{!!side.improvement && <Text style={T.body}>{side.improvement}</Text>}
          {side.evidence.map((evidence, index) => <Text key={`${evidence.turnId}-${index}`} selectable style={T.small}>“{evidence.quote}”</Text>)}
        </View>)}
      </View>)}
      {!!result.limitations.length && <View style={R.smallCard}>{result.limitations.map((value, index) => <Text key={index} style={T.small}>{value}</Text>)}</View>}
    </View>}
    {run?.status === "completed" && <Text style={T.h2}>🏆 {run.title} completed</Text>}
    {run?.status === "eliminated" && <Text style={T.body}>This run is complete. Start a new run when you’re ready.</Text>}
    <Action label="My record" onPress={onHistory} disabled={busy} />
  </View>;
}
