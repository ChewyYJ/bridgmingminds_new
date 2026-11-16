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
import { ActivityArt } from "../room/ActivityArt";
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

export function DailyPlanIntro({ onStart, companion }: { onStart?: () => void; companion?: React.ReactNode }) {
  const { state, refresh } = useApp();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const entering = useRef(false);
  async function enter(activity: "read_aloud" | "spin_speak" | "words") {
    if (entering.current) return;
    const owner = state!.profile.id;
    entering.current = true;
    setBusy(activity);
    setError("");
    try {
      await api("/daily-workout/enroll", { method: "POST", body: {} });
      if (!isDraftOwner(owner)) return;
      await refresh();
      if (!isDraftOwner(owner)) return;
      if (activity === "read_aloud") router.push("/read-aloud");
      else if (activity === "words") router.push("/vocabulary-review");
      else onStart?.();
    } catch (cause) {
      if (isDraftOwner(owner)) setError(cause instanceof Error ? cause.message : "Please try again.");
    } finally {
      entering.current = false;
      if (isDraftOwner(owner)) setBusy(null);
    }
  }
  return (
    <View style={{ gap: 16 }}>
      <ChallengeHub
        state={state!}
        onRead={() => void enter("read_aloud")}
        onSpin={() => void enter("spin_speak")}
        onWords={() => void enter("words")}
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
      onWords={() => router.push(state.profile.wordBloomEnabled !== false ? "/vocabulary-review" : "/progress" as never)}
      companion={companion}
    />
  );
}

