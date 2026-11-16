import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { useApp } from "../lib/state";
import { isDraftOwner, loadDraft, saveDraft } from "../lib/api";
import { useReducedMotion } from "../hooks/useReducedMotion";
import { LayeredAvatar, supportedAvatarAnimation } from "./LayeredAvatar";
import { AVATAR_PACK } from "./generated-pack";
import { AVATAR_FOOD_ASSETS, type AvatarFoodId } from "./food-assets";
import {
  defaultSelection,
  normalizeSelection,
  type AvatarAnimation,
  type AvatarCategory,
  type AvatarCollection,
  type AvatarSelection,
} from "./pack";

const DRAFT_KEY = "avatar-wardrobe-v1";
type StudioAction = Exclude<AvatarAnimation, "eatOnigiri" | "eatBento">;
const CATEGORIES: { id: AvatarCategory; label: string; optional?: boolean }[] =
  [
    { id: "hair", label: "Hair" },
    { id: "hat", label: "Hats", optional: true },
    { id: "top", label: "Tops" },
    { id: "jacket", label: "Jackets", optional: true },
    { id: "bottom", label: "Bottoms" },
    { id: "shoes", label: "Shoes" },
    { id: "accessory", label: "Accessories", optional: true },
  ];
const STREET_ANIMATIONS: { id: StudioAction; label: string }[] = [
  { id: "idle", label: "Idle / blink" },
  { id: "walk", label: "Walk" },
];
const REACTION_ANIMATIONS: { id: StudioAction; label: string }[] = [
  { id: "greet", label: "Greet" },
  { id: "speak", label: "Speak" },
  { id: "celebrate", label: "Celebrate" },
  { id: "eat", label: "Eat" },
];

function Choice({
  label,
  selected,
  disabled = false,
  onPress,
  primary = false,
  testID,
}: {
  label: string;
  selected?: boolean;
  disabled?: boolean;
  onPress: () => void;
  primary?: boolean;
  testID?: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{
        ...(selected === undefined ? {} : { selected }),
        disabled,
      }}
      {...(Platform.OS === "web" && selected !== undefined
        ? { "aria-pressed": selected }
        : {})}
      disabled={disabled}
      onPress={onPress}
      testID={testID}
      style={({ pressed }) => [
        s.choice,
        selected && s.choiceSelected,
        primary && s.primary,
        (pressed || disabled) && { opacity: disabled ? 0.45 : 0.7 },
      ]}
    >
      <Text style={[s.choiceText, primary && { color: "#FFFFFF" }]}>
        {label}
      </Text>
    </Pressable>
  );
}

function PaletteRow({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { id: string; name: string; color: string }[];
  value: string;
  onChange: (id: string) => void;
}) {
  return (
    <View style={{ gap: 9 }}>
      <Text style={s.label}>{label}</Text>
      <View style={s.row}>
        {options.map((option) => (
          <Pressable
            key={option.id}
            accessibilityRole="button"
            accessibilityLabel={`${label}: ${option.name}`}
            accessibilityState={{ selected: value === option.id }}
            {...(Platform.OS === "web"
              ? { "aria-pressed": value === option.id }
              : {})}
            onPress={() => onChange(option.id)}
            style={[s.swatchTarget, value === option.id && s.swatchSelected]}
          >
            <View style={[s.swatch, { backgroundColor: option.color }]} />
            {value === option.id && (
              <View style={s.swatchCheck}>
                <Text style={s.swatchCheckText}>✓</Text>
              </View>
            )}
          </Pressable>
        ))}
      </View>
    </View>
  );
}

