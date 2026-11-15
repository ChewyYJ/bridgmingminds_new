import React, { useRef, useState } from "react";
import { Image, Platform, Pressable, Text, View, useWindowDimensions } from "react-native";
import { C, T, ErrorNote, Icon } from "../components/ui";
import { LayeredAvatar } from "../avatar/LayeredAvatar";
import { AVATAR_FOOD_ASSETS, type AvatarFoodId } from "../avatar/food-assets";
import { normalizeSelection } from "../avatar/pack";
import { isDraftOwner } from "../lib/api";
import { role3Api } from "./api";
import { Action, CoinBalance, LoadState, Meter, R, errorMessage, requestId, useGamification } from "./common";
import { AvatarPanelHeader } from "./AvatarPanelHeader";
import { PixelStreetBackdrop } from "./PixelStreetBackdrop";

export function FoodCareScreen({ onBack }: { onBack: () => void }) {
  const { data, owner, loading, error: loadError, reload, setData } = useGamification();
  const { width } = useWindowDimensions();
  const [selected, setSelected] = useState<AvatarFoodId>("ramen");
  const [preferencesOpen, setPreferencesOpen] = useState(false);
  const [operation, setOperation] = useState<"feed" | "care" | null>(null);
  const [error, setError] = useState(""); const [notice, setNotice] = useState("");
  const lock = useRef(false); const transaction = useRef({ food: selected, id: requestId() });
  const busy = operation !== null;
  async function feed() {
    if (!data || lock.current) return;
    const chosen = data.foods.find(food => food.id === selected);
    if (!chosen || data.coins < chosen.cost || data.fullness.value >= data.fullness.max) return;
    if (transaction.current.food !== selected) transaction.current = { food: selected, id: requestId() };
    lock.current = true; setOperation("feed"); setError(""); setNotice("");
    try {
      const next = await role3Api.feed(selected, transaction.current.id);
      if (!isDraftOwner(owner)) return;
      setData(next.state);
      setNotice(next.alreadyProcessed ? "This meal was already served. Your balance is up to date." : `${next.food.name} served. Fullness is now ${next.state.fullness.value}/100.`);
      transaction.current = { food: selected, id: requestId() };
    } catch (cause) { if (isDraftOwner(owner)) setError(errorMessage(cause)); }
    finally { lock.current = false; if (isDraftOwner(owner)) setOperation(null); }
  }
  async function care(settings: { careEnabled?: boolean; remindersEnabled?: boolean }) {
    if (lock.current) return; lock.current = true; setOperation("care"); setError("");
    try { const next = await role3Api.care(settings); if (isDraftOwner(owner)) setData(next); }
    catch (cause) { if (isDraftOwner(owner)) setError(errorMessage(cause)); }
    finally { lock.current = false; if (isDraftOwner(owner)) setOperation(null); }
  }
  if (!data) return <View style={R.page}><AvatarPanelHeader title="Food & care" onBack={onBack} /><LoadState loading={loading} error={loadError} onRetry={reload} /></View>;
  const food = data.foods.find(entry => entry.id === selected);
  const foodArt = AVATAR_FOOD_ASSETS.find(entry => entry.id === selected)!;
  const enough = !!food && data.coins >= food.cost;
  const full = data.fullness.value >= data.fullness.max;
  return <View style={{ gap: 14, width: "100%", maxWidth: 560, alignSelf: "center" }} testID="food-care-screen">
    <AvatarPanelHeader title="Food & care" onBack={onBack} />
    <View style={{ alignItems: "center", height: 195, justifyContent: "flex-end", overflow: "hidden", borderRadius: 20 }}>
      <View pointerEvents="none" style={{ position: "absolute", left: 0, bottom: 20, height: 132, opacity: 0.17 }}><PixelStreetBackdrop width={Math.min(560, Math.max(250, width - 40))} height={132} /></View>
      <LayeredAvatar selection={normalizeSelection(data.avatar.selection)} variant="chibi" animation={foodArt.animation} scale={0.68} accessibilityLabel={`${foodArt.name} eating preview`} />
      <Text style={[T.small, { fontSize: 11 }]}>{foodArt.name} preview</Text>
    </View>
    <View style={{ padding: 14, borderRadius: 15, borderWidth: 1, borderColor: C.border, backgroundColor: C.paper }}><Meter value={data.fullness.value} max={data.fullness.max} label="Fullness" /></View>
    <Text style={[T.body, { textAlign: "center", fontSize: 14, lineHeight: 21 }]}>Keep your avatar feeling good.{"\n"}Practise and earn Coins for a little treat.</Text>
    <View style={{ height: 1, backgroundColor: C.border, opacity: 0.6, marginVertical: 2 }} />
    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}><Text accessibilityRole="header" style={[T.h2, { fontSize: 19 }]}>Food shop</Text><CoinBalance value={data.coins} /></View>
    <View style={{ flexDirection: "row", gap: 8 }}>
      {data.foods.map(entry => {
        const asset = AVATAR_FOOD_ASSETS.find(value => value.id === entry.id);
        if (!asset) return null;
        const active = selected === entry.id;
        return <Pressable key={entry.id} accessibilityRole="button" accessibilityLabel={`Choose ${entry.name}, ${entry.cost} Coins, restores up to ${entry.fullness} fullness`} accessibilityState={{ selected: active, disabled: busy }} {...(Platform.OS === "web" ? { "aria-pressed": active } : {})} disabled={busy} onPress={() => { setSelected(asset.id); setNotice(""); setError(""); }} testID={`buy-food-${entry.id}`} style={{ flex: 1, minWidth: 0, alignItems: "center", gap: 3, borderWidth: active ? 2 : 1, borderRadius: 14, borderColor: active ? "#A58B70" : C.border, backgroundColor: active ? "#EEE4DA" : C.paper, paddingVertical: 11, paddingHorizontal: 3 }}>
          <Image source={asset.source} style={{ width: 72, height: 72 }} resizeMode="contain" accessible={false} />
          <Text style={[T.h3, { fontSize: 13 }]}>{entry.name}</Text><Text style={[T.small, { fontSize: 10, lineHeight: 16 }]}>+{entry.fullness} fullness</Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "#F5E6BA", borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 }}><Icon name="circle" size={12} color="#A57520" /><Text style={[T.small, { fontFamily: "DMBold", color: "#765317" }]}>{entry.cost}</Text></View>
          {active && <View style={{ position: "absolute", top: 5, right: 5, padding: 3, borderRadius: 9, backgroundColor: C.forest }}><Icon name="check" size={10} color="white" /></View>}
        </Pressable>;
      })}
    </View>
    {!!food && <View style={{ gap: 10, paddingTop: 2 }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 }}><Text style={[T.h3, { fontSize: 15 }]}>{food.name} · {food.cost} Coins</Text><Text style={T.small}>Balance: {data.coins}</Text></View>
      <Text style={T.small}>{full ? "Your avatar is full. Save this meal for later." : enough ? `Restores up to ${Math.min(food.fullness, data.fullness.max - data.fullness.value)} fullness. You’ll have ${data.coins - food.cost} Coins left.` : `Earn ${food.cost - data.coins} more Coins to buy this meal.`}</Text>
      <Action label={`Buy & feed ${food.name}`} primary disabled={!enough || full || operation === "care"} busy={operation === "feed"} onPress={() => void feed()} testID="confirm-food-purchase" />
    </View>}
    <ErrorNote message={error || loadError} />{!!notice && <Text accessibilityLiveRegion="polite" style={T.body} testID="food-purchase-result">{notice}</Text>}
    <View style={{ borderTopWidth: 1, borderColor: C.border, paddingTop: 2, gap: 9 }}>
      <Pressable accessibilityRole="button" accessibilityLabel="Care preferences" accessibilityState={{ expanded: preferencesOpen }} onPress={() => setPreferencesOpen(value => !value)} style={{ minHeight: 46, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}><Text style={[T.small, { fontFamily: "DMBold", color: C.ink }]}>Care preferences</Text><Icon name={preferencesOpen ? "chevron-up" : "chevron-down"} size={18} /></Pressable>
      {preferencesOpen && <View style={{ gap: 10 }}><Text style={T.small}>{data.fullness.careEnabled ? "Fullness gently decreases over time. Learning is always available." : "Automatic fullness changes are off. You can still serve a meal."}</Text><View style={R.row}>
        <Action label={`Avatar care ${data.fullness.careEnabled ? "on" : "off"}`} selected={data.fullness.careEnabled} disabled={busy} onPress={() => void care({ careEnabled: !data.fullness.careEnabled })} />
        <Action label={`Care reminders ${data.fullness.remindersEnabled ? "on" : "off"}`} selected={data.fullness.remindersEnabled} disabled={busy} onPress={() => void care({ remindersEnabled: !data.fullness.remindersEnabled })} />
      </View><Text style={T.small}>Reminders appear in the app when care is on and fullness is low.</Text></View>}
    </View>
  </View>;
}