function ChallengeHub({
  state, onRead, onSpin, onWords, busy, companion,
}: {
  state: AppState; onRead: () => void; onSpin: () => void; onWords: () => void;
  busy?: string | null; companion?: React.ReactNode;
}) {
  const { width } = useWindowDimensions();
  const wide = width >= 1100;
  const daily = state.dailyWorkout;
  const complete = Boolean(daily && daily.completed === daily.required);
  const first = state.profile.displayName.trim().split(" ")[0];
  const [savedDraft, setSavedDraft] = useState<{ owner: string; day: string; pending: boolean } | null>(null);
  const savedSpeaking = savedDraft?.owner === state.profile.id && savedDraft.day === daily?.day && savedDraft.pending;
  useEffect(() => {
    let active = true;
    const day = daily?.day;
    if (day) void loadDraft("daily-speaking-v2:" + day + ":new").then(raw => {
      if (!active || !isDraftOwner(state.profile.id)) return;
      let pending = false;
      try {
        const saved = raw ? JSON.parse(raw) : null;
        pending = saved?.version === 1 && ["board", "speak", "transcript", "processing"].includes(saved.step) && saved.attempt?.status !== "completed";
      } catch { /* An unreadable draft must not claim resumable work. */ }
      setSavedDraft({ owner: state.profile.id, day, pending });
    }).catch(() => undefined);
    return () => { active = false; };
  }, [state.profile.id, daily?.day, daily?.completed]);
  const readDone = Boolean(daily?.activities.find(item => item.type === "read_aloud")?.completed);
  const spinDone = Boolean(daily?.activities.find(item => item.type === "spin_speak")?.completed);
  const next = savedSpeaking && !spinDone ? "spin_speak" : !readDone ? "read_aloud" : !spinDone ? "spin_speak" : null;
  const continuePractice = () => next === "read_aloud" ? onRead() : onSpin();
  const nextActivity = daily?.activities.find(item => item.type === next);
  const activities = [
    { id: "spin_speak", title: "Spin & Speak", description: "Build your ideas", duration: "About 4 min", kind: "speak" as const, action: onSpin, completed: spinDone },
    { id: "read_aloud", title: "Read aloud", description: "Find your rhythm", duration: "About 3 min", kind: "read" as const, action: onRead, completed: readDone },
    { id: "words", title: "Word review", description: "Use saved words", duration: "About 2 min", kind: "words" as const, action: onWords, completed: false },
    { id: "respond", title: "Read & respond", description: "Explore an idea", duration: "Choose a practice read", kind: "respond" as const, action: () => router.push("/discover" as never), completed: false },
  ];
  return (
    <View style={{ width: "100%", maxWidth: 1040, alignSelf: "center", gap: 16 }} testID="daily-hub">
      <View style={{ gap: 4 }}>
        <Text style={T.small}>Hello{first ? ", " + first : ""}</Text>
        <Text accessibilityRole="header" style={T.title}>A little practice today.</Text>
      </View>
      <View style={{ flexDirection: wide ? "row" : "column", alignItems: "stretch", gap: 20 }}>
        <View style={{ flex: wide ? 1 : undefined, gap: 14, minWidth: 0 }}>
          {companion}
          <Card style={{ padding: 16, gap: 12 }}>
            <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", gap: 6 }}>
              <Text accessibilityRole="header" style={[T.h2, { fontSize: 20 }]}>Today’s practice</Text>
              <Text testID="daily-progress" style={T.small}>{daily?.completed ?? 0} of {daily?.required ?? 2} complete</Text>
            </View>
            <Text testID="daily-streak-status" style={T.body}>{complete ? "Both daily activities are complete. Choose what you’d like to practise next." : `Next up: ${next === "read_aloud" ? "Read aloud · about 3 min" : "Spin & Speak · about 4 min"}`}</Text>
            {savedSpeaking && !spinDone && <Text style={[T.small, { color: C.ink }]}>Your saved plan · resume</Text>}
            {(readDone || spinDone) && !complete && <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}><Icon name="check-circle" size={16} /><Text style={T.small}>{readDone ? "Read aloud" : "Spin & Speak"} completed</Text></View>}
            {!complete && <>
              {!!nextActivity && <Text style={T.small}>+{nextActivity.coins ?? 0} Coins{nextActivity.xp ? " · +" + nextActivity.xp + " XP" : ""} on eligible completion</Text>}
              <Button label={daily ? "Continue practice" : "Start daily practice"} icon="arrow-right" disabled={Boolean(busy)} loading={Boolean(busy)} onPress={continuePractice} />
            </>}
          </Card>
        </View>
        <View style={{ flex: wide ? 1.2 : undefined, gap: 12, minWidth: 0 }}>
          <Text accessibilityRole="header" style={[T.h2, { fontSize: 21 }]}>Choose an activity</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }} testID="home-activity-grid">
            {activities.map(item => <Pressable key={item.id} accessibilityRole="button" accessibilityLabel={item.title} accessibilityHint={item.completed ? "Completed today. Practise again." : item.duration} accessibilityState={{ disabled: Boolean(busy), busy: busy === item.id }} disabled={Boolean(busy)} onPress={item.action} testID={`home-activity-${item.id}`}
              style={({ pressed }) => ({ width: "48%", flexGrow: 1, flexBasis: "45%", minHeight: 146, padding: 12, gap: 3, borderWidth: 1, borderColor: C.border, borderRadius: 15, backgroundColor: pressed ? C.sage : C.paper, opacity: busy && busy !== item.id ? 0.65 : 1 })}>
              <ActivityArt kind={item.kind} size={50} />
              <Text style={[T.h3, { fontSize: 16 }]}>{item.title}</Text>
              <Text style={[T.small, { fontSize: 13 }]}>{item.description}</Text>
              <Text style={[T.small, { fontSize: 12, color: item.completed ? C.forest : C.muted }]}>{item.completed ? "Completed · practise again" : item.duration}</Text>
              {busy === item.id && <ActivityIndicator color={C.forest} style={{ position: "absolute", top: 12, right: 12 }} />}
            </Pressable>)}
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel="Open your room" onPress={() => router.push("/room" as never)} style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 10, minHeight: 48, paddingHorizontal: 12, borderWidth: 1, borderColor: C.border, borderRadius: 13, backgroundColor: pressed ? C.sage : C.cream })}><Icon name="grid" size={19} /><Text style={[T.small, { flex: 1, color: C.ink }]}>Make a little space your own</Text><Icon name="chevron-right" size={16} /></Pressable>
        </View>
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
