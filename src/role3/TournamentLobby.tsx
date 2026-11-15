import React, { useState } from "react";
import { Image, Text, View } from "react-native";
import { Link } from "expo-router";
import type { DebateProficiency, DebateTopic, DebateTournament } from "../../shared/debate.mjs";
import { C, T, Icon } from "../components/ui";
import { LayeredAvatar } from "../avatar/LayeredAvatar";
import { Action, R } from "./common";
import { opponentLook } from "./DebateStreet";
import type { DebateCatalog } from "./debate-api";

export function TopicContext({ topic }: { topic: DebateTopic }) {
  return <View style={{ gap: 8 }}><Text style={T.small}>{topic.context}</Text>
    {topic.sources?.map(source => <Link key={source.url} href={source.url as `https://${string}`} target="_blank" rel="noopener noreferrer" style={[T.small, { color: "#69543C", textDecorationLine: "underline", paddingVertical: 5 }]}>{source.title} ↗</Link>)}
    {topic.contextReviewedAt && <Text style={[T.small, { fontSize: 10 }]}>Background reviewed {topic.contextReviewedAt} · original practice motion, not an official position.</Text>}
  </View>;
}

export function DebateSetup({ topics, topic, position, proficiency, busy, onTopic, onPosition, onProficiency }: {
  topics: DebateTopic[]; topic: DebateTopic; position: "for" | "against"; proficiency: DebateProficiency; busy: boolean;
  onTopic: (id: string) => void; onPosition: (value: "for" | "against") => void; onProficiency: (value: DebateProficiency) => void;
}) {
  return <View style={{ gap: 12 }}>
    <Text style={T.h3}>Choose a topic</Text>
    {topics.map(entry => <Action key={entry.id} label={entry.title} selected={topic.id === entry.id} disabled={busy} onPress={() => onTopic(entry.id)} />)}
    <TopicContext topic={topic} />
    <Text style={T.h3}>Your position</Text><View style={R.row}><Action label="Argue for" selected={position === "for"} disabled={busy} onPress={() => onPosition("for")} /><Action label="Argue against" selected={position === "against"} disabled={busy} onPress={() => onPosition("against")} /></View>
    <Text style={T.h3}>Speaking confidence</Text><View style={R.row}>{([ ["beginner", "Getting started"], ["developing", "Building confidence"], ["confident", "Feeling confident"] ] as const).map(([value, label]) => <Action key={value} label={label} selected={proficiency === value} disabled={busy} onPress={() => onProficiency(value)} />)}</View>
  </View>;
}

