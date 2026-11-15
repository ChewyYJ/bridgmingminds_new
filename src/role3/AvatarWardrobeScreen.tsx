import React, { useRef, useState } from "react";
import { Platform, Pressable, Text, View, useWindowDimensions } from "react-native";
import { C, T, ErrorNote, Icon } from "../components/ui";
import { LayeredAvatar } from "../avatar/LayeredAvatar";
import { AVATAR_PACK } from "../avatar/generated-pack";
import { defaultSelection, normalizeSelection, type AvatarCategory, type AvatarCollection, type AvatarSelection } from "../avatar/pack";
import { isDraftOwner } from "../lib/api";
import { role3Api } from "./api";
import { Action, CoinBalance, LoadState, R, errorMessage, requestId, useGamification } from "./common";
import { AvatarPanelHeader } from "./AvatarPanelHeader";
import { WardrobeCategoryIcon, WardrobeItemArt } from "./WardrobeItemArt";
import { PixelStreetBackdrop } from "./PixelStreetBackdrop";

type WardrobeTab = "Outfit" | "Accessory" | "Style";
const categories: { id: AvatarCategory; name: string; tab: WardrobeTab; optional?: boolean }[] = [
  { id: "hair", name: "Hair", tab: "Style" }, { id: "hat", name: "Hats", tab: "Accessory", optional: true },
  { id: "top", name: "Tops", tab: "Outfit" }, { id: "jacket", name: "Jackets", tab: "Outfit", optional: true },
  { id: "bottom", name: "Bottoms", tab: "Outfit" }, { id: "shoes", name: "Shoes", tab: "Outfit" },
  { id: "accessory", name: "Accessories", tab: "Accessory", optional: true },
];

