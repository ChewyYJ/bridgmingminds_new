import React from "react";
import { Text, View } from "react-native";
import { ITEM_CATALOG, ACHIEVEMENTS, type RewardReceipt } from "../../shared/gamification.mjs";
import { T } from "../components/ui";

/** Render only unlocks present in the committed server reward receipt. */
export function ConfirmedUnlocks({ receipt }: { receipt?: RewardReceipt }) {
  if (!receipt) return null;
  const items = ITEM_CATALOG.filter(item => receipt.unlockedItems.includes(item.id));
  const achievements = ACHIEVEMENTS.filter(item => receipt.achievements.includes(item.id));
  if (!items.length && !achievements.length) return null;
  return <View style={{ gap: 6 }} accessibilityLiveRegion="polite">
    {items.map(item => <Text key={item.id} style={T.body}>Unlocked · {item.name}</Text>)}
    {achievements.map(item => <Text key={item.id} style={T.body}>🏆 {item.title}</Text>)}
    <Text style={T.small}>{receipt.streak.current}-day learning streak · rewards saved</Text>
  </View>;
}
