import { useTheme } from "../theme/ThemeProvider";
import React from "react";
import { Pressable, Text, View } from "react-native";
import { Icon } from "../components/ui";

export function AvatarPanelHeader({
  title,
  subtitle,
  onBack,
  onSettings,
}: {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  onSettings?: () => void;
}) {
  const { C, T } = useTheme();

  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        minHeight: 44,
        gap: 7,
      }}
    >
      {onBack && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back"
          onPress={onBack}
          style={{
            width: 44,
            height: 44,
            alignItems: "flex-start",
            justifyContent: "center",
          }}
        >
          <Icon name="arrow-left" size={24} color={C.ink} />
        </Pressable>
      )}
      <View style={{ flex: 1, gap: 2 }}>
        <Text accessibilityRole="header" style={[T.h2, { fontSize: 24 }]}>
          {title}
        </Text>
        {subtitle && (
          <Text style={[T.small, { fontSize: 13 }]}>{subtitle}</Text>
        )}
      </View>
      {onSettings && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Settings"
          onPress={onSettings}
          style={{
            width: 44,
            height: 44,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Icon name="settings" size={23} color={C.ink} />
        </Pressable>
      )}
    </View>
  );
}
