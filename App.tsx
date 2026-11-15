import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  useWindowDimensions,
  ActivityIndicator,
  StyleSheet,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, usePathname, useLocalSearchParams } from "expo-router";
import { StatusBar } from "expo-status-bar";
import {
  C,
  T,
  Icon,
  Button,
  Resource,
  ErrorNote,
  Card,
} from "./src/components/ui";
import { MindGardenMark } from "./src/components/art";
import { useApp } from "./src/lib/state";
import { Home, Play, Discover } from "./src/screens/Dashboard";
import { Onboarding } from "./src/screens/Onboarding";
import { Garden } from "./src/screens/Garden";
import { ProfileScreen } from "./src/screens/Profile";
import { Settings } from "./src/screens/Settings";
import { Practice, Feedback } from "./src/screens/Practice";
import Friends from "./src/screens/Friends";
import { ReadAloud } from "./src/screens/DailyWorkout";
import { Mode, Page, Article, Attempt } from "./src/types";
import { api } from "./src/lib/api";
const nav: [Page, string, string][] = [
  ["home", "Home", "home"],
  ["play", "Play", "grid"],
  ["discover", "Discover", "compass"],
  ["garden", "Garden", "feather"],
  ["profile", "Profile", "user"],
];
export default function App() {
  const pageScroll = useRef<ScrollView>(null);
  const showResultFromTop = useCallback(() => {
    pageScroll.current?.scrollTo({ y: 0, animated: false });
  }, []);
  const [gardenInteracting, setGardenInteracting] = useState(false);
  const { state, articles, loading, error, refresh, logout, bootstrap } =
    useApp();
  const { width } = useWindowDimensions();
  const desktop = width >= 960;
  const pathname = usePathname();
  const params = useLocalSearchParams<{
    mode?: string;
    article?: string;
    retry?: string;
    id?: string;
  }>();
  const page = (pathname.split("/")[1] || "home") as
    Page | "practice" | "attempt" | "friends" | "read-aloud";
  const practiceMode: Mode =
    params.mode === "debate" || params.mode === "read_reflect"
      ? params.mode
      : "spin_speak";
  const navigate = (p: Page) =>
    router.push(p === "home" ? "/" : (`/${p}` as any));
  function start(mode: Mode, article?: Article, retry?: Attempt) {
    router.push({
      pathname: "/practice",
      params: {
        mode,
        ...(article ? { article: article.id } : {}),
        ...(retry ? { retry: retry.id } : {}),
      },
    } as any);
  }
  if (loading)
    return (
      <View style={s.center}>
        <MindGardenMark size={60} />
        <Text style={T.h2}>Loading…</Text>
        <ActivityIndicator color={C.forest} />
      </View>
    );
  if (error)
    return (
      <View style={s.center}>
        <MindGardenMark size={60} />
        <Text style={T.h2}>Can’t connect</Text>
        <ErrorNote message={error} />
        <Button label="Try again" onPress={() => void bootstrap()} />
      </View>
    );
  if (!state?.profile.onboardingComplete)
    return (
      <Onboarding
        state={state}
        onDone={async () => {
          await refresh();
          router.replace("/");
        }}
      />
    );
  const immersive = page === "practice" || page === "attempt" || page === "read-aloud";
  const dailySpeaking = page === "practice" && practiceMode === "spin_speak" && Boolean(state?.profile.dailyWorkout);
  const common = {
    state,
    articles,
    navigate,
    start,
    openAttempt: (attempt: Attempt) =>
      router.push({ pathname: "/attempt", params: { id: attempt.id } } as any),
    openFriends: () => router.push("/friends" as any),
  };
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.cream }}>
      <StatusBar style="dark" />
      <View style={{ flex: 1, flexDirection: "row" }}>
        {desktop && !immersive && (
          <View style={s.sidebar}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="MindGarden home"
              onPress={() => navigate("home")}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 9,
                paddingHorizontal: 12,
                marginTop: 15,
                marginBottom: 40,
              }}
            >
              <MindGardenMark size={36} />
              <View>
                <Text style={[T.h2, { fontSize: 22, lineHeight: 26 }]}>
                  MindGarden
                </Text>
              </View>
            </Pressable>
            {nav.map(([id, label, icon]) => (
              <NavItem
                key={id}
                label={label}
                icon={icon}
                active={page === id || (id === "play" && page === "friends")}
                onPress={() => navigate(id)}
              />
            ))}
            <View style={{ flex: 1 }} />
            <NavItem
              label="Settings"
              icon="settings"
              active={page === "settings"}
              onPress={() => navigate("settings")}
            />
            <View
              style={{
                borderTopWidth: 1,
                borderColor: C.border,
                paddingTop: 20,
                marginTop: 12,
                marginHorizontal: 12,
                paddingBottom: 10,
                flexDirection: "row",
                alignItems: "center",
                gap: 10,
              }}
            >
              <View style={s.avatar}>
                <Text
                  style={{ fontFamily: "Lora", fontSize: 20, color: C.forest }}
                >
                  {state.profile.displayName.charAt(0).toUpperCase()}
                </Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text numberOfLines={1} style={[T.h3, { fontSize: 12 }]}>
                  {state.profile.displayName}
                </Text>
                {state.profile.isGuest && (
                  <Text style={[T.small, { fontSize: 10 }]}>Guest</Text>
                )}
              </View>
            </View>
          </View>
        )}
        <View style={{ flex: 1, minWidth: 0 }}>
          {!immersive && !(desktop && page === "garden") && (
            <View style={[s.topbar, { paddingHorizontal: desktop ? 36 : 18 }]}>
              {desktop ? (
                <View />
              ) : (
                <View
                  style={{ flexDirection: "row", gap: 7, alignItems: "center" }}
                >
                  <MindGardenMark size={28} />
                  <Text style={[T.h2, { fontSize: 18 }]}>MindGarden</Text>
                </View>
              )}
              {page !== "garden" && (
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: width < 450 ? 4 : 9,
                  }}
                >
                  <Resource
                    icon="feather"
                    value={state.wallet.seeds}
                    label={width < 450 ? "" : "seeds"}
                  />
                  <Resource
                    icon="droplet"
                    value={state.wallet.water}
                    label={width < 450 ? "" : "water"}
                    color="#E8F0EE"
                  />
                  {width > 550 && (
                    <Resource
                      icon="sun"
                      value={state.wallet.sunlight}
                      label="sunlight"
                      color="#F6EFD9"
                    />
                  )}
                </View>
              )}
            </View>
          )}
          <ScrollView
            ref={pageScroll}
            scrollEnabled={!gardenInteracting}
            key={pathname + JSON.stringify(params)}
            style={{ flex: 1, ...(dailySpeaking ? { backgroundColor: C.cream } : {}) }}
            contentContainerStyle={{
              padding: dailySpeaking ? 0 : desktop ? 34 : 20,
              paddingTop: dailySpeaking ? 0 : immersive ? 22 : desktop ? 32 : 23,
              paddingBottom: dailySpeaking ? 0 : 40,
              ...(dailySpeaking ? { backgroundColor: C.cream, flexGrow: 1 } : {}),
              alignItems: "center",
            }}
            keyboardShouldPersistTaps="handled"
          >
            <View style={{ width: "100%", maxWidth: immersive ? 1050 : 1280, ...(dailySpeaking ? { flexGrow: 1 } : {}) }}>
              {page === "read-aloud" ? (
                <ReadAloud key={state.profile.id} />
              ) : page === "home" ? (
                <Home {...common} />
              ) : page === "play" ? (
                <Play {...common} />
              ) : page === "discover" ? (
                <Discover {...common} />
              ) : page === "friends" ? (
                <Friends
                  userId={state.profile.id}
                  onClose={() => navigate("play")}
                />
              ) : page === "garden" ? (
                <Garden
                  state={state}
                  refresh={refresh}
                  startPractice={() => navigate("play")}
                  onInteractionChange={setGardenInteracting}
                />
              ) : page === "profile" ? (
                <ProfileScreen
                  state={state}
                  openAttempt={(a) =>
                    router.push({
                      pathname: "/attempt",
                      params: { id: a.id },
                    } as any)
                  }
                  openSettings={() => navigate("settings")}
                  start={start}
                />
              ) : page === "settings" ? (
                <Settings
                  state={state}
                  refresh={refresh}
                  onLogout={() => {
                    logout();
                    router.replace("/");
                  }}
                />
              ) : page === "practice" ? (
                <Practice
                  key={JSON.stringify(params)}
                  mode={practiceMode}
                  article={articles.find((a) => a.id === params.article)}
                  retryAttempt={state.attempts.find(
                    (a) => a.id === params.retry,
                  )}
                  onClose={() => {
                    void refresh();
                    navigate("home");
                  }}
                  onComplete={() => {
                    void refresh();
                  }}
                  onResultShown={showResultFromTop}
                  onGarden={() => {
                    void refresh();
                    navigate("garden");
                  }}
                />
              ) : page === "attempt" ? (
                <AttemptDetail
                  id={params.id || ""}
                  onClose={() => navigate("profile")}
                  onRetry={(a) =>
                    start(
                      a.mode,
                      articles.find((x) => x.id === a.articleId),
                      a,
                    )
                  }
                  refresh={refresh}
                  onGarden={() => navigate("garden")}
                />
              ) : (
                <Home {...common} />
              )}
            </View>
          </ScrollView>
          {!desktop && !immersive && (
            <View style={s.bottomNav}>
              {nav.map(([id, label, icon]) => (
                <Pressable
                  key={id}
                  accessibilityRole="button"
                  accessibilityLabel={`Navigate to ${label}`}
                  accessibilityState={{
                    selected:
                      page === id || (id === "play" && page === "friends"),
                  }}
                  onPress={() => navigate(id)}
                  style={{
                    flex: 1,
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 5,
                    minHeight: 62,
                  }}
                >
                  <Icon
                    name={icon}
                    size={20}
                    color={
                      page === id || (id === "play" && page === "friends")
                        ? C.forest
                        : "#9A9F94"
                    }
                  />
                  <Text
                    style={{
                      fontFamily:
                        page === id || (id === "play" && page === "friends")
                          ? "DMBold"
                          : "DM",
                      fontSize: 10,
                      color:
                        page === id || (id === "play" && page === "friends")
                          ? C.forest
                          : "#848D7D",
                    }}
                  >
                    {label}
                  </Text>
                </Pressable>
              ))}
            </View>
          )}
        </View>
      </View>
    </SafeAreaView>
  );
}
function NavItem({
  label,
  icon,
  active,
  onPress,
}: {
  label: string;
  icon: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Navigate to ${label}`}
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={({ hovered }: any) => ({
        flexDirection: "row",
        alignItems: "center",
        gap: 14,
        paddingHorizontal: 18,
        paddingVertical: 15,
        borderRadius: 11,
        marginVertical: 3,
        backgroundColor: active
          ? "#E8EDDC"
          : hovered
            ? "#F0F2E8"
            : "transparent",
      })}
    >
      <Icon name={icon} size={19} color={active ? C.forest : "#87917E"} />
      <Text
        style={{
          fontFamily: active ? "DMBold" : "DMMedium",
          fontSize: 14,
          color: active ? C.forest : "#77816F",
        }}
      >
        {label}
      </Text>
      {active && (
        <View
          style={{
            width: 5,
            height: 5,
            borderRadius: 3,
            backgroundColor: "#8CA775",
            marginLeft: "auto",
          }}
        />
      )}
    </Pressable>
  );
}
function AttemptDetail({
  id,
  onClose,
  onRetry,
  refresh,
  onGarden,
}: {
  id: string;
  onClose: () => void;
  onRetry: (a: Attempt) => void;
  refresh: () => Promise<void>;
  onGarden: () => void;
}) {
  const [attempt, setAttempt] = useState<Attempt | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let live = true;
    async function load() {
      try {
        const a = await api<Attempt>(`/attempts/${id}`);
        if (live) setAttempt(a);
      } catch (e: any) {
        if (live) setError(e.message);
      }
    }
    void load();
    const t = setInterval(load, 1800);
    return () => {
      live = false;
      clearInterval(t);
    };
  }, [id]);
  if (attempt && (attempt.evaluation || attempt.status === "draft"))
    return (
      <Feedback
        attempt={attempt}
        onClose={onClose}
        onRetry={onRetry}
        onRefresh={() => void refresh()}
        onGarden={onGarden}
      />
    );
  return (
    <View style={{ gap: 20 }}>
      <Button label="Back to profile" variant="ghost" onPress={onClose} />
      <Text style={T.title}>
        {attempt?.status === "failed"
          ? "Response saved"
          : "Preparing feedback…"}
      </Text>
      <ErrorNote message={error} />
      {attempt && (
        <Card style={{ gap: 15 }}>
          <Text style={T.h3}>{attempt.prompt}</Text>
          <Text style={T.body}>{attempt.text}</Text>
          {attempt.status === "failed" ? (
            <Button
              label="Retry evaluation"
              loading={busy}
              onPress={async () => {
                setBusy(true);
                try {
                  await api(`/attempts/${id}/evaluate`, {
                    method: "POST",
                    body: {},
                  });
                  setAttempt(await api(`/attempts/${id}`));
                } catch (e: any) {
                  setError(e.message);
                } finally {
                  setBusy(false);
                }
              }}
            />
          ) : (
            <>
              <ActivityIndicator color={C.forest} />
              <Text style={T.small}>
                Evaluation {attempt.status}. You can return home and open this
                saved response later.
              </Text>
            </>
          )}
        </Card>
      )}
    </View>
  );
}
const s = StyleSheet.create({
  center: {
    flex: 1,
    backgroundColor: C.cream,
    alignItems: "center",
    justifyContent: "center",
    padding: 30,
    gap: 25,
  },
  sidebar: {
    width: 226,
    backgroundColor: "#F4F5ED",
    padding: 16,
    borderRightWidth: 1,
    borderColor: C.border,
  },
  topbar: {
    height: 77,
    borderBottomWidth: 1,
    borderColor: C.border,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  avatar: {
    height: 37,
    width: 37,
    borderRadius: 25,
    backgroundColor: "#DEE5CE",
    alignItems: "center",
    justifyContent: "center",
  },
  bottomNav: {
    flexDirection: "row",
    backgroundColor: "#FDFCF8",
    borderTopWidth: 1,
    borderColor: C.border,
  },
});