export function AvatarWardrobeScreen({ onBack }: { onBack: () => void }) {
  const { data, owner, loading, error: loadError, reload, setData } = useGamification();
  const { width } = useWindowDimensions();
  const [draft, setDraft] = useState<{ owner: string; selection: AvatarSelection } | null>(null);
  const [category, setCategory] = useState<AvatarCategory>("jacket");
  const [filter, setFilter] = useState<"all" | "owned" | "locked">("all");
  const [operation, setOperation] = useState<"equip" | "purchase" | null>(null);
  const [confirmation, setConfirmation] = useState<{ itemId: string; requestId: string } | null>(null);
  const [error, setError] = useState(""); const [notice, setNotice] = useState("");
  const lock = useRef(false);
  const busy = operation !== null;
  if (!data) return <View style={R.page}><AvatarPanelHeader title="My avatar" onBack={onBack} /><LoadState loading={loading} error={loadError} onRetry={reload} /></View>;
  const equipped = normalizeSelection(data.avatar.selection);
  const selection = draft?.owner === owner ? draft.selection : equipped;
  const owned = new Set(data.avatar.ownedItemIds);
  const canEquip = categories.every(entry => !selection[entry.id] || owned.has(selection[entry.id]!));
  const changed = JSON.stringify(equipped) !== JSON.stringify(selection);
  const currentCategory = categories.find(entry => entry.id === category)!;
  const items = AVATAR_PACK.catalog[selection.collection][category].filter(item => filter === "all" || (filter === "owned" ? owned.has(item.id) : !owned.has(item.id)));
  const chosen = data.catalog.find(item => item.id === selection[category]);
  const price = chosen?.price ?? null;
  const canBuy = !!chosen && !owned.has(chosen.id) && chosen.purchasable && price !== null;
  const confirming = !!chosen && confirmation?.itemId === chosen.id;
  const stageWidth = Math.min(560, Math.max(250, width - 40));
  function update(next: AvatarSelection) { setDraft({ owner, selection: next }); setConfirmation(null); setError(""); setNotice(""); }
  function changeCategory(next: AvatarCategory) { setCategory(next); setConfirmation(null); setError(""); }
  function collection(next: AvatarCollection) {
    if (next !== selection.collection) update(normalizeSelection({ ...defaultSelection(next), skin: selection.skin, hairColor: selection.hairColor, eyeColor: selection.eyeColor }));
  }
  async function save() {
    if (lock.current || !canEquip) return; lock.current = true; setOperation("equip"); setError("");
    try {
      const next = await role3Api.equip(selection);
      if (!isDraftOwner(owner)) return;
      setData(next); setDraft(null); setNotice("Your look is equipped.");
    } catch (cause) { if (isDraftOwner(owner)) setError(errorMessage(cause)); }
    finally { lock.current = false; if (isDraftOwner(owner)) setOperation(null); }
  }
  async function purchase() {
    if (lock.current || !confirmation || !canBuy || price === null || data!.coins < price) return;
    lock.current = true; setOperation("purchase"); setError(""); setNotice("");
    try {
      const next = await role3Api.purchase(confirmation.itemId, confirmation.requestId);
      if (!isDraftOwner(owner)) return;
      setData(next.state); setConfirmation(null);
      setNotice(next.coinsSpent === 0 ? `${next.item.name} is already yours. Equip your look when ready.` : `${next.item.name} added to your wardrobe. Equip your look when ready.`);
    } catch (cause) { if (isDraftOwner(owner)) setError(errorMessage(cause)); }
    finally { lock.current = false; if (isDraftOwner(owner)) setOperation(null); }
  }
  return <View style={{ gap: 13, width: "100%", maxWidth: 560, alignSelf: "center" }} testID="avatar-wardrobe-screen">
    <AvatarPanelHeader title="My avatar" onBack={onBack} />
    <View style={{ flexDirection: "row", alignSelf: "center", borderRadius: 18, padding: 3, backgroundColor: C.sage }}>
      {([ ["girl", "Girl styles"], ["boy", "Boy styles"] ] as const).map(([id, label]) => <Pressable key={id} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ selected: selection.collection === id, disabled: busy }} {...(Platform.OS === "web" ? { "aria-pressed": selection.collection === id } : {})} disabled={busy} onPress={() => collection(id)} style={{ minHeight: 38, justifyContent: "center", paddingHorizontal: 20, borderRadius: 15, backgroundColor: selection.collection === id ? C.paper : "transparent" }}><Text style={[T.small, { fontFamily: "DMBold", color: C.ink }]}>{label}</Text></Pressable>)}
    </View>
    <View style={{ flexDirection: "row", gap: 10, height: 332 }}>
      <View style={{ flex: 1, justifyContent: "flex-end", alignItems: "center", overflow: "hidden", borderRadius: 20 }}>
        <View pointerEvents="none" style={{ position: "absolute", bottom: 28, left: 0, right: 0, height: 200, opacity: 0.16 }}><PixelStreetBackdrop width={stageWidth} height={200} /></View>
        <LayeredAvatar selection={selection} variant="big" scale={width < 360 ? 0.74 : 0.83} accessibilityLabel="Your full-body avatar preview" />
        <View style={{ position: "absolute", left: 0, bottom: 7, alignItems: "center", backgroundColor: "rgba(255,252,248,0.9)", borderRadius: 14, padding: 3 }}>
          <LayeredAvatar selection={selection} variant="chibi" scale={0.25} playing={false} accessibilityLabel="Matching chibi portrait" /><Text style={[T.small, { fontSize: 10, lineHeight: 14 }]}>Chibi</Text>
        </View>
      </View>
      <View style={{ width: 46, justifyContent: "space-between" }}>
        {categories.map(entry => <Pressable key={entry.id} accessibilityRole="button" accessibilityLabel={entry.name} accessibilityState={{ selected: category === entry.id, disabled: busy }} {...(Platform.OS === "web" ? { "aria-pressed": category === entry.id } : {})} disabled={busy} onPress={() => changeCategory(entry.id)} testID={`wardrobe-category-${entry.id}`} style={{ width: 44, height: 44, borderRadius: 12, borderWidth: 1, borderColor: category === entry.id ? "#A58B70" : C.border, backgroundColor: category === entry.id ? C.sage : C.paper, alignItems: "center", justifyContent: "center" }}><WardrobeCategoryIcon category={entry.id} /></Pressable>)}
      </View>
    </View>
    <View accessibilityRole="progressbar" accessibilityLabel="Level progress" accessibilityValue={{ min: 0, max: data.levelProgress.required, now: data.levelProgress.current }} style={{ gap: 7 }}>
      <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between" }}><Text style={[T.h3, { fontSize: 18 }]}>Lv. {data.level}</Text><Text style={T.small}>{data.levelProgress.current.toLocaleString()} / {data.levelProgress.required.toLocaleString()} XP</Text></View>
      <View style={{ height: 9, backgroundColor: C.sage, borderRadius: 5, overflow: "hidden" }}><View style={{ width: `${Math.max(0, Math.min(100, data.levelProgress.current / Math.max(1, data.levelProgress.required) * 100))}%`, height: 9, borderRadius: 5, backgroundColor: "#6F6256" }} /></View>
    </View>
    <View style={{ flexDirection: "row", backgroundColor: "#EEE7DF", padding: 3, borderRadius: 12 }}>
      {(["Outfit", "Accessory", "Style"] as const).map(tab => <Pressable key={tab} accessibilityRole="button" accessibilityLabel={tab} accessibilityState={{ selected: currentCategory.tab === tab, disabled: busy }} {...(Platform.OS === "web" ? { "aria-pressed": currentCategory.tab === tab } : {})} disabled={busy} onPress={() => changeCategory(tab === "Outfit" ? "jacket" : tab === "Accessory" ? "accessory" : "hair")} style={{ flex: 1, minHeight: 42, borderRadius: 9, backgroundColor: currentCategory.tab === tab ? "#DCCDBF" : "transparent", alignItems: "center", justifyContent: "center" }}><Text style={[T.small, { fontFamily: "DMBold", color: C.ink }]}>{tab}</Text></Pressable>)}
    </View>
    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 }}><Text accessibilityRole="header" style={[T.h3, { fontSize: 15 }]}>{currentCategory.name}</Text>
      <View style={{ flexDirection: "row" }}>{([ ["all", "All"], ["owned", "Owned"], ["locked", "Locked"] ] as const).map(([id, label]) => <Pressable key={id} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ selected: filter === id }} {...(Platform.OS === "web" ? { "aria-pressed": filter === id } : {})} onPress={() => setFilter(id)} style={{ minHeight: 40, justifyContent: "center", paddingHorizontal: 10 }}><Text style={[T.small, { color: filter === id ? C.ink : C.muted, fontFamily: filter === id ? "DMBold" : "DM", textDecorationLine: filter === id ? "underline" : "none" }]}>{label}</Text></Pressable>)}</View>
    </View>
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
      {items.map(item => {
        const active = selection[category] === item.id; const isOwned = owned.has(item.id); const listing = data.catalog.find(entry => entry.id === item.id);
        return <Pressable key={item.id} accessibilityRole="button" accessibilityLabel={`Preview ${item.name}, ${isOwned ? "owned" : `${listing?.price ?? "locked"} Coins, locked`}`} accessibilityState={{ selected: active, disabled: busy }} {...(Platform.OS === "web" ? { "aria-pressed": active } : {})} disabled={busy} onPress={() => update(normalizeSelection({ ...selection, [category]: item.id }))} testID={`inventory-${item.id}`} style={{ width: "31.5%", minHeight: 139, paddingVertical: 8, paddingHorizontal: 4, alignItems: "center", gap: 4, borderRadius: 13, borderWidth: active ? 2 : 1, borderColor: active ? "#A58B70" : C.border, backgroundColor: active ? "#EEE4DA" : C.paper }}>
          <WardrobeItemArt selection={selection} item={item} />
          <Text style={[T.small, { color: C.ink, textAlign: "center", fontFamily: "DMBold", fontSize: 11, lineHeight: 15 }]}>{item.name}</Text>
          {isOwned ? <Text style={[T.small, { fontSize: 10 }]}>{equipped[category] === item.id ? "Equipped" : "Owned"}</Text> : <View style={{ flexDirection: "row", alignItems: "center", gap: 4, borderRadius: 10, backgroundColor: "#F5E6BA", paddingHorizontal: 7, paddingVertical: 2 }}><Icon name="circle" size={11} color="#A57520" /><Text style={[T.small, { fontFamily: "DMBold", color: "#765317", fontSize: 11 }]}>{listing?.price ?? "Locked"}</Text></View>}
          <View style={{ position: "absolute", top: 5, right: 5, borderRadius: 9, padding: 3, backgroundColor: isOwned ? C.forest : "#E8DED2" }}><Icon name={isOwned ? "check" : "lock"} size={10} color={isOwned ? "white" : C.muted} /></View>
        </Pressable>;
      })}
    </View>
    {!items.length && <Text style={T.small}>No {filter} pieces in this category yet.</Text>}
    {currentCategory.optional && <Pressable accessibilityRole="button" accessibilityLabel={`No ${category}`} accessibilityState={{ selected: selection[category] === null, disabled: busy }} {...(Platform.OS === "web" ? { "aria-pressed": selection[category] === null } : {})} disabled={busy} onPress={() => update(normalizeSelection({ ...selection, [category]: null }))} style={{ minHeight: 44, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7 }}><Icon name={selection[category] === null ? "check-circle" : "minus-circle"} size={15} /><Text style={T.small}>No {category}</Text></Pressable>}
    {chosen && !owned.has(chosen.id) && <View style={[R.smallCard, { gap: 10 }]}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 }}><Text style={[T.h3, { flex: 1, fontSize: 15 }]}>{chosen.name}</Text>{canBuy && <Text style={[T.small, { color: "#765317", fontFamily: "DMBold" }]}>{price} Coins</Text>}</View>
      <Text style={T.small}>Earn it: {chosen.unlockRule.description} ({Math.min(chosen.progress, chosen.unlockRule.target)}/{chosen.unlockRule.target})</Text>
      {canBuy && <>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 }}><Text style={T.small}>Your balance</Text><CoinBalance value={data.coins} /></View>
        {confirming ? <View style={{ gap: 10 }} testID="wardrobe-purchase-confirmation"><Text style={T.body}>Buy {chosen.name} for {price} Coins?{data.coins >= price! ? ` You’ll have ${data.coins - price!} Coins left.` : ""}</Text><Text style={T.small}>The piece will be yours to equip whenever you like.</Text><View style={R.row}><Action label="Cancel purchase" disabled={busy} onPress={() => setConfirmation(null)} style={{ flex: 1 }} /><Action label="Confirm purchase" primary disabled={data.coins < price! || operation === "equip"} busy={operation === "purchase"} onPress={() => void purchase()} testID="confirm-avatar-purchase" style={{ flex: 1 }} /></View></View> : <Action label={`Buy for ${price} Coins`} primary disabled={busy || data.coins < price!} onPress={() => { setConfirmation({ itemId: chosen.id, requestId: requestId() }); setError(""); }} testID="buy-avatar-item" />}
        {data.coins < price! && <Text style={T.small}>Earn {price! - data.coins} more Coins to buy this piece.</Text>}
      </>}
    </View>}
    {currentCategory.tab === "Style" && <View style={{ gap: 12, paddingVertical: 5 }}>
      {([ ["Skin tone", "skin", "skin"], ["Hair colour", "hair", "hairColor"], ["Eye colour", "eyes", "eyeColor"] ] as const).map(([label, palette, field]) => <View key={field} style={{ gap: 6 }}><Text style={T.small}>{label}</Text><View style={R.row}>{AVATAR_PACK.palettes[palette].map(swatch => <Pressable key={swatch.id} accessibilityRole="button" accessibilityLabel={`${label}: ${swatch.name}`} accessibilityState={{ selected: selection[field] === swatch.id, disabled: busy }} disabled={busy} onPress={() => update({ ...selection, [field]: swatch.id })} {...(Platform.OS === "web" ? { "aria-pressed": selection[field] === swatch.id } : {})} style={{ width: 44, height: 44, padding: 6, borderRadius: 22, borderWidth: selection[field] === swatch.id ? 2 : 1, borderColor: selection[field] === swatch.id ? C.forest : C.border }}><View style={{ flex: 1, borderRadius: 18, backgroundColor: swatch.color }} />{selection[field] === swatch.id && <View style={{ position: "absolute", right: -2, bottom: -2, borderRadius: 8, padding: 2, backgroundColor: C.forest }}><Icon name="check" size={10} color="white" /></View>}</Pressable>)}</View></View>)}
    </View>}
    {!canEquip && <Text style={T.small}>Your preview includes locked pieces. Buy or earn them to equip this look.</Text>}
    <ErrorNote message={error || loadError} />
    <Action label={changed ? "Equip look" : "Look equipped"} primary disabled={!changed || !canEquip || operation === "purchase"} busy={operation === "equip"} onPress={() => void save()} testID="equip-avatar" />
    {changed && <Action label="Restore equipped look" disabled={busy} onPress={() => { setDraft(null); setConfirmation(null); setNotice(""); setError(""); }} />}
    {!!notice && <Text accessibilityLiveRegion="polite" style={T.body} testID="wardrobe-result">{notice}</Text>}
  </View>;
}
