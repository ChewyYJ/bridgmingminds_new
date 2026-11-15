import React, { useState } from "react";
import { Text, View } from "react-native";
import { C, T, Icon } from "../components/ui";
import { Action, LoadState, Meter, R, ScreenHeader, useGamification } from "./common";

export function AchievementsScreen({ onBack }: { onBack: () => void }) {
  const { data, loading, error, reload } = useGamification();
  const [filter, setFilter] = useState<"all" | "progress" | "earned">("all");
  if (!data) return <View style={R.page}><ScreenHeader title="Achievements" onBack={onBack} /><LoadState loading={loading} error={error} onRetry={reload} /></View>;
  const entries = data.achievements.filter(entry => filter === "all" || (filter === "earned" ? !!entry.earnedAt : !entry.earnedAt));
  return <View style={R.page} testID="achievements-screen">
    <ScreenHeader title="Achievements" subtitle="The habits and ideas you’re growing, one step at a time." onBack={onBack} />
    <View style={R.row}>{([ ["all", "All"], ["progress", "In progress"], ["earned", "Earned"] ] as const).map(([id, label]) => <Action key={id} label={label} selected={filter === id} onPress={() => setFilter(id)} />)}</View>
    <View style={[R.card, { backgroundColor: C.sage }]}><Text style={T.h3}>🔥 {data.streak.current}-day streak</Text><Text style={T.small}>{data.streak.securedToday ? "Today is counted. Enjoy your progress." : "Your next eligible practice can build the habit."} Longest streak: {data.streak.longest} days.</Text></View>
    {!entries.length && <View style={R.card}><Text style={T.body}>Your next milestone is still ahead.</Text><Text style={T.small}>Explore the All tab to see what you can work toward.</Text></View>}
    {entries.map(entry => <View key={entry.id} style={R.card}>
      <View style={R.row}><View style={{ padding: 12, borderRadius: 14, backgroundColor: entry.earnedAt ? "#F4E1A6" : C.sage }}><Icon name={entry.earnedAt ? "award" : "flag"} size={25} color={entry.earnedAt ? "#9B6D14" : C.muted} /></View><View style={{ flex: 1, gap: 4 }}><Text style={T.h3}>{entry.title}</Text><Text style={T.small}>{entry.description}</Text></View></View>
      <Meter value={entry.progress} max={entry.target} label={entry.earnedAt ? "Earned" : entry.progress > 0 ? "In progress" : "Not started"} />
      {!!entry.earnedAt && <Text style={T.small}>Earned {new Date(entry.earnedAt).toLocaleDateString()}</Text>}
    </View>)}
  </View>;
}
