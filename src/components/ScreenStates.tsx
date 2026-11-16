import React, { useEffect, useState } from "react";
import { Animated, Platform, Text, View } from "react-native";
import { useReducedMotion } from "../hooks/useReducedMotion";
import { useTheme } from "../theme/ThemeProvider";
import { Button, Card, Icon } from "./ui";

export function ScreenLoading({
  label = "Loading your space…",
}: {
  label?: string;
}) {
  const { C, T } = useTheme();
  const reduced = useReducedMotion();
  const [pulse] = useState(() => new Animated.Value(1));
  useEffect(() => {
    if (reduced) {
      pulse.setValue(1);
      return;
    }
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 0.4,
          duration: 700,
          useNativeDriver: Platform.OS !== "web",
        }),
        Animated.timing(pulse, {
          toValue: 1,
          duration: 700,
          useNativeDriver: Platform.OS !== "web",
        }),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [pulse, reduced]);
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      style={{
        width: "100%",
        maxWidth: 680,
        padding: 24,
        gap: 24,
        alignSelf: "center",
      }}
    >
      <Text style={T.small} accessibilityLiveRegion="polite">
        {label}
      </Text>
      <Animated.View aria-hidden style={{ opacity: pulse, gap: 14 }}>
        <View
          style={{
            height: 28,
            width: "64%",
            backgroundColor: C.sage,
            borderRadius: 8,
          }}
        />
        <View
          style={{
            height: 14,
            width: "90%",
            backgroundColor: C.sage,
            borderRadius: 5,
          }}
        />
        <View
          style={{ height: 180, backgroundColor: C.sage, borderRadius: 20 }}
        />
        <View
          style={{ height: 48, backgroundColor: C.sage, borderRadius: 12 }}
        />
      </Animated.View>
    </View>
  );
}

export function NotFound({ onHome }: { onHome: () => void }) {
  const { C, T } = useTheme();
  return (
    <View
      role="main"
      style={{
        flex: 1,
        justifyContent: "center",
        backgroundColor: C.cream,
        padding: 24,
      }}
    >
      <Card
        style={{ width: "100%", maxWidth: 480, alignSelf: "center", gap: 16 }}
      >
        <Icon name="compass" size={32} color={C.accent} />
        <Text role="heading" aria-level={1} style={T.title}>
          Let’s find your way back.
        </Text>
        <Text style={T.body}>
          This page isn’t here. Your saved practice is still in your account.
        </Text>
        <Button label="Go to Home" icon="arrow-left" onPress={onHome} />
      </Card>
    </View>
  );
}

/** Keep technical traces out of the learner-facing recovery screen. */
export function ScreenError({ retry }: { retry: () => void }) {
  const { C, T } = useTheme();
  return (
    <View
      role="main"
      style={{
        flex: 1,
        justifyContent: "center",
        backgroundColor: C.cream,
        padding: 24,
      }}
    >
      <Card
        style={{ width: "100%", maxWidth: 480, alignSelf: "center", gap: 16 }}
      >
        <Icon name="refresh-cw" size={28} color={C.accent} />
        <Text role="heading" aria-level={1} style={T.title}>
          This page needs another try.
        </Text>
        <Text style={T.body}>
          We couldn’t open it just now. Check your connection and try again.
        </Text>
        <Button label="Try again" onPress={retry} />
      </Card>
    </View>
  );
}
