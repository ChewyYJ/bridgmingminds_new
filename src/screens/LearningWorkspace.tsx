import { Home, Play, Discover } from "./Dashboard";
import { ProfileScreen } from "./Profile";
import { Settings } from "./Settings";
import { Practice } from "./Practice";
import { ReadAloud } from "./DailyWorkout";
import { VocabularyReviewScreen } from "./VocabularyReview";
import { AttemptDetail } from "./AttemptDetail";
import Friends from "./Friends";
import { FoodCareScreen } from "../role3/FoodCareScreen";
import { AchievementsScreen } from "../role3/AchievementsScreen";
import { AvatarWardrobeScreen } from "../role3/AvatarWardrobeScreen";
import { DebateScreen } from "../role3/DebateScreen";
import { pageAliases, pageTitles } from "../navigation/routeInfo";

import { useTheme } from "../theme/ThemeProvider";
import React, { useState, useRef, useCallback } from "react";
import { View, Text, ScrollView, useWindowDimensions } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, usePathname, useLocalSearchParams } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useApp } from "../lib/state";

import { AppHeader, NavigationRail, TabBar } from "../components/AppNavigation";
import { ScreenLoading } from "../components/ScreenStates";
import Head from "expo-router/head";
import { Mode, Page, Article, Attempt } from "../types";

// Keep saved links working while the five main tabs use their new destinations.

