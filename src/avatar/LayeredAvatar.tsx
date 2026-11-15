import React, { memo, useEffect, useMemo, useState } from "react";
import {
  AppState,
  Image,
  Platform,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { Asset } from "expo-asset";
import { useReducedMotion } from "../hooks/useReducedMotion";
import { AVATAR_PACK } from "./generated-pack";
import {
  getAvatarLayers,
  type AvatarAnimation,
  type AvatarSelection,
  type AvatarStyle,
} from "./pack";

type Layer = ReturnType<typeof getAvatarLayers>[number];

const decodedAtlases = new Map<number, Promise<void>>();

/** Decode each atlas before a frame swaps sources, including in item thumbnails. */
function decodeWebAtlas(source: number) {
  const cached = decodedAtlases.get(source);
  if (cached) return cached;
  const pending = new Promise<void>((resolve, reject) => {
    const image = new window.Image();
    image.decoding = "sync";
    image.onload = () => image.decode().then(() => resolve(), reject);
    image.onerror = () => reject(new Error("Avatar artwork could not be loaded."));
    image.src = Asset.fromModule(source).uri;
  });
  decodedAtlases.set(source, pending);
  void pending.catch(() => decodedAtlases.delete(source));
  return pending;
}

/** Keep the last complete frame until every image for its replacement is ready. */
function useDecodedFrame(layers: Layer[], variant: AvatarStyle) {
  const [ready, setReady] = useState<{ layers: Layer[]; variant: AvatarStyle }>({
    layers: [],
    variant,
  });
  useEffect(() => {
    if (Platform.OS !== "web") return;
    let current = true;
    const sources = [...new Set(layers.map((layer) => layer.source))];
    void Promise.all(sources.map(decodeWebAtlas)).then(
      () => {
        if (current) setReady({ layers, variant });
      },
      // Retain a complete look on failure. The next frame can retry the atlas.
      () => {},
    );
    return () => {
      current = false;
    };
  }, [layers, variant]);
  return Platform.OS !== "web" ? layers : ready.variant === variant ? ready.layers : [];
}

const STYLE_ACTIONS: Record<AvatarStyle, AvatarAnimation[]> = {
  big: ["idle", "walk"],
  chibi: ["idle", "greet", "speak", "celebrate", "eat", "eatOnigiri", "eatBento"],
};

/** The two representations deliberately have different animation roles. */
export function supportedAvatarAnimation(
  variant: AvatarStyle,
  requested: AvatarAnimation,
): AvatarAnimation {
  const rig: typeof AVATAR_PACK.styles[AvatarStyle] & {
    animations?: AvatarAnimation[];
  } = AVATAR_PACK.styles[variant];
  const available = rig.animations ?? STYLE_ACTIONS[variant];
  return available.includes(requested) ? requested : "idle";
}

/** All body and clothing pieces use the same frame; none owns a timer. */
function useAvatarFrame(animation: AvatarAnimation, playing: boolean) {
  const reduced = useReducedMotion();
  const [active, setActive] = useState(
    AppState.currentState == null || AppState.currentState === "active",
  );
  const [visible, setVisible] = useState(
    Platform.OS !== "web" || typeof document === "undefined" || !document.hidden,
  );
  const [clock, setClock] = useState({ animation, frame: 0 });
  // Reset before rendering children, including a rapid A → B → A action change.
  if (clock.animation !== animation) setClock({ animation, frame: 0 });
  const { frames, fps, loopFrom } = AVATAR_PACK.animations[animation];
  const running = playing && !reduced && active && visible;

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (next) => {
      setActive(next === "active");
    });
    const onVisibility = () => setVisible(!document.hidden);
    if (Platform.OS === "web")
      document.addEventListener("visibilitychange", onVisibility);
    return () => {
      subscription.remove();
      if (Platform.OS === "web")
        document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => {
      setClock((previous) => {
        const current = previous.animation === animation ? previous.frame : 0;
        return {
          animation,
          frame: current + 1 >= frames ? loopFrom : current + 1,
        };
      });
    }, 1000 / fps);
    return () => clearInterval(timer);
  }, [animation, fps, frames, loopFrom, running]);

  return reduced || !playing || clock.animation !== animation ? 0 : clock.frame;
}

/** A trimmed atlas cell, restored to its original rig position. */
const AtlasLayer = memo(function AtlasLayer({
  layer,
}: {
  layer: Layer;
}) {
  const webUri = useMemo(
    () => (Platform.OS === "web" ? Asset.fromModule(layer.source).uri : null),
    [layer.source],
  );
  const imageStyle = {
    position: "absolute" as const,
    left: -layer.x,
    top: -layer.y,
    width: layer.atlasWidth,
    height: layer.atlasHeight,
  };
  return (
    <View
      pointerEvents="none"
      style={{
        position: "absolute",
        left: layer.offsetX,
        top: layer.offsetY,
        width: layer.width,
        height: layer.height,
        overflow: "hidden",
      }}
    >
      {webUri ? (
        React.createElement("img", {
          src: webUri,
          alt: "",
          draggable: false,
          decoding: "sync",
          style: {
            ...imageStyle,
            maxWidth: "none",
            imageRendering: "pixelated",
            pointerEvents: "none",
            userSelect: "none",
          },
        })
      ) : (
        <Image
          accessible={false}
          source={layer.source}
          resizeMode="stretch"
          fadeDuration={0}
          style={imageStyle}
        />
      )}
    </View>
  );
});

export interface LayeredAvatarProps {
  selection: AvatarSelection;
  variant?: AvatarStyle;
  animation?: AvatarAnimation;
  facing?: "left" | "right";
  scale?: number;
  playing?: boolean;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
}

/** Composes the selected wearables and pose without baking outfit combinations. */
export const LayeredAvatar = memo(function LayeredAvatar({
  selection,
  variant = "big",
  animation = "idle",
  facing = "right",
  scale = 1,
  playing = true,
  accessibilityLabel,
  style,
}: LayeredAvatarProps) {
  const effectiveAnimation = supportedAvatarAnimation(variant, animation);
  const frame = useAvatarFrame(effectiveAnimation, playing);
  const rig = AVATAR_PACK.styles[variant];
  const layers = useMemo(
    () => getAvatarLayers(selection, variant, effectiveAnimation, frame),
    [selection, variant, effectiveAnimation, frame],
  );
  const readyLayers = useDecodedFrame(layers, variant);
  const width = rig.width * scale;
  const height = rig.height * scale;
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={
        accessibilityLabel ??
        `${selection.collection === "boy" ? "Boy" : "Girl"} avatar, ${variant === "big" ? "adult" : "chibi bust"}, ${effectiveAnimation}, facing ${facing}`
      }
      testID={`layered-avatar-${variant}`}
      style={[{ width, height }, style]}
    >
      <View
        pointerEvents="none"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={{
          width,
          height,
          transform: facing === "left" ? [{ scaleX: -1 }] : undefined,
        }}
      >
        <View
          style={{
            position: "absolute",
            width: rig.width,
            height: rig.height,
            transformOrigin: "top left",
            transform: [{ scale }],
          }}
        >
          {readyLayers.map((layer, index) => (
            <AtlasLayer key={`${layer.slot}-${index}`} layer={layer} />
          ))}
        </View>
      </View>
    </View>
  );
});
