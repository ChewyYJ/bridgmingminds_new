import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { api, isDraftOwner } from "../lib/api";
import { useApp } from "../lib/state";
import type { ReadAloudAttempt, SpeechAssessment } from "../types";
import { Button, C, Card, ErrorNote, T } from "./ui";
import { ReadingEvaluation } from "./ReadingEvaluation";
import { PrivateRecordingPlayback } from "./PrivateRecording";

interface SpeechJob {
  id: string;
  status: "queued" | "processing" | "failed" | "completed";
  locale: "en-US" | "en-GB";
  prosody: boolean;
  retries: number;
  result: SpeechAssessment | null;
  error: { message: string } | null;
  wordBloomReview?: {
    words: { wordId: string; observationStatus: string; action: string }[];
  };
}
export function ReadingSpeech({
  attempt,
  feedbackRequested = false,
  onComplete,
}: {
  attempt: ReadAloudAttempt;
  feedbackRequested?: boolean;
  onComplete?: () => void;
}) {
  const { state } = useApp();
  const uid = state!.profile.id;
  const [job, setJob] = useState<SpeechJob | null>(null);
  const [locales, setLocales] = useState<string[]>([]);
  const [locale, setLocale] = useState<"en-US" | "en-GB">("en-GB");
  const [consented, setConsented] = useState(feedbackRequested);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const notified = useRef(false);
  useEffect(() => {
    if (job?.status === "completed" && !notified.current) {
      notified.current = true;
      onComplete?.();
    }
  }, [job?.status, onComplete]);
  const [selected, setSelected] = useState<number | null>(null);
  const [wordPage, setWordPage] = useState<number | null>(null);
  const abort = useRef<AbortController | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    abort.current = controller;
    void Promise.all([
      api<{ locales: { locale: string; status: string }[] }>(
        "/read-aloud/speech-capabilities",
        { signal: controller.signal },
      ),
      api<SpeechJob | null>(
        `/read-aloud/attempts/${attempt.id}/speech-assessment`,
        { signal: controller.signal },
      ),
    ])
      .then(([capability, saved]) => {
        if (controller.signal.aborted || !isDraftOwner(uid)) return;
        setLocales(
          capability.locales
            .filter((item) => item.status === "available")
            .map((item) => item.locale),
        );
        setJob(saved);
        if (saved) setLocale(saved.locale);
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => {
      controller.abort();
      abort.current = null;
    };
  }, [attempt.id, uid]);
  const pendingJobId =
    job && ["queued", "processing"].includes(job.status) ? job.id : null;
  useEffect(() => {
    if (!pendingJobId) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const next = await api<SpeechJob>(
          `/read-aloud/speech-jobs/${pendingJobId}`,
          {
            signal: controller.signal,
          },
        );
        if (controller.signal.aborted || !isDraftOwner(uid)) return;
        setJob(next);
        setError("");
        if (["queued", "processing"].includes(next.status))
          timer = setTimeout(() => void poll(), 1800);
      } catch (e) {
        if (!controller.signal.aborted) {
          setError(
            e instanceof Error
              ? e.message
              : "Unable to check speech processing.",
          );
          timer = setTimeout(() => void poll(), 5000);
        }
      }
    };
    timer = setTimeout(() => void poll(), 500);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [pendingJobId, uid]);
  async function submit() {
    setBusy(true);
    setError("");
    try {
      const next = await api<SpeechJob>(
        `/read-aloud/attempts/${attempt.id}/speech-assessment`,
        {
          method: "POST",
          body: {
            locale,
            prosody: job?.prosody || false,
            processingConsent: true,
          },
          signal: abort.current?.signal,
        },
      );
      if (isDraftOwner(uid) && !abort.current?.signal.aborted) setJob(next);
    } catch (e) {
      if (isDraftOwner(uid) && !abort.current?.signal.aborted)
        setError(
          e instanceof Error
            ? e.message
            : "Unable to request assessment. Retry safely with the same recording.",
        );
    } finally {
      if (isDraftOwner(uid)) setBusy(false);
    }
  }
  const result = job?.result || attempt.speechAssessment;
  const pending = job?.status === "queued" || job?.status === "processing";
  const word = selected !== null ? result?.words[selected] : undefined;
  const spans = result?.words.filter((item) => item.sourceSpan) || [];
  let cursor = 0;
  const annotated: React.ReactNode[] = [];
  for (const [index, item] of spans.entries()) {
    const span = item.sourceSpan!;
    if (span.start < cursor) continue;
    annotated.push(attempt.passage.text.slice(cursor, span.start));
    annotated.push(
      <Text
        key={index}
        style={{
          backgroundColor:
            item.providerErrorType === "Mispronunciation" ? C.yellow : C.sage,
        }}
      >
        {attempt.passage.text.slice(span.start, span.end)}
      </Text>,
    );
    cursor = span.end;
  }
  annotated.push(attempt.passage.text.slice(cursor));
  if (result?.readingEvaluation)
    return (
      <ReadingEvaluation
        evaluation={result.readingEvaluation}
        audioId={attempt.audioId}
      />
    );
  if (feedbackRequested && !result)
    return (
      <Card style={{ gap: 14 }} testID="reading-speech">
        {loading || pending ? (
          <>
            <ActivityIndicator color={C.forest} />
            <Text accessibilityLiveRegion="polite" style={T.h3}>
              Listening to your reading…
            </Text>
            <Text style={T.body}>
              Checking pronunciation, pace, intonation, word stress and
              completeness.
            </Text>
            <Text style={T.small}>
              Your recording is saved. You can return to this feedback later.
            </Text>
          </>
        ) : (
          <>
            <Text style={T.h3}>Let’s try the feedback again</Text>
            <ErrorNote
              message={
                error ||
                job?.error?.message ||
                "Your recording is saved, but feedback isn’t ready."
              }
            />
            <Button
              label="Retry feedback"
              icon="refresh-cw"
              loading={busy}
              disabled={!locales.length || (job?.retries || 0) >= 3}
              onPress={() => void submit()}
            />
          </>
        )}
      </Card>
    );
  return (
    <View testID="reading-speech" style={{ gap: 12 }}>
      <Text style={T.h3}>
        {feedbackRequested || result || pending
          ? "Speech feedback"
          : "Optional speech feedback"}
      </Text>
      <Text style={T.small}>
        {feedbackRequested || result || pending
          ? "Feedback on your recorded reading."
          : "Assess your recording for pronunciation and fluency feedback."}
      </Text>
      <ErrorNote message={error || job?.error?.message || ""} />
      {!result && !locales.length && !pending ? (
        <Text style={T.body}>
          Speech feedback is unavailable right now. Your recording and
          observation are saved.
        </Text>
      ) : null}
      {!result && locales.length > 0 && !pending ? (
        <>
          <Text style={T.body}>
            Choose a practice target. Singapore English and other legitimate
            varieties are welcome; provider scores are provisional.
          </Text>
          <View style={{ gap: 8 }}>
            {(["en-GB", "en-US"] as const)
              .filter((value) => locales.includes(value))
              .map((value) => (
                <Button
                  key={value}
                  label={
                    value === "en-GB"
                      ? "UK English practice target"
                      : "US English practice target"
                  }
                  variant="secondary"
                  selected={locale === value}
                  disabled={Boolean(job)}
                  onPress={() => setLocale(value)}
                />
              ))}
          </View>
          <Pressable
            accessibilityRole="checkbox"
            accessibilityLabel="Allow Azure to assess this reading recording"
            accessibilityState={{ checked: consented }}
            onPress={() => setConsented(!consented)}
            style={{ minHeight: 48, paddingVertical: 12 }}
          >
            <Text style={T.body}>
              {consented ? "☑" : "☐"} I allow this private recording and its
              reading passage to be sent to Microsoft Azure for acoustic
              assessment. This is optional.
            </Text>
          </Pressable>
          <Button
            label={
              job?.status === "failed"
                ? "Retry acoustic assessment"
                : "Assess my reading recording"
            }
            loading={busy}
            disabled={!consented || (job?.retries || 0) >= 3}
            onPress={() => void submit()}
          />
        </>
      ) : null}
      {pending ? (
        <Text accessibilityLiveRegion="polite" style={T.body}>
          Assessing your saved recording… You can leave and return; the request
          is saved.
        </Text>
      ) : null}
      {result ? (
        <View style={{ gap: 12 }}>
          <Text style={T.h3}>
            Provisional acoustic feedback · {result.locale}
          </Text>
          {result.status === "no_speech" ? (
            <Text style={T.body}>
              No speech could be assessed. Try a new recording in a quieter
              place; no speech scores were assigned.
            </Text>
          ) : (
            <>
              <Text testID="speech-annotated-passage" style={T.body}>
                {annotated}
              </Text>
              <Text style={T.small}>
                Green highlights mark aligned words. Yellow marks a provider
                suggestion to review, not a confirmed error. Choose a word below
                to inspect its audio timing.
              </Text>
              {result.utterances.map((utterance, index) => (
                <View key={index} style={{ gap: 5 }}>
                  <Text style={T.small}>
                    Segment {index + 1} ·{" "}
                    {(utterance.startMs / 1000).toFixed(1)}s
                  </Text>
                  <Text style={T.body}>{utterance.transcript}</Text>
                  <Text style={T.small}>
                    {Object.entries(utterance.metrics)
                      .filter(([, value]) => value !== null)
                      .map(([name, value]) => `${name}: ${value}/100`)
                      .join(" · ") ||
                      "No acoustic metrics returned for this segment."}
                  </Text>
                </View>
              ))}
              <Button
                label={
                  wordPage === null
                    ? "Inspect words and timings"
                    : "Hide word timings"
                }
                variant="secondary"
                onPress={() => setWordPage(wordPage === null ? 0 : null)}
              />
              {wordPage !== null ? (
                <View style={{ gap: 8 }}>
                  {result.words
                    .slice(wordPage * 12, wordPage * 12 + 12)
                    .map((item, pageIndex) => {
                      const index = wordPage * 12 + pageIndex;
                      return (
                        <Button
                          key={index}
                          label={`Inspect ${item.word} at ${(item.startMs / 1000).toFixed(1)} seconds`}
                          variant="secondary"
                          selected={selected === index}
                          onPress={() => setSelected(index)}
                        />
                      );
                    })}
                  {wordPage > 0 ? (
                    <Button
                      label="Previous word timings"
                      variant="secondary"
                      onPress={() => setWordPage(wordPage - 1)}
                    />
                  ) : null}
                  {(wordPage + 1) * 12 < result.words.length ? (
                    <Button
                      label="More word timings"
                      variant="secondary"
                      onPress={() => setWordPage(wordPage + 1)}
                    />
                  ) : null}
                </View>
              ) : null}
              {word ? (
                <View testID="speech-selected-word" style={{ gap: 8 }}>
                  <Text style={T.h3}>{word.word}</Text>
                  <Text style={T.body}>
                    Audio: {(word.startMs / 1000).toFixed(1)}–
                    {((word.startMs + word.durationMs) / 1000).toFixed(1)}s ·
                    accuracy{" "}
                    {word.accuracy === null
                      ? "not assessed"
                      : `${word.accuracy}/100`}{" "}
                    ·{" "}
                    {word.providerErrorType === "Mispronunciation"
                      ? "provider suggests reviewing this word"
                      : "provider observation"}
                  </Text>
                  <Text style={T.body}>
                    Listen to this phrase, then try it once more at a
                    comfortable pace.
                  </Text>
                  <PrivateRecordingPlayback
                    key={`${attempt.audioId}:${word.startMs}`}
                    id={attempt.audioId!}
                    startSeconds={Math.max(0, word.startMs / 1000 - 0.2)}
                  />
                </View>
              ) : null}
            </>
          )}
          {result.limitations.map((limitation) => (
            <Text key={limitation} style={T.small}>
              {limitation}
            </Text>
          ))}
          {job?.wordBloomReview?.words.length ? (
            <View testID="speech-wordbloom-review" style={{ gap: 8 }}>
              <Text style={T.h3}>WordBloom reading review · provisional</Text>
              {job.wordBloomReview.words.map((word) => (
                <Text key={word.wordId} style={T.body}>
                  {word.wordId}:{" "}
                  {word.observationStatus !== "observed"
                    ? "No reliable matched pronunciation observation; review interval unchanged."
                    : word.action === "review_sooner"
                      ? "Review scheduled sooner after repeated reading observations."
                      : word.action === "review_later"
                        ? "Review spaced further after repeated reading observations."
                        : "Reading observation recorded; review interval unchanged."}
                </Text>
              ))}
              <Text style={T.small}>
                Reading pronunciation is separate from self-review and
                spontaneous word use. These pilot rules do not establish
                mastery.
              </Text>
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}
