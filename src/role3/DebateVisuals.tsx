import React from "react";
import { Platform, Text, View } from "react-native";
import Svg, { Path } from "react-native-svg";
import { C, T } from "../components/ui";
import { PixelScene } from "./PixelStreetBackdrop";

export function SoftTownBackdrop() {
  return <View pointerEvents="none" accessible={false} style={{ position: "absolute", inset: 0, overflow: "hidden", borderRadius: 20 }}>
    <View style={{ opacity: 0.08 }}><PixelScene scene="hall" width={680} height={300} /></View>
  </View>;
}

export function TurnProgress({ value, label }: { value: number; label: string }) {
  return <View accessibilityRole="progressbar" accessibilityLabel={label} accessibilityValue={{ min: 0, max: 3, now: value, text: `${value} of 3 turns completed` }} style={{ height: 8, width: "100%", borderRadius: 4, borderWidth: 1, borderColor: "#8C7D70", backgroundColor: "#F8F2EA", overflow: "hidden" }}>
    <View style={{ height: "100%", width: `${value / 3 * 100}%`, backgroundColor: "#78685A" }} />
  </View>;
}

export function VoiceMark({ active = false }: { active?: boolean }) {
  return <View accessible={false} style={{ flexDirection: "row", gap: 3, justifyContent: "center", alignItems: "center", height: 30 }}>
    {[5, 9, 16, 24, 12, 28, 19, 10, 22, 15, 7, 4].map((height, index) => <View key={index} style={{ width: 3, height, borderRadius: 2, backgroundColor: active ? "#6F6256" : "#C8BDB1" }} />)}
  </View>;
}

export function JudgingLabel({ local }: { local: boolean }) {
  return <View style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12, backgroundColor: C.sage, alignSelf: "flex-start" }}>
    <Text style={[T.small, { fontSize: 12, color: C.ink }]}>{local ? "Practice · unscored" : "AI-assessed · provisional"}</Text>
  </View>;
}

export function DebateSteps({ completed }: { completed: number }) {
  return <View style={{ flexDirection: "row", gap: 6 }} accessibilityLabel={`${Math.min(completed, 3)} of 3 turns submitted`}>
    {["Opening", "Rebuttal", "Closing"].map((label, index) => <View key={label} style={{ flex: 1, gap: 7, alignItems: "center" }}>
      <View style={{ height: 4, width: "100%", borderRadius: 2, backgroundColor: index <= completed ? C.forest : C.border }} />
      <Text style={[T.small, { fontSize: 12, color: index === completed ? C.ink : C.muted, fontFamily: index === completed ? "DMBold" : "DM" }]}>{index < completed ? "✓ " : ""}{label}</Text>
    </View>)}
  </View>;
}

function Laurel({ mirror = false, color }: { mirror?: boolean; color: string }) {
  return <Svg width={24} height={40} viewBox="0 0 24 40" {...(Platform.OS === "web" ? { "aria-hidden": true } : { accessible: false })} style={mirror ? { transform: [{ scaleX: -1 }] } : undefined}>
    <Path d="M21 36C8 30 4 14 15 3" fill="none" stroke={color} strokeWidth={1.5} />
    <Path d="M14 6C9 6 9 2 13 0C16 1 17 4 14 6ZM10 12C4 12 3 8 5 5C10 5 12 8 10 12ZM8 19C2 19 0 15 2 12C7 12 10 15 8 19ZM10 26C3 27 0 23 1 20C7 19 10 22 10 26ZM14 32C7 35 3 32 3 28C9 26 13 28 14 32ZM10 14C10 9 15 8 18 10C17 14 14 16 10 14ZM9 21C9 16 14 15 17 17C16 22 12 24 9 21ZM12 28C12 23 17 21 20 23C19 28 16 30 12 28ZM17 34C17 29 21 27 24 30C23 34 20 36 17 34Z" fill={color} />
  </Svg>;
}

export function Laurels({ title, celebrate = false }: { title: string; celebrate?: boolean }) {
  return <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 12 }}>
    <Laurel color={celebrate ? "#9B773F" : C.forest} />
    <Text accessibilityRole="header" style={[T.title, { textAlign: "center", flexShrink: 1, fontSize: 32 }]}>{title}</Text>
    <Laurel mirror color={celebrate ? "#9B773F" : C.forest} />
  </View>;
}
