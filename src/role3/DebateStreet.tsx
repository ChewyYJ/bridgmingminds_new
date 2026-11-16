import React, { useEffect, useRef, useState } from "react";
import { Animated, AppState, Pressable, ScrollView, Text, View } from "react-native";
import type { DebateOpponent } from "../../shared/debate.mjs";
import { C, T } from "../components/ui";
import { LayeredAvatar } from "../avatar/LayeredAvatar";
import { AVATAR_PACK } from "../avatar/generated-pack";
import { defaultSelection, type AvatarSelection } from "../avatar/pack";
import { useReducedMotion } from "../hooks/useReducedMotion";
import { PixelScene } from "./PixelStreetBackdrop";
import { Action, R } from "./common";

export function opponentLook(opponent: DebateOpponent): AvatarSelection {
  // Keep the named cast recognisable: Mina and Ari collided under a name hash.
  const cast: Record<string, number> = { mina: 0, leo: 1, ari: 2 };
  const index = cast[opponent.id] ?? [...opponent.id].reduce((sum, char) => sum + char.charCodeAt(0), 0) % 3;
  const catalog = AVATAR_PACK.catalog[opponent.collection];
  if (opponent.id === "chair-lin") return { ...defaultSelection("girl"), hair: "girl-hair-ponytail", hairColor: "black", jacket: "girl-jacket-tailored-blazer", top: "girl-top-cotton-tee", bottom: "girl-bottom-wide-trousers", shoes: "girl-shoes-penny-loafers", accessory: "girl-accessory-round-glasses", hat: null };
  return { ...defaultSelection(opponent.collection), hair: catalog.hair[index].id, top: catalog.top[index].id, jacket: catalog.jacket[index].id, bottom: catalog.bottom[index].id, shoes: catalog.shoes[index].id, hat: null, accessory: index === 1 ? catalog.accessory[0].id : null };
}

export function DebateStreet({ selection, opponents, onMeet }: { selection: AvatarSelection; opponents: DebateOpponent[]; onMeet: (opponent: DebateOpponent) => void }) {
  const reduced = useReducedMotion(); const scroll = useRef<ScrollView>(null);
  const [position] = useState(() => new Animated.Value(30));
  const currentPosition = useRef(80); const [viewport, setViewport] = useState(320);
  const movementVersion = useRef(0);
  const [walking, setWalking] = useState(false); const [facing, setFacing] = useState<"left" | "right">("right");
  const [nearby, setNearby] = useState<DebateOpponent | null>(opponents[0] ?? null);
  const locations = opponents.map((opponent, index) => ({ opponent, x: 220 + index * 290 }));
  useEffect(() => {
    const subscription = AppState.addEventListener("change", state => { if (state !== "active") { movementVersion.current++; position.stopAnimation(value => { currentPosition.current = value + 50; setWalking(false); }); } });
    return () => { subscription.remove(); position.stopAnimation(); };
  }, [position]);
  useEffect(() => {
    if (reduced) { movementVersion.current++; position.stopAnimation(() => setWalking(false)); position.setValue(currentPosition.current - 50); }
  }, [position, reduced]);
  function move(target: number) {
    const next = Math.max(70, Math.min(900, target));
    setFacing(next < currentPosition.current ? "left" : "right");
    const distance = Math.abs(next - currentPosition.current); currentPosition.current = next;
    const match = locations.find(entry => Math.abs(entry.x - next) <= 120);
    const version = ++movementVersion.current;
    position.stopAnimation();
    if (match) setNearby(match.opponent);
    setWalking(!reduced && distance > 0);
    Animated.timing(position, { toValue: next - 50, duration: reduced ? 0 : Math.min(1800, distance * 4), useNativeDriver: true }).start(() => { if (version === movementVersion.current) setWalking(false); });
    scroll.current?.scrollTo({ x: Math.max(0, Math.min(960 - viewport, next - viewport * 0.35)), animated: !reduced });
  }
  return <View style={{ gap: 12 }} testID="debate-street">
    <View style={{ borderRadius: 20, overflow: "hidden", borderWidth: 1, borderColor: C.border }} onLayout={event => setViewport(event.nativeEvent.layout.width)}>
      <ScrollView ref={scroll} horizontal showsHorizontalScrollIndicator accessibilityLabel="Debate street, scroll to explore the neighbourhood">
        <View style={{ width: 960, height: 280, position: "relative" }}>
          <PixelScene scene="street" width={960} height={280} absolute />
          {locations.map(({ opponent, x }) => <Pressable key={opponent.id} accessibilityRole="button" accessibilityLabel={`Walk to ${opponent.name}, ${opponent.title}`} onPress={() => move(x - 90)}
            accessibilityState={{ selected: nearby?.id === opponent.id }}
            style={{ position: "absolute", left: x - 48, top: 82, width: 96, alignItems: "center" }}>
            <LayeredAvatar selection={opponentLook(opponent)} variant="big" scale={0.38} facing="left" />
            <View style={{ backgroundColor: C.paper, paddingHorizontal: 9, paddingVertical: 5, borderRadius: 8, borderWidth: 1, borderColor: C.border }}><Text style={[T.small, { fontFamily: "DMBold", color: C.ink }]}>{opponent.name}</Text></View>
          </Pressable>)}
          <Animated.View style={{ position: "absolute", left: 0, top: 82, transform: [{ translateX: position }], alignItems: "center" }} pointerEvents="none">
            <LayeredAvatar selection={selection} variant="big" scale={0.38} animation={walking ? "walk" : "idle"} facing={facing} />
            <Text style={[T.small, { color: C.paper, backgroundColor: C.ink, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 }]}>You</Text>
          </Animated.View>
        </View>
      </ScrollView>
    </View>
    <View style={[R.row, { justifyContent: "space-between" }]}>
      <Action label="Walk left" icon="arrow-left" onPress={() => move(currentPosition.current - 120)} testID="street-walk-left" />
      <Action label="Walk right" icon="arrow-right" onPress={() => move(currentPosition.current + 120)} testID="street-walk-right" />
    </View>
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
