import React, { useState } from "react";
import {
  View,
  Text,
  Pressable,
  useWindowDimensions,
  StyleSheet,
} from "react-native";
import { C, T, Card, Button, Tag, Icon } from "../components/ui";
import { GardenPreview } from "../components/GardenPreview";
import { AppState, Article, Attempt, Mode, Page, Quest } from "../types";
import { NewsFeed } from "../components/NewsFeed";
import { PracticeWeek } from "../components/PracticeWeek";
import { useGardenClock } from "../hooks/useGardenClock";
import { MotionView } from "../components/Motion";
import { getThoughtGuide } from "../../shared/thought-guide.mjs";
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
export function Home({
  state,
  articles,
  navigate,
  start,
  openFriends,
  openAttempt,
}: Props) {
  const { width } = useWindowDimensions();
  const gardenNow = useGardenClock();
  const wide = width > 1080;
  const first = state.profile.displayName.split(" ")[0] || "friend";
  const recent = [...state.attempts].sort(
    (a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt),
  );
  const completed = recent.filter((a) => a.status === "completed");
  const unfinished = recent.find((a) => a.status !== "completed");
  const latest = completed.find((a) => a.evaluation);
  const todayCounts = state.practiceWeek?.days.includes(state.practiceWeek.day);
  const preferredReadings = articles.filter((article) =>
    state.profile.interests.includes(article.category),
  );
  const ideaPool = [
    ...(preferredReadings.length ? preferredReadings : articles),
  ].sort((a, b) => a.id.localeCompare(b.id));
  const daySeed = [...(state.practiceWeek?.day || "")].reduce(
    (total, character) => total + character.charCodeAt(0),
    0,
  );
  const dailyIdea = ideaPool.length
    ? ideaPool[daySeed % ideaPool.length]
    : undefined;
  const next = unfinished
    ? {
        title:
          unfinished.status === "draft"
            ? "Your saved response"
            : unfinished.status === "failed"
              ? "Feedback paused"
              : "Preparing feedback",
        copy: unfinished.status === "failed" ? "Your response is saved." : "",
        label:
          unfinished.status === "draft"
            ? "Continue response"
            : unfinished.status === "failed"
              ? "Retry feedback"
              : "View feedback",
        action: () => openAttempt(unfinished),
      }
    : todayCounts
      ? {
          title: "Today’s practice is done",
          copy: "",
          label: "Open garden",
          action: () => navigate("garden"),
        }
      : latest
        ? {
            title: "Your next step",
            copy: getThoughtGuide(latest.mode, latest.evaluation)[0].question,
            label: "Try again",
            action: () =>
              start(
                latest.mode,
                articles.find((a) => a.id === latest.articleId),
                latest,
              ),
          }
        : dailyIdea
          ? {
              title: dailyIdea.questions[0],
              copy: `${dailyIdea.title} · ${dailyIdea.readMinutes} min read`,
              label: "Explore this idea",
              action: () => start("read_reflect", dailyIdea),
            }
          : {
              title: "Start with one idea",
              copy: "Speak or write · 5 min",
              label: "Start practice",
              action: () => start("spin_speak"),
            };
  function openQuest(quest: Quest) {
    const mode: Mode =
      quest.id === "deep-roots"
        ? "debate"
        : quest.id === "curious-reader"
          ? "read_reflect"
          : "spin_speak";
    if (quest.completed) {
      const calendar = new Intl.DateTimeFormat("en-CA", {
        timeZone: state.practiceWeek.timezone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      });
      const last = [...completed]
        .sort(
          (a, b) =>
            Date.parse(b.completedAt || b.evaluation?.created_at || "") -
            Date.parse(a.completedAt || a.evaluation?.created_at || ""),
        )
        .find((attempt) => {
          const timestamp = Date.parse(
            attempt.completedAt || attempt.evaluation?.created_at || "",
          );
          return (
            (quest.id === "second-bloom"
              ? !!attempt.retryOf
              : !attempt.retryOf && attempt.mode === mode) &&
            Number.isFinite(timestamp) &&
            calendar.format(new Date(timestamp)) === state.practiceWeek.day
          );
        });
      return last ? openAttempt(last) : navigate("profile");
    }
    if (quest.id === "second-bloom") {
      if (latest)
        return start(
          latest.mode,
          articles.find((a) => a.id === latest.articleId),
          latest,
        );
      return start("spin_speak");
    }
    if (mode === "read_reflect") return navigate("discover");
    start(mode);
  }
  if (state.dailyWorkout) return <DailyHome state={state} start={start} />;
  return (
    <View style={{ gap: 22 }}>
      <Text accessibilityRole="header" style={T.title}>
        Hi, {first}.
      </Text>
      <DailyPlanIntro />
      <PracticeWeek week={state.practiceWeek} />
      <View style={{ flexDirection: wide ? "row" : "column", gap: 22 }}>
        <View style={{ flex: wide ? 2 : undefined, gap: 22 }}>
          <MotionView
            replayKey={next.label}
            style={[s.hero, { padding: 24, gap: 16 }]}
          >
            {!unfinished && !todayCounts && !latest && dailyIdea && (
              <Text style={T.label}>Today’s idea</Text>
            )}
            <Text style={T.h2}>{next.title}</Text>
            {!!next.copy && (
              <Text style={[T.body, { color: C.muted }]}>{next.copy}</Text>
            )}
            <View testID="home-next-action">
              <Button
                label={next.label}
                icon="arrow-right"
                onPress={next.action}
              />
            </View>
          </MotionView>
          <View style={{ gap: 12 }}>
            <Text style={T.h2}>Practice</Text>
            {activities.map(([mode, description, icon, color]) => (
              <Pressable
                key={mode}
                accessibilityRole="button"
                accessibilityLabel={modeNames[mode]}
                onPress={() =>
                  mode === "read_reflect" ? navigate("discover") : start(mode)
                }
                style={({ hovered }: any) => [
                  s.activity,
                  {
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 14,
                    backgroundColor: hovered ? color : C.paper,
                  },
                ]}
              >
                <View
                  style={{
                    width: 42,
                    height: 42,
                    borderRadius: 13,
                    backgroundColor: color,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Icon name={icon} size={20} />
                </View>
                <View style={{ flex: 1, gap: 3 }}>
                  <Text style={T.h3}>{modeNames[mode]}</Text>
                  <Text style={T.small}>{description}</Text>
                </View>
                <Icon name="arrow-right" size={17} />
              </Pressable>
            ))}
          </View>
          <FriendInvitation onPress={openFriends} />
        </View>
        <View style={{ flex: wide ? 1 : undefined, gap: 22 }}>
          <Card style={{ padding: 20, gap: 12, backgroundColor: "#F7F5EA" }}>
            <Text style={T.h3}>Your garden</Text>
            <GardenPreview
              plots={state.plots}
              decorations={state.decorations}
              now={gardenNow}
            />
            <Button
              label="Visit my garden"
              variant="secondary"
              icon="arrow-right"
              onPress={() => navigate("garden")}
            />
          </Card>
          <Card style={{ padding: 20, gap: 16 }}>
            <View style={s.sectionHead}>
              <Text style={T.h3}>Daily quests</Text>
              <Tag>Optional</Tag>
            </View>
            {state.quests.map((q, i) => (
              <Pressable
                key={q.id}
                accessibilityRole="button"
                accessibilityLabel={q.title}
                accessibilityHint={`${q.completed ? "Completed. Revisit your reflection." : q.description} ${q.completed ? "Earned" : "Daily bonus"}: ${q.reward.water} water, ${q.reward.sunlight} sunlight, and ${q.reward.xp} XP.`}
                onPress={() => openQuest(q)}
                style={{
                  flexDirection: "row",
                  gap: 12,
                  alignItems: "center",
                  minHeight: 52,
                }}
              >
                <Icon
                  name={
                    q.completed
                      ? "check-circle"
                      : i === 0
                        ? "mic"
                        : i === 1
                          ? "message-circle"
                          : i === 3
                            ? "refresh-cw"
                            : "book-open"
                  }
                  size={18}
                />
                <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
                  <Text
                    style={[T.body, { fontFamily: "DMMedium", fontSize: 13 }]}
                  >
                    {q.title}
                  </Text>
                  <Text style={[T.small, { fontSize: 11 }]}>
                    {q.completed ? "Completed · review" : q.description}
                  </Text>
                  <Text style={[T.small, { fontSize: 11, color: C.forest }]}>
                    {q.completed ? "Earned" : "Bonus"}: +{q.reward.water} water
                    · +{q.reward.sunlight} sunlight · +{q.reward.xp} XP
                  </Text>
                </View>
                <Icon name="chevron-right" size={16} />
              </Pressable>
            ))}
            <Text style={[T.small, { fontSize: 11 }]}>
              Bonuses once daily, regardless of score.
            </Text>
          </Card>
        </View>
      </View>
    </View>
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