/** Local asset studio. No wallet, ownership or server equipment state is mutated. */
export function WardrobeStudio({ onBack }: { onBack: () => void }) {
  const { state } = useApp();
  const ownerId = state?.profile.id ?? "guest";
  const { width } = useWindowDimensions();
  const reduced = useReducedMotion();
  const [selection, setSelection] = useState<AvatarSelection>(() =>
    defaultSelection("girl"),
  );
  const [category, setCategory] = useState<AvatarCategory>("hair");
  const [action, setAction] = useState<StudioAction>("idle");
  const [food, setFood] = useState<AvatarFoodId>("ramen");
  const [facing, setFacing] = useState<"left" | "right">("right");
  const [playing, setPlaying] = useState(true);
  const [previewWidth, setPreviewWidth] = useState(300);
  const [hydratedOwner, setHydratedOwner] = useState<string | null>(null);
  const [savedSignature, setSavedSignature] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const ready = hydratedOwner === ownerId;

  useEffect(() => {
    let live = true;
    void loadDraft(DRAFT_KEY)
      .then((raw) => {
        if (!live || !isDraftOwner(ownerId)) return;
        setError("");
        setSaving(false);
        let next = defaultSelection("girl");
        if (raw) {
          try {
            const stored: unknown = JSON.parse(raw);
            next = normalizeSelection(stored);
          } catch {
            setError(
              "The saved look could not be read. A fresh look is ready to customise.",
            );
          }
        }
        setSelection(next);
        setSavedSignature(raw ? JSON.stringify(next) : "");
        setNotice(raw ? "Saved look restored from this device." : "");
        setHydratedOwner(ownerId);
      })
      .catch(() => {
        if (!live || !isDraftOwner(ownerId)) return;
        setSaving(false);
        setSelection(defaultSelection("girl"));
        setSavedSignature("");
        setError(
          "The saved look could not be loaded. You can still try the wardrobe.",
        );
        setHydratedOwner(ownerId);
      });
    return () => {
      live = false;
    };
  }, [ownerId]);

  const signature = JSON.stringify(selection);
  const selectedCategory = CATEGORIES.find((entry) => entry.id === category)!;
  const items = AVATAR_PACK.catalog[selection.collection][category];
  const previewColumnWidth = Math.max(88, (previewWidth - 20) / 2);
  const tallScale = Math.min(
    1.35,
    previewColumnWidth / AVATAR_PACK.styles.big.width,
  );
  const chibiScale = Math.min(
    1.3,
    previewColumnWidth / AVATAR_PACK.styles.chibi.width,
  );
  const selectedFood = AVATAR_FOOD_ASSETS.find((entry) => entry.id === food)!;
  const animation = action === "eat" ? selectedFood.animation : action;
  const tallAction = supportedAvatarAnimation("big", animation);
  const chibiAction = supportedAvatarAnimation("chibi", animation);
  const thumbnailVariant =
    category === "bottom" || category === "shoes" ? "big" : "chibi";
  const thumbnailRig = AVATAR_PACK.styles[thumbnailVariant];
  const thumbnailScale = Math.min(
    76 / thumbnailRig.width,
    92 / thumbnailRig.height,
  );
  const thumbnails = useMemo(
    () =>
      items.map((item) => ({
        item,
        selection: normalizeSelection({ ...selection, [category]: item.id }),
        preview: normalizeSelection({
          ...selection,
          [category]: item.id,
          ...(category === "top" ? { jacket: null } : {}),
        }),
      })),
    [items, selection, category],
  );

  function update(next: AvatarSelection) {
    setSelection(next);
    setNotice("");
    setError("");
  }

  function switchCollection(collection: AvatarCollection) {
    if (selection.collection === collection) return;
    update(
      normalizeSelection({
        ...defaultSelection(collection),
        skin: selection.skin,
        hairColor: selection.hairColor,
        eyeColor: selection.eyeColor,
      }),
    );
  }

  async function save() {
    if (!ready || saving || !isDraftOwner(ownerId)) return;
    const captured = JSON.stringify(selection);
    setSaving(true);
    setError("");
    try {
      await saveDraft(DRAFT_KEY, captured);
      if (!isDraftOwner(ownerId)) return;
      setSavedSignature(captured);
      setNotice("Saved on this device.");
    } catch {
      if (isDraftOwner(ownerId))
        setError("This look could not be saved. Please try again.");
    } finally {
      if (isDraftOwner(ownerId)) setSaving(false);
    }
  }

  if (!ready)
    return (
      <View
        style={[
          s.panel,
          {
            minHeight: 180,
            alignItems: "center",
            justifyContent: "center",
            gap: 12,
          },
        ]}
      >
        <ActivityIndicator accessibilityLabel="Loading" color="#242424" />
        <Text style={s.body}>Opening your wardrobe…</Text>
      </View>
    );

  return (
    <View style={{ gap: 20 }} testID="wardrobe-studio">
      <View style={[s.row, { justifyContent: "space-between" }]}>
        <View style={{ flex: 1, minWidth: 190, gap: 5 }}>
          <Text style={s.eyebrow}>BRIDGINGMINDS · AVATAR STUDIO</Text>
          <Text accessibilityRole="header" style={s.heading}>
            Make it yours
          </Text>
          <Text style={s.body}>
            An adult street avatar and a chibi portrait for reactions.
          </Text>
        </View>
        <Choice label="Back" onPress={onBack} />
      </View>

      <View style={[s.row, { gap: 8 }]}>
        <Choice
          label="Girl styles"
          selected={selection.collection === "girl"}
          onPress={() => switchCollection("girl")}
          testID="collection-girl"
        />
        <Choice
          label="Boy styles"
          selected={selection.collection === "boy"}
          onPress={() => switchCollection("boy")}
          testID="collection-boy"
        />
        <Text style={s.small}>3 designs in every category</Text>
      </View>

      <View
        style={{
          flexDirection: width >= 850 ? "row" : "column",
          gap: 18,
          alignItems: "stretch",
        }}
      >
        <View
          style={[
            s.panel,
            { flex: width >= 850 ? 1 : undefined, minWidth: 0, gap: 18 },
          ]}
        >
          <View style={{ gap: 4 }}>
            <Text accessibilityRole="header" style={s.sectionTitle}>
              Your avatar
            </Text>
            <Text style={s.small}>
              Walk with your adult avatar. Express yourself with your chibi.
            </Text>
          </View>
          <View
            onLayout={(event) =>
              setPreviewWidth(event.nativeEvent.layout.width)
            }
            style={s.stage}
          >
            <View
              style={{
                alignItems: "center",
                gap: 8,
                width: previewColumnWidth,
              }}
            >
              <LayeredAvatar
                selection={selection}
                animation={animation}
                variant="big"
                scale={tallScale}
                facing={facing}
                playing={playing}
              />
              <Text style={[s.label, { textAlign: "center" }]}>
                Adult · street
              </Text>
              <Text style={s.small} testID="adult-action-label">
                {tallAction === "walk" ? "Walking" : "Idle / blink"}
              </Text>
            </View>
            <View
              style={{
                alignItems: "center",
                gap: 8,
                paddingBottom: 2,
                width: previewColumnWidth,
              }}
            >
              <LayeredAvatar
                selection={selection}
                animation={animation}
                variant="chibi"
                scale={chibiScale}
                facing={facing}
                playing={playing}
              />
              <Text style={[s.label, { textAlign: "center" }]}>
                Chibi · upper body
              </Text>
              <Text style={s.small} testID="chibi-action-label">
                {AVATAR_FOOD_ASSETS.find(
                  (entry) => entry.animation === chibiAction,
                )
                  ? `Eating ${selectedFood.name}`
                  : (REACTION_ANIMATIONS.find(
                      (entry) => entry.id === chibiAction,
                    )?.label ?? "Idle / blink")}
              </Text>
            </View>
          </View>
          <View style={{ gap: 9 }}>
            <Text style={s.label}>Street movement</Text>
            <View style={s.row}>
              {STREET_ANIMATIONS.map((entry) => (
                <Choice
                  key={entry.id}
                  label={entry.label}
                  selected={action === entry.id}
                  onPress={() => setAction(entry.id)}
                  testID={`animation-${entry.id}`}
                />
              ))}
            </View>
          </View>
          <View style={{ gap: 9 }}>
            <Text style={s.label}>Chibi reactions</Text>
            <View style={s.row}>
              {REACTION_ANIMATIONS.map((entry) => (
                <Choice
                  key={entry.id}
                  label={entry.label}
                  selected={action === entry.id}
                  onPress={() => setAction(entry.id)}
                  testID={`animation-${entry.id}`}
                />
              ))}
            </View>
          </View>
          <View style={{ gap: 9 }}>
            <Text style={s.label}>Food for eating</Text>
            <View style={s.row}>
              {AVATAR_FOOD_ASSETS.map((entry) => (
                <Choice
                  key={entry.id}
                  label={entry.name}
                  selected={food === entry.id}
                  onPress={() => {
                    setFood(entry.id);
                    setAction("eat");
                  }}
                  testID={`food-${entry.id}`}
                />
              ))}
            </View>
          </View>
          <View style={s.row}>
            <Choice
              label="← Face left"
              selected={facing === "left"}
              onPress={() => setFacing("left")}
            />
            <Choice
              label="Face right →"
              selected={facing === "right"}
              onPress={() => setFacing("right")}
            />
            <Choice
              label={playing ? "Pause" : "Play"}
              onPress={() => setPlaying(!playing)}
              disabled={reduced}
            />
          </View>
          {reduced && (
            <Text style={s.small}>
              Reduced motion is on. The preview shows a still pose.
            </Text>
          )}
        </View>

        <View
          style={[
            s.panel,
            { flex: width >= 850 ? 1.15 : undefined, minWidth: 0, gap: 18 },
          ]}
        >
          <View style={{ gap: 4 }}>
            <Text accessibilityRole="header" style={s.sectionTitle}>
              Wardrobe
            </Text>
            <Text style={s.small}>
              Choose your look. Bottoms and shoes appear on the adult avatar.
            </Text>
          </View>
          <View style={s.row}>
            {CATEGORIES.map((entry) => (
              <Choice
                key={entry.id}
                label={entry.label}
                selected={category === entry.id}
                onPress={() => setCategory(entry.id)}
                testID={`category-${entry.id}`}
              />
            ))}
          </View>
          <View style={s.itemGrid}>
            {thumbnails.map(({ item, selection: candidate, preview }) => {
              const selected = selection[category] === item.id;
              return (
                <Pressable
                  key={item.id}
                  accessibilityRole="button"
                  accessibilityLabel={`Wear ${item.name}`}
                  accessibilityState={{ selected }}
                  {...(Platform.OS === "web"
                    ? { "aria-pressed": selected }
                    : {})}
                  testID={`wear-${item.id}`}
                  onPress={() => update(candidate)}
                  style={({ pressed }) => [
                    s.item,
                    selected && s.itemSelected,
                    pressed && { opacity: 0.7 },
                  ]}
                >
                  <View style={s.itemArt}>
                    <LayeredAvatar
                      selection={preview}
                      variant={thumbnailVariant}
                      animation="idle"
                      playing={false}
                      scale={thumbnailScale}
                      accessibilityLabel={item.name}
                    />
                  </View>
                  <Text numberOfLines={2} style={s.itemName}>
                    {item.name}
                  </Text>
                  <Text style={[s.itemState, selected && { color: "#242424" }]}>
                    {selected ? "✓ Wearing" : "Try on"}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          {selectedCategory.optional && (
            <Choice
              label={`No ${category === "accessory" ? "accessory" : category}`}
              selected={selection[category] === null}
              onPress={() =>
                update(normalizeSelection({ ...selection, [category]: null }))
              }
              testID={`remove-${category}`}
            />
          )}
          <View style={s.divider} />
          <PaletteRow
            label="Skin tone"
            options={AVATAR_PACK.palettes.skin}
            value={selection.skin}
            onChange={(skin) => update({ ...selection, skin })}
          />
          <PaletteRow
            label="Hair colour"
            options={AVATAR_PACK.palettes.hair}
            value={selection.hairColor}
            onChange={(hairColor) => update({ ...selection, hairColor })}
          />
          <PaletteRow
            label="Eye colour"
            options={AVATAR_PACK.palettes.eyes}
            value={selection.eyeColor}
            onChange={(eyeColor) => update({ ...selection, eyeColor })}
          />
        </View>
      </View>

      <View style={[s.panel, { gap: 12 }]}>
        <View style={[s.row, { justifyContent: "space-between" }]}>
          <View style={{ flex: 1, minWidth: 180, gap: 4 }}>
            <Text style={s.sectionTitle}>
              {signature === savedSignature
                ? "Your look is saved"
                : "Happy with your look?"}
            </Text>
            <Text style={s.small}>Save your look on this device.</Text>
          </View>
          <View style={s.row}>
            <Choice
              label="Reset look"
              onPress={() => update(defaultSelection(selection.collection))}
              disabled={saving}
            />
            <Choice
              label={saving ? "Saving…" : "Save look"}
              onPress={() => void save()}
              primary
              disabled={saving || signature === savedSignature}
              testID="save-avatar-look"
            />
          </View>
        </View>
        {!!notice && (
          <Text
            style={s.body}
            accessibilityLiveRegion="polite"
            testID="avatar-save-notice"
          >
            {notice}
          </Text>
        )}
        {!!error && (
          <Text
            style={[s.body, { color: "#A5453F" }]}
            accessibilityRole="alert"
          >
            {error}
          </Text>
        )}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8 },
  panel: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E7E7E7",
    borderRadius: 18,
    padding: 18,
  },
  eyebrow: {
    fontFamily: "DMBold",
    fontSize: 10,
    letterSpacing: 1.4,
    color: "#737373",
  },
  heading: {
    fontFamily: "DMBold",
    fontSize: 30,
    lineHeight: 38,
    color: "#181818",
  },
  sectionTitle: {
    fontFamily: "DMBold",
    fontSize: 18,
    lineHeight: 25,
    color: "#181818",
  },
  body: { fontFamily: "DM", fontSize: 14, lineHeight: 21, color: "#484848" },
  small: { fontFamily: "DM", fontSize: 12, lineHeight: 18, color: "#737373" },
  label: { fontFamily: "DMMedium", fontSize: 13, color: "#484848" },
  choice: {
    minHeight: 44,
    paddingHorizontal: 13,
    paddingVertical: 10,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#E7E7E7",
    backgroundColor: "#FFFFFF",
    borderRadius: 10,
  },
  choiceSelected: { backgroundColor: "#EDE6DD", borderColor: "#D8CBBE" },
  choiceText: {
    fontFamily: "DMMedium",
    fontSize: 13,
    lineHeight: 18,
    color: "#242424",
  },
  primary: {
    backgroundColor: "#242424",
    borderColor: "#242424",
    paddingHorizontal: 22,
  },
  stage: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "center",
    gap: 20,
    paddingTop: 16,
    paddingBottom: 18,
    minHeight: 230,
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
  },
  itemGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    alignItems: "stretch",
  },
  item: {
    flexGrow: 1,
    flexBasis: "30%",
    minWidth: 84,
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 4,
    borderWidth: 1,
    borderColor: "#E7E7E7",
    borderRadius: 12,
    backgroundColor: "#FAFAFA",
    gap: 5,
  },
  itemSelected: { borderColor: "#A58B6A", backgroundColor: "#F6F1EB" },
  itemArt: { alignItems: "center", justifyContent: "center", height: 96 },
  itemName: {
    fontFamily: "DMMedium",
    fontSize: 12,
    lineHeight: 17,
    color: "#242424",
    textAlign: "center",
    minHeight: 34,
  },
  itemState: { fontFamily: "DM", fontSize: 11, color: "#737373" },
  divider: { height: 1, backgroundColor: "#EEEEEE" },
  swatchTarget: {
    width: 44,
    height: 44,
    borderRadius: 22,
    padding: 6,
    borderWidth: 1,
    borderColor: "#E7E7E7",
    alignItems: "center",
    justifyContent: "center",
  },
  swatchSelected: { borderColor: "#242424", borderWidth: 2, padding: 5 },
  swatch: { width: 30, height: 30, borderRadius: 15 },
  swatchCheck: {
    position: "absolute",
    right: -1,
    bottom: -1,
    width: 17,
    height: 17,
    borderRadius: 9,
    backgroundColor: "#242424",
    alignItems: "center",
    justifyContent: "center",
  },
  swatchCheckText: {
    color: "#FFFFFF",
    fontSize: 11,
    lineHeight: 15,
    fontFamily: "DMBold",
  },
});
