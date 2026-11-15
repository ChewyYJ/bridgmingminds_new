import React, { useState } from "react";
import { Pressable, Text, View, useWindowDimensions } from "react-native";
import { C, T, Icon } from "../components/ui";
import { useApp } from "../lib/state";
import { LayeredAvatar } from "../avatar/LayeredAvatar";
import { normalizeSelection } from "../avatar/pack";
import { Action, CoinBalance, LoadState, Meter, R, useGamification } from "./common";
import { PixelStreetBackdrop } from "./PixelStreetBackdrop";

export interface GamificationHomeProps {
  onOpenAvatar: () => void; onOpenFood: () => void; onOpenAchievements: () => void; onOpenDebate: () => void;
  onDailyPractice: () => void; onReadAloud: () => void; onReadReflect: () => void;
}

export function GamificationHome(props: GamificationHomeProps) {
  const { data, loading, error, reload } = useGamification();
  const { state } = useApp(); const { width } = useWindowDimensions();
  const [heroWidth, setHeroWidth] = useState(320);
  if (!data) return <LoadState loading={loading} error={error} onRetry={reload} />;
  const cards = [
    { label: "Daily Practice", detail: "Build your speaking habit", icon: "target", action: props.onDailyPractice },
    { label: "Read Aloud", detail: "Find your speaking rhythm", icon: "mic", action: props.onReadAloud },
    { label: "AI Debate", detail: "Meet a new perspective", icon: "message-circle", action: props.onOpenDebate },
    { label: "Read & Reflect", detail: "Explore an idea in depth", icon: "book-open", action: props.onReadReflect },
  ];
  return <View style={R.page} testID="gamification-home">
    <View style={[R.row, { justifyContent: "space-between" }]}>
      <View style={{ gap: 3 }}><Text style={T.label}>YOUR EVERYDAY PROGRESS</Text><Text accessibilityRole="header" style={T.title}>Hello, {state?.profile.displayName || "learner"}.</Text></View>
      <CoinBalance value={data.coins} />
    </View>
    <View style={[R.card, { paddingBottom: 0, overflow: "hidden" }]}>
      <View style={[R.row, { justifyContent: "space-between" }]}>
        <View style={{ flex: 1, minWidth: 160, gap: 8 }}><Text style={T.h3}>Level {data.level}</Text><Meter value={data.levelProgress.current} max={data.levelProgress.required} label="XP to next level" /></View>
        <View style={{ alignItems: "flex-end", gap: 3 }}><Text style={T.h3}>🔥 {data.streak.current}-day streak</Text><Text style={T.small}>{data.streak.securedToday ? "Today’s practice is complete" : "A little practice goes a long way"}</Text></View>
      </View>
      <View onLayout={event => setHeroWidth(event.nativeEvent.layout.width)} style={[R.row, { position: "relative", justifyContent: "center", alignItems: "center", gap: width < 500 ? 12 : 40, paddingTop: 10, borderTopLeftRadius: 16, borderTopRightRadius: 16, overflow: "hidden" }]}>
        <PixelStreetBackdrop width={heroWidth} height={240} />
        <View pointerEvents="none" style={{ position: "absolute", inset: 0, backgroundColor: "rgba(255,252,248,0.76)" }} />
        <LayeredAvatar selection={normalizeSelection(data.avatar.selection)} variant="chibi" scale={width < 500 ? 0.62 : 0.85} animation="idle" />
        <View style={{ flex: 1, maxWidth: 260, minWidth: 110, gap: 12, paddingBottom: 20 }}>
          <Text style={[T.h2, { fontSize: width < 500 ? 20 : 25 }]}>Ready for a new challenge?</Text>
          <Text style={T.small}>Small steps. Stronger ideas. Your own pace.</Text>
          <Action label="My avatar" icon="user" onPress={props.onOpenAvatar} />
        </View>
      </View>
    </View>
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
      {cards.map(card => <Pressable key={card.label} accessibilityRole="button" accessibilityLabel={card.label} onPress={card.action}
        style={({ pressed }) => [R.smallCard, { flexBasis: width < 600 ? "46%" : "22%", flexGrow: 1, minWidth: 130, minHeight: 148, justifyContent: "space-between", opacity: pressed ? 0.7 : 1 }]}>
        <Icon name={card.icon} size={27} /><Text style={T.h3}>{card.label}</Text><Text style={T.small}>{card.detail}</Text>
      </Pressable>)}
    </View>
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 14 }}>
      <View style={[R.card, { flexGrow: 1, flexBasis: 240 }]}><Text style={T.h3}>A moment of care</Text><Meter value={data.fullness.value} max={100} label="Fullness" /><Text style={T.small}>A meal and a little rest. Learning is always available.</Text>{data.fullness.careEnabled && data.fullness.remindersEnabled && data.fullness.value < 30 && <Text accessibilityLiveRegion="polite" style={T.body}>Your companion might enjoy a meal when you have a moment.</Text>}<Action label="Food & care" icon="coffee" onPress={props.onOpenFood} /></View>
      <View style={[R.card, { flexGrow: 1, flexBasis: 240 }]}><Text style={T.h3}>Your milestones</Text><Text style={[T.h2, { color: C.forest }]}>{data.achievements.filter(entry => entry.earnedAt).length} achievements earned</Text><Text style={T.small}>See the skills and habits you’re building.</Text><Action label="View achievements" icon="award" onPress={props.onOpenAchievements} /></View>
    </View>
    {!!error && <Text style={T.small}>{error}</Text>}
  </View>;
}
