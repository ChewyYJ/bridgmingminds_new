import React, { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View, type ViewStyle } from "react-native";
import { C, T, Icon } from "../components/ui";
import { useApp } from "../lib/state";
import { isDraftOwner } from "../lib/api";
import type { GamificationSummary } from "../../shared/gamification.mjs";
import { role3Api } from "./api";
import { CoinIcon } from "./CoinIcon";

export const R = StyleSheet.create({
  page: { gap: 22 }, row: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 10 },
  card: { backgroundColor: C.paper, borderRadius: 20, borderWidth: 1, borderColor: C.border, padding: 20, gap: 14 },
  smallCard: { backgroundColor: C.paper, borderRadius: 14, borderWidth: 1, borderColor: C.border, padding: 14, gap: 9 },
  divider: { height: 1, backgroundColor: C.border },
});

export function Action({ label, onPress, selected, disabled = false, busy = false, primary = false, icon, testID, style }: {
  label: string; onPress: () => void; selected?: boolean; disabled?: boolean; busy?: boolean; primary?: boolean; icon?: string; testID?: string; style?: ViewStyle;
}) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label}
    accessibilityState={{ disabled: disabled || busy, busy, ...(selected === undefined ? {} : { selected }) }}
    {...(Platform.OS === "web" && selected !== undefined ? { "aria-pressed": selected } : {})}
    disabled={disabled || busy} onPress={onPress} testID={testID}
    style={({ pressed }) => [{ minHeight: 46, paddingVertical: 11, paddingHorizontal: 15, borderRadius: 12, borderWidth: 1, borderColor: primary ? C.forest : selected ? "#AC9275" : C.border, backgroundColor: primary ? C.forest : selected ? C.sage : C.paper, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, opacity: disabled || busy ? 0.5 : pressed ? 0.75 : 1 }, style]}>
    {busy ? <ActivityIndicator color={primary ? "white" : C.forest} /> : icon ? <Icon name={icon} size={18} color={primary ? "white" : C.forest} /> : null}
    <Text style={{ fontFamily: "DMBold", fontSize: 13, color: primary ? "white" : C.ink, textAlign: "center", flexShrink: 1 }}>{label}</Text>
  </Pressable>;
}

export function ScreenHeader({ title, subtitle, onBack }: { title: string; subtitle?: string; onBack?: () => void }) {
  return <View style={[R.row, { alignItems: "flex-start" }]}>
    <View style={{ flex: 1, minWidth: 160, gap: 5 }}><Text accessibilityRole="header" style={T.title}>{title}</Text>{subtitle && <Text style={T.small}>{subtitle}</Text>}</View>
    {onBack && <Action label="Back" icon="arrow-left" onPress={onBack} />}
  </View>;
}

export function Meter({ value, max, label }: { value: number; max: number; label: string }) {
  const bounded = Math.max(0, Math.min(value, max));
  return <View style={{ gap: 7 }} accessibilityRole="progressbar" accessibilityLabel={label} accessibilityValue={{ min: 0, max, now: bounded, text: `${label}: ${bounded} of ${max}` }}>
    <View style={[R.row, { justifyContent: "space-between" }]}><Text style={[T.small, { color: C.ink }]}>{label}</Text><Text style={T.small}>{bounded} / {max}</Text></View>
    <View style={{ height: 8, borderRadius: 4, backgroundColor: C.sage, overflow: "hidden" }}><View style={{ height: 8, width: `${max > 0 ? bounded / max * 100 : 0}%`, backgroundColor: "#6F6256", borderRadius: 4 }} /></View>
  </View>;
}

export function CoinBalance({ value }: { value: number }) {
  return <View style={[R.row, { gap: 5, backgroundColor: "#F0E9DD", paddingVertical: 7, paddingHorizontal: 10, borderRadius: 18 }]} accessibilityLabel={`${value} Coins`}>
    <CoinIcon /><Text style={[T.h3, { fontSize: 15 }]}>{value.toLocaleString()}</Text><Text style={T.small}>Coins</Text>
  </View>;
}

export function LoadState({ loading, error, onRetry }: { loading: boolean; error: string; onRetry: () => void }) {
  return <View style={[R.card, { minHeight: 140, justifyContent: "center" }]}>
    {loading ? <><ActivityIndicator color={C.forest} /><Text style={[T.small, { textAlign: "center" }]}>Loading your progress…</Text></> : <><Text accessibilityRole="alert" style={T.body}>{error || "Your progress could not be loaded."}</Text><Action label="Try again" onPress={onRetry} /></>}
  </View>;
}

export function errorMessage(cause: unknown) { return cause instanceof Error ? cause.message : "Something went wrong. Please try again."; }
export function requestId() { return `role3-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`; }

/** Never show a previous account's loaded summary after the owner changes. */
export function useGamification() {
  const { state, refresh } = useApp();
  const owner = state?.profile.id ?? "guest";
  const [saved, setSaved] = useState<{ owner: string; data: GamificationSummary | null }>({ owner, data: null });
  const [revision, setRevision] = useState(0);
  const [status, setStatus] = useState({ owner, revision: 0, error: "" });
  const generation = useRef(0);
  const reload = useCallback(() => setRevision(value => value + 1), []);
  useEffect(() => {
    const abort = new AbortController(); const sequence = ++generation.current;
    void role3Api.summary(abort.signal).then(data => {
      if (!abort.signal.aborted && sequence === generation.current && isDraftOwner(owner)) { setSaved({ owner, data }); setStatus({ owner, revision, error: "" }); }
    }).catch(cause => { if (!abort.signal.aborted && sequence === generation.current) setStatus({ owner, revision, error: errorMessage(cause) }); });
    return () => abort.abort();
  }, [owner, revision, state?.gamification]);
  const setData = useCallback((data: GamificationSummary) => {
    if (!isDraftOwner(owner)) return;
    // A purchase receipt is newer than any summary request started before it.
    generation.current++;
    setSaved({ owner, data });
    setStatus({ owner, revision, error: "" });
    void refresh().catch(() => undefined);
  }, [owner, refresh, revision]);
  const current = status.owner === owner && status.revision === revision;
  const data = saved.owner === owner ? saved.data : null;
  return { data, owner, loading: !current || (!data && !status.error), error: current ? status.error : "", reload, setData };
}
