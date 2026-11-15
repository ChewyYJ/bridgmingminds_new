import React, { useState } from "react";
import {
  View,
  Text,
  Pressable,
  useWindowDimensions,
  StyleSheet,
} from "react-native";
import { C, T, Card, Button, Icon } from "../components/ui";
import { AppState, Article, Attempt, Mode, Page } from "../types";
import { NewsFeed } from "../components/NewsFeed";
import { DailyHome, DailyPlanIntro } from "./DailyWorkout";
export const modeNames = {
  spin_speak: "Spin & Speak",
  debate: "Debate Garden",
  read_reflect: "Read & Reflect",
};
const activities: [Mode, string, string, string][] = [
  ["spin_speak", "Speak or write · 5 min", "mic", C.sage],
  ["debate", "Explore both sides · 7 min", "message-circle", C.lilac],
  ["read_reflect", "Read and respond · 5 min", "book-open", C.peach],
];
type Props = {
  state: AppState;
  articles: Article[];
  navigate: (page: Page) => void;
  start: (mode: Mode, article?: Article, retry?: Attempt) => void;
  openAttempt: (attempt: Attempt) => void;
  openFriends: () => void;
};
export function Home({ state, start }: Props) {
  return state.dailyWorkout ? (
    <DailyHome state={state} start={start} />
  ) : (
    <DailyPlanIntro onStart={() => start("spin_speak")} />
  );
}
export function Play({ start, navigate, openFriends }: Props) {
  const { width } = useWindowDimensions();
  return (
    <View style={{ gap: 22 }}>
      <Text accessibilityRole="header" style={T.title}>
        Practice
      </Text>
      <View style={{ flexDirection: width > 750 ? "row" : "column", gap: 16 }}>
        {activities.slice(0, 2).map(([mode, description, icon, color]) => (
          <Card
            key={mode}
            style={{ flex: 1, backgroundColor: color, padding: 24, gap: 16 }}
          >
            <Icon name={icon} size={28} />
            <Text style={T.h2}>{modeNames[mode]}</Text>
            <Text style={T.small}>{description}</Text>
            <Button
              label={mode === "spin_speak" ? "Let’s spin" : "Start a debate"}
              icon="arrow-right"
              onPress={() => start(mode)}
            />
          </Card>
        ))}
      </View>
      <FriendInvitation onPress={openFriends} />
      <Button
        label="Read something first"
        variant="ghost"
        icon="book-open"
        onPress={() => navigate("discover")}
      />
    </View>
  );
}
function FriendInvitation({ onPress }: { onPress: () => void }) {
  return (
    <Card style={{ backgroundColor: "#F1EDF5", padding: 20, gap: 12 }}>
      <Button
        label="Debate with friends"
        variant="ghost"
        icon="users"
        onPress={onPress}
      />
      <Text style={T.small}>Private room · Voice or text · 2–3 rounds</Text>
    </Card>
  );
}
export function ArticleRow({
  article,
  index = 0,
  onPress,
}: {
  article: Article;
  index?: number;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={article.title}
      onPress={onPress}
      style={({ hovered }: any) => [
        s.article,
        hovered && { backgroundColor: "#F4F5ED" },
      ]}
    >
      <View
        style={{
          width: 52,
          height: 52,
          borderRadius: 14,
          backgroundColor: [C.sage, C.peach, C.lilac][index % 3],
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Icon
          name={
            article.category === "Science"
              ? "sun"
              : article.category === "Technology"
                ? "cpu"
                : article.category === "Environment"
                  ? "feather"
                  : "globe"
          }
          size={25}
          color="#798966"
        />
      </View>
      <View style={{ flex: 1, gap: 5 }}>
        <Text style={[T.label, { fontSize: 9, letterSpacing: 1.3 }]}>
          {article.category} · {article.readMinutes} MIN READ
        </Text>
        <Text style={[T.h3, { fontSize: 15, lineHeight: 21 }]}>
          {article.title}
        </Text>
        <Text style={[T.small, { fontSize: 11 }]}>
          {article.source} ·{" "}
          {new Date(article.publishedAt).toLocaleDateString("en", {
            month: "short",
            day: "numeric",
            year: "numeric",
          })}
        </Text>
      </View>
      <Icon name="arrow-up-right" size={18} />
    </Pressable>
  );
}
export function Discover({ articles, start }: Props) {
  const [filter, setFilter] = useState("All");
  const list =
    filter === "All" ? articles : articles.filter((a) => a.category === filter);
  return (
    <View style={{ gap: 24 }}>
      <Text accessibilityRole="header" style={T.title}>
        Discover
      </Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {[
          "All",
          "Today's news",
          ...Array.from(new Set(articles.map((a) => a.category))),
        ].map((c) => (
          <Button
            key={c}
            label={c}
            icon={c === "Today's news" ? "radio" : undefined}
            variant={c === filter ? "primary" : "secondary"}
            onPress={() => setFilter(c)}
          />
        ))}
      </View>
      {filter === "Today's news" ? (
        <NewsFeed />
      ) : (
        <>
          <Text style={T.small}>Curated reading · Summaries for practice</Text>
          <View style={{ gap: 14 }}>
            {list.map((article, i) => (
              <ArticleRow
                key={article.id}
                article={article}
                index={i}
                onPress={() => start("read_reflect", article)}
              />
            ))}
          </View>
        </>
      )}
    </View>
  );
}
const s = StyleSheet.create({
  hero: {
    backgroundColor: "#EAF0DD",
    borderRadius: 22,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#DFE6D0",
  },
  sectionHead: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 8,
    alignItems: "center",
    flexWrap: "wrap",
  },
  activity: {
    padding: 20,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 17,
  },
  article: {
    flexDirection: "row",
    alignItems: "center",
    gap: 18,
    padding: 17,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 16,
    backgroundColor: C.paper,
  },
});
