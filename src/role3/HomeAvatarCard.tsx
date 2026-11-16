import { useTheme, createThemedStyles } from "../theme/ThemeProvider";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Icon } from "../components/ui";
import { LayeredAvatar } from "../avatar/LayeredAvatar";
import { normalizeSelection } from "../avatar/pack";
import { Action, useGamification } from "./common";
import { PixelScene } from "./PixelStreetBackdrop";

export interface HomeAvatarCardProps {
  onOpenAvatar: () => void;
  onOpenFood: () => void;
  onOpenAchievements: () => void;
}

/** Compact personal context; daily learning remains the primary action. */
export function HomeAvatarCard({ onOpenAvatar }: HomeAvatarCardProps) {
  const { C, T } = useTheme();
  const styles = useStyles();

  const { data, loading, error, reload } = useGamification();
  const [sceneSize, setSceneSize] = useState({ width: 340, height: 184 });
  if (!data)
    return (
      <View
        style={styles.pending}
        testID="home-avatar-card"
        onLayout={(event) => setSceneSize(event.nativeEvent.layout)}
      >
        {loading ? (
          <>
            <ActivityIndicator color={C.forest} />
            <Text style={T.small}>Loading your avatar…</Text>
          </>
        ) : (
          <>
            <Text accessibilityRole="alert" style={T.small}>
              {error || "Your avatar couldn’t be loaded."}
            </Text>
            <Action label="Retry avatar" onPress={reload} />
          </>
        )}
      </View>
    );

  const current = Math.max(
    0,
    Math.min(data.levelProgress.current, data.levelProgress.required),
  );
  const required = Math.max(1, data.levelProgress.required);
  return (
    <View
      style={styles.card}
      testID="home-avatar-card"
      onLayout={(event) => setSceneSize(event.nativeEvent.layout)}
    >
      <View style={styles.scene} pointerEvents="none" accessible={false}>
        <PixelScene
          scene="skyline"
          width={sceneSize.width}
          height={sceneSize.height}
          absolute
        />
      </View>
      <View style={styles.status}>
        <Text accessibilityRole="header" style={[T.h2, { fontSize: 22 }]}>
          Level {data.level}
        </Text>
        <View
          style={{ gap: 7 }}
          accessibilityRole="progressbar"
          accessibilityLabel="Avatar level progress"
          accessibilityValue={{
            min: 0,
            max: required,
            now: current,
            text:
              current +
              " of " +
              required +
              " XP toward level " +
              (data.level + 1),
          }}
        >
          <Text style={[T.small, { color: C.ink }]}>
            {current.toLocaleString()} / {required.toLocaleString()} XP
          </Text>
          <View style={styles.track}>
            <View
              style={[
                styles.progress,
                { width: `${(current / required) * 100}%` },
              ]}
            />
          </View>
        </View>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="My avatar"
        onPress={onOpenAvatar}
        testID="home-open-avatar"
        style={({ pressed }) => [
          styles.portrait,
          { opacity: pressed ? 0.7 : 1 },
        ]}
      >
        <LayeredAvatar
          selection={normalizeSelection(data.avatar.selection)}
          variant="chibi"
          animation="idle"
          scale={0.55}
          accessibilityLabel="Your equipped avatar"
        />
        <View style={styles.avatarLink}>
          <Text style={[T.small, { color: C.ink }]}>My avatar</Text>
          <Icon name="chevron-right" size={15} />
        </View>
      </Pressable>
      {!!error && (
        <Text accessibilityRole="alert" style={[T.small, styles.error]}>
          {error}
        </Text>
      )}
    </View>
  );
}

const useStyles = createThemedStyles(({ C }) =>
  StyleSheet.create({
    card: {
      width: "100%",
      minHeight: 184,
      padding: 16,
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      borderWidth: 1,
      borderColor: C.border,
      borderRadius: 20,
      backgroundColor: C.paper,
      overflow: "hidden",
    },
    scene: { position: "absolute", inset: 0, opacity: 0.54 },
    status: {
      flex: 1,
      minWidth: 0,
      maxWidth: 250,
      gap: 10,
      padding: 12,
      borderRadius: 14,
      backgroundColor: C.paper,
    },
    portrait: {
      marginLeft: "auto",
      width: 130,
      alignItems: "center",
      justifyContent: "flex-end",
      minHeight: 150,
    },
    avatarLink: {
      flexDirection: "row",
      alignItems: "center",
      gap: 2,
      borderRadius: 10,
      backgroundColor: C.paper,
      paddingHorizontal: 8,
      paddingVertical: 3,
    },
    track: {
      height: 7,
      backgroundColor: C.sage,
      borderRadius: 4,
      overflow: "hidden",
    },
    progress: { height: 7, borderRadius: 4, backgroundColor: C.accent },
    pending: {
      minHeight: 184,
      padding: 16,
      alignItems: "center",
      justifyContent: "center",
      gap: 12,
      borderWidth: 1,
      borderColor: C.border,
      borderRadius: 20,
      backgroundColor: C.paper,
    },
    error: {
      position: "absolute",
      bottom: 4,
      left: 16,
      right: 16,
      backgroundColor: C.paper,
    },
  }),
);
