import { useTheme, createThemedStyles } from "../theme/ThemeProvider";
import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { Button, Card, ErrorNote, Field } from "../components/ui";
import { api } from "../lib/api";
import { useApp } from "../lib/state";
import type { VocabularyReview } from "../types";

export function VocabularyReviewScreen() {
  const styles = useStyles();

  const { C, T } = useTheme();

  const { state, refresh } = useApp();
  const [review, setReview] = useState<VocabularyReview | null>();
  const [version, setVersion] = useState(0);
  const [answer, setAnswer] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const controller = useRef<AbortController | null>(null);

  useEffect(() => {
    const request = new AbortController();
    controller.current = request;
    void api<VocabularyReview | null>("/wordbloom/reviews", {
      method: "POST",
      body: {},
      signal: request.signal,
    })
      .then((next) => {
        if (!request.signal.aborted) setReview(next);
      })
      .catch((failure) => {
        if (!request.signal.aborted) setError(failure.message);
      });
    return () => request.abort();
  }, [version]);

  function loadNext() {
    setReview(undefined);
    setAnswer("");
    setError("");
    setVersion((value) => value + 1);
  }

  async function submit(step: "recall" | "reflect", response: string) {
    if (!review || busy) return;
    const signal = controller.current?.signal;
    setBusy(true);
    setError("");
    try {
      const next = await api<VocabularyReview>(
        `/wordbloom/reviews/${review.id}`,
        {
          method: "POST",
          body: { step, answer: response },
          signal,
        },
      );
      if (signal?.aborted) return;
      setReview(next);
      setAnswer("");
      if (next.result) void refresh().catch(() => {});
    } catch (failure) {
      if (!signal?.aborted)
        setError(
          failure instanceof Error ? failure.message : "Please try again.",
        );
    } finally {
      if (!signal?.aborted) setBusy(false);
    }
  }

  return (
    <View style={styles.page}>
      <Button
        label="Back to My Dictionary"
        icon="arrow-left"
        variant="ghost"
        onPress={() => router.replace("/progress" as any)}
      />
      <Text accessibilityRole="header" style={T.title}>
        Word review
      </Text>
      <ErrorNote message={error} />
      {review === undefined ? (
        error ? (
          <Button label="Try again" onPress={loadNext} />
        ) : (
          <ActivityIndicator accessibilityLabel="Loading" color={C.forest} />
        )
      ) : review === null ? (
        <Card style={styles.paper}>
          <Text style={T.h2}>You’re caught up</Text>
          <Text style={T.body}>
            Due words will appear here. You can revisit any saved word in My
            Dictionary.
          </Text>
        </Card>
      ) : review.result ? (
        <Card style={styles.paper}>
          <Text accessibilityRole="header" style={T.h2}>
            Review complete
          </Text>
          <Text style={T.h3}>{review.word}</Text>
          <Text style={T.body}>{review.reflection}</Text>
          <Text style={T.small}>
            {review.result.correct} of {review.result.reviews} recall exercises
            correct ·{" "}
            {review.result.streak >= 3 ? "Consistent recall" : "Practising"}
          </Text>
          <Text style={T.body}>
            Next review{" "}
            {new Date(review.result.dueAt).toLocaleDateString(undefined, {
              timeZone: state?.profile.timezone,
            })}
            .
          </Text>
          <Text style={T.small}>
            {review.result.xp
              ? `+${review.result.xp} XP earned`
              : "Today’s word review bonus was already earned."}
          </Text>
          <Button label="Review another word" onPress={loadNext} />
        </Card>
      ) : (
        <>
          <Card style={styles.paper}>
            <Text style={T.label}>
              {review.recall ? "Reflect · 2 of 2" : "Read and recall · 1 of 2"}
            </Text>
            <Text accessibilityRole="header" style={T.h2}>
              {review.title}
            </Text>
            <Text style={T.body}>{review.example ?? review.passage}</Text>
            <Text style={T.small}>{review.meaning}</Text>
          </Card>
          <Card style={styles.activity}>
            {review.recall ? (
              <>
                <Text style={T.h3}>
                  {review.recall.correct
                    ? `You recalled “${review.word}”`
                    : `The word is “${review.word}”`}
                </Text>
                <Text style={T.body}>{review.reflectionPrompt}</Text>
                <Field
                  key="reflection"
                  label={`Your reflection · use “${review.word}”`}
                  value={answer}
                  onChangeText={setAnswer}
                  maxLength={1000}
                  multiline
                  editable={!busy}
                  style={{ minHeight: 105 }}
                />
                <Button
                  label="Complete review"
                  onPress={() => void submit("reflect", answer)}
                  loading={busy}
                  disabled={!answer.trim()}
                />
              </>
            ) : (
              <>
                <Field
                  key="recall"
                  label="Which word fits the blank?"
                  value={answer}
                  onChangeText={setAnswer}
                  autoCapitalize="none"
                  maxLength={60}
                  editable={!busy}
                />
                <View style={styles.actions}>
                  <Button
                    label="Check answer"
                    onPress={() => void submit("recall", answer)}
                    loading={busy}
                    disabled={!answer.trim()}
                  />
                  <Button
                    label="Show the word"
                    variant="ghost"
                    onPress={() => void submit("recall", "?")}
                    disabled={busy}
                  />
                </View>
              </>
            )}
          </Card>
        </>
      )}
    </View>
  );
}

const useStyles = createThemedStyles(({ C }) =>
  StyleSheet.create({
    page: { alignSelf: "center", width: "100%", maxWidth: 780, gap: 18 },
    paper: {
      backgroundColor: C.yellow,
      gap: 12,
      padding: 24,
      borderColor: "#E7DED1",
    },
    activity: { gap: 14 },
    actions: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  }),
);
