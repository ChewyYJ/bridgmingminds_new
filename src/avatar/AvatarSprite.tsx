import React, { useEffect, useMemo, useState } from "react";
import {
  Image,
  Platform,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { Asset } from "expo-asset";
import { useReducedMotion } from "../hooks/useReducedMotion";
import { AVATAR_SPRITES, type AvatarAnimation } from "./sprites";

/** A single pixel-art image drawn at `scale` (crisp on web). */
export function PixelImage({
  source,
  width,
  height,
  scale = 2,
  style,
  accessibilityLabel,
}: {
  source: number;
  width: number;
  height: number;
  scale?: number;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}) {
  const w = width * scale;
  const h = height * scale;
  const webUri = useMemo(
    () => (Platform.OS === "web" ? Asset.fromModule(source).uri : null),
    [source],
  );
  return (
    <View
      accessible={
        accessibilityLabel && Platform.OS !== "web" ? true : undefined
      }
      accessibilityRole={accessibilityLabel ? "image" : undefined}
      accessibilityLabel={accessibilityLabel}
      style={[{ width: w, height: h }, style]}
    >
      {webUri ? (
        React.createElement("img", {
          src: webUri,
          alt: "",
          draggable: false,
          style: {
            width: w,
            height: h,
            imageRendering: "pixelated",
            pointerEvents: "none",
            userSelect: "none",
          },
        })
      ) : (
        <Image
          source={source}
          resizeMode="stretch"
          style={{ width: w, height: h }}
        />
      )}
    </View>
  );
}

/**
 * Plays one of the avatar sprite sheets cut from the BridgingMinds mock.
 * `scale` is the on-screen size of one art pixel. Motion stops (first frame)
 * when the system or app asks for reduced motion.
 */
export function AvatarSprite({
  animation,
  scale = 2,
  facing = "right",
  playing = true,
  style,
  accessibilityLabel,
}: {
  animation: AvatarAnimation;
  scale?: number;
  facing?: "left" | "right";
  playing?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}) {
  const sheet = AVATAR_SPRITES[animation];
  const reduced = useReducedMotion();
  const animate = playing && !reduced;
  const [tick, setTick] = useState({ animation, frame: 0 });
  const frame = tick.animation === animation ? tick.frame : 0;

  useEffect(() => {
    if (!animate) return;
    const id = setInterval(
      () =>
        setTick((t) => {
          const current = t.animation === animation ? t.frame : 0;
          const next =
            current + 1 >= sheet.frames ? sheet.loopFrom : current + 1;
          return { animation, frame: next };
        }),
      1000 / sheet.fps,
    );
    return () => clearInterval(id);
  }, [animate, animation, sheet]);

  const width = sheet.frameWidth * scale;
  const height = sheet.frameHeight * scale;
  const sheetWidth = width * sheet.frames;
  const shift = -(animate ? frame : 0) * width;
  const webUri = useMemo(
    () => (Platform.OS === "web" ? Asset.fromModule(sheet.source).uri : null),
    [sheet.source],
  );

  return (
    <View
      accessible={Platform.OS !== "web" ? true : undefined}
      accessibilityRole="image"
      accessibilityLabel={accessibilityLabel ?? `Avatar: ${sheet.description}`}
      style={[{ width, height, overflow: "hidden" }, style]}
    >
      <View
        style={{
          width,
          height,
          transform: facing === "left" ? [{ scaleX: -1 }] : undefined,
        }}
      >
        {webUri ? (
          // Web: a plain <img> so the browser keeps pixels crisp when scaled.
          React.createElement("img", {
            src: webUri,
            alt: "",
            draggable: false,
            style: {
              position: "absolute",
              top: 0,
              left: 0,
              width: sheetWidth,
              height,
              maxWidth: "none",
              transform: `translateX(${shift}px)`,
              imageRendering: "pixelated",
              pointerEvents: "none",
              userSelect: "none",
            },
          })
        ) : (
          <Image
            source={sheet.source}
            resizeMode="stretch"
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: sheetWidth,
              height,
              transform: [{ translateX: shift }],
            }}
          />
        )}
      </View>
    </View>
  );
}
