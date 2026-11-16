import React, { useState } from "react";
import { Text, View } from "react-native";
import type { DebateSession, DebateTournament } from "../../shared/debate.mjs";
import type { GamificationSummary } from "../../shared/gamification.mjs";
import { C, T, Icon } from "../components/ui";
import { LayeredAvatar } from "../avatar/LayeredAvatar";
import { normalizeSelection } from "../avatar/pack";
import { Action, R } from "./common";
import { Laurels, JudgingLabel } from "./DebateVisuals";
import { CoinIcon } from "./CoinIcon";

export function DebateResults({ session, summary, run, busy, onAdvance, onHistory, onNew }: {
  session: DebateSession; summary: GamificationSummary; run: DebateTournament | null; busy: boolean;
  onAdvance: () => void; onHistory: () => void; onNew: () => void;
}) {
  const [feedback, setFeedback] = useState(false);
  const result = session.evaluation;
  if (!result) return null;
  const local = result.provider === "local", won = !local && result.outcome === "win" && !result.uncertain;
  const cupComplete = won && run?.status === "completed" && run.currentSessionId === session.id;
  const title = local ? "Practice complete" : result.uncertain ? "Result uncertain" : won ? "Victory!" : result.outcome === "draw" ? "Well matched!" : "Keep growing";
  const canAdvance = !!run && run.status === "active" && run.currentSessionId === session.id && !local && (result.outcome === "win" || result.outcome === "draw");
  const unlocked = (session.reward?.unlockedItems || []).map(id => summary.catalog.find(item => item.id === id)).filter(item => !!item);
  const featured = unlocked.find(item => item.collection === summary.avatar.selection.collection) || unlocked[0];
  const hasReward = !!session.reward && (session.reward.coinsGranted > 0 || session.reward.xpGranted > 0);
  const rewardReason = typeof session.reward?.reason === "string" ? session.reward.reason.replace(/^./, first => first.toUpperCase()).replace(/[.!?]?$/, ".") : "No additional reward for this completion.";
  return <View style={{ gap: 18, maxWidth: 620, width: "100%", alignSelf: "center" }} testID="debate-results">
    <View style={[R.row, { justifyContent: "space-between" }]}><Text style={T.h3}>Match result</Text><Action label="Close result" icon="x" disabled={busy} onPress={onNew} /></View>
    <View style={{ alignItems: "center", gap: 9 }} testID={won ? "debate-victory" : "debate-completion"}>
      <Laurels title={title} celebrate={won} />
      <LayeredAvatar selection={normalizeSelection(summary.avatar.selection)} variant="chibi" animation={won ? "celebrate" : "greet"} scale={0.45} />
      {cupComplete && <Text style={[T.h3, { backgroundColor: C.sage, padding: 11, borderRadius: 10, textAlign: "center" }]}>{run.title} complete</Text>}
      <JudgingLabel local={local} />
    </View>
    <View style={[R.card, { padding: 16, gap: 14 }]} testID="debate-learning-takeaway">
      <View style={{ gap: 7 }}><View style={R.row}><Icon name="check-circle" size={18} /><Text style={T.h3}>What worked</Text></View><Text style={T.body}>{result.strengths[0] || result.explanation}</Text></View>
      <View style={R.divider} />
      <View style={{ gap: 7 }}><View style={R.row}><Icon name="compass" size={18} /><Text style={T.h3}>Try next time</Text></View><Text style={T.body}>{result.improvements[0] || "Revisit one claim and add a specific example that supports it."}</Text></View>
    </View>
    {local && <Text style={T.small}>Rule-based practice complete. Your reflection is unscored; no competitive win or loss was recorded.</Text>}
    {session.reward && <View style={[R.smallCard, { alignItems: "center", gap: 10 }]} testID="debate-reward-receipt">
      {hasReward ? <View style={[R.row, { justifyContent: "center", gap: 20 }]}>
        {session.reward.coinsGranted > 0 && <View style={[R.row, { gap: 6 }]}><CoinIcon /><Text style={T.h3}>+{session.reward.coinsGranted} Coins</Text></View>}
        {session.reward.xpGranted > 0 && <Text style={T.h3}>+{session.reward.xpGranted} XP</Text>}
      </View> : <Text style={T.small}>{rewardReason} You can keep practising.</Text>}
      {featured && <View style={[R.row, { justifyContent: "center" }]}><Icon name="gift" size={18} /><Text style={[T.small, { color: C.ink }]}>Unlocked · {featured.name}{unlocked.length > 1 ? ` +${unlocked.length - 1} more` : ""}</Text></View>}
      <Text style={[T.small, { fontSize: 12 }]}>Rewards saved to your account</Text>
    </View>}
    {run?.status === "eliminated" && <Text style={T.body}>This cup run is complete. Your matches and feedback remain in your record.</Text>}
    <Action label={feedback ? "Hide detailed feedback" : "View detailed feedback"} selected={feedback} onPress={() => setFeedback(!feedback)} testID="view-debate-feedback" />
    {feedback && <View style={{ gap: 14 }}>
      <View style={R.smallCard}><Text style={T.h3}>About this result</Text><Text style={T.body}>{result.explanation}</Text>{!local && result.totals.user !== null && result.totals.ai !== null && <Text style={T.small}>Your case {result.totals.user} · {session.opponent.name} {result.totals.ai}. AI feedback is provisional.</Text>}</View>
      {!!unlocked.length && <View style={R.smallCard}><Text style={T.h3}>Your new wardrobe pieces</Text>{unlocked.map(item => <Text key={item.id} style={T.body}>{item.name} · {item.collection} collection</Text>)}</View>}
      {result.strengths.slice(1).map((value, index) => <Text key={`strength-${index}`} style={T.body}>{value}</Text>)}
      {result.improvements.slice(1).map((value, index) => <Text key={`next-${index}`} style={T.body}>{value}</Text>)}
      {result.criteria.map(criterion => <View key={criterion.key} style={R.card}><Text style={T.h3}>{criterion.label}</Text>
        {([["Your case", criterion.user], [session.opponent.name, criterion.ai]] as const).map(([label, side]) => <View key={label} style={{ gap: 6 }}><Text style={[T.small, { fontFamily: "DMBold" }]}>{label} · {side.score === null ? "Not scored" : `${side.score}/4`} · {side.confidence} confidence</Text>{!!side.strength && <Text style={T.body}>{side.strength}</Text>}{!!side.improvement && <Text style={T.body}>{side.improvement}</Text>}{side.evidence.map((evidence, index) => <Text key={`${evidence.turnId}-${index}`} selectable style={T.small}>“{evidence.quote}”</Text>)}</View>)}
      </View>)}
      {!!result.limitations.length && <View style={R.smallCard}>{result.limitations.map((value, index) => <Text key={index} style={T.small}>{value}</Text>)}</View>}
    </View>}
    <Action label={canAdvance ? result.outcome === "draw" ? "Replay match" : "Next match" : "Back to Debate street"} primary busy={busy} onPress={canAdvance ? onAdvance : onNew} />
    <Action label="My record" icon="clock" onPress={onHistory} disabled={busy} />
  </View>;
}
