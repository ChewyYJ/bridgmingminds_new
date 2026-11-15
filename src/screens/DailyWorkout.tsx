import React, { useEffect, useRef, useState } from "react";
import Ionicons from "@expo/vector-icons/Ionicons";
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
      <View style={{ gap: 14 }}>
        <View
          style={{
            flexDirection: "row",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: 14,
          }}
        >
          <View style={{ flex: 1, gap: 9, paddingTop: 4 }}>
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
            <Text testID="daily-streak-status" style={T.body}>
              {complete
                ? "Both done. See you tomorrow."
                : `${first}, choose where to start.`}
            </Text>
          </View>
          <View
            testID="home-streak"
            accessible
            accessibilityLabel={`${daily?.streak.current ?? 0} day streak. ${daily?.streak.securedToday ? "Today secured." : "Complete an eligible activity to build your streak."}`}
            style={{
              minWidth: wide ? 156 : 112,
              paddingHorizontal: wide ? 22 : 14,
              paddingVertical: 14,
              borderRadius: 14,
              backgroundColor: "#F7EAD2",
              borderWidth: 1,
              borderColor: "#E8D2AD",
              alignItems: "center",
              gap: 3,
            }}
          >
            <View
              style={{ flexDirection: "row", alignItems: "center", gap: 8 }}
            >
              <Ionicons
                name="flame-outline"
                size={wide ? 32 : 28}
                color="#916A36"
              />
              <Text
                style={{
                  fontFamily: "DMBold",
                  fontSize: wide ? 38 : 32,
                  lineHeight: wide ? 44 : 38,
                  color: C.ink,
                }}
              >
                {daily?.streak.current ?? 0}
              </Text>
            </View>
            <Text style={{ ...T.small, fontFamily: "DMBold", color: C.ink }}>
              Day streak
            </Text>
            <Text style={{ ...T.small, fontSize: 11, color: "#785631" }}>
              {daily?.streak.securedToday
                ? "Today secured"
                : daily?.streak.current
                  ? "Keep it growing"
                  : "Start today"}
            </Text>
          </View>
        </View>
        {daily ? (
          <View
            style={{
              flexDirection: "row",
              gap: 7,
              alignItems: "center",
            }}
          >
            <Icon name={complete ? "check-circle" : "circle"} size={17} />
            <Text
              testID="daily-progress"
              style={{ ...T.small, fontFamily: "DMBold" }}
            >
              {daily.completed}/{daily.required}
            </Text>
            <Text style={T.small}>done today · {daily.xp} XP</Text>
          </View>
        ) : null}
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
                minHeight: wide ? 248 : 176,
                padding: wide ? 28 : 22,
                borderRadius: 20,
                backgroundColor: C.paper,
                borderWidth: 1,
                borderColor: focusedActivity === item.id ? C.forest : C.border,
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
                    backgroundColor: C.sage,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Icon name={item.icon} size={24} />
                </View>
                {activity?.completed ? (
                  <Tag>Done today</Tag>
                ) : activity ? (
                  <Text style={T.small}>+{activity.coins || 0} Coins{activity.xp ? ` · +${activity.xp} XP` : ""}</Text>
                ) : null}
              </View>
              <View style={{ gap: 5, flex: 1 }}>
                <Text
                  style={{
                    fontFamily: "DMBold",
                    color: C.ink,
                    fontSize: wide ? 24 : 21,
                    lineHeight: 30,
                  }}
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
          label="My avatar"
          icon="user"
          variant="ghost"
          onPress={() => router.push("/avatar" as never)}
        />
        <Button
          label="More practice"
          icon="arrow-right"
          variant="ghost"
          onPress={() => router.push("/play" as never)}
        />
        <Button
          label="Read & Reflect"
          icon="book-open"
          variant="ghost"
          onPress={() => router.push("/vocabulary-review")}
        />
      </View>
    </View>
  );
}

export function ReadAloud() {
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
                +{result.rewards.coins || 0} Coins{result.rewards.xp ? ` · +${result.rewards.xp} XP` : ""}
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
