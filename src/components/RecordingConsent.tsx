import { useTheme, createThemedStyles } from "../theme/ThemeProvider";
import React, { useEffect, useId, useState } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { Button, Icon } from "./ui";

export function RecordingConsent({
  busy,
  onAllow,
  onWrite,
}: {
  busy: boolean;
  onAllow: () => void;
  onWrite?: () => void;
}) {
  const { C, T } = useTheme();
  const s = useStyles();

  const [display, setDisplay] = useState<
    "closed" | "hover" | "focus" | "pinned"
  >("closed");
  const [focused, setFocused] = useState(false);
  const detailsId = useId();
  const expanded = display !== "closed";

  useEffect(() => {
    if (Platform.OS !== "web" || !expanded) return;
    const dismiss = (event: KeyboardEvent) => {
      if (event.key === "Escape") setDisplay("closed");
    };
    document.addEventListener("keydown", dismiss);
    return () => document.removeEventListener("keydown", dismiss);
  }, [expanded]);

  return (
    <View style={{ gap: 14 }}>
      <View
        onPointerLeave={() =>
          setDisplay((value) => (value === "hover" ? "closed" : value))
        }
      >
        <View style={s.heading}>
          <Icon name="shield" size={22} />
          <View style={{ flex: 1, gap: 3 }}>
            <Text style={T.h3}>Private recording</Text>
            <Text style={T.small}>Deleted after 30 days.</Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Recording privacy details"
            accessibilityHint="Shows how recordings are stored and transcribed."
            accessibilityState={{ expanded }}
            aria-expanded={expanded}
            {...(Platform.OS === "web" ? { "aria-controls": detailsId } : {})}
            onHoverIn={() =>
              setDisplay((value) => (value === "closed" ? "hover" : value))
            }
            onFocus={() => {
              setFocused(true);
              setDisplay((value) => (value === "pinned" ? value : "focus"));
            }}
            onBlur={() => {
              setFocused(false);
              setDisplay((value) => (value === "pinned" ? value : "closed"));
            }}
            onPress={() =>
              setDisplay((value) => (value === "pinned" ? "closed" : "pinned"))
            }
            style={({ pressed }) => [
              s.info,
              focused && s.focused,
              pressed && { backgroundColor: C.sage },
            ]}
          >
            <Icon name="info" size={20} />
          </Pressable>
        </View>
        {expanded && (
          <View
            nativeID={detailsId}
            testID="recording-privacy-details"
            style={s.details}
          >
            <Text style={T.small}>
              Recordings are stored privately on this server for playback and
              optional transcription.
            </Text>
            <Text style={T.small}>
              With AI enabled, Use recording sends your audio to the provider.
            </Text>
            <Text style={T.small}>
              Microphone access is requested when you tap Record. Change storage
              in Settings{onWrite ? " or write instead" : ""}.
            </Text>
          </View>
        )}
      </View>
      <Button
        label="Allow private recording"
        icon="mic"
        loading={busy}
        onPress={onAllow}
      />
      {onWrite && (
        <Button label="Write instead" variant="ghost" onPress={onWrite} />
      )}
    </View>
  );
}

const useStyles = createThemedStyles(({ C }) =>
  StyleSheet.create({
    heading: { flexDirection: "row", alignItems: "center", gap: 10 },
    info: {
      width: 44,
      height: 44,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: 22,
      borderWidth: 2,
      borderColor: "transparent",
    },
    focused: { borderColor: C.forest },
    details: {
      marginTop: 10,
      padding: 14,
      gap: 9,
      borderRadius: 12,
      backgroundColor: "#F3F5EE",
    },
  }),
);
