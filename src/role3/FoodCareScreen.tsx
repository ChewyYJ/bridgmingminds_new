import { useTheme } from "../theme/ThemeProvider";
import React, { useRef, useState } from "react";
import { Image, Platform, Pressable, Text, View } from "react-native";
import type { FoodPurchaseReceipt } from "../../shared/gamification.mjs";
import { ErrorNote, Icon } from "../components/ui";
import { LayeredAvatar } from "../avatar/LayeredAvatar";
import { AVATAR_FOOD_ASSETS, type AvatarFoodId } from "../avatar/food-assets";
import { normalizeSelection } from "../avatar/pack";
import { isDraftOwner } from "../lib/api";
import { role3Api } from "./api";
import {
  Action,
  LoadState,
  Meter,
  useRoleStyles,
  errorMessage,
  requestId,
  useGamification,
} from "./common";
import { AvatarPanelHeader } from "./AvatarPanelHeader";
import { CoinIcon } from "./CoinIcon";

export function FoodCareScreen({ onBack }: { onBack: () => void }) {
  const { C, T } = useTheme();
  const R = useRoleStyles();

  const {
    data,
    owner,
    loading,
    error: loadError,
    reload,
    setData,
  } = useGamification();
  const [selected, setSelected] = useState<AvatarFoodId>("ramen");
  const [preview, setPreview] = useState<AvatarFoodId | null>(null);
  const [served, setServed] = useState<{
    owner: string;
    receipt: FoodPurchaseReceipt;
  } | null>(null);
  const [preferencesOpen, setPreferencesOpen] = useState(false);
  const [operation, setOperation] = useState<"feed" | "care" | null>(null);
  const [error, setError] = useState("");
  const lock = useRef(false);
  const transaction = useRef({ food: selected, id: requestId() });
  const busy = operation !== null;
  async function feed() {
    if (!data || lock.current) return;
    const chosen = data.foods.find((food) => food.id === selected);
    if (
      !chosen ||
      data.coins < chosen.cost ||
      data.fullness.value >= data.fullness.max
    )
      return;
    if (transaction.current.food !== selected)
      transaction.current = { food: selected, id: requestId() };
    lock.current = true;
    setOperation("feed");
    setError("");
    try {
      const next = await role3Api.feed(selected, transaction.current.id);
      if (!isDraftOwner(owner)) return;
      setData(next.state);
      setServed({ owner, receipt: next });
      setPreview(null);
      transaction.current = { food: selected, id: requestId() };
    } catch (cause) {
      if (isDraftOwner(owner)) setError(errorMessage(cause));
    } finally {
      lock.current = false;
      if (isDraftOwner(owner)) setOperation(null);
    }
  }
  async function care(settings: {
    careEnabled?: boolean;
    remindersEnabled?: boolean;
  }) {
    if (lock.current) return;
    lock.current = true;
    setOperation("care");
    setError("");
    try {
      const next = await role3Api.care(settings);
      if (isDraftOwner(owner)) setData(next);
    } catch (cause) {
      if (isDraftOwner(owner)) setError(errorMessage(cause));
    } finally {
      lock.current = false;
      if (isDraftOwner(owner)) setOperation(null);
    }
  }
  if (!data)
    return (
      <View style={R.page}>
        <AvatarPanelHeader title="Food & care" onBack={onBack} />
        <LoadState loading={loading} error={loadError} onRetry={reload} />
      </View>
    );
  const food = data.foods.find((entry) => entry.id === selected);
  const foodArt = AVATAR_FOOD_ASSETS.find((entry) => entry.id === selected)!;
  const receipt =
    served?.owner === owner && served.receipt.foodId === selected
      ? served.receipt
      : null;
  const previewing = preview === selected && !receipt;
  const animation = receipt
    ? foodArt.animation
    : previewing
      ? foodArt.animation
      : "idle";
  const enough = !!food && data.coins >= food.cost;
  const full = data.fullness.value >= data.fullness.max;
  function choose(id: AvatarFoodId) {
    setSelected(id);
    setPreview(null);
    setServed(null);
    setError("");
  }
  return (
    <View
      style={{ gap: 14, width: "100%", maxWidth: 560, alignSelf: "center" }}
      testID="food-care-screen"
    >
      <AvatarPanelHeader title="Food & care" onBack={onBack} />
      <View style={{ alignItems: "center", paddingTop: 2, gap: 5 }}>
        <LayeredAvatar
          selection={normalizeSelection(data.avatar.selection)}
          variant="chibi"
          animation={animation}
          scale={0.68}
          accessibilityLabel={
            receipt
              ? `${foodArt.name} served`
              : previewing
                ? `${foodArt.name} animation preview`
                : "Your avatar, idle"
          }
        />
        {receipt ? (
          <View
            style={{
              minHeight: 38,
              flexDirection: "row",
              alignItems: "center",
              gap: 7,
              backgroundColor: C.sage,
              paddingVertical: 7,
              paddingHorizontal: 16,
              borderRadius: 22,
            }}
            testID="food-purchase-result"
          >
            <Icon name="check-circle" size={19} color={C.forest} />
            <Text
              accessibilityLiveRegion="polite"
              style={[T.h3, { fontSize: 16 }]}
            >
              {receipt.food.name} served
            </Text>
          </View>
        ) : (
          <Text style={[T.small, { minHeight: 20, textAlign: "center" }]}>
            {previewing
              ? "Animation preview · no Coins spent"
              : "A little care, whenever you like."}
          </Text>
        )}
      </View>
      <View
        style={{
          padding: 14,
          borderRadius: 15,
          borderWidth: 1,
          borderColor: C.border,
          backgroundColor: C.paper,
        }}
      >
        <Meter
          value={data.fullness.value}
          max={data.fullness.max}
          label="Fullness"
        />
      </View>
      {receipt && (
        <View
          style={{
            alignSelf: "center",
            backgroundColor: C.cream,
            borderRadius: 15,
            paddingVertical: 7,
            paddingHorizontal: 18,
          }}
        >
          <Text
            style={[T.body, { fontSize: 14 }]}
          >{`+${receipt.fullnessRestored} fullness · −${receipt.coinsSpent} Coins`}</Text>
        </View>
      )}
      <Text style={[T.small, { textAlign: "center", fontSize: 13 }]}>
        Care is optional. Practice is always available.
      </Text>
      <View style={{ flexDirection: "row", gap: 8 }}>
        {data.foods.map((entry) => {
          const asset = AVATAR_FOOD_ASSETS.find(
            (value) => value.id === entry.id,
          );
          if (!asset) return null;
          const active = selected === entry.id;
          const isServed = receipt?.foodId === entry.id;
          return (
            <Pressable
              key={entry.id}
              accessibilityRole="button"
              accessibilityLabel={`Choose ${entry.name}, ${entry.cost} Coins, restores up to ${entry.fullness} fullness`}
              accessibilityState={{ selected: active, disabled: busy }}
              {...(Platform.OS === "web" ? { "aria-pressed": active } : {})}
              disabled={busy}
              onPress={() => {
                if (!isServed) choose(asset.id);
              }}
              testID={`buy-food-${entry.id}`}
              style={{
                flex: 1,
                minWidth: 0,
                alignItems: "center",
                gap: 4,
                borderWidth: active ? 2 : 1,
                borderRadius: 14,
                borderColor: active ? C.orange : C.border,
                backgroundColor: active ? C.cream : C.paper,
                paddingVertical: 10,
                paddingHorizontal: 3,
              }}
            >
              <Image
                source={asset.source}
                style={{ width: 68, height: 68 }}
                resizeMode="contain"
                accessible={false}
              />
              <Text style={[T.h3, { fontSize: 14 }]}>{entry.name}</Text>
              {isServed ? (
                <Text style={T.small}>Served</Text>
              ) : (
                <View
                  style={{ flexDirection: "row", alignItems: "center", gap: 4 }}
                >
                  <CoinIcon size={15} />
                  <Text style={T.small}>{entry.cost} Coins</Text>
                </View>
              )}
              {!isServed && (
                <Text style={[T.small, { fontSize: 12, textAlign: "center" }]}>
                  +{entry.fullness} fullness
                </Text>
              )}
              {isServed && (
                <View
                  style={{
                    position: "absolute",
                    top: 5,
                    right: 5,
                    padding: 3,
                    borderRadius: 9,
                    backgroundColor: C.forest,
                  }}
                >
                  <Icon name="check" size={10} color={C.paper} />
                </View>
              )}
            </Pressable>
          );
        })}
      </View>
      {receipt ? (
        <View style={{ gap: 8 }}>
          {receipt.alreadyProcessed && (
            <Text style={T.small}>
              This meal was already served. No second charge was made.
            </Text>
          )}
          <Action label="Done" primary onPress={onBack} testID="food-done" />
        </View>
      ) : (
        !!food && (
          <View style={{ gap: 10 }}>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 8,
              }}
            >
              <Text style={[T.h3, { fontSize: 16 }]}>
                {food.name} · {food.cost} Coins
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={
                  previewing ? "Stop animation preview" : "Preview animation"
                }
                accessibilityState={{ selected: previewing, disabled: busy }}
                {...(Platform.OS === "web"
                  ? { "aria-pressed": previewing }
                  : {})}
                disabled={busy}
                onPress={() => setPreview(previewing ? null : selected)}
                testID="preview-food-animation"
                style={{
                  minHeight: 44,
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 5,
                  paddingHorizontal: 3,
                }}
              >
                <Icon name={previewing ? "pause" : "play"} size={13} />
                <Text
                  style={[
                    T.small,
                    { color: C.ink, textDecorationLine: "underline" },
                  ]}
                >
                  {previewing ? "Stop preview" : "Preview"}
                </Text>
              </Pressable>
            </View>
            <Text style={T.small}>
              {full
                ? "Your avatar is full. Save this meal for later."
                : enough
                  ? `Restores up to ${Math.min(food.fullness, data.fullness.max - data.fullness.value)} fullness. You’ll have ${data.coins - food.cost} Coins left.`
                  : `Earn ${food.cost - data.coins} more Coins to buy this meal.`}
            </Text>
            <Action
              label={`Buy & feed ${food.name} · ${food.cost} Coins`}
              primary
              disabled={!enough || full || operation === "care"}
              busy={operation === "feed"}
              onPress={() => void feed()}
              testID="confirm-food-purchase"
            />
          </View>
        )
      )}
      <ErrorNote message={error || loadError} />
      <View
        style={{
          borderWidth: 1,
          borderColor: C.border,
          borderRadius: 14,
          paddingHorizontal: 13,
          paddingVertical: 4,
          gap: preferencesOpen ? 10 : 0,
          backgroundColor: C.paper,
        }}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Care preferences"
          accessibilityState={{ expanded: preferencesOpen }}
          onPress={() => setPreferencesOpen((value) => !value)}
          style={{
            minHeight: 46,
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
          }}
        >
          <Icon name="settings" size={18} />
          <Text
            style={[
              T.small,
              { flex: 1, fontFamily: "DMBold", color: C.ink, fontSize: 14 },
            ]}
          >
            Care settings
          </Text>
          <Text style={T.small}>
            {data.fullness.careEnabled ? "On" : "Off"}
          </Text>
          <Icon
            name={preferencesOpen ? "chevron-up" : "chevron-right"}
            size={18}
          />
        </Pressable>
        {preferencesOpen && (
          <View style={{ gap: 10, paddingBottom: 10 }}>
            <Text style={T.small}>
              {data.fullness.careEnabled
                ? "Fullness gently decreases over time. Learning is always available."
                : "Automatic fullness changes are off. You can still serve a meal."}
            </Text>
            <View style={R.row}>
              <Action
                label={`Avatar care ${data.fullness.careEnabled ? "on" : "off"}`}
                selected={data.fullness.careEnabled}
                disabled={busy}
                onPress={() =>
                  void care({ careEnabled: !data.fullness.careEnabled })
                }
              />
              <Action
                label={`Care reminders ${data.fullness.remindersEnabled ? "on" : "off"}`}
                selected={data.fullness.remindersEnabled}
                disabled={busy}
                onPress={() =>
                  void care({
                    remindersEnabled: !data.fullness.remindersEnabled,
                  })
                }
              />
            </View>
            <Text style={T.small}>
              Reminders appear in the app when care is on and fullness is low.
            </Text>
          </View>
        )}
      </View>
    </View>
  );
}