export function TournamentLobby({ catalog, topic, position, proficiency, currentRun, busy, onTopic, onPosition, onProficiency, onStart, onBossPractice, onResume, onHistory }: {
  catalog: DebateCatalog; topic: DebateTopic; position: "for" | "against"; proficiency: DebateProficiency; currentRun: DebateTournament | null; busy: boolean;
  onTopic: (id: string) => void; onPosition: (value: "for" | "against") => void; onProficiency: (value: DebateProficiency) => void;
  onStart: () => void; onBossPractice: () => void; onResume: () => void; onHistory: () => void;
}) {
  const [panel, setPanel] = useState<"rounds" | "rewards" | "setup" | null>(null);
  const toggle = (next: typeof panel) => setPanel(panel === next ? null : next);
  const boss = catalog.boss;
  const bracket = currentRun?.bracket || catalog.tournamentOpponents;
  const finalOpponent = bracket[bracket.length - 1] || boss;
  return <View style={{ width: "100%", maxWidth: 620, alignSelf: "center", gap: 18 }} testID="tournament-lobby">
    <View style={{ alignItems: "center", gap: 8 }}>
      <Text accessible={false} style={{ fontSize: 43 }}>🏆</Text>
      <Text accessibilityRole="header" style={[T.h2, { textAlign: "center", fontSize: 25 }]}>AI Debate Tournament</Text>
      <Text style={[T.body, { textAlign: "center", fontSize: 14 }]}>Build your case. Meet the challengers.{"\n"}Take on Singapore’s big questions.</Text>
    </View>
    <View style={{ height: 210, borderRadius: 18, overflow: "hidden", backgroundColor: C.sage }}>
      <Image source={require("../../assets/role3/debate-street.png")} resizeMode="cover" style={{ position: "absolute", width: "100%", height: "100%", opacity: 0.65 }} />
      <View style={{ position: "absolute", top: 10, right: 18 }}><LayeredAvatar selection={opponentLook(finalOpponent)} variant="big" scale={0.36} playing={false} /></View>
      <View style={{ position: "absolute", top: 32, left: 28, alignItems: "center" }}><Text accessible={false} style={{ fontSize: 45 }}>♜</Text><Text style={[T.small, { color: C.ink, fontFamily: "DMBold" }]}>{finalOpponent.boss ? "FINAL BOSS" : "FINAL ROUND"}</Text></View>
      <View style={{ position: "absolute", bottom: 0, width: "100%", padding: 16, backgroundColor: "rgba(50,43,38,0.94)", alignItems: "center", gap: 4 }}>
        <Text style={[T.h2, { color: "#FFF9EF", fontSize: 22 }]}>{currentRun?.title || catalog.rules.title}</Text><Text style={[T.small, { color: "#E8D8C1" }]}>3 rounds · Final challenge: {finalOpponent.name}</Text>
      </View>
    </View>
    <View style={{ gap: 5 }}><Text style={[T.label, { fontSize: 10 }]}>YOUR MOTION · {position === "for" ? "FOR" : "AGAINST"}</Text><Text style={[T.body, { fontSize: 14 }]}>{currentRun?.topic.title || topic.title}</Text></View>
    <Action label={currentRun ? `Continue round ${currentRun.round}` : "Start tournament"} primary icon="chevron-right" busy={busy} disabled={!currentRun && !catalog.tournamentAvailable} onPress={currentRun ? onResume : onStart} testID="start-debate-tournament" style={{ borderRadius: 24 }} />
    {!catalog.tournamentAvailable && <Text style={[T.small, { textAlign: "center", fontSize: 11 }]}>Competitive judging needs a configured AI provider. You can practise with the boss below.</Text>}
    <View style={{ flexDirection: "row", gap: 10 }}>
      {([ ["rounds", "Rounds", "bar-chart-2"], ["rewards", "Rewards", "gift"], ["history", "My record", "file-text"] ] as const).map(([id, label, icon]) => <View key={id} style={[R.smallCard, { flex: 1, padding: 8, alignItems: "center", gap: 6 }]}><Icon name={icon} size={24} /><Action label={label} selected={id !== "history" && panel === id} onPress={id === "history" ? onHistory : () => toggle(id)} style={{ paddingHorizontal: 4, borderWidth: 0, minHeight: 38 }} /></View>)}
    </View>
    {panel === "rounds" && <View style={R.card}><Text style={T.h3}>The road to the final</Text>{bracket.map((opponent, index) => <View key={opponent.id} style={{ flexDirection: "row", alignItems: "center", gap: 10 }}><LayeredAvatar selection={opponentLook(opponent)} variant="chibi" scale={0.22} playing={false} /><View style={{ flex: 1 }}><Text style={T.h3}>{index + 1}. {opponent.name}{opponent.boss ? " · Boss" : ""}</Text><Text style={T.small}>{opponent.title} · {opponent.difficulty}</Text></View></View>)}<Text style={T.small}>{catalog.rules.progression}</Text></View>}
    {panel === "rewards" && <View style={R.card}><Text style={T.h3}>Rewards for taking part</Text><Text style={T.body}>Eligible match: +{catalog.rewardPreview?.coins || 0} Coins · +{catalog.rewardPreview?.xp || 0} XP</Text><Text style={T.small}>{catalog.rewardPreview?.unlockNote}</Text><Text style={T.small}>Up to {catalog.rewardPreview?.dailyCap || 2} rewarded debate completions each day. Verified wins can unlock special wardrobe pieces.</Text></View>}
    <Action label={panel === "setup" ? "Close match setup" : "Topic & difficulty"} selected={panel === "setup"} onPress={() => toggle("setup")} />
    {panel === "setup" && <View style={R.card}><DebateSetup topics={catalog.tournamentTopics} topic={topic} position={position} proficiency={proficiency} busy={busy} onTopic={onTopic} onPosition={onPosition} onProficiency={onProficiency} /><Text style={T.small}>{catalog.rules.scale}</Text><Text style={T.small}>{catalog.rules.outcome}</Text></View>}
    <View style={[R.smallCard, { flexDirection: "row", alignItems: "center", gap: 12 }]}><LayeredAvatar selection={opponentLook(boss)} variant="chibi" scale={0.28} playing={false} /><View style={{ flex: 1, gap: 5 }}><Text style={T.h3}>{boss.name} · The policy chair</Text><Text style={T.small}>A fictional challenger who asks for evidence, trade-offs and a workable plan.</Text></View></View>
    <Action label={`Practise with ${boss.name}`} busy={busy} onPress={onBossPractice} testID="start-debate-practice" />
  </View>;
}
