import React, { useEffect, useMemo, useRef, useState } from "react";
import { Animated, AppState, Pressable, ScrollView, Text, View } from "react-native";
import type { DebateOpponent } from "../../shared/debate.mjs";
import { C, T } from "../components/ui";
import { LayeredAvatar } from "../avatar/LayeredAvatar";
import { AVATAR_PACK } from "../avatar/generated-pack";
import { defaultSelection, type AvatarSelection } from "../avatar/pack";
import { useReducedMotion } from "../hooks/useReducedMotion";
import { PixelScene } from "./PixelStreetBackdrop";
import { Action, R } from "./common";

const WORLD_WIDTH = 1920;
const WORLD_HEIGHT = 320;
const AVATAR_SCALE = 0.4;
const AVATAR_HALF = AVATAR_PACK.styles.big.width * AVATAR_SCALE / 2;
const STREET_MIN = 65;
const STREET_MAX = WORLD_WIDTH - 65;

export function opponentLook(opponent: DebateOpponent): AvatarSelection {
  // Deliberate outfits keep the six neighbours recognisable in both avatar sizes.
  const cast: Record<string, Partial<AvatarSelection>> = {
    mina: { hair: "girl-hair-waves", top: "girl-top-sage-blouse", jacket: "girl-jacket-soft-cardigan", bottom: "girl-bottom-blue-jeans", accessory: null },
    leo: { hair: "boy-hair-curls", top: "boy-top-sage-polo", jacket: "boy-jacket-weekend-bomber", bottom: "boy-bottom-cargo-pants", shoes: "boy-shoes-brown-boots", accessory: "boy-accessory-square-glasses" },
    ari: { hair: "girl-hair-ponytail", hairColor: "cocoa", top: "girl-top-oat-rib-knit", jacket: "girl-jacket-sage-cropped", bottom: "girl-bottom-pleated-skirt", shoes: "girl-shoes-ankle-boots", accessory: null },
    safiya: { hair: "girl-hair-bob", skin: "tan", hairColor: "black", top: "girl-top-cotton-tee", jacket: "girl-jacket-tailored-blazer", bottom: "girl-bottom-wide-trousers", shoes: "girl-shoes-penny-loafers", accessory: "girl-accessory-mini-crossbody" },
    daniel: { hair: "boy-hair-sweep", hairColor: "cocoa", skin: "honey", top: "boy-top-everyday-tee", jacket: "boy-jacket-city-overshirt", bottom: "boy-bottom-blue-jeans", accessory: "boy-accessory-canvas-messenger" },
    kai: { hair: "boy-hair-curtains", hairColor: "black", top: "boy-top-stripe-knit", jacket: "boy-jacket-slate-denim", bottom: "boy-bottom-school-trousers", shoes: "boy-shoes-black-loafers", hat: "boy-hat-rib-beanie", accessory: null },
    "chair-lin": { hair: "girl-hair-ponytail", hairColor: "black", jacket: "girl-jacket-tailored-blazer", top: "girl-top-cotton-tee", bottom: "girl-bottom-wide-trousers", shoes: "girl-shoes-penny-loafers", accessory: "girl-accessory-round-glasses", hat: null },
  };
  return { ...defaultSelection(opponent.collection), ...cast[opponent.id] };
}

