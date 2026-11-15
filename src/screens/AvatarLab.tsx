import React, { useEffect, useState } from "react";
import { Platform, Pressable, Text, View, useWindowDimensions } from "react-native";
import { C, T, Button, Card } from "../components/ui";
import { AvatarSprite, PixelImage } from "../avatar/AvatarSprite";
import {
  AVATAR_PORTRAIT,
  AVATAR_SPRITES,
  type AvatarAnimation,
} from "../avatar/sprites";
import { useReducedMotion } from "../hooks/useReducedMotion";
import { WardrobeStudio } from "../avatar/WardrobeStudio";

export function AvatarLab({ onBack }: { onBack: () => void }) {
  const [tab, setTab] = useState<"studio" | "original">("studio");
  return (
    <View style={{ gap: 20 }}>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {([
          ["studio", "Customise avatar"],
          ["original", "Original preview"],
        ] as const).map(([value, label]) => (
          <Pressable
            key={value}
            accessibilityRole="button"
            accessibilityLabel={label}
            accessibilityState={{ selected: tab === value }}
            {...(Platform.OS === "web" ? { "aria-pressed": tab === value } : {})}
            onPress={() => setTab(value)}
            style={{
              minHeight: 44,
              paddingHorizontal: 16,
              paddingVertical: 11,
              borderRadius: 10,
              borderWidth: 1,
              borderColor: tab === value ? "#D8CBBE" : "#E7E7E7",
              backgroundColor: tab === value ? "#EDE6DD" : "#FFFFFF",
            }}
          >
            <Text style={{ fontFamily: "DMMedium", fontSize: 13, color: "#242424" }}>{label}</Text>
          </Pressable>
        ))}
      </View>
      {tab === "studio" ? <WardrobeStudio onBack={onBack} /> : <OriginalAvatarPreview onBack={onBack} />}
    </View>
  );
}

// The mock draws the eating chibi larger than the victory one, so scale them to
// matching head sizes on screen.
const CHIBI: {
  animation: AvatarAnimation;
  title: string;
  caption: string;
  scale: number;
}[] = [
  {
    animation: "cheer",
    title: "Cheer",
    caption: "For a friend's good point",
    scale: 2,
  },
  {
    animation: "eat",
    title: "Eat",
    caption: "Food & Fullness break",
    scale: 1.4,
  },
  {
    animation: "victory",
    title: "Victory",
    caption: "You won the match",
    scale: 2,
  },
];

/** Preview of every avatar animation, styled after the BridgingMinds mock. */
function OriginalAvatarPreview({ onBack }: { onBack: () => void }) {
  const { width } = useWindowDimensions();
  const compact = width < 520;
  return (
    <View style={{ gap: 22 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        <View style={{ flex: 1, gap: 6 }}>
          <Text accessibilityRole="header" style={T.title}>
            My avatar
          </Text>
          <Text style={[T.body, { color: C.muted }]}>
            Pixel art from the BridgingMinds mock, with idle, walk, cheer, eat
            and victory animations.
          </Text>
        </View>
        <Button
          label="Back"
          icon="arrow-left"
          variant="secondary"
          onPress={onBack}
        />
      </View>
      <Street scale={compact ? 1.5 : 2} />
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 14 }}>
        {CHIBI.map((c) => (
          <Card
            key={c.animation}
            style={{
              flexGrow: 1,
              flexBasis: 260,
              alignItems: "center",
              gap: 10,
            }}
          >
            <View style={{ minHeight: 230, justifyContent: "flex-end" }}>
              <AvatarSprite
                animation={c.animation}
                scale={compact ? c.scale * 0.8 : c.scale}
              />
            </View>
            <Text style={T.h3}>{c.title}</Text>
            <Text style={[T.small, { textAlign: "center" }]}>{c.caption}</Text>
          </Card>
        ))}
      </View>
      <Card style={{ flexDirection: "row", alignItems: "center", gap: 18 }}>
        <View
          style={{
            width: 120,
            height: 120,
            borderRadius: 60,
            backgroundColor: C.peach,
            alignItems: "center",
            justifyContent: "center",
            overflow: "hidden",
          }}
        >
          <PixelImage
            source={AVATAR_PORTRAIT.source}
            width={AVATAR_PORTRAIT.width}
            height={AVATAR_PORTRAIT.height}
            scale={2}
            accessibilityLabel="Avatar portrait"
          />
        </View>
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={T.h3}>Portrait</Text>
          <Text style={T.small}>
            For profile bubbles, the tournament bracket and the home header.
          </Text>
        </View>
      </Card>
    </View>
  );
}

/** Debate Street strip: stand still or walk back and forth. */
function Street({ scale }: { scale: number }) {
  const reduced = useReducedMotion();
  const [walking, setWalking] = useState(true);
  const [stripWidth, setStripWidth] = useState(0);
  const [pos, setPos] = useState({ x: 0, dir: 1 as 1 | -1 });
  const sheet = AVATAR_SPRITES.walk;
  const spriteW = sheet.frameWidth * scale;
  const spriteH = sheet.frameHeight * scale;
  const maxX = Math.max(0, stripWidth - spriteW);
  const moving = walking && !reduced && maxX > 0;

  useEffect(() => {
    if (!moving) return;
    const id = setInterval(() => {
      setPos(({ x, dir }) => {
        const next = x + dir * 2.4 * scale;
        if (next >= maxX) return { x: maxX, dir: -1 };
        if (next <= 0) return { x: 0, dir: 1 };
        return { x: next, dir };
      });
    }, 50);
    return () => clearInterval(id);
  }, [moving, maxX, scale]);

  const x = Math.min(pos.x, maxX);
  return (
    <Card style={{ gap: 14 }}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 10,
          flexWrap: "wrap",
        }}
      >
        <Text style={[T.h3, { flex: 1 }]}>Debate Street</Text>
        <Button
          label="Stand"
          variant="secondary"
          selected={!walking}
          onPress={() => setWalking(false)}
        />
        <Button
          label="Walk"
          variant="secondary"
          selected={walking}
          onPress={() => setWalking(true)}
        />
      </View>
      <View
        onLayout={(e) => setStripWidth(e.nativeEvent.layout.width)}
        style={{
          height: spriteH + 26,
          borderRadius: 14,
          overflow: "hidden",
          backgroundColor: "#EFE9E0",
        }}
      >
        <View
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 0,
            height: 34,
            backgroundColor: "#E2DBD0",
          }}
        />
        <View
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 34,
            height: 2,
            backgroundColor: "#D6CEC1",
          }}
        />
        <View
          style={{
            position: "absolute",
            left: x + spriteW * 0.18,
            bottom: 10,
            width: spriteW * 0.64,
            height: 10 * (scale / 2),
            borderRadius: 999,
            backgroundColor: "rgba(60, 46, 40, 0.16)",
          }}
        />
        <AvatarSprite
          animation={walking ? "walk" : "idle"}
          scale={scale}
          facing={walking && pos.dir < 0 ? "left" : "right"}
          style={{ position: "absolute", left: x, bottom: 14 }}
        />
      </View>
      <Text style={T.small}>
        {walking
          ? "Walk: little steps with a bounce. Mirrored to face left."
          : "Idle: breathing with a blink."}
        {reduced ? " Motion is paused because reduced motion is on." : ""}
      </Text>
    </Card>
  );
}
