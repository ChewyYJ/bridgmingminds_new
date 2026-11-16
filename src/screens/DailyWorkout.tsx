import { useTheme } from "../theme/ThemeProvider";
import React, { useEffect, useRef, useState } from "react";
import { READING_CRITERIA } from "../../shared/reading-rubric.mjs";
import {
  ActivityIndicator,
  ScrollView,
  Pressable,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { router } from "expo-router";
import { Button, Card, ErrorNote, Field, Icon, Tag } from "../components/ui";
import AudioInput, {
  AudioPlayback,
  RecordedAudio,
} from "../components/AudioInput";
import { PrivateRecordingPlayback } from "../components/PrivateRecording";
import { WordBloomPassage } from "../components/WordBloom";
import { ReadingSpeech } from "../components/ReadingSpeech";
import { useApp } from "../lib/state";
import {
  api,
  deleteDraft,
  isDraftOwner,
  loadDraft,
  saveDraft,
  uploadAudio,
} from "../lib/api";
import type {
  AppState,
  Mode,
  ReadAloudAttempt,
  ReadingAssignment,
  WordReviewOutcome,
} from "../types";

export function DailyPlanIntro({
  onStart,
  companion,
}: {
  onStart?: () => void;
  companion?: React.ReactNode;
}) {
  const { state, refresh } = useApp();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const entering = useRef(false);
  async function enter(activity: "read_aloud" | "spin_speak") {
    if (entering.current) return;
    entering.current = true;
    setBusy(activity);
    setError("");
    try {
      await api("/daily-workout/enroll", { method: "POST", body: {} });
      await refresh();
      if (activity === "read_aloud") router.push("/read-aloud");
      else onStart?.();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Please try again.");
    } finally {
      entering.current = false;
      setBusy(null);
    }
  }
  return (
    <View style={{ gap: 16 }}>
      <ChallengeHub
        state={state!}
        onRead={() => void enter("read_aloud")}
        onSpin={() => void enter("spin_speak")}
        busy={busy}
        companion={companion}
      />
      <ErrorNote message={error} />
    </View>
  );
}

export function DailyHome({
  state,
  start,
  companion,
}: {
  state: AppState;
  start: (mode: Mode) => void;
  companion?: React.ReactNode;
}) {
  return (
    <ChallengeHub
      state={state}
      onRead={() => router.push("/read-aloud")}
      onSpin={() => start("spin_speak")}
      companion={companion}
    />
  );
}

function ChallengeHub({
  state,
  onRead,
  onSpin,
  busy,
  companion,
}: {
  state: AppState;
  onRead: () => void;
  onSpin: () => void;
  busy?: string | null;
  companion?: React.ReactNode;
}) {
  const { C, T } = useTheme();

  const { width } = useWindowDimensions();
  const wide = width >= 1100;
  const daily = state.dailyWorkout;
  const complete = Boolean(daily && daily.completed === daily.required);
  const first = state.profile.displayName.trim().split(" ")[0];
  const [savedDraft, setSavedDraft] = useState<{
    owner: string;
    day: string;
    pending: boolean;
  } | null>(null);
  const savedSpeaking =
    savedDraft?.owner === state.profile.id &&
    savedDraft.day === daily?.day &&
    savedDraft.pending;
  useEffect(() => {
    let active = true;
    const day = daily?.day;
    if (day)
      void loadDraft("daily-speaking-v2:" + day + ":new")
        .then((raw) => {
          if (!active || !isDraftOwner(state.profile.id)) return;
          let pending = false;
          try {
            const saved = raw ? JSON.parse(raw) : null;
            pending =
              saved?.version === 1 &&
              ["board", "speak", "transcript", "processing"].includes(
                saved.step,
              ) &&
              saved.attempt?.status !== "completed";
          } catch {
            /* An unreadable draft must not claim resumable work. */
          }
          setSavedDraft({ owner: state.profile.id, day, pending });
        })
        .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [state.profile.id, daily?.day, daily?.completed]);
  const readDone = Boolean(
    daily?.activities.find((item) => item.type === "read_aloud")?.completed,
  );
  const spinDone = Boolean(
    daily?.activities.find((item) => item.type === "spin_speak")?.completed,
  );
  const next =
    savedSpeaking && !spinDone
      ? "spin_speak"
      : !readDone
        ? "read_aloud"
        : !spinDone
          ? "spin_speak"
          : null;
  const continuePractice = () =>
    next === "read_aloud"
      ? onRead()
      : next === "spin_speak"
        ? onSpin()
        : router.push("/play" as never);
  const reviewWords = () =>
    router.push(
      state.profile.dailyWorkout && state.profile.wordBloomEnabled !== false
        ? "/vocabulary-review"
        : ("/progress" as never),
    );
  const streak =
    state.gamification?.streak.current ?? daily?.streak.current ?? state.streak;
  return (
    <View
      style={{ width: "100%", maxWidth: 1040, alignSelf: "center", gap: 20 }}
      testID="daily-hub"
    >
      <View style={{ gap: 10 }}>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
          }}
        >
          <Text style={[T.small, { flex: 1 }]}>
            Hello{first ? ", " + first : ""}
          </Text>
          <View
            testID="home-streak"
            accessibilityLabel={`${streak} day streak`}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 7,
              minHeight: 44,
              paddingHorizontal: 12,
              borderRadius: 12,
              backgroundColor: C.yellow,
            }}
          >
            <Icon name="zap" size={18} color={C.orange} />
            <Text style={[T.body, { fontFamily: "DMBold", color: C.orange }]}>
              {streak}-day streak
            </Text>
          </View>
        </View>
        <Text
          accessibilityRole="header"
          style={[T.display, { fontSize: 32, lineHeight: 40 }]}
        >
          A little practice today.
        </Text>
        <Text style={T.small} testID="daily-streak-status">
          {complete
            ? "Both daily activities are complete. Make the next step your own."
            : "One small step, at your pace."}
        </Text>
      </View>
      <View
        style={{
          flexDirection: wide ? "row" : "column",
          alignItems: "stretch",
          gap: 20,
        }}
      >
        <View style={{ flex: wide ? 1 : undefined, gap: 14 }}>{companion}</View>
        <View style={{ flex: wide ? 1.2 : undefined, gap: 16, minWidth: 0 }}>
          <Card style={{ padding: 16, gap: 14 }}>
            <View
              style={{
                flexDirection: "row",
                flexWrap: "wrap",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 6,
              }}
            >
              <Text accessibilityRole="header" style={[T.h2, { fontSize: 20 }]}>
                Today’s practice
              </Text>
              <Text testID="daily-progress" style={T.small}>
                {daily?.completed ?? 0} of {daily?.required ?? 2} complete
              </Text>
            </View>
            {[
              {
                id: "read_aloud",
                title: "Read aloud",
                duration: "About 3 min",
                icon: "book-open",
                action: onRead,
              },
              {
                id: "spin_speak",
                title: "Spin & Speak",
                duration: "About 4 min",
                icon: "mic",
                action: onSpin,
              },
            ].map((item) => {
              const activity = daily?.activities.find(
                (entry) => entry.type === item.id,
              );
              const isNext = next === item.id;
              return (
                <Pressable
                  key={item.id}
                  accessibilityRole="button"
                  accessibilityLabel={item.title}
                  accessibilityHint={
                    activity?.completed
                      ? "Completed today. Practise again."
                      : isNext
                        ? "Your next daily activity"
                        : "Start this daily activity"
                  }
                  accessibilityState={{
                    disabled: Boolean(busy),
                    busy: busy === item.id,
                  }}
                  disabled={Boolean(busy)}
                  onPress={item.action}
                  style={({ pressed }) => ({
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 12,
                    padding: 12,
                    minHeight: 76,
                    borderRadius: 13,
                    backgroundColor: isNext ? C.sage : C.quiet,
                    opacity: pressed || (busy && busy !== item.id) ? 0.65 : 1,
                  })}
                >
                  <View
                    style={{
                      width: 38,
                      height: 42,
                      alignItems: "center",
                      justifyContent: "center",
                      backgroundColor: C.paper,
                      borderRadius: 10,
                    }}
                  >
                    <Icon
                      name={activity?.completed ? "check" : item.icon}
                      size={21}
                    />
                  </View>
                  <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                    <Text style={[T.h3, { fontSize: 16 }]}>{item.title}</Text>
                    <Text style={T.small}>
                      {activity?.completed
                        ? "Completed · practise again"
                        : savedSpeaking && item.id === "spin_speak"
                          ? "Your saved plan · resume"
                          : item.duration + (isNext ? " · Next up" : "")}
                    </Text>
                    {!activity?.completed && activity && (
                      <Text style={T.small}>
                        +{activity.coins ?? 0} Coins
                        {activity.xp ? " · +" + activity.xp + " XP" : ""}
                      </Text>
                    )}
                  </View>
                  {busy === item.id ? (
                    <ActivityIndicator color={C.forest} />
                  ) : (
                    <Icon
                      name={activity?.completed ? "check" : "chevron-right"}
                      size={19}
                    />
                  )}
                </Pressable>
              );
            })}
            <Button
              label={
                complete
                  ? "Explore more practice"
                  : daily
                    ? "Continue practice"
                    : "Start daily practice"
              }
              icon="arrow-right"
              disabled={Boolean(busy)}
              loading={Boolean(busy)}
              onPress={continuePractice}
            />
          </Card>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Word review"
            onPress={reviewWords}
            style={({ pressed }) => ({
              flexDirection: "row",
              alignItems: "center",
              gap: 12,
              padding: 16,
              minHeight: 78,
              borderWidth: 1,
              borderColor: C.border,
              backgroundColor: C.paper,
              borderRadius: 16,
              opacity: pressed ? 0.7 : 1,
            })}
          >
            <Icon name="book-open" size={23} />
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={T.h3}>Word review</Text>
              <Text style={T.small}>
                {state.profile.dailyWorkout &&
                state.profile.wordBloomEnabled !== false
                  ? "Use the words you’ve saved · about 2 min"
                  : "Find your saved words in My Dictionary"}
              </Text>
            </View>
            <Icon name="chevron-right" size={18} />
          </Pressable>
          <Button
            label="Your progress"
            variant="ghost"
            onPress={() => router.push("/progress" as never)}
          />
        </View>
      </View>
    </View>
  );
}

