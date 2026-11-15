import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { router } from "expo-router";
import {
  Button,
  C,
  Card,
  ErrorNote,
  Field,
  Icon,
  T,
  Tag,
} from "../components/ui";
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

export function DailyPlanIntro({ onStart }: { onStart?: () => void }) {
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
      />
      <ErrorNote message={error} />
      <Text style={{ ...T.small, textAlign: "center" }}>
        Starting switches to daily rewards. Your garden and saved work stay with
        you.
      </Text>
    </View>
  );
}

export function DailyHome({
  state,
  start,
}: {
  state: AppState;
  start: (mode: Mode) => void;
}) {
  return (
    <ChallengeHub
      state={state}
      onRead={() => router.push("/read-aloud")}
      onSpin={() => start("spin_speak")}
    />
  );
}

function ChallengeHub({
  state,
  onRead,
  onSpin,
  busy,
}: {
  state: AppState;
  onRead: () => void;
  onSpin: () => void;
  busy?: string | null;
}) {
  const { width } = useWindowDimensions();
  const wide = width >= 900;
  const [focusedActivity, setFocusedActivity] = useState<string | null>(null);
  const daily = state.dailyWorkout;
  const complete = Boolean(daily && daily.completed === daily.required);
  const first = state.profile.displayName.split(" ")[0];
  return (
    <View
      style={{
        width: "100%",
        maxWidth: 1040,
        alignSelf: "center",
        gap: wide ? 32 : 22,
      }}
      testID="daily-hub"
    >
      <View style={{ gap: 9 }}>
        <Text
          style={{ ...T.small, letterSpacing: 1.4, textTransform: "uppercase" }}
        >
          A little practice, every day
        </Text>
        <View
          style={{
            flexDirection: "row",
            flexWrap: "wrap",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 14,
          }}
        >
          <Text
            accessibilityRole="header"
            style={{
              fontFamily: "DMBold",
              fontSize: wide ? 38 : 29,
              color: C.ink,
            }}
          >
            Daily challenge
          </Text>
          {daily ? (
            <View
              style={{
                flexDirection: "row",
                gap: 7,
                alignItems: "center",
                backgroundColor: "#eef2e8",
                paddingVertical: 8,
                paddingHorizontal: 13,
                borderRadius: 24,
              }}
            >
              <Icon name={complete ? "check-circle" : "circle"} size={17} />
              <Text
                testID="daily-progress"
                style={{ ...T.small, fontFamily: "DMBold" }}
              >
                {daily.completed}/{daily.required}
              </Text>
              <Text style={T.small}>done</Text>
            </View>
          ) : null}
        </View>
        <Text testID="daily-streak-status" style={T.body}>
          {complete
            ? "Both done. Come back tomorrow, or keep practising."
            : `${first}, choose where to start.`}
        </Text>
      </View>
      <View style={{ flexDirection: wide ? "row" : "column", gap: 16 }}>
        {[
          {
            id: "read_aloud",
            title: "Read aloud",
            caption: "Find your rhythm.",
            copy: "A short passage. A little more confidence.",
            icon: "book-open",
            color: "#edf2e6",
            action: onRead,
          },
          {
            id: "spin_speak",
            title: "Spin and reflect",
            caption: "Find your point of view.",
            copy: "One question. Your ideas, in your own words.",
            icon: "shuffle",
            color: "#efeaf6",
            action: onSpin,
          },
        ].map((item) => {
          const activity = daily?.activities.find((a) => a.type === item.id);
          return (
            <Pressable
              key={item.id}
              accessibilityRole="button"
              accessibilityLabel={item.title}
              accessibilityState={{
                disabled: Boolean(busy),
                busy: busy === item.id,
              }}
              disabled={Boolean(busy)}
              onFocus={() => setFocusedActivity(item.id)}
              onBlur={() => setFocusedActivity(null)}
              onPress={item.action}
              style={({ pressed }) => ({
                flex: wide ? 1 : undefined,
                minHeight: wide ? 290 : 190,
                padding: wide ? 28 : 22,
                borderRadius: 25,
                backgroundColor: item.color,
                borderWidth: 2,
                borderColor:
                  focusedActivity === item.id ? C.forest : "transparent",
                opacity: pressed || (busy && busy !== item.id) ? 0.65 : 1,
                gap: 18,
              })}
            >
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <View
                  style={{
                    width: 48,
                    height: 48,
                    borderRadius: 16,
                    backgroundColor: "#ffffffb0",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Icon name={item.icon} size={24} />
                </View>
                {activity?.completed ? (
                  <Tag>Done today</Tag>
                ) : activity ? (
                  <Text style={T.small}>+{activity.xp} XP</Text>
                ) : null}
              </View>
              <View style={{ gap: 5, flex: 1 }}>
                <Text
                  style={{ ...T.h3, fontSize: wide ? 26 : 22, lineHeight: 32 }}
                >
                  {item.title}
                </Text>
                <Text style={T.body}>{wide ? item.copy : item.caption}</Text>
              </View>
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <Text style={{ ...T.small, fontFamily: "DMBold" }}>
                  {busy === item.id
                    ? "Opening…"
                    : activity?.completed
                      ? "Practise again"
                      : "Let’s begin"}
                </Text>
                {busy === item.id ? (
                  <ActivityIndicator color={C.forest} />
                ) : (
                  <Icon name="arrow-up-right" size={23} />
                )}
              </View>
            </Pressable>
          );
        })}
      </View>
      {daily ? (
        <View
          style={{
            flexDirection: "row",
            flexWrap: "wrap",
            gap: 18,
            alignItems: "center",
          }}
        >
          <Text style={T.small}>{daily.streak.current} day streak</Text>
          <Text style={T.small}>{daily.xp} XP today</Text>
          <Text style={T.small}>{daily.timezone}</Text>
        </View>
      ) : null}
      <View
        style={{
          borderTopWidth: 1,
          borderColor: C.border,
          paddingTop: 16,
          flexDirection: "row",
          flexWrap: "wrap",
          gap: 12,
          justifyContent: "space-between",
        }}
      >
        <Button
          label="My garden"
          icon="sun"
          variant="ghost"
          onPress={() => router.push("/garden" as never)}
        />
        <Button
          label="More practice"
          icon="arrow-right"
          variant="ghost"
          onPress={() => router.push("/play" as never)}
        />
      </View>
    </View>
  );
}

export function ReadAloud() {
  const { state, refresh } = useApp();
  const uid = state!.profile.id;
  const [assignment, setAssignment] = useState<ReadingAssignment | null>(null);
  const [notes, setNotes] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [wordReviews, setWordReviews] = useState<
    Record<string, WordReviewOutcome>
  >({});
  const [recording, setRecording] = useState(false);
  const [review, setReview] = useState(false);
  const [audio, setAudio] = useState<{ id: string; uri: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<ReadAloudAttempt | null>(null);
  const [attemptAgain, setAttemptAgain] = useState(false);
  const [loadVersion, setLoadVersion] = useState(0);
  const requestKey = useRef<string | null>(null);
  const draftWrites = useRef(Promise.resolve());
  const controller = useRef<AbortController | null>(null);
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
        if (!next.latestAttempt) {
          const draft = await loadDraft(`read-aloud:${next.id}`);
          if (!abort.signal.aborted && isDraftOwner(uid)) { setNotes(draft); setReview(Boolean(draft)); }
        }
      })
      .catch((e) => {
        if (!abort.signal.aborted) setError(e.message);
      });
    return () => {
      abort.abort();
      controller.current = null;
    };
  }, [uid, loadVersion]);
  async function allowRecording() {
    setBusy(true);
    setError("");
    try {
      await api("/me", {
        method: "PATCH",
        body: { consent: { recording: true } },
        signal: controller.current?.signal,
      });
      if (!isDraftOwner(uid)) return;
      await refresh();
      setRecording(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Please try again.");
    } finally {
      setBusy(false);
    }
  }
  async function saveRecording(recorded: RecordedAudio) {
    setBusy(true);
    setError("");
    try {
      if (recorded.duration < 3)
        throw new Error(
          "This take is very short. Read a few sentences before saving, or use accessible self-review.",
        );
      const saved = await uploadAudio(recorded.uri, recorded.mime, {
        signal: controller.current?.signal,
      });
      if (!isDraftOwner(uid)) return;
      setAudio({ id: saved.id, uri: recorded.uri });
      setRecording(false);
      requestKey.current = null;
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Could not upload your recording.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function submit() {
    if (!assignment || busy) return;
    setBusy(true);
    setError("");
    requestKey.current ||= `reading-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    try {
      const saved = await api<ReadAloudAttempt>(
        `/read-aloud/assignments/${assignment.id}/submit`,
        {
          method: "POST",
          signal: controller.current?.signal,
          body: {
            idempotencyKey: requestKey.current,
            notes,
            selfReviewConfirmed: confirmed,
            ...(Object.keys(wordReviews).length
              ? {
                  wordReviews: Object.entries(wordReviews).map(
                    ([vocabularyId, outcome]) => ({ vocabularyId, outcome }),
                  ),
                }
              : {}),
            ...(audio ? { audioId: audio.id } : {}),
          },
        },
      );
      if (!isDraftOwner(uid)) return;
      setResult(saved);
      setAttemptAgain(false);
      await draftWrites.current;
      if (isDraftOwner(uid)) await deleteDraft(`read-aloud:${assignment.id}`);
      await refresh();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Your work is kept here. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <View
      style={{ gap: 20, maxWidth: 820, width: "100%", alignSelf: "center" }}
    >
      <Button
        label="Daily challenge"
        icon="arrow-left"
        variant="ghost"
        onPress={() => router.push("/")}
      />
      <Text accessibilityRole="header" style={T.title}>
        Read aloud
      </Text>
      <ErrorNote message={error} />
      {!assignment ? (
        <Card style={{ gap: 12 }}>
          {!error ? <ActivityIndicator color={C.forest} /> : null}
          <Text style={T.body}>
            {error
              ? "Your reading could not be loaded."
              : "Preparing your reading…"}
          </Text>
          {error ? (
            <Button
              label="Reload reading"
              onPress={() => {
                setError("");
                setLoadVersion((value) => value + 1);
              }}
            />
          ) : null}
        </Card>
      ) : (
        <>
          {!review && (!result || attemptAgain) ? (
            <Card style={{ gap: 14 }}>
              <Tag>Your passage</Tag>
              <Text style={T.h2}>{assignment.passage.title}</Text>
              <WordBloomPassage
                text={assignment.passage.text}
                words={assignment.wordbloom?.words || []}
                reviews={wordReviews}
                allowReview={!result || attemptAgain}
                onReview={(id, outcome) => {
                  setWordReviews((current) => ({ ...current, [id]: outcome }));
                  requestKey.current = null;
                }}
              />
              <Text style={T.small}>
                Try this: {assignment.passage.target}.
              </Text>
            </Card>
          ) : null}
          {result && !attemptAgain ? (
            <Card style={{ gap: 14 }}>
              <Text accessibilityRole="header" style={T.h2}>
                Reading practice saved
              </Text>
              <Text selectable style={T.body}>
                {result.text}
              </Text>
              {result.audioId ? (
                <PrivateRecordingPlayback id={result.audioId} />
              ) : null}
              <Text style={T.body}>{result.evaluation.next_step}</Text>
              {result.audioId ? (
                <ReadingSpeech key={result.id} attempt={result} />
              ) : null}
              <Text testID="reading-reward" style={T.h3}>
                {result.rewards.xp
                  ? `+${result.rewards.xp} XP`
                  : "Extra practice saved · no duplicate XP"}
              </Text>
              <Text style={T.body}>
                {state?.dailyWorkout?.completed === 2
                  ? "2/2 · daily workout complete. Streak secured."
                  : `${state?.dailyWorkout?.completed || 0}/2 done today.`}
              </Text>
              <Button
                label="Return to daily workout"
                onPress={() => router.push("/")}
              />
              <Button
                label="Read again for practice"
                variant="secondary"
                onPress={() => {
                  setAttemptAgain(true);
                  setReview(false);
                  setNotes("");
                  setConfirmed(false);
                  setWordReviews({});
                  setAudio(null);
                  requestKey.current = null;
                }}
              />
            </Card>
          ) : (
            <>
              {!review ? (
                recording ? (
                  <AudioInput
                    appearance="daily"
                    onRecorded={saveRecording}
                    onCancel={() => setRecording(false)}
                    busy={busy}
                  />
                ) : audio ? (
                  <Card style={{ gap: 12 }}>
                    <AudioPlayback uri={audio.uri} />
                    <Button
                      label="Record another take"
                      variant="ghost"
                      onPress={() => setRecording(true)}
                    />
                  </Card>
                ) : (
                  <Card style={{ gap: 12 }}>
                    {state?.profile.consent?.recording ? (
                      <Button
                        label="Record the passage"
                        icon="mic"
                        onPress={() => setRecording(true)}
                      />
                    ) : (
                      <Button
                        label="Record the passage"
                        icon="mic"
                        loading={busy}
                        onPress={() => void allowRecording()}
                      />
                    )}
                    <Text style={T.small}>
                      Optional · private recording, stored for up to 30 days.
                    </Text>
                  </Card>
                )
              ) : null}
              {review ? (
                <Card style={{ gap: 16 }}>
                  <Text style={T.h2}>Notice one small thing</Text>
                  <Text style={T.small}>Self-review · no speech scores</Text>
                  <Field
                    label="Your reading observation"
                    value={notes}
                    onChangeText={(value: string) => {
                      setNotes(value);
                      requestKey.current = null;
                      draftWrites.current = draftWrites.current
                        .then(async () => {
                          if (isDraftOwner(uid))
                            await saveDraft(
                              `read-aloud:${assignment.id}`,
                              value,
                            );
                        })
                        .catch(() => {
                          if (isDraftOwner(uid))
                            setError(
                              "Your note could not be saved on this device. Keep this page open and submit when ready.",
                            );
                        });
                    }}
                    multiline
                    placeholder="Which phrase did you practise, and what did you notice?"
                  />
                  <Pressable
                    accessibilityRole="checkbox"
                    accessibilityLabel="I practised this passage and reviewed my reading"
                    accessibilityState={{ checked: confirmed }}
                    onPress={() => {
                      setConfirmed(!confirmed);
                      requestKey.current = null;
                    }}
                    style={{
                      flexDirection: "row",
                      gap: 12,
                      alignItems: "center",
                      paddingVertical: 12,
                      minHeight: 48,
                    }}
                  >
                    <Icon name={confirmed ? "check-square" : "square"} />
                    <Text style={[T.body, { flex: 1 }]}>
                      I read the passage and reviewed my reading.
                    </Text>
                  </Pressable>
                  <Button
                    label="Save reading self-review"
                    onPress={() => void submit()}
                    loading={busy}
                    disabled={!confirmed || notes.trim().length < 20}
                  />
                  <Button
                    label="Back to passage"
                    variant="ghost"
                    onPress={() => setReview(false)}
                  />
                </Card>
              ) : (
                <Button
                  label="Done reading"
                  icon="arrow-right"
                  disabled={recording || busy}
                  onPress={() => setReview(true)}
                />
              )}
            </>
          )}
        </>
      )}
    </View>
  );
}
