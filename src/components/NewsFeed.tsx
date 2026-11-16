import { useTheme } from "../theme/ThemeProvider";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  AppState,
  Linking,
  Platform,
  Pressable,
  Text,
  View,
} from "react-native";
import { api } from "../lib/api";
import { Button, Card, ErrorNote, Icon, Tag } from "./ui";

export type NewsResult = {
  articles: {
    id: string;
    title: string;
    source: string;
    sourceUrl: string;
    publishedAt: string;
    category: string;
  }[];
  fetchedAt: string | null;
  day: string;
  timezone: string;
  status: "ok" | "stale" | "unavailable";
  message?: string;
};

const REFRESH_INTERVAL = 10 * 60 * 1000;
const SOURCES = ["All sources", "CNA", "NPR", "NASA"] as const;
function dayInTimezone(time: number, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(time);
  const part = (type: string) =>
    parts.find((item) => item.type === type)?.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function nextDayBoundary(now: number, timezone: string) {
  const today = dayInTimezone(now, timezone);
  // Find the actual calendar boundary, including 23/25-hour daylight-saving days.
  let before = now;
  let after = now + 36 * 60 * 60 * 1000;
  while (after - before > 1) {
    const middle = Math.floor((before + after) / 2);
    if (dayInTimezone(middle, timezone) === today) before = middle;
    else after = middle;
  }
  return after;
}

export function NewsFeed() {
  const { C, T } = useTheme();

  const [feed, setFeed] = useState<NewsResult | null>(null);
  const [source, setSource] = useState<(typeof SOURCES)[number]>("All sources");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [clock, setClock] = useState(() => Date.now());
  const [nextRefresh, setNextRefresh] = useState(0);
  const requestPending = useRef(true);
  const refresh = useCallback(() => {
    setClock(Date.now());
    if (requestPending.current) return;
    requestPending.current = true;
    setLoading(true);
    setRefreshKey((key) => key + 1);
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, 20_000);
    void api<NewsResult>("/news", { signal: controller.signal })
      .then((result) => {
        if (!active) return;
        setFeed(result);
        setClock(Date.now());
        setError("");
      })
      .catch((e) => {
        if (active)
          setError(
            timedOut
              ? "News update timed out. Try refreshing."
              : e instanceof Error
                ? e.message
                : "News is unavailable. Try refreshing.",
          );
      })
      .finally(() => {
        clearTimeout(timeout);
        if (!active) return;
        requestPending.current = false;
        setClock(Date.now());
        setLoading(false);
        setNextRefresh(Date.now() + REFRESH_INTERVAL);
      });
    return () => {
      active = false;
      clearTimeout(timeout);
      controller.abort();
    };
  }, [refreshKey]);
  const timezone = feed?.timezone || "UTC";
  const feedDay = feed?.day;
  useEffect(() => {
    if (!nextRefresh) return;
    const now = Date.now();
    const due = Math.min(nextRefresh, nextDayBoundary(now, timezone));
    const timer = setTimeout(
      () => {
        setClock(Date.now());
        if (
          AppState.currentState !== "background" &&
          AppState.currentState !== "inactive"
        )
          refresh();
      },
      Math.max(1, due - now),
    );
    return () => clearTimeout(timer);
  }, [nextRefresh, timezone, refresh]);
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (status) => {
      if (status !== "active") return;
      const now = Date.now();
      setClock(now);
      if (
        now >= nextRefresh ||
        (feedDay && dayInTimezone(now, timezone) !== feedDay)
      )
        refresh();
    });
    return () => subscription.remove();
  }, [feedDay, nextRefresh, timezone, refresh]);
  async function openArticle(url: string) {
    try {
      await Linking.openURL(url);
    } catch {
      setError("Couldn’t open the publisher’s page. Try again.");
    }
  }
  const today = dayInTimezone(clock, timezone);
  const currentFeed = feed?.day === today ? feed : null;
  const articles =
    currentFeed?.articles.filter(
      (article) => source === "All sources" || article.source === source,
    ) ?? [];
  const day = feed
    ? new Date(`${today}T12:00:00Z`).toLocaleDateString("en", {
        timeZone: "UTC",
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : "Today’s news";
  return (
    <View style={{ gap: 20 }}>
      <View
        style={{
          flexDirection: "row",
          flexWrap: "wrap",
          gap: 12,
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <View style={{ gap: 3, flexShrink: 1 }}>
          <Text style={[T.body, { fontFamily: "DMBold" }]}>{day}</Text>
          {!!feed && (
            <Text style={T.small}>
              Time zone: {feed.timezone.replaceAll("_", " ")}
            </Text>
          )}
        </View>
        <Button
          label="Refresh news"
          variant="secondary"
          icon="refresh-cw"
          loading={loading}
          onPress={refresh}
        />
      </View>
      <View style={{ gap: 10 }}>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {SOURCES.map((publisher) => (
            <Pressable
              key={publisher}
              accessibilityRole="button"
              {...(Platform.OS === "web"
                ? { "aria-pressed": source === publisher }
                : { accessibilityState: { selected: source === publisher } })}
              onPress={() => setSource(publisher)}
              style={({ pressed }) => ({
                minHeight: 44,
                justifyContent: "center",
                paddingHorizontal: 17,
                borderRadius: 22,
                borderWidth: 1,
                borderColor: source === publisher ? C.forest : C.border,
                backgroundColor:
                  source === publisher ? C.forest : pressed ? C.sage : C.paper,
              })}
            >
              <Text
                style={[
                  T.small,
                  {
                    fontFamily: "DMBold",
                    color: source === publisher ? C.onPrimary : C.forest,
                  },
                ]}
              >
                {publisher}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>
      {!!error && <ErrorNote message={error} />}
      {loading && !feed && (
        <View style={{ padding: 30, alignItems: "center", gap: 12 }}>
          <ActivityIndicator accessibilityLabel="Loading" color={C.forest} />
          <Text style={T.small}>Loading headlines…</Text>
        </View>
      )}
      {!!feed && !currentFeed && (
        <Card style={{ gap: 10, alignItems: "center", padding: 28 }}>
          {loading && (
            <ActivityIndicator accessibilityLabel="Loading" color={C.forest} />
          )}
          <Text
            accessibilityLiveRegion="polite"
            style={[T.h2, { textAlign: "center" }]}
          >
            {loading ? "Updating headlines…" : "No headlines for today yet."}
          </Text>
          <Text style={[T.body, { color: C.muted, textAlign: "center" }]}>
            {loading ? "Checking today’s stories." : "Refresh to try again."}
          </Text>
        </Card>
      )}
      {!!currentFeed && (
        <>
          {!!currentFeed.message && (
            <View
              style={{
                backgroundColor:
                  currentFeed.status === "ok" ? C.sage : C.yellow,
                padding: 14,
                borderRadius: 12,
              }}
            >
              <Text accessibilityLiveRegion="polite" style={T.small}>
                {currentFeed.message}
              </Text>
            </View>
          )}
          <View
            style={{
              flexDirection: "row",
              flexWrap: "wrap",
              justifyContent: "space-between",
              gap: 8,
            }}
          >
            {!!currentFeed.fetchedAt && (
              <Text style={T.small}>
                {currentFeed.status === "stale" || error
                  ? "Last successful update"
                  : "Updated"}{" "}
                {new Date(currentFeed.fetchedAt).toLocaleString("en", {
                  timeZone: currentFeed.timezone,
                  month: "short",
                  day: "numeric",
                  hour: "numeric",
                  minute: "2-digit",
                })}
              </Text>
            )}
          </View>
          {articles.length === 0 ? (
            <Card style={{ gap: 12, alignItems: "center", padding: 32 }}>
              <Icon
                name={
                  currentFeed.status === "unavailable" ? "cloud-off" : "coffee"
                }
                size={28}
              />
              <Text style={[T.h2, { textAlign: "center" }]}>
                {currentFeed.status === "unavailable"
                  ? "News unavailable."
                  : source !== "All sources"
                    ? `No ${source} headlines today.`
                    : "No headlines today."}
              </Text>
              <Text
                style={[
                  T.body,
                  { color: C.muted, textAlign: "center", maxWidth: 480 },
                ]}
              >
                {currentFeed.status === "unavailable"
                  ? "Couldn’t reach the publishers. Refresh to try again."
                  : source !== "All sources"
                    ? "Choose another source or refresh."
                    : "Check back later or choose a reading topic."}
              </Text>
            </Card>
          ) : (
            <View style={{ gap: 12 }}>
              {articles.map((article, index) => (
                <Pressable
                  key={article.id}
                  accessibilityRole="link"
                  accessibilityLabel={`Read ${article.title} at ${article.source}`}
                  onPress={() => void openArticle(article.sourceUrl)}
                  style={({ pressed }) => ({
                    backgroundColor: pressed ? "#F0F2E9" : C.paper,
                    borderWidth: 1,
                    borderColor: C.border,
                    borderRadius: 16,
                    padding: 18,
                    gap: 10,
                  })}
                >
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 10,
                    }}
                  >
                    <Tag color={[C.sage, C.peach, C.lilac][index % 3]}>
                      {article.source}
                    </Tag>
                    <Icon name="arrow-up-right" size={18} />
                  </View>
                  <Text style={[T.h2, { fontSize: 21, lineHeight: 29 }]}>
                    {article.title}
                  </Text>
                  <View
                    style={{
                      flexDirection: "row",
                      justifyContent: "space-between",
                      flexWrap: "wrap",
                      gap: 8,
                    }}
                  >
                    <Text style={T.small}>
                      {new Date(article.publishedAt).toLocaleString("en", {
                        timeZone: currentFeed.timezone,
                        month: "short",
                        day: "numeric",
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </Text>
                    <Text
                      style={[
                        T.small,
                        { color: C.forest, fontFamily: "DMBold" },
                      ]}
                    >
                      Read source
                    </Text>
                  </View>
                </Pressable>
              ))}
            </View>
          )}
        </>
      )}
    </View>
  );
}
