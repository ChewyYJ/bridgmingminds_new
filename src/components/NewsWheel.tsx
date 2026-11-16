import { useTheme, createThemedStyles } from "../theme/ThemeProvider";
import React, { useEffect, useState } from "react";
import {
  Animated,
  Easing,
  Platform,
  Pressable,
  Text,
  View,
} from "react-native";
import Svg, { Circle, Path } from "react-native-svg";
import { useReducedMotion } from "../hooks/useReducedMotion";
import { Icon } from "./ui";

const segments = Array.from({ length: 8 }, (_, index) => {
  const start = ((index * 45 - 90) * Math.PI) / 180;
  const end = start + Math.PI / 4;
  return `M100 100 L${100 + 92 * Math.cos(start)} ${100 + 92 * Math.sin(start)} A92 92 0 0 1 ${100 + 92 * Math.cos(end)} ${100 + 92 * Math.sin(end)} Z`;
});
const useColorsStyles = createThemedStyles(({ C }) => [
  C.sage,
  C.peach,
  C.cream,
  C.yellow,
]);

export function NewsWheel({
  busy,
  disabled,
  onSpin,
}: {
  busy: boolean;
  disabled: boolean;
  onSpin: () => void;
}) {
  const { C, T } = useTheme();
  const colors = useColorsStyles();

  const reduced = useReducedMotion();
  const [rotation] = useState(() => new Animated.Value(0));
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    if (!busy || reduced) return;
    rotation.setValue(0);
    const animation = Animated.loop(
      Animated.timing(rotation, {
        toValue: 1,
        duration: 1100,
        easing: Easing.inOut(Easing.cubic),
        useNativeDriver: Platform.OS !== "web",
        isInteraction: false,
      }),
    );
    animation.start();
    return () => animation.stop();
  }, [busy, reduced, rotation]);

  return (
    <View style={{ alignItems: "center", gap: 8 }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Spin the wheel"
        accessibilityHint="Draw another news question before brainstorming"
        accessibilityState={{ disabled, busy }}
        disabled={disabled}
        onPress={onSpin}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={({ pressed }) => ({
          width: 176,
          height: 176,
          borderRadius: 88,
          borderWidth: 2,
          borderColor: focused ? C.forest : "transparent",
          opacity: pressed || (disabled && !busy) ? 0.6 : 1,
          alignItems: "center",
          justifyContent: "center",
        })}
      >
        <Animated.View
          pointerEvents="none"
          style={{
            width: "100%",
            height: "100%",
            transform: [
              {
                rotate: rotation.interpolate({
                  inputRange: [0, 1],
                  outputRange: ["0deg", "720deg"],
                }),
              },
            ],
          }}
        >
          <Svg width="100%" height="100%" viewBox="0 0 200 200">
            {segments.map((path, i) => (
              <Path
                key={i}
                d={path}
                fill={colors[i % colors.length]}
                stroke={C.paper}
                strokeWidth={3}
              />
            ))}
            <Circle
              cx={100}
              cy={100}
              r={94}
              fill="none"
              stroke={C.border}
              strokeWidth={2}
            />
          </Svg>
        </Animated.View>
        <View pointerEvents="none" style={{ position: "absolute", top: 0 }}>
          <Svg width={20} height={22} viewBox="0 0 20 22">
            <Path d="M2 2 L18 2 L10 20 Z" fill={C.forest} />
          </Svg>
        </View>
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            width: 76,
            height: 76,
            borderRadius: 38,
            backgroundColor: C.forest,
            alignItems: "center",
            justifyContent: "center",
            gap: 4,
          }}
        >
          <Icon name="rotate-cw" size={22} color={C.paper} />
          <Text style={{ ...T.small, color: C.paper, fontFamily: "DMBold" }}>
            {busy ? "Drawing…" : "Spin"}
          </Text>
        </View>
      </Pressable>
      <Text accessibilityLiveRegion="polite" style={T.small}>
        {busy
          ? "Finding your next headline…"
          : "Spin for another news question"}
      </Text>
    </View>
  );
}
