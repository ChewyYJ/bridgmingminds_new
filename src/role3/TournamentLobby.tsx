import React, { useState } from "react";
import { Text, View } from "react-native";
import { Link } from "expo-router";
import type { DebateProficiency, DebateTopic, DebateTournament } from "../../shared/debate.mjs";
import { C, T, Icon } from "../components/ui";
import { LayeredAvatar } from "../avatar/LayeredAvatar";
import { Action, R } from "./common";
import { opponentLook } from "./DebateStreet";
import { PixelScene } from "./PixelStreetBackdrop";
import { JudgingLabel } from "./DebateVisuals";
import type { DebateCatalog } from "./debate-api";

const confidence = { beginner: "Getting started", developing: "Building confidence", confident: "Feeling confident" };

export function TopicContext({ topic }: { topic: DebateTopic }) {
  return <View style={{ gap: 8 }}><Text style={T.small}>{topic.context}</Text>
    {topic.sources?.map(source => <Link key={source.url} href={source.url as `https://${string}`} target="_blank" rel="noopener noreferrer" style={[T.small, { color: C.forest, textDecorationLine: "underline", paddingVertical: 7 }]}>{source.title} ↗</Link>)}
    {topic.contextReviewedAt && <Text style={[T.small, { fontSize: 12 }]}>Background reviewed {topic.contextReviewedAt}. Original practice motion, not an official position.</Text>}
  </View>;
}

export function DebateSetup({ topics, topic, fixedTopic = false, proficiency, busy, onTopic, onProficiency }: {
  topics: DebateTopic[]; topic: DebateTopic; fixedTopic?: boolean; proficiency: DebateProficiency; busy: boolean;
  onTopic: (id: string) => void; onProficiency: (value: DebateProficiency) => void;
}) {
  const [choosing, setChoosing] = useState(false), [background, setBackground] = useState(false);
  return <View style={{ gap: 14 }}>
    <View style={[R.smallCard, { gap: 10 }]}>
      <Text style={T.label}>YOUR MOTION</Text><Text accessibilityRole="header" style={T.h3}>{topic.title}</Text>
      <View style={R.row}>{!fixedTopic && <Action label={choosing ? "Close topics" : "Change topic"} selected={choosing} disabled={busy} onPress={() => setChoosing(!choosing)} />}<Action label={background ? "Hide background" : "Read background"} selected={background} onPress={() => setBackground(!background)} /></View>
      {background && <TopicContext topic={topic} />}
      {!fixedTopic && choosing && <View style={{ gap: 8 }}>{topics.map(entry => <Action key={entry.id} label={entry.title} selected={topic.id === entry.id} disabled={busy} onPress={() => { onTopic(entry.id); setChoosing(false); }} />)}</View>}
    </View>
    <Text style={T.h3}>Speaking confidence</Text><View style={R.row}>{(Object.entries(confidence) as [DebateProficiency, string][]).map(([value, label]) => <Action key={value} label={label} selected={proficiency === value} disabled={busy} onPress={() => onProficiency(value)} />)}</View>
  </View>;
}

