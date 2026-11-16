import { useTheme } from "../theme/ThemeProvider";
import React, { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useReducedMotion } from "../hooks/useReducedMotion";

const BAR_COUNT = 19;
const empty = () => Array<number>(BAR_COUNT).fill(0);

/** dBFS from Expo's actual recorder, on web and native. No signal is zero. */
function amplitude(decibels: number | undefined) {
  if (decibels === undefined || !Number.isFinite(decibels)) return 0;
  return Math.max(0, Math.min(1, (decibels + 60) / 54));
}

export function LiveVoiceMeter({
  recorder,
  active,
}: {
  recorder: { getStatus: () => { isRecording: boolean; metering?: number } };
  active: boolean;
}) {
  const { C } = useTheme();

  const reducedMotion = useReducedMotion();
  const [signal, setSignal] = useState({ samples: empty(), available: true });
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(
      () => {
        try {
          const status = recorder.getStatus();
          const available =
            typeof status.metering === "number" &&
            Number.isFinite(status.metering);
          const level = status.isRecording ? amplitude(status.metering) : 0;
          setSignal((previous) => ({
            available,
            // Reduced motion keeps a stationary meter; both modes use measured input.
            samples: reducedMotion
              ? Array<number>(BAR_COUNT).fill(level)
              : [...previous.samples.slice(1), level],
          }));
        } catch {
          setSignal({ samples: empty(), available: false });
        }
      },
      reducedMotion ? 250 : 80,
    );
    return () => clearInterval(timer);
  }, [active, recorder, reducedMotion]);
  const samples = active ? signal.samples : empty();
  const current = samples[samples.length - 1];
  return (
    <View style={styles.container}>
      <View
        testID="live-voice-meter"
        accessibilityRole="progressbar"
        accessibilityLabel={
          active ? "Live microphone level" : "Microphone inactive"
        }
        accessibilityValue={{
          min: 0,
          max: 100,
          now: Math.round(current * 100),
        }}
        accessibilityLiveRegion="none"
        style={styles.wave}
      >
        {samples.map((level, i) => (
          <View
            key={i}
            testID={`voice-bar-${i}`}
            style={{
              width: 5,
              borderRadius: 4,
              height: 5 + level * 43,
              backgroundColor: active && level > 0.02 ? C.forest : C.border,
            }}
          />
        ))}
      </View>
      {active && !signal.available ? (
        <Text style={styles.note}>Recording · level display unavailable</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: "center", gap: 6 },
  wave: {
    height: 52,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
  },
  note: {
    fontFamily: "DM",
    fontSize: 12,
    color: "#737373",
    textAlign: "center",
  },
});
