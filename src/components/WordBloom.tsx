import React, { useEffect, useRef, useState } from "react";
import { Text, View } from "react-native";
import type {
  ReadingWord,
  WordBloomSummary,
  WordReviewOutcome,
} from "../types";
import { api, isDraftOwner } from "../lib/api";
import { useApp } from "../lib/state";
import { Button, C, Card, ErrorNote, T, Tag } from "./ui";

export function WordBloomPreview({ ids }: { ids?: string[] }) {
  return ids?.length ? <WordBloomPanel ids={ids} /> : null;
}
export function WordBloomProgress() {
  return <WordBloomPanel progress />;
}

function WordBloomPanel({
  ids,
  progress = false,
}: {
  ids?: string[];
  progress?: boolean;
}) {
  const { state, refresh } = useApp();
  const uid = state!.profile.id;
  const enabled = state!.profile.wordBloomEnabled;
  const [data, setData] = useState<WordBloomSummary | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [version, setVersion] = useState(0);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => {
    const abort = new AbortController();
    controller.current = abort;
    void api<WordBloomSummary>("/wordbloom/summary", { signal: abort.signal })
      .then((summary) => {
        if (!abort.signal.aborted && isDraftOwner(uid)) {
          setData(summary);
          setError("");
        }
      })
      .catch((e) => {
        if (!abort.signal.aborted) setError(e.message);
      });
    return () => {
      abort.abort();
      controller.current = null;
    };
  }, [uid, enabled, version]);
  async function change(id: string, action: "dismiss" | "familiar") {
    setBusy(id);
    setError("");
    try {
      const next = await api<WordBloomSummary>(`/wordbloom/${id}`, {
        method: "PATCH",
        body: { action },
        signal: controller.current?.signal,
      });
      if (isDraftOwner(uid)) setData(next);
    } catch (e) {
      if (isDraftOwner(uid))
        setError(e instanceof Error ? e.message : "Please try again.");
    } finally {
      setBusy("");
    }
  }
  async function toggle() {
    setBusy("preference");
    setError("");
    try {
      await api("/me", {
        method: "PATCH",
        body: { wordBloomEnabled: !data?.enabled },
        signal: controller.current?.signal,
      });
      if (isDraftOwner(uid)) await refresh();
    } catch (e) {
      if (isDraftOwner(uid))
        setError(e instanceof Error ? e.message : "Please try again.");
    } finally {
      setBusy("");
    }
  }
  const words =
    data?.words.filter((word) => progress || ids?.includes(word.id)) || [];
  return (
    <Card
      testID={progress ? "wordbloom-progress" : "wordbloom-preview"}
      style={{ gap: 14, backgroundColor: C.sage }}
    >
      <Tag>WordBloom · optional</Tag>
      <Text accessibilityRole="header" style={T.h2}>
        {progress ? "Words along the way" : "Words to discover"}
      </Text>
      <Text style={T.body}>
        {progress
          ? "Reading exposures and provisional mentions are separate observations. Neither proves vocabulary mastery."
          : "A small vocabulary opportunity from your response. Simple English is welcome; these are options, not corrections or replacement answers."}
      </Text>
      <ErrorNote message={error} />
      {!data ? (
        <Text style={T.small}>Loading your vocabulary…</Text>
      ) : (
        <>
          {!data.enabled ? (
            <Text style={T.small}>
              WordBloom is paused. Already assigned passages stay as received;
              new passages will not schedule these words.
            </Text>
          ) : null}
          {!words.length ? (
            <Text style={T.small}>
              Words appear only when a useful opportunity is found. There is no
              extra task to complete.
            </Text>
          ) : null}
          {words.map((word) => (
            <View
              key={word.id}
              testID={`wordbloom-item-${word.wordId}`}
              style={{
                gap: 8,
                paddingTop: 12,
                borderTopWidth: 1,
                borderColor: C.border,
              }}
            >
              <Text style={T.h3}>{word.word}</Text>
              <Text style={T.body}>{word.meaning}</Text>
              <Text style={T.small}>Example: {word.example}</Text>
              {!progress ? (
                <>
                  <Text selectable style={T.body}>
                    {word.source.kind === "selected_sample"
                      ? "From your sample script"
                      : "From your response"}
                    : “{word.source.span.quote}”
                  </Text>
                  <Text style={T.small}>{word.source.reason}</Text>
                </>
              ) : null}
              <Text testID={`wordbloom-status-${word.wordId}`} style={T.small}>
                {word.status === "dismissed"
                  ? "Dismissed · excluded from future passages"
                  : word.status === "familiar"
                    ? "Marked familiar by you · not a mastery rating"
                    : word.status === "scheduled"
                      ? "Scheduled for a future eligible reading"
                      : word.status === "review_due"
                        ? "Ready for another reading exposure"
                        : `Introduced · next eligible review ${new Date(word.dueAt).toLocaleDateString(undefined, { timeZone: state!.profile.timezone })}`}
              </Text>
              {progress ? (
                <Text style={T.small}>
                  {word.exposureCount} reading exposures ·{" "}
                  {word.productiveUseCandidates} provisional later-use
                  candidates ·{" "}
                  {word.pronunciationReview?.observationStatus === "observed"
                    ? `provisional reading pronunciation observation (${word.pronunciationReview.locale})`
                    : word.pronunciationReview
                      ? "latest reading pronunciation not assessed"
                      : "pronunciation not assessed"}
                </Text>
              ) : null}
              {progress && word.pronunciationReview ? (
                <Text
                  testID={`wordbloom-pronunciation-${word.wordId}`}
                  style={T.small}
                >
                  {word.pronunciationReview.action === "review_sooner"
                    ? "Review scheduled sooner after repeated reading observations."
                    : word.pronunciationReview.action === "review_later"
                      ? "Review spaced further after repeated reading observations."
                      : "Reading review interval unchanged."}{" "}
                  Provider observations and scheduling rules are provisional; no
                  vocabulary mastery is inferred.
                </Text>
              ) : null}
              {word.status !== "dismissed" && word.status !== "familiar" ? (
                <View
                  style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}
                >
                  <Button
                    label={`Dismiss ${word.word}`}
                    variant="ghost"
                    disabled={!!busy}
                    onPress={() => void change(word.id, "dismiss")}
                  />
                  <Button
                    label={`I know ${word.word}`}
                    variant="ghost"
                    disabled={!!busy}
                    onPress={() => void change(word.id, "familiar")}
                  />
                </View>
              ) : null}
            </View>
          ))}
        </>
      )}
      {error ? (
        <Button
          label="Reload WordBloom"
          variant="secondary"
          onPress={() => setVersion((value) => value + 1)}
        />
      ) : null}
      {progress && data ? (
        <Button
          label={data.enabled ? "Pause WordBloom" : "Resume WordBloom"}
          variant="secondary"
          disabled={!!busy}
          loading={busy === "preference"}
          onPress={() => void toggle()}
        />
      ) : null}
    </Card>
  );
}