export function DebateStreet({ selection, opponents, onMeet }: { selection: AvatarSelection; opponents: DebateOpponent[]; onMeet: (opponent: DebateOpponent) => void }) {
  const reduced = useReducedMotion();
  const scroll = useRef<ScrollView>(null);
  const [position] = useState(() => new Animated.Value(100 - AVATAR_HALF));
  const currentPosition = useRef(100);
  const viewport = useRef(320);
  const followPlayer = useRef(false);
  const movementVersion = useRef(0);
  const [walking, setWalking] = useState(false);
  const [facing, setFacing] = useState<"left" | "right">("right");
  const [target, setTarget] = useState(100);
  const [nearbyId, setNearbyId] = useState(opponents[0]?.id ?? "");
  const locations = useMemo(() => opponents.map((opponent, index) => ({
    opponent, x: 230 + index * Math.min(300, 1500 / Math.max(1, opponents.length - 1)),
  })), [opponents]);
  const nearby = opponents.find(opponent => opponent.id === nearbyId) ?? opponents[0];

  useEffect(() => {
    // The camera follows the actual frame position, so it cannot outrun the walker.
    const listener = position.addListener(({ value }) => {
      const center = value + AVATAR_HALF;
      currentPosition.current = center;
      if (followPlayer.current) scroll.current?.scrollTo({
        x: Math.max(0, Math.min(WORLD_WIDTH - viewport.current, center - viewport.current * 0.35)),
        animated: false,
      });
    });
    const subscription = AppState.addEventListener("change", state => {
      if (state !== "active") {
        movementVersion.current++;
        position.stopAnimation(value => {
          currentPosition.current = value + AVATAR_HALF;
          setTarget(currentPosition.current);
          setWalking(false);
        });
      }
    });
    return () => {
      position.removeListener(listener);
      subscription.remove();
      position.stopAnimation();
    };
  }, [position]);

  useEffect(() => {
    if (reduced) {
      movementVersion.current++;
      position.stopAnimation(value => {
        currentPosition.current = value + AVATAR_HALF;
        setTarget(currentPosition.current);
        setWalking(false);
      });
    }
  }, [position, reduced]);

  function move(destination: number, selectedId?: string) {
    const next = Math.max(STREET_MIN, Math.min(STREET_MAX, destination));
    const version = ++movementVersion.current;
    position.stopAnimation(value => {
      if (version !== movementVersion.current) return;
      const origin = value + AVATAR_HALF;
      const distance = Math.abs(next - origin);
      setFacing(next < origin ? "left" : "right");
      setTarget(next);
      const closest = locations.reduce<typeof locations[number] | undefined>((best, entry) =>
        !best || Math.abs(entry.x - next) < Math.abs(best.x - next) ? entry : best, undefined);
      if (selectedId || closest) setNearbyId(selectedId ?? closest!.opponent.id);
      followPlayer.current = true;
      setWalking(!reduced && distance > 0);
      Animated.timing(position, { toValue: next - AVATAR_HALF, duration: reduced ? 0 : Math.min(3200, distance * 4), useNativeDriver: true }).start(({ finished }) => {
        if (finished && version === movementVersion.current) setWalking(false);
      });
    });
  }

  return <View style={{ gap: 12 }} testID="debate-street">
    <Text style={[T.small, { fontSize: 12 }]}>{opponents.length} neighbours · Swipe the street or walk to explore</Text>
    <View testID="street-viewport" style={{ borderRadius: 20, overflow: "hidden", borderWidth: 1, borderColor: C.border }} onLayout={event => { viewport.current = event.nativeEvent.layout.width; }}>
      <ScrollView ref={scroll} horizontal showsHorizontalScrollIndicator={false} onScrollBeginDrag={() => { followPlayer.current = false; }} accessibilityLabel="Debate street, scroll to explore the neighbourhood">
        <View testID="street-world" style={{ width: WORLD_WIDTH, height: WORLD_HEIGHT, position: "relative" }}>
          <PixelScene scene="street" width={WORLD_WIDTH} height={WORLD_HEIGHT} absolute />
          {locations.map(({ opponent, x }) => <Pressable key={opponent.id} accessibilityRole="button" accessibilityLabel={`Walk to ${opponent.name}, ${opponent.title}`} onPress={() => move(x - 90, opponent.id)}
            accessibilityState={{ selected: nearby?.id === opponent.id }} testID={`street-npc-${opponent.id}`}
            style={{ position: "absolute", left: x - AVATAR_HALF, top: 140, width: AVATAR_HALF * 2, alignItems: "center" }}>
            <LayeredAvatar selection={opponentLook(opponent)} variant="big" scale={AVATAR_SCALE} facing="left" playing={nearby?.id === opponent.id} />
            <View style={{ backgroundColor: nearby?.id === opponent.id ? "#F5EBDD" : C.paper, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 7, borderWidth: 1, borderColor: nearby?.id === opponent.id ? "#A38C72" : C.border }}><Text style={[T.small, { fontSize: 12, lineHeight: 16, fontFamily: "DMBold", color: C.ink }]}>{opponent.name}</Text></View>
          </Pressable>)}
          <Animated.View testID="street-player" style={{ position: "absolute", left: 0, top: 140, transform: [{ translateX: position }], alignItems: "center" }} pointerEvents="none">
            <LayeredAvatar selection={selection} variant="big" scale={AVATAR_SCALE} animation={walking ? "walk" : "idle"} facing={facing} />
            <Text style={[T.small, { fontSize: 12, lineHeight: 16, color: C.paper, backgroundColor: C.ink, borderRadius: 7, paddingHorizontal: 9, paddingVertical: 2 }]}>You</Text>
          </Animated.View>
        </View>
      </ScrollView>
    </View>
    <View style={[R.row, { justifyContent: "space-between", flexWrap: "nowrap" }]}>
      <Action label="Walk left" icon="arrow-left" disabled={target <= STREET_MIN} onPress={() => move(currentPosition.current - 150)} testID="street-walk-left" />
      <Action label="Walk right" icon="arrow-right" disabled={target >= STREET_MAX} onPress={() => move(currentPosition.current + 150)} testID="street-walk-right" />
    </View>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} accessibilityLabel="Choose a neighbour to walk to" contentContainerStyle={{ gap: 8 }}>
      {locations.map(({ opponent, x }) => <Action key={opponent.id} label={opponent.name} selected={nearby?.id === opponent.id} onPress={() => move(x - 90, opponent.id)} testID={`street-visit-${opponent.id}`} style={{ minWidth: 72, paddingVertical: 8 }} />)}
    </ScrollView>
    {reduced && <Text style={[T.small, { fontSize: 12 }]}>Reduced motion is on; movement is shown as still positions.</Text>}
    {nearby && <View style={[R.card, { padding: 16, gap: 12 }]} testID="street-challenger">
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        <LayeredAvatar selection={opponentLook(nearby)} variant="chibi" scale={0.27} playing={false} />
        <View style={{ flex: 1, gap: 5 }}><Text style={T.h2}>{nearby.name}</Text><Text style={T.small}>{nearby.title} · {nearby.difficulty}</Text><Text style={T.small}>Friendly practice · 3 turns</Text></View>
      </View>
      <Text style={T.small}>{nearby.style}</Text>
      <Action label={`Practise with ${nearby.name}`} primary onPress={() => onMeet(nearby)} testID="meet-street-challenger" />
    </View>}
  </View>;
}
