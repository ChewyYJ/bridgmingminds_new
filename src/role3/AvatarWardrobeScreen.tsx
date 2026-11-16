import React, { useRef, useState } from "react";
import { Platform, Pressable, Text, View } from "react-native";
import { C, T, ErrorNote, Icon } from "../components/ui";
import { LayeredAvatar } from "../avatar/LayeredAvatar";
import { AVATAR_PACK } from "../avatar/generated-pack";
import { defaultSelection, normalizeSelection, type AvatarCategory, type AvatarCollection, type AvatarSelection } from "../avatar/pack";
import { isDraftOwner } from "../lib/api";
import { useApp } from "../lib/state";
import { role3Api } from "./api";
import { Action, LoadState, R, errorMessage, requestId, useGamification } from "./common";
import { AvatarPanelHeader } from "./AvatarPanelHeader";
import { WardrobeItemArt } from "./WardrobeItemArt";
import { PixelScene } from "./PixelStreetBackdrop";
import { CoinIcon } from "./CoinIcon";

const categories: { id: AvatarCategory; name: string; optional?: boolean }[] = [
  { id: "hair", name: "Hair" }, { id: "top", name: "Tops" }, { id: "bottom", name: "Bottoms" },
  { id: "hat", name: "Hats", optional: true }, { id: "jacket", name: "Jackets", optional: true },
  { id: "shoes", name: "Shoes" }, { id: "accessory", name: "Accessories", optional: true },
];
type WardrobeDraft = { owner: string; active: AvatarCollection; looks: Partial<Record<AvatarCollection, AvatarSelection>> };