export function WordBloomPassage({
  text,
  words,
  reviews,
  onReview,
  allowReview,
}: {
  text: string;
  words: ReadingWord[];
  reviews: Record<string, WordReviewOutcome>;
  onReview: (id: string, outcome: WordReviewOutcome) => void;
  allowReview: boolean;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const spans = words
    .flatMap((word) => word.spans.map((span) => ({ ...span, word })))
    .sort((a, b) => a.start - b.start);
  const fragments: React.ReactNode[] = [];
  let cursor = 0;
  for (const span of spans) {
    if (span.start < cursor || span.end <= span.start || span.end > text.length)
      continue;
    fragments.push(text.slice(cursor, span.start));
    fragments.push(
      <Text
        key={`${span.start}-${span.end}`}
        testID={`wordbloom-highlight-${span.word.wordId}`}
        onPress={() => setSelected(span.word.vocabularyId)}
        style={{
          backgroundColor: C.sage,
          color: C.forest,
          fontFamily: "DMBold",
        }}
      >
        {text.slice(span.start, span.end)}
      </Text>,
    );
    cursor = span.end;
  }
  fragments.push(text.slice(cursor));
  const word = words.find((item) => item.vocabularyId === selected);
  return (
    <View style={{ gap: 14 }}>
      <Text
        selectable
        testID="reading-passage"
        style={[T.body, { fontSize: 19, lineHeight: 31 }]}
      >
        {fragments}
      </Text>
      {words.length ? (
        <>
          <Text style={T.small}>
            A word to notice · tap a highlight or choose its meaning below. No
            extra exercise is required.
          </Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {words.map((item) => (
              <Button
                key={item.vocabularyId}
                label={`Meaning of ${item.word}`}
                variant="secondary"
                selected={selected === item.vocabularyId}
                onPress={() =>
                  setSelected((value) =>
                    value === item.vocabularyId ? null : item.vocabularyId,
                  )
                }
              />
            ))}
          </View>
        </>
      ) : null}
      {word ? (
        <View
          testID="wordbloom-definition"
          style={{
            padding: 14,
            backgroundColor: C.sage,
            borderRadius: 12,
            gap: 10,
          }}
        >
          <Text style={T.h3}>{word.word}</Text>
          <Text style={T.body}>{word.meaning}</Text>
          <Text style={T.small}>Example: {word.example}</Text>
          <Text style={T.small}>
            {word.firstExposure
              ? "A first scheduled exposure"
              : "A scheduled review"}{" "}
            · reading a word does not establish independent mastery.
          </Text>
          {allowReview ? (
            <>
              <Text style={T.small}>
                Optional: how did this word feel to read? This is your
                self-report, not a pronunciation assessment.
              </Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                <Button
                  label={`Practise ${word.word} again`}
                  selected={reviews[word.vocabularyId] === "needs_practice"}
                  variant="secondary"
                  onPress={() => onReview(word.vocabularyId, "needs_practice")}
                />
                <Button
                  label={`${word.word} felt comfortable`}
                  selected={reviews[word.vocabularyId] === "comfortable"}
                  variant="secondary"
                  onPress={() => onReview(word.vocabularyId, "comfortable")}
                />
                <Button
                  label="Skip word review"
                  variant="ghost"
                  onPress={() => onReview(word.vocabularyId, "not_assessed")}
                />
              </View>
            </>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}
