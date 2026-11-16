import React, { useState } from "react";
import { View, Text, Pressable, ScrollView, useWindowDimensions, StyleSheet } from "react-native";
import { C, T, Card, Button, Icon } from "../components/ui";
import { AppState, Article, Attempt, Mode, Page } from "../types";
import { NewsFeed } from "../components/NewsFeed";
import { DailyHome, DailyPlanIntro } from "./DailyWorkout";
import { HomeAvatarCard } from "../role3/HomeAvatarCard";
import { PixelScene } from "../role3/PixelStreetBackdrop";
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
  const companion = <HomeAvatarCard onOpenProgress={() => navigate("progress")} />;
  return state.dailyWorkout ? <DailyHome state={state} start={start} companion={companion} />
    : <DailyPlanIntro onStart={() => start("spin_speak")} companion={companion} />;
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
  const sceneHeight = Math.min(230, Math.max(178, sceneWidth / 2));
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
          <View style={{ height: sceneHeight, backgroundColor: C.sage, overflow: "hidden" }} onLayout={event => setSceneWidth(event.nativeEvent.layout.width)}><PixelScene scene="library" width={sceneWidth} height={sceneHeight} absolute /></View>
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