export default function LearningWorkspace() {
  const { C, dark } = useTheme();

  const [debateFocused, setDebateFocused] = useState(false);
  const pageScroll = useRef<ScrollView>(null);
  const showResultFromTop = useCallback(() => {
    pageScroll.current?.scrollTo({ y: 0, animated: false });
  }, []);
  const { state, articles, refresh, logout } = useApp();
  const { width } = useWindowDimensions();
  const desktop = width >= 960;
  const pathname = usePathname();
  const params = useLocalSearchParams<{
    mode?: string;
    article?: string;
    retry?: string;
    id?: string;
  }>();
  const route = pathname.split("/")[1] || "home";
  const page = (pageAliases[route] || route) as
    | Page
    | "practice"
    | "attempt"
    | "friends"
    | "read-aloud"
    | "vocabulary-review"
    | "avatar";
  const activeTab =
    page === "tournament"
      ? "debate"
      : ["progress", "settings", "food", "achievements"].includes(page)
        ? "profile"
        : page === "friends"
          ? "debate"
          : page;
  const practiceMode: Mode =
    params.mode === "debate" || params.mode === "read_reflect"
      ? params.mode
      : "spin_speak";
  const navigate = (p: Page) =>
    router.push(p === "home" ? "/" : (`/${p}` as any));
  function start(mode: Mode, article?: Article, retry?: Attempt) {
    if (mode === "debate" && !retry) {
      router.push("/debate" as any);
      return;
    }
    router.push({
      pathname: "/practice",
      params: {
        mode,
        ...(article ? { article: article.id } : {}),
        ...(retry ? { retry: retry.id } : {}),
      },
    } as any);
  }
  const pageTitle = pageTitles[page] || "Page not found";
  if (!state) return <ScreenLoading />;
  const immersive =
    page === "practice" ||
    page === "attempt" ||
    page === "read-aloud" ||
    page === "vocabulary-review" ||
    (debateFocused && (page === "debate" || page === "tournament"));
  const dailySpeaking =
    page === "practice" &&
    practiceMode === "spin_speak" &&
    Boolean(state?.profile.dailyWorkout);
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
      <Head>
        <title>{pageTitle} · BridgingMinds</title>
      </Head>
      <StatusBar style={dark ? "light" : "dark"} />
      <View style={{ flex: 1, flexDirection: "row" }}>
        {desktop && !immersive && (
          <NavigationRail
            active={page === "settings" ? "settings" : activeTab}
            navigate={navigate}
            name={state.profile.displayName}
            guest={state.profile.isGuest}
          />
        )}
        <View style={{ flex: 1, minWidth: 0 }}>
          {!immersive && (
            <AppHeader
              desktop={desktop}
              coins={state.wallet.coins || 0}
              title={pageTitle}
            />
          )}
          <ScrollView
            role="main"
            accessibilityLabel={pageTitle}
            ref={pageScroll}
            key={pathname + JSON.stringify(params)}
            style={{
              flex: 1,
              ...(dailySpeaking ? { backgroundColor: C.cream } : {}),
            }}
            contentContainerStyle={{
              padding: dailySpeaking ? 0 : desktop ? 34 : 20,
              paddingTop: dailySpeaking
                ? 0
                : immersive
                  ? 22
                  : desktop
                    ? 32
                    : 23,
              paddingBottom: dailySpeaking ? 0 : 40,
              ...(dailySpeaking
                ? { backgroundColor: C.cream, flexGrow: 1 }
                : {}),
              alignItems: "center",
            }}
            keyboardShouldPersistTaps="handled"
          >
            <View
              style={{
                width: "100%",
                maxWidth: page === "read-aloud" ? 1050 : 1080,
                ...(dailySpeaking ? { flexGrow: 1 } : {}),
              }}
            >
              <Text
                role="heading"
                aria-level={1}
                style={{
                  position: "absolute",
                  width: 1,
                  height: 1,
                  overflow: "hidden",
                  opacity: 0,
                }}
              >
                {pageTitle}
              </Text>

              {page === "read-aloud" ? (
                <ReadAloud key={state.profile.id} />
              ) : page === "vocabulary-review" ? (
                <VocabularyReviewScreen key={state.profile.id} />
              ) : page === "home" ? (
                <Home {...common} />
              ) : page === "play" ? (
                <Play {...common} />
              ) : page === "discover" ? (
                <Discover {...common} />
              ) : page === "profile" ? (
                <AvatarWardrobeScreen
                  key={state.profile.id}
                  onBack={() => navigate("home")}
                  onOpenProgress={() => navigate("progress")}
                  onOpenSettings={() => navigate("settings")}
                  onOpenFood={() => navigate("food")}
                />
              ) : page === "food" ? (
                <FoodCareScreen
                  key={state.profile.id}
                  onBack={() => navigate("profile")}
                />
              ) : page === "achievements" ? (
                <AchievementsScreen onBack={() => navigate("home")} />
              ) : page === "debate" || page === "tournament" ? (
                <DebateScreen
                  key={`${state.profile.id}-${page}`}
                  initialTab={page === "tournament" ? "lobby" : "street"}
                  onBack={() => navigate("home")}
                  onScrollTop={showResultFromTop}
                  onFocusChange={setDebateFocused}
                  onOpenFriends={common.openFriends}
                />
              ) : page === "friends" ? (
                <Friends
                  userId={state.profile.id}
                  onClose={() => navigate("debate")}
                />
              ) : page === "progress" ? (
                <ProfileScreen
                  state={state}
                  openAttempt={(a) =>
                    router.push({
                      pathname: "/attempt",
                      params: { id: a.id },
                    } as any)
                  }
                  openSettings={() => navigate("settings")}
                  openAvatar={() => navigate("profile")}
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
                    navigate("profile");
                  }}
                />
              ) : page === "attempt" ? (
                <AttemptDetail
                  id={params.id || ""}
                  onClose={() => navigate("progress")}
                  onRetry={(a) =>
                    start(
                      a.mode,
                      articles.find((x) => x.id === a.articleId),
                      a,
                    )
                  }
                  refresh={refresh}
                  onGarden={() => navigate("profile")}
                />
              ) : (
                <Home {...common} />
              )}
            </View>
          </ScrollView>
          {!desktop && !immersive && (
            <TabBar active={activeTab} navigate={navigate} />
          )}
        </View>
      </View>
    </SafeAreaView>
  );
}