export function ReadAloud() {
  const { C, T } = useTheme();

  const { height } = useWindowDimensions();
  const { state, refresh } = useApp();
  const uid = state!.profile.id;
  const [assignment, setAssignment] = useState<ReadingAssignment | null>(null);
  const [notes, setNotes] = useState("");
  const [wordReviews, setWordReviews] = useState<
    Record<string, WordReviewOutcome>
  >({});
  const [recording, setRecording] = useState(false);
  const [playbackUri, setPlaybackUri] = useState("");
  const [selfReview, setSelfReview] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<ReadAloudAttempt | null>(null);
  const [loadVersion, setLoadVersion] = useState(0);
  const [provider, setProvider] = useState("AI speech service");
  const requestKey = useRef<string | null>(null);
  const audio = useRef<{ id: string; uri: string } | null>(null);
  const controller = useRef<AbortController | null>(null);
  const lock = useRef(false);
  useEffect(() => {
    const abort = new AbortController();
    controller.current = abort;
    void api<ReadingAssignment>("/read-aloud/assignment", {
      signal: abort.signal,
    })
      .then(async (next) => {
        if (abort.signal.aborted || !isDraftOwner(uid)) return;
        setAssignment(next);
        setResult(next.latestAttempt || null);
        const draft = await loadDraft(`read-aloud:${next.id}`);
        if (!abort.signal.aborted && isDraftOwner(uid)) setNotes(draft);
      })
      .catch((cause) => {
        if (!abort.signal.aborted) setError(cause.message);
      });
    void api<{ locales: { provider: string; status: string }[] }>(
      "/read-aloud/speech-capabilities",
      { signal: abort.signal },
    )
      .then((caps) => {
        const active = caps.locales.find((item) => item.status === "available");
        if (!abort.signal.aborted && isDraftOwner(uid))
          setProvider(
            active?.provider === "openai"
              ? "OpenAI"
              : active?.provider === "azure"
                ? "Microsoft Azure"
                : "AI speech service",
          );
      })
      .catch(() => {});
    return () => {
      abort.abort();
      controller.current = null;
    };
  }, [uid, loadVersion]);

  async function startRecording() {
    setBusy(true);
    setError("");
    try {
      if (!state?.profile.consent?.recording) {
        await api("/me", {
          method: "PATCH",
          body: { consent: { recording: true } },
          signal: controller.current?.signal,
        });
        await refresh();
      }
      if (isDraftOwner(uid)) {
        setSelfReview(false);
        setRecording(true);
      }
    } catch (cause) {
      if (isDraftOwner(uid))
        setError(
          cause instanceof Error ? cause.message : "Microphone unavailable.",
        );
    } finally {
      setBusy(false);
    }
  }

  async function submit(recorded?: RecordedAudio) {
    if (!assignment || lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      if (recorded) {
        if (recorded.duration < 3)
          throw new Error(
            "Read for a few seconds so there’s enough speech to assess.",
          );
        if (audio.current?.uri !== recorded.uri) {
          const saved = await uploadAudio(recorded.uri, recorded.mime, {
            signal: controller.current?.signal,
          });
          if (!isDraftOwner(uid)) return;
          audio.current = { id: saved.id, uri: recorded.uri };
          setPlaybackUri(recorded.uri);
          requestKey.current = null;
        }
      }
      requestKey.current ||= `reading-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const saved = await api<ReadAloudAttempt>(
        `/read-aloud/assignments/${assignment.id}/submit`,
        {
          method: "POST",
          signal: controller.current?.signal,
          body: {
            idempotencyKey: requestKey.current,
            ...(recorded
              ? {
                  audioId: audio.current!.id,
                  evaluateRecording: true,
                  processingConsent: true,
                }
              : { notes: notes.trim(), selfReviewConfirmed: true }),
            wordReviews: Object.entries(wordReviews).map(
              ([vocabularyId, outcome]) => ({ vocabularyId, outcome }),
            ),
          },
        },
      );
      if (!isDraftOwner(uid) || controller.current?.signal.aborted) return;
      setResult(saved);
      setRecording(false);
      setSelfReview(false);
      await deleteDraft(`read-aloud:${assignment.id}`);
      await refresh();
    } catch (cause) {
      if (isDraftOwner(uid))
        setError(
          cause instanceof Error
            ? cause.message
            : "Your recording is kept here. Please try Done again.",
        );
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  async function assessmentComplete() {
    try {
      const next = await api<ReadingAssignment>("/read-aloud/assignment", {
        signal: controller.current?.signal,
      });
      if (!isDraftOwner(uid) || controller.current?.signal.aborted) return;
      setAssignment(next);
      setResult(next.latestAttempt || null);
      await refresh();
    } catch {
      /* The saved job remains recoverable on reload. */
    }
  }

  function again() {
    setResult(null);
    setRecording(false);
    setSelfReview(false);
    setNotes("");
    setWordReviews({});
    audio.current = null;
    setPlaybackUri("");
    requestKey.current = null;
    setError("");
  }

  return (
    <View
      style={{ gap: 20, maxWidth: 680, width: "100%", alignSelf: "center" }}
    >
      <Button
        label="Daily challenge"
        icon="arrow-left"
        variant="ghost"
        onPress={() => router.push("/")}
        style={{ alignSelf: "flex-start" }}
      />
      <View style={{ gap: 6 }}>
        <Text accessibilityRole="header" style={T.title}>
          {result
            ? result.audioId
              ? "Your reading feedback"
              : "Practice saved"
            : "Read aloud"}
        </Text>
        <Text style={T.body}>
          {result
            ? "One small step towards clearer speech."
            : recording
              ? "Read at your own pace. Tap Done when you finish."
              : "Find your rhythm, one passage at a time."}
        </Text>
      </View>
      <ErrorNote message={error} />
      {!assignment ? (
        <Card>
          <ActivityIndicator color={C.forest} />
          <Button
            label="Retry"
            variant="ghost"
            onPress={() => setLoadVersion((value) => value + 1)}
          />
        </Card>
      ) : result ? (
        <>
          {result.audioId ? (
            <>
              <Card style={{ gap: 8 }}>
                <Text style={T.h3}>Your recording</Text>
                {playbackUri ? (
                  <AudioPlayback uri={playbackUri} />
                ) : (
                  <PrivateRecordingPlayback id={result.audioId} autoLoad />
                )}
              </Card>
              <ReadingSpeech
                key={result.id}
                attempt={result}
                feedbackRequested
                onComplete={assessmentComplete}
              />
            </>
          ) : (
            <Card style={{ gap: 12 }}>
              <Tag>Self-review · no AI assessment</Tag>
              <Text style={T.body}>{result.text}</Text>
              <Text style={T.small}>{result.evaluation.next_step}</Text>
            </Card>
          )}
          {result.rewards.coins > 0 || result.rewards.xp > 0 ? (
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
                padding: 16,
                borderRadius: 12,
                backgroundColor: C.sage,
              }}
            >
              <Text testID="reading-reward" style={T.h3}>
                +{result.rewards.coins || 0} Coins
                {result.rewards.xp ? ` · +${result.rewards.xp} XP` : ""}
              </Text>
              <Text style={T.small}>Practice complete</Text>
            </View>
          ) : null}
          <Button
            label="Read again"
            icon="mic"
            variant="secondary"
            onPress={again}
          />
          <Button
            label="Continue"
            icon="arrow-right"
            onPress={() => router.push("/")}
          />
        </>
      ) : (
        <>
          {!recording && !selfReview ? (
            <Button
              label="Record the passage"
              icon="mic"
              loading={busy}
              onPress={() => void startRecording()}
            />
          ) : null}
          <Card style={{ gap: 16 }}>
            <Tag>Your passage</Tag>
            <Text style={T.h2}>{assignment.passage.title}</Text>
            <ScrollView
              nestedScrollEnabled
              style={
                recording
                  ? { maxHeight: Math.min(350, height * 0.3) }
                  : undefined
              }
            >
              <WordBloomPassage
                text={assignment.passage.text}
                words={assignment.wordbloom?.words || []}
                reviews={wordReviews}
                allowReview
                onReview={(id, outcome) => {
                  setWordReviews((current) => ({ ...current, [id]: outcome }));
                  requestKey.current = null;
                }}
              />
            </ScrollView>
            <Text style={T.small}>Try this: {assignment.passage.target}.</Text>
          </Card>
          {recording ? (
            <Card style={{ gap: 12 }}>
              <AudioInput
                appearance="reading"
                reviewActionLabel="Done"
                onRecorded={submit}
                onCancel={() => setRecording(false)}
                busy={busy}
              />
              <Text style={[T.small, { textAlign: "center" }]}>
                Done sends your recording to {provider} for feedback. Your
                recording stays private.
              </Text>
            </Card>
          ) : selfReview ? (
            <Card style={{ gap: 14 }}>
              <Text style={T.h3}>Practise without recording</Text>
              <Text style={T.small}>
                Save your own observation. This won’t evaluate your speech.
              </Text>
              <Field
                label="Your reading observation"
                value={notes}
                multiline
                placeholder="What did you notice about your reading?"
                onChangeText={(value: string) => {
                  setNotes(value);
                  requestKey.current = null;
                  void saveDraft(`read-aloud:${assignment.id}`, value).catch(
                    () => {},
                  );
                }}
              />
              <Button
                label="Done"
                loading={busy}
                disabled={notes.trim().length < 20}
                onPress={() => void submit()}
              />
              <Button
                label="Record instead"
                icon="mic"
                variant="ghost"
                onPress={() => void startRecording()}
              />
            </Card>
          ) : (
            <>
              <Card style={{ gap: 14 }}>
                <Text style={T.h3}>What we listen for</Text>
                <View
                  style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}
                >
                  {READING_CRITERIA.map((item) => (
                    <View
                      key={item.key}
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 6,
                        backgroundColor: C.cream,
                        borderRadius: 8,
                        padding: 9,
                      }}
                    >
                      <Icon name={item.icon} size={14} />
                      <Text style={T.small}>{item.label}</Text>
                    </View>
                  ))}
                </View>
                <Text style={T.small}>
                  Clear communication matters. Your accent is welcome.
                </Text>
              </Card>
              <Button
                label="Practise without recording"
                variant="ghost"
                onPress={() => setSelfReview(true)}
              />
            </>
          )}
        </>
      )}
    </View>
  );
}
