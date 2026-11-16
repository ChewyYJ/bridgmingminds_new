import React, { useRef, useState } from "react";
import { View, Text, Pressable, ScrollView, useWindowDimensions, StyleSheet } from "react-native";
import { router } from "expo-router";
import { C, T, Card, Button, Icon, ErrorNote } from "../components/ui";
import { AppState, Article, Attempt, Mode, Page } from "../types";
import { NewsFeed } from "../components/NewsFeed";
import { DailyHome, DailyPlanIntro } from "./DailyWorkout";
import { HomeAvatarCard } from "../role3/HomeAvatarCard";
import { PixelScene } from "../role3/PixelStreetBackdrop";
import { LayeredAvatar } from "../avatar/LayeredAvatar";
import { normalizeSelection } from "../avatar/pack";
import { useApp } from "../lib/state";
import { api, isDraftOwner } from "../lib/api";

export const modeNames = {
  spin_speak: "Spin & Speak",
  debate: "AI Debate",
  read_reflect: "Read & respond",
};

type Props = {
  state: AppState;
  articles: Article[];
  navigate: (page: Page) => void;
  start: (mode: Mode, article?: Article, retry?: Attempt) => void;
  openAttempt: (attempt: Attempt) => void;
  openFriends: () => void;
};

export function Home({ state, start, navigate }: Props) {
  const companion = <HomeAvatarCard onOpenAvatar={() => navigate("profile")}
    onOpenFood={() => navigate("food")} onOpenAchievements={() => navigate("achievements")} />;
  return state.dailyWorkout ? <DailyHome state={state} start={start} companion={companion} />
    : <DailyPlanIntro onStart={() => start("spin_speak")} companion={companion} />;
}

export function Play({ state, start, navigate }: Props) {
  const { refresh } = useApp();
  const { width } = useWindowDimensions();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [sceneWidth, setSceneWidth] = useState(340);
  const locked = useRef(false);
  const owner = state.profile.id;
  const readDone = state.dailyWorkout?.activities.find(item => item.type === "read_aloud")?.completed;
  const spinDone = state.dailyWorkout?.activities.find(item => item.type === "spin_speak")?.completed;
  const recommended = spinDone && !readDone ? "read_aloud" : "spin_speak";
  async function begin(skill: "spin_speak" | "read_aloud" | "words") {
    if (locked.current) return;
    if (skill === "words") {
      if (state.profile.dailyWorkout && state.profile.wordBloomEnabled !== false) router.push("/vocabulary-review");
      else navigate("progress");
      return;
    }
    locked.current = true; setBusy(skill); setError("");
    try {
      if (!state.profile.dailyWorkout) {
        await api("/daily-workout/enroll", { method: "POST", body: {} });
        if (!isDraftOwner(owner)) return;
        await refresh();
      }
      if (!isDraftOwner(owner)) return;
      if (skill === "read_aloud") router.push("/read-aloud");
      else start("spin_speak");
    } catch (cause) {
      if (isDraftOwner(owner)) setError(cause instanceof Error ? cause.message : "Please try again.");
    } finally {
      locked.current = false;
      if (isDraftOwner(owner)) setBusy(null);
    }
  }
  const skills = [
    { id: "spin_speak" as const, title: "Spin & Speak", description: "Build a clear point of view.", duration: "About 4 min", icon: "mic" },
    { id: "read_aloud" as const, title: "Read aloud", description: "Practise pace and clarity.", duration: "About 3 min", icon: "volume-2" },
    { id: "words" as const, title: "Word review", description: "Use the words you’ve saved.", duration: "About 2 min", icon: "type" },
  ];
  const featured = skills.find(item => item.id === recommended)!;
  return <View style={s.page} testID="play-skills">
    <View style={{ gap: 6 }}><Text accessibilityRole="header" style={T.title}>What would you like to practise?</Text><Text style={T.body}>A small step, at your pace.</Text></View>
    <View style={{ flexDirection: width >= 1100 ? "row" : "column", gap: 18 }}>
      <Card style={{ flex: width >= 1100 ? 1.2 : undefined, padding: 18, gap: 14, overflow: "hidden", backgroundColor: "#F0E7DD" }}>
        <View style={{ minHeight: 180, justifyContent: "center", gap: 12, overflow: "hidden" }} onLayout={event => setSceneWidth(event.nativeEvent.layout.width)}>
          <View pointerEvents="none" accessible={false} style={{ position: "absolute", inset: 0, opacity: 0.18 }}><PixelScene scene="room" width={sceneWidth} height={190} absolute /></View>
          <View style={{ alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: C.paper, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 5 }}><Icon name="star" size={15} color="#8C683E" /><Text style={[T.small, { color: C.ink }]}>{spinDone && readDone ? "Keep practising" : "Recommended next"}</Text></View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <View style={{ flex: 1, minWidth: 0, gap: 6 }}>
              <Icon name={featured.icon} size={27} />
              <Text style={T.h2}>{featured.title}</Text>
              <Text style={T.body}>{featured.description}</Text>
              <Text style={T.small}>{featured.duration}</Text>
            </View>
            {!!state.gamification && <View pointerEvents="none" accessible={false} style={{ width: width < 360 ? 92 : 124, alignItems: "center" }}>
              <LayeredAvatar selection={normalizeSelection(state.gamification.avatar.selection)} variant="chibi" animation={recommended === "spin_speak" ? "speak" : "idle"} scale={width < 360 ? 0.4 : 0.49} accessibilityLabel="Your learning companion" />
            </View>}
          </View>
        </View>
        <Button label="Start practice" icon="arrow-right" loading={busy === recommended} disabled={Boolean(busy)} onPress={() => void begin(featured.id)} />
      </Card>
      <View style={{ flex: width >= 1100 ? 1 : undefined, gap: 14 }}>
        {skills.filter(item => item.id !== recommended).map(item => <Pressable key={item.id} accessibilityRole="button" accessibilityLabel={item.title} accessibilityState={{ disabled: Boolean(busy) }} disabled={Boolean(busy)} onPress={() => void begin(item.id)}
          style={({ pressed }) => [s.skillRow, { opacity: pressed || busy ? 0.7 : 1 }]}>
          <View style={s.iconTile}><Icon name={item.icon} size={23} /></View>
          <View style={{ flex: 1, minWidth: 0, gap: 3 }}><Text style={T.h3}>{item.title}</Text><Text style={T.body}>{item.description}</Text><Text style={T.small}>{item.duration}</Text></View>
          <Icon name="chevron-right" size={19} />
        </Pressable>)}
        <Button label="Explore a topic in Discover" icon="compass" variant="ghost" onPress={() => navigate("discover")} />
      </View>
    </View>
    <ErrorNote message={error} />
  </View>;
}

