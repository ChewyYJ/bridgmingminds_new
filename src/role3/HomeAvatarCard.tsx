import React, { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { C, T, Icon } from "../components/ui";
import { LayeredAvatar } from "../avatar/LayeredAvatar";
import { normalizeSelection } from "../avatar/pack";
import { Action, useGamification } from "./common";
import { PixelScene } from "./PixelStreetBackdrop";

export interface HomeAvatarCardProps {
  onOpenProgress: () => void;
}

/** Compact personal context; daily learning remains the primary action. */
export function HomeAvatarCard({ onOpenProgress }: HomeAvatarCardProps) {
  const { data, loading, error, reload } = useGamification();
  const [sceneSize, setSceneSize] = useState({ width: 340, height: 142 });
  if (!data) return <View style={styles.pending} testID="home-avatar-card" onLayout={event => setSceneSize(event.nativeEvent.layout)}>
    {loading ? <><ActivityIndicator color={C.forest} /><Text style={T.small}>Loading your avatar…</Text></> : <><Text accessibilityRole="alert" style={T.small}>{error || "Your avatar couldn’t be loaded."}</Text><Action label="Retry avatar" onPress={reload} /></>}
  </View>;

  const current = Math.max(0, Math.min(data.levelProgress.current, data.levelProgress.required));
  const required = Math.max(1, data.levelProgress.required);
  return <Pressable accessibilityRole="button" accessibilityLabel="Open your progress" accessibilityHint={`Level ${data.level}, ${current} of ${required} XP, ${data.streak.current}-day streak. View your learning history and Dictionary.`} onPress={onOpenProgress} style={({ pressed }) => [styles.card, { opacity: pressed ? 0.8 : 1 }]} testID="home-avatar-card" onLayout={event => setSceneSize(event.nativeEvent.layout)}>
    <View style={styles.scene} pointerEvents="none" accessible={false}><PixelScene scene="skyline" width={sceneSize.width} height={sceneSize.height} absolute /></View>
    <View style={styles.status}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}><Text style={[T.h2, { fontSize: 20 }]}>Level {data.level}</Text><Icon name="chevron-right" size={16} /></View>
      <View style={{ gap: 7 }} accessibilityRole="progressbar" accessibilityLabel="Avatar level progress" accessibilityValue={{ min: 0, max: required, now: current, text: current + " of " + required + " XP toward level " + (data.level + 1) }}>
        <Text style={[T.small, { color: C.ink }]}>{current.toLocaleString()} / {required.toLocaleString()} XP</Text>
        <View style={styles.track}><View style={[styles.progress, { width: `${current / required * 100}%` }]} /></View>
      </View>
      <View style={styles.streak} testID="home-streak" accessibilityLabel={data.streak.current + " day streak"}>
        <Icon name="zap" size={17} color="#8C683E" /><Text style={[T.small, { color: C.ink, fontFamily: "DMMedium" }]}>{data.streak.current}-day streak</Text>
      </View>
    </View>
    <View pointerEvents="none" style={styles.portrait}>
      <LayeredAvatar selection={normalizeSelection(data.avatar.selection)} variant="chibi" animation="idle" scale={0.38} accessibilityLabel="Your equipped avatar" />
      <Text style={[T.small, styles.avatarLink]}>View progress</Text>
    </View>
    {!!error && <Text accessibilityRole="alert" style={[T.small, styles.error]}>{error}</Text>}
  </Pressable>;
}

const styles = StyleSheet.create({
  card: { width: "100%", minHeight: 142, padding: 10, flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1, borderColor: C.border, borderRadius: 17, backgroundColor: C.paper, overflow: "hidden" },
  scene: { position: "absolute", inset: 0, opacity: 0.88 },
  status: { flex: 1, minWidth: 0, gap: 7, padding: 10, borderRadius: 12, backgroundColor: "rgba(255,252,248,0.90)" },
  portrait: { marginLeft: "auto", width: 102, alignItems: "center", justifyContent: "center" },
  avatarLink: { color: C.ink, fontSize: 12, borderRadius: 8, backgroundColor: "rgba(255,252,248,0.94)", paddingHorizontal: 6, paddingVertical: 2 },
  track: { height: 7, backgroundColor: C.sage, borderRadius: 4, overflow: "hidden" },
  progress: { height: 7, borderRadius: 4, backgroundColor: "#84715D" },
  streak: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 5, alignSelf: "flex-start" },
  pending: { minHeight: 142, padding: 16, alignItems: "center", justifyContent: "center", gap: 12, borderWidth: 1, borderColor: C.border, borderRadius: 17, backgroundColor: C.paper },
  error: { position: "absolute", bottom: 4, left: 16, right: 16, backgroundColor: C.paper },
});
