import React from "react";
import { Pressable, Text, View } from "react-native";
import { C, T, Icon } from "../components/ui";

export function AvatarPanelHeader({ title, onBack }: { title: string; onBack: () => void }) {
  return <View style={{ flexDirection: "row", alignItems: "center", minHeight: 44 }}>
    <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={onBack} style={{ width: 44, height: 44, alignItems: "flex-start", justifyContent: "center" }}><Icon name="chevron-left" size={27} color={C.ink} /></Pressable>
    <Text accessibilityRole="header" style={[T.h2, { flex: 1, textAlign: "center", fontSize: 21 }]}>{title}</Text><View style={{ width: 44 }} />
  </View>;
}