export function TournamentLobby({ catalog, topic, proficiency, currentRun, busy, onTopic, onProficiency, onStart, onBossPractice, onResume, onHistory }: {
  catalog: DebateCatalog; topic: DebateTopic; proficiency: DebateProficiency; currentRun: DebateTournament | null; busy: boolean;
  onTopic: (id: string) => void; onProficiency: (value: DebateProficiency) => void;
  onStart: () => void; onBossPractice: () => void; onResume: () => void; onHistory: () => void;
}) {
  const [setup, setSetup] = useState(false), [background, setBackground] = useState(false), [rewards, setRewards] = useState(false), [width, setWidth] = useState(340);
  const opponent = currentRun?.bracket[currentRun.round - 1] || catalog.boss;
  const selectedTopic = currentRun?.topic || topic, local = !catalog.tournamentAvailable;
  const legacy = !!currentRun && currentRun.bracket.length > 1;
  return <View style={{ width: "100%", maxWidth: 620, alignSelf: "center", gap: 16 }} testID="tournament-lobby">
    <View style={{ flexDirection: "row", gap: 9, alignItems: "center" }}><Icon name="award" size={25} /><Text accessibilityRole="header" style={[T.h2, { flex: 1 }]}>{currentRun?.title || catalog.rules.title}</Text></View>
    <View onLayout={event => setWidth(event.nativeEvent.layout.width)} style={{ height: 220, borderRadius: 18, overflow: "hidden", backgroundColor: C.sage }}>
      <PixelScene scene="hall" width={width} height={220} absolute />
      <View style={{ flex: 1, alignItems: "center", justifyContent: "flex-end", padding: 12 }} testID="tournament-current-boss">
        <LayeredAvatar selection={opponentLook(opponent)} variant="chibi" scale={0.41} playing={false} />
        <Text style={[T.small, { fontFamily: "DMBold", backgroundColor: C.paper, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 9 }]}>{opponent.name} · {opponent.boss ? "Boss challenge" : "Saved cup match"}</Text>
      </View>
    </View>
    <Text style={T.small}>{legacy ? `Resume your saved cup · match ${currentRun.round} of ${currentRun.bracket.length}. New challenges are one boss match.` : "One boss · one match. Build your case through opening, rebuttal and closing."}</Text>
    <View style={[R.smallCard, { gap: 10 }]}><Text style={T.label}>YOUR MOTION</Text><Text style={T.h3}>{selectedTopic.title}</Text><Action label={background ? "Hide background" : "Read background"} selected={background} onPress={() => setBackground(!background)} />{background && <TopicContext topic={selectedTopic} />}</View>
    <Text style={T.body}>{currentRun ? `${currentRun.position === "for" ? "For" : "Against"} the motion` : "Your side is assigned by a roll"} · {confidence[currentRun?.proficiency || proficiency]}</Text>
    <JudgingLabel local={local} />
    {!currentRun && <Action label={setup ? "Close match setup" : "Change match setup"} selected={setup} disabled={busy} onPress={() => setSetup(!setup)} />}
    {setup && !currentRun && <DebateSetup topics={catalog.tournamentTopics} topic={topic} proficiency={proficiency} busy={busy} onTopic={onTopic} onProficiency={onProficiency} />}
    {currentRun ? <Action label={legacy ? `Continue match ${currentRun.round}` : "Continue boss challenge"} primary busy={busy} onPress={onResume} testID="start-debate-tournament" /> : local ? <><Text style={T.small}>This mode offers unscored boss practice. Competitive judging is currently unavailable.</Text><Action label={`Roll to practise with ${catalog.boss.name}`} primary busy={busy} onPress={onBossPractice} testID="start-debate-practice" /></> : <Action label={`Roll to challenge ${catalog.boss.name}`} primary busy={busy} onPress={onStart} testID="start-debate-tournament" />}
    <View style={R.smallCard}><Text style={T.h3}>Meet {catalog.boss.name}</Text><Text style={T.small}>A fictional policy challenger who asks about evidence, trade-offs and a workable plan.</Text>{!local && <Action label={`Roll to practise with ${catalog.boss.name}`} busy={busy} onPress={onBossPractice} testID="start-debate-practice" />}</View>
    <View style={R.row}><Action label="Rewards" icon="gift" selected={rewards} onPress={() => setRewards(!rewards)} style={{ flex: 1 }} /><Action label="Match history" icon="clock" onPress={onHistory} style={{ flex: 1 }} /></View>
    {rewards && <View style={R.smallCard}><Text style={T.h3}>Rewards for taking part</Text><Text style={T.body}>Eligible match: +{catalog.rewardPreview?.coins || 0} Coins · +{catalog.rewardPreview?.xp || 0} XP</Text><Text style={T.small}>{catalog.rewardPreview?.unlockNote}</Text><Text style={T.small}>Up to {catalog.rewardPreview?.dailyCap || 2} rewarded debate completions each day. Learning remains open after the reward limit.</Text></View>}
  </View>;
}