export function AvatarWardrobeScreen({ onBack, onOpenProgress, onOpenSettings, onOpenFood }: {
  onBack: () => void; onOpenProgress?: () => void; onOpenSettings?: () => void; onOpenFood?: () => void;
}) {
  const { data, owner, loading, error: loadError, reload, setData } = useGamification();
  const { state } = useApp();
  const [draft, setDraft] = useState<WardrobeDraft | null>(null);
  const [category, setCategory] = useState<AvatarCategory>("hair");
  const [moreOpen, setMoreOpen] = useState(false);
  const [filter, setFilter] = useState<"owned" | "shop">("owned");
  const [stageWidth, setStageWidth] = useState(350);
  const [operation, setOperation] = useState<"equip" | "purchase" | null>(null);
  const [confirmation, setConfirmation] = useState<{ itemId: string; requestId: string } | null>(null);
  const [error, setError] = useState(""); const [notice, setNotice] = useState("");
  const lock = useRef(false);
  const busy = operation !== null;
  if (!data) return <View style={R.page}><AvatarPanelHeader title="My profile" onSettings={onOpenSettings} /><LoadState loading={loading} error={loadError} onRetry={reload} /></View>;
  const equipped = normalizeSelection(data.avatar.selection);
  const selection = draft?.owner === owner ? draft.looks[draft.active] ?? equipped : equipped;
  const owned = new Set(data.avatar.ownedItemIds);
  const lockedSelected = categories.map(entry => selection[entry.id]).filter((id): id is string => !!id && !owned.has(id));
  const canEquip = lockedSelected.length === 0;
  const changed = JSON.stringify(equipped) !== JSON.stringify(selection);
  const currentCategory = categories.find(entry => entry.id === category)!;
  const items = AVATAR_PACK.catalog[selection.collection][category].filter(item => filter === "shop" || owned.has(item.id));
  const chosen = data.catalog.find(item => item.id === selection[category]);
  const price = chosen?.price ?? null;
  const canBuy = !!chosen && !owned.has(chosen.id) && chosen.purchasable && price !== null;
  const confirming = !!chosen && confirmation?.itemId === chosen.id;
  const extraCategory = categories.slice(3).some(entry => entry.id === category);
  function update(next: AvatarSelection) {
    setDraft(current => ({ owner, active: next.collection, looks: { ...(current?.owner === owner ? current.looks : { [equipped.collection]: equipped }), [next.collection]: next } }));
    setConfirmation(null); setError(""); setNotice("");
  }
  function changeCategory(next: AvatarCategory) { setCategory(next); setMoreOpen(false); setConfirmation(null); setError(""); }
  function collection(next: AvatarCollection) {
    if (next === selection.collection) return;
    const saved = draft?.owner === owner ? draft.looks[next] : undefined;
    update(saved ?? (equipped.collection === next ? equipped : normalizeSelection({ ...defaultSelection(next), skin: selection.skin, hairColor: selection.hairColor, eyeColor: selection.eyeColor })));
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
  function categoryButton(entry: typeof categories[number]) {
    const active = category === entry.id;
    return <Pressable key={entry.id} accessibilityRole="button" accessibilityLabel={entry.name} accessibilityState={{ selected: active, disabled: busy }} {...(Platform.OS === "web" ? { "aria-pressed": active } : {})} disabled={busy} onPress={() => changeCategory(entry.id)} testID={`wardrobe-category-${entry.id}`} style={{ flex: 1, minWidth: 0, minHeight: 44, justifyContent: "center", alignItems: "center", paddingHorizontal: 4, borderRadius: 10, backgroundColor: active ? C.sage : "transparent" }}><Text style={[T.small, { color: C.ink, fontFamily: active ? "DMBold" : "DM", fontSize: 12 }]}>{entry.name}</Text></Pressable>;
  }
  return <View style={{ gap: 12, width: "100%", maxWidth: 600, alignSelf: "center" }} testID="avatar-wardrobe-screen">
    <AvatarPanelHeader title="My profile" subtitle={`${state?.profile.displayName || "Your avatar"} · Level ${data.level}`} onSettings={onOpenSettings} onBack={onOpenProgress ? undefined : onBack} />
    {!!onOpenProgress && <View style={{ flexDirection: "row", padding: 3, backgroundColor: C.cream, borderRadius: 12, borderWidth: 1, borderColor: C.border }}>
      <Pressable accessibilityRole="button" accessibilityLabel="Avatar" accessibilityState={{ selected: true }} {...(Platform.OS === "web" ? { "aria-pressed": true } : {})} style={{ flex: 1, minHeight: 44, alignItems: "center", justifyContent: "center", borderRadius: 9, backgroundColor: C.forest }}><Text style={[T.small, { color: C.paper, fontFamily: "DMBold", fontSize: 14 }]}>Avatar</Text></Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="Progress" accessibilityState={{ selected: false }} {...(Platform.OS === "web" ? { "aria-pressed": false } : {})} onPress={onOpenProgress} style={{ flex: 1, minHeight: 44, alignItems: "center", justifyContent: "center" }}><Text style={[T.small, { color: C.ink, fontSize: 14 }]}>Progress</Text></Pressable>
    </View>}
    <View onLayout={event => setStageWidth(event.nativeEvent.layout.width)} style={{ height: 286, borderRadius: 17, overflow: "hidden", alignItems: "center", justifyContent: "flex-end", backgroundColor: C.sage }}>
      <PixelScene scene="room" width={stageWidth} height={286} absolute />
      <View pointerEvents="none" style={{ position: "absolute", inset: 0, backgroundColor: "rgba(255,252,248,0.12)" }} />
      <LayeredAvatar selection={selection} variant="big" scale={stageWidth < 310 ? 0.65 : 0.73} accessibilityLabel="Your full-body avatar preview" />
      <View style={{ position: "absolute", top: 10, right: 10, flexDirection: "row", borderRadius: 14, backgroundColor: C.paper, padding: 2 }}>
        {([ ["girl", "Girl styles"], ["boy", "Boy styles"] ] as const).map(([id, label]) => <Pressable key={id} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ selected: selection.collection === id, disabled: busy }} {...(Platform.OS === "web" ? { "aria-pressed": selection.collection === id } : {})} disabled={busy} onPress={() => collection(id)} style={{ minHeight: 44, paddingHorizontal: 10, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: selection.collection === id ? C.sage : "transparent" }}><Text style={[T.small, { fontFamily: "DMBold", color: C.ink, fontSize: 12 }]}>{id === "girl" ? "Girl" : "Boy"}</Text></Pressable>)}
      </View>
      <View style={{ position: "absolute", left: 10, bottom: 10, borderRadius: 40, borderWidth: 2, borderColor: C.paper, backgroundColor: C.cream, padding: 3 }}><LayeredAvatar selection={selection} variant="chibi" scale={0.25} playing={false} accessibilityLabel="Matching chibi portrait" /></View>
      <View style={{ position: "absolute", top: 10, left: 10, paddingHorizontal: 9, paddingVertical: 7, borderRadius: 10, backgroundColor: C.paper }}><Text style={[T.small, { fontFamily: "DMBold", color: C.ink }]}>{changed ? "Preview" : "Equipped"}</Text></View>
    </View>
    <View style={{ gap: 8 }}>
      {changed && <Text style={T.small}>{canEquip ? "Preview · ready to equip" : `Preview · ${lockedSelected.length} locked ${lockedSelected.length === 1 ? "piece" : "pieces"}. Buy or earn to equip.`}</Text>}
      <View style={{ flexDirection: "row", gap: 8 }}>
        {changed && <Action label="Restore equipped look" icon="rotate-ccw" disabled={busy} onPress={() => { setDraft(null); setConfirmation(null); setNotice(""); setError(""); }} style={{ flex: 1, paddingHorizontal: 8 }} />}
        <Action label={changed ? "Equip look" : "Look equipped"} primary={changed} disabled={!changed || !canEquip || operation === "purchase"} busy={operation === "equip"} onPress={() => void save()} testID="equip-avatar" style={{ flex: 1 }} />
      </View>
      {!!notice && <Text accessibilityLiveRegion="polite" style={T.small} testID="wardrobe-result">{notice}</Text>}
      <ErrorNote message={confirmation ? loadError : error || loadError} />
    </View>
    <View style={{ backgroundColor: C.cream, borderRadius: 12, padding: 3, gap: 3 }}>
      <View style={{ flexDirection: "row" }}>{categories.slice(0, 3).map(categoryButton)}<Pressable accessibilityRole="button" accessibilityLabel="More categories" accessibilityState={{ expanded: moreOpen, selected: extraCategory, disabled: busy }} disabled={busy} onPress={() => setMoreOpen(value => !value)} testID="wardrobe-more-categories" style={{ flex: 1, minHeight: 44, paddingHorizontal: 4, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 3, borderRadius: 10, backgroundColor: extraCategory ? C.sage : "transparent" }}><Text style={[T.small, { color: C.ink, fontFamily: extraCategory ? "DMBold" : "DM", fontSize: 12 }]}>{extraCategory ? currentCategory.name : "More"}</Text><Icon name={moreOpen ? "chevron-up" : "chevron-down"} size={12} /></Pressable></View>
      {moreOpen && <View style={{ flexDirection: "row", flexWrap: "wrap" }}>{categories.slice(3).map(categoryButton)}</View>}
    </View>
    <View style={{ flexDirection: "row", padding: 3, backgroundColor: C.cream, borderRadius: 12, borderWidth: 1, borderColor: C.border }}>
      {([ ["owned", "Owned"], ["shop", "Shop"] ] as const).map(([id, label]) => <Pressable key={id} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ selected: filter === id }} {...(Platform.OS === "web" ? { "aria-pressed": filter === id } : {})} onPress={() => { setFilter(id); setConfirmation(null); }} style={{ flex: 1, minHeight: 44, alignItems: "center", justifyContent: "center", borderRadius: 9, backgroundColor: filter === id ? C.forest : "transparent" }}><Text style={[T.small, { fontSize: 14, color: filter === id ? C.paper : C.ink, fontFamily: filter === id ? "DMBold" : "DM" }]}>{label}</Text></Pressable>)}
    </View>
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
      {items.map(item => {
        const active = selection[category] === item.id; const isOwned = owned.has(item.id); const isEquipped = equipped[category] === item.id; const listing = data.catalog.find(entry => entry.id === item.id);
        return <Pressable key={item.id} accessibilityRole="button" accessibilityLabel={`Preview ${item.name}, ${isOwned ? isEquipped ? "equipped" : "owned" : `${listing?.price ?? "locked"} Coins, locked`}`} accessibilityState={{ selected: active, disabled: busy }} {...(Platform.OS === "web" ? { "aria-pressed": active } : {})} disabled={busy} onPress={() => update(normalizeSelection({ ...selection, [category]: item.id }))} testID={`inventory-${item.id}`} style={{ width: "31%", minHeight: 149, paddingVertical: 8, paddingHorizontal: 4, alignItems: "center", gap: 4, borderRadius: 13, borderWidth: active ? 2 : 1, borderColor: active ? C.orange : C.border, backgroundColor: active ? C.cream : C.paper }}>
          <WardrobeItemArt selection={selection} item={item} />
          <Text style={[T.small, { color: C.ink, textAlign: "center", fontFamily: "DMBold", fontSize: 12, lineHeight: 17 }]}>{item.name}</Text>
          {isOwned ? <Text style={[T.small, { fontSize: 12, textAlign: "center" }]}>{isEquipped ? "Equipped" : active ? "Previewing" : "Owned"}</Text> : <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}><CoinIcon size={14} /><Text style={T.small}>{listing?.price ?? "—"}</Text></View>}
          {(isEquipped || !isOwned) && <View style={{ position: "absolute", top: 5, right: 5, borderRadius: 9, padding: 3, backgroundColor: isEquipped ? C.orange : C.sage }}><Icon name={isEquipped ? "check" : "lock"} size={10} color={isEquipped ? C.paper : C.muted} /></View>}
        </Pressable>;
      })}
    </View>
    {!items.length && <View style={R.smallCard}><Text style={T.body}>No owned {currentCategory.name.toLowerCase()} yet.</Text><Text style={T.small}>Explore the shop to preview pieces and see how to earn them.</Text><Action label="Explore shop" onPress={() => setFilter("shop")} /></View>}
    {currentCategory.optional && <Action label={`No ${category}`} selected={selection[category] === null} disabled={busy} icon="minus-circle" onPress={() => update(normalizeSelection({ ...selection, [category]: null }))} />}
    {chosen && !owned.has(chosen.id) && <View style={[R.smallCard, { gap: 10 }]}>
      <Text style={T.h3}>{chosen.name}</Text>
      <Text style={[T.small, { color: C.ink }]}>Earn it through learning</Text>
      <Text style={T.body}>{chosen.unlockRule.description}</Text>
      <Text style={T.small}>{Math.min(chosen.progress, chosen.unlockRule.target)} / {chosen.unlockRule.target} completed</Text>
      {canBuy && <>
        <View style={R.divider} /><Text style={T.small}>Or buy for {price} Coins.</Text>
        {confirming ? <View style={{ gap: 10 }} testID="wardrobe-purchase-confirmation"><Text style={T.body}>Buy {chosen.name} for {price} Coins?{data.coins >= price! ? ` You’ll have ${data.coins - price!} Coins left.` : ""}</Text><Text style={T.small}>Buying adds ownership. Equip your look when ready.</Text><ErrorNote message={error} /><View style={R.row}><Action label="Cancel purchase" disabled={busy} onPress={() => setConfirmation(null)} style={{ flex: 1 }} /><Action label="Confirm purchase" primary disabled={data.coins < price! || operation === "equip"} busy={operation === "purchase"} onPress={() => void purchase()} testID="confirm-avatar-purchase" style={{ flex: 1 }} /></View></View> : <Action label={`Buy for ${price} Coins`} primary disabled={busy || data.coins < price!} onPress={() => { setConfirmation({ itemId: chosen.id, requestId: requestId() }); setError(""); }} testID="buy-avatar-item" />}
        {data.coins < price! && <Text style={T.small}>Earn {price! - data.coins} more Coins to buy this piece.</Text>}
      </>}
    </View>}
    {category === "hair" && <View style={{ gap: 12 }}>
      {([ ["Skin tone", "skin", "skin"], ["Hair colour", "hair", "hairColor"], ["Eye colour", "eyes", "eyeColor"] ] as const).map(([label, palette, field]) => <View key={field} style={{ gap: 6 }}><Text style={T.small}>{label}</Text><View style={R.row}>{AVATAR_PACK.palettes[palette].map(swatch => <Pressable key={swatch.id} accessibilityRole="button" accessibilityLabel={`${label}: ${swatch.name}`} accessibilityState={{ selected: selection[field] === swatch.id, disabled: busy }} disabled={busy} onPress={() => update({ ...selection, [field]: swatch.id })} {...(Platform.OS === "web" ? { "aria-pressed": selection[field] === swatch.id } : {})} style={{ width: 44, height: 44, padding: 6, borderRadius: 22, borderWidth: selection[field] === swatch.id ? 2 : 1, borderColor: selection[field] === swatch.id ? C.forest : C.border }}><View style={{ flex: 1, borderRadius: 18, backgroundColor: swatch.color }} />{selection[field] === swatch.id && <View style={{ position: "absolute", right: -2, bottom: -2, borderRadius: 8, padding: 2, backgroundColor: C.forest }}><Icon name="check" size={10} color={C.paper} /></View>}</Pressable>)}</View></View>)}
    </View>}
    {!!onOpenFood && <Pressable accessibilityRole="button" accessibilityLabel="Food & care" onPress={onOpenFood} style={[R.smallCard, { flexDirection: "row", alignItems: "center", minHeight: 54 }]}><Icon name="coffee" size={21} color={C.orange} /><Text style={[T.h3, { flex: 1, fontSize: 15 }]}>Food & care</Text><Text style={T.small}>{data.fullness.value} / {data.fullness.max}</Text><Icon name="chevron-right" size={17} /></Pressable>}
  </View>;
}