export function ArticleRow({ article, index = 0, onPress }: { article: Article; index?: number; onPress: () => void }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={article.title} onPress={onPress} style={({ pressed }) => [s.article, { opacity: pressed ? 0.7 : 1 }]}>
    <View style={[s.iconTile, { backgroundColor: index % 2 ? C.peach : C.sage }]}><Icon name={article.category === "Science" ? "sun" : article.category === "Technology" ? "cpu" : article.category === "Environment" ? "feather" : "book-open"} size={25} /></View>
    <View style={{ flex: 1, minWidth: 0, gap: 5 }}>
      <Text style={T.small}>{article.category} · {article.readMinutes} min read</Text>
      <Text style={T.h3}>{article.title}</Text>
      <Text style={T.small}>{article.source} · {new Date(article.publishedAt).toLocaleDateString("en", { month: "short", day: "numeric", year: "numeric" })}</Text>
    </View>
    <Icon name="chevron-right" size={18} />
  </Pressable>;
}

export function Discover({ articles, start, navigate }: Props) {
  const [section, setSection] = useState<"reads" | "news">("reads");
  const [filter, setFilter] = useState("All");
  const [sceneWidth, setSceneWidth] = useState(340);
  const { width } = useWindowDimensions();
  const list = filter === "All" ? articles : articles.filter(article => article.category === filter);
  const featured = list[0];
  return <View style={s.page} testID="discover-topics">
    <Text accessibilityRole="header" style={T.title}>Something to think about.</Text>
    <View style={s.segment}>
      {([{ id: "reads", label: "Practice reads" }, { id: "news", label: "Today’s news" }] as const).map(item => <Pressable key={item.id} accessibilityRole="tab" accessibilityState={{ selected: section === item.id }} aria-selected={section === item.id} accessibilityLabel={item.label} onPress={() => setSection(item.id)} style={[s.segmentItem, { backgroundColor: section === item.id ? C.forest : "transparent" }]}><Text style={[T.body, { fontFamily: "DMBold", color: section === item.id ? C.paper : C.ink }]}>{item.label}</Text></Pressable>)}
    </View>
    {section === "news" ? <><Text style={T.small}>Headlines from publishers. Open a source to read the full story.</Text><NewsFeed /></> : <>
      <ScrollView horizontal showsHorizontalScrollIndicator accessibilityLabel="Reading categories" accessibilityHint="Scroll horizontally for more categories." style={{ flexGrow: 0 }} contentContainerStyle={{ gap: 8, paddingBottom: 6 }}>
        {["All", ...Array.from(new Set(articles.map(article => article.category)))].map(category => <Button key={category} label={category} selected={filter === category} variant={filter === category ? "secondary" : "ghost"} style={{ minHeight: 44, paddingVertical: 10, paddingHorizontal: 16 }} onPress={() => setFilter(category)} />)}
      </ScrollView>
      <Text style={T.small}>Curated summaries for practice · read, then share your view.</Text>
      <View style={{ flexDirection: width >= 1100 ? "row" : "column", alignItems: "flex-start", gap: 18 }}>
        {featured ? <Card style={{ width: width >= 1100 ? "53%" : "100%", padding: 0, overflow: "hidden" }}>
          <View style={{ height: 166, backgroundColor: C.sage, overflow: "hidden" }} onLayout={event => setSceneWidth(event.nativeEvent.layout.width)}><PixelScene scene="library" width={sceneWidth} height={166} absolute /></View>
          <View style={{ padding: 18, gap: 10 }}>
            <Text style={T.small}>{featured.category} · {featured.readMinutes} min read</Text>
            <Text accessibilityRole="header" style={T.h2}>{featured.title}</Text>
            <Text style={T.small}>{featured.source} · {new Date(featured.publishedAt).toLocaleDateString("en", { month: "short", day: "numeric", year: "numeric" })}</Text>
            <Text style={T.body} numberOfLines={3}>{featured.summary}</Text>
            <Button label="Read & respond" icon="arrow-right" onPress={() => start("read_reflect", featured)} />
          </View>
        </Card> : <Card style={{ width: "100%", gap: 8 }}><Text style={T.h3}>No practice reads in this category yet.</Text><Text style={T.body}>Choose another category or browse today’s news.</Text></Card>}
        {!!list.slice(1).length && <View style={{ flex: width >= 1100 ? 1 : undefined, width: width >= 1100 ? undefined : "100%", gap: 12 }}>{list.slice(1).map((article, index) => <ArticleRow key={article.id} article={article} index={index} onPress={() => start("read_reflect", article)} />)}</View>}
      </View>
    </>}
    <Pressable accessibilityRole="button" accessibilityLabel="My saved words" onPress={() => navigate("progress")} style={({ pressed }) => [s.skillRow, { opacity: pressed ? 0.7 : 1 }]}><Icon name="book-open" size={23} /><View style={{ flex: 1 }}><Text style={T.h3}>My saved words</Text><Text style={T.small}>Revisit your Dictionary in Progress.</Text></View><Icon name="chevron-right" size={18} /></Pressable>
  </View>;
}

const s = StyleSheet.create({
  page: { width: "100%", maxWidth: 1040, alignSelf: "center", gap: 20 },
  skillRow: { minHeight: 88, flexDirection: "row", alignItems: "center", gap: 12, padding: 16, borderWidth: 1, borderColor: C.border, borderRadius: 16, backgroundColor: C.paper },
  iconTile: { width: 44, height: 48, borderRadius: 12, backgroundColor: C.sage, alignItems: "center", justifyContent: "center" },
  article: { flexDirection: "row", alignItems: "center", gap: 12, padding: 16, borderWidth: 1, borderColor: C.border, borderRadius: 16, backgroundColor: C.paper },
  segment: { flexDirection: "row", padding: 4, backgroundColor: "#ECE5DD", borderWidth: 1, borderColor: C.border, borderRadius: 13 },
  segmentItem: { flex: 1, minHeight: 46, paddingHorizontal: 8, paddingVertical: 8, alignItems: "center", justifyContent: "center", borderRadius: 9 },
});
