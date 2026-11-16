import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { createThemedStyles, useTheme } from "../theme/ThemeProvider";
import type { Page } from "../types";
import { CoinBalance } from "../role3/common";
import { BridgingMindsMark } from "./art";
import { Icon } from "./ui";

const destinations: [Page, string, string][] = [
  ["home", "Home", "home"],
  ["play", "Play", "play"],
  ["discover", "Discover", "compass"],
  ["debate", "Debate", "message-circle"],
  ["profile", "Profile", "user"],
];
type NavigationProps = { active: string; navigate: (page: Page) => void };

function NavItem({
  page,
  label,
  icon,
  active,
  navigate,
}: NavigationProps & { page: Page; label: string; icon: string }) {
  const { C, T } = useTheme();
  const selected = active === page;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Navigate to ${label}`}
      accessibilityState={{ selected }}
      onPress={() => navigate(page)}
      style={({ pressed }) => ({
        minHeight: 52,
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        paddingHorizontal: 16,
        borderRadius: 12,
        backgroundColor: selected
          ? C.accentSurface
          : pressed
            ? C.quiet
            : "transparent",
      })}
    >
      <Icon name={icon} size={20} color={selected ? C.accent : C.muted} />
      <Text
        style={[
          T.body,
          {
            fontFamily: selected ? "DMBold" : "DMMedium",
            color: selected ? C.accent : C.muted,
          },
        ]}
      >
        {label}
      </Text>
      {selected && (
        <View
          style={{
            marginLeft: "auto",
            width: 5,
            height: 5,
            borderRadius: 3,
            backgroundColor: C.accent,
          }}
        />
      )}
    </Pressable>
  );
}

export function NavigationRail({
  active,
  navigate,
  name,
  guest,
}: NavigationProps & { name: string; guest: boolean }) {
  const { C, T } = useTheme();
  const s = useStyles();
  return (
    <View role="navigation" accessibilityLabel="Main navigation" style={s.rail}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="BridgingMinds home"
        onPress={() => navigate("home")}
        style={s.brand}
      >
        <BridgingMindsMark size={34} />
        <Text style={[T.h3, { fontSize: 17 }]}>BridgingMinds</Text>
      </Pressable>
      <View style={{ gap: 5 }}>
        {destinations.map(([page, label, icon]) => (
          <NavItem key={page} {...{ page, label, icon, active, navigate }} />
        ))}
      </View>
      <View style={{ flex: 1 }} />
      <NavItem
        page="settings"
        label="Settings"
        icon="settings"
        active={active}
        navigate={navigate}
      />
      <View style={s.profile}>
        <View style={s.initial}>
          <Text style={[T.h3, { color: C.accent }]}>
            {name.charAt(0).toUpperCase()}
          </Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text numberOfLines={1} style={[T.body, { fontFamily: "DMBold" }]}>
            {name}
          </Text>
          <Text style={T.small}>
            {guest ? "Guest account" : "Your learning space"}
          </Text>
        </View>
      </View>
    </View>
  );
}

export function TabBar({ active, navigate }: NavigationProps) {
  const { C } = useTheme();
  const s = useStyles();
  return (
    <View role="navigation" accessibilityLabel="Main navigation" style={s.tabs}>
      {destinations.map(([page, label, icon]) => {
        const selected = active === page;
        return (
          <Pressable
            key={page}
            accessibilityRole="button"
            accessibilityLabel={`Navigate to ${label}`}
            accessibilityState={{ selected }}
            onPress={() => navigate(page)}
            style={s.tab}
          >
            <View
              style={{
                width: 46,
                height: 30,
                borderRadius: 10,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: selected ? C.accentSurface : "transparent",
              }}
            >
              <Icon
                name={icon}
                size={20}
                color={selected ? C.accent : C.muted}
              />
            </View>
            <Text
              style={{
                fontFamily: selected ? "DMBold" : "DMMedium",
                fontSize: 11,
                lineHeight: 16,
                color: selected ? C.accent : C.muted,
              }}
            >
              {label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function AppHeader({
  coins,
  desktop,
  title,
}: {
  coins: number;
  desktop: boolean;
  title: string;
}) {
  const { T } = useTheme();
  const s = useStyles();
  return (
    <View
      role="banner"
      style={[s.header, { paddingHorizontal: desktop ? 32 : 18 }]}
    >
      {desktop ? (
        <Text style={T.small}>{title}</Text>
      ) : (
        <View
          style={{
            flex: 1,
            minWidth: 0,
            flexDirection: "row",
            alignItems: "center",
            gap: 7,
          }}
        >
          <BridgingMindsMark size={28} />
          <Text
            numberOfLines={1}
            style={[T.h3, { fontSize: 17, flexShrink: 1 }]}
          >
            BridgingMinds
          </Text>
        </View>
      )}
      <View testID="shell-coin-balance">
        <CoinBalance value={coins} />
      </View>
    </View>
  );
}

const useStyles = createThemedStyles(({ C }) =>
  StyleSheet.create({
    rail: {
      width: 232,
      backgroundColor: C.paper,
      padding: 16,
      borderRightWidth: 1,
      borderColor: C.border,
      gap: 16,
    },
    brand: {
      minHeight: 64,
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      paddingHorizontal: 8,
      marginBottom: 16,
    },
    profile: {
      borderTopWidth: 1,
      borderColor: C.border,
      paddingTop: 20,
      paddingBottom: 8,
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
    },
    initial: {
      height: 40,
      width: 40,
      borderRadius: 12,
      backgroundColor: C.accentSurface,
      alignItems: "center",
      justifyContent: "center",
    },
    header: {
      minHeight: 72,
      borderBottomWidth: 1,
      borderColor: C.border,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 8,
    },
    tabs: {
      flexDirection: "row",
      backgroundColor: C.paper,
      borderTopWidth: 1,
      borderColor: C.border,
      paddingVertical: 5,
    },
    tab: {
      flex: 1,
      minHeight: 58,
      alignItems: "center",
      justifyContent: "center",
      gap: 2,
    },
  }),
);
