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
import { RecordingConsent } from "../components/RecordingConsent";
import { PrivateRecordingPlayback } from "../components/PrivateRecording";
import { WordBloomPassage } from "../components/WordBloom";
import { ReadingSpeech } from "../components/ReadingSpeech";
import { GardenPreview } from "../components/GardenPreview";
import { useGardenClock } from "../hooks/useGardenClock";
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
  const { refresh } = useApp();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function enroll() {
    setBusy(true);
    setError("");
    try {
      await api("/daily-workout/enroll", { method: "POST", body: {} });
      await refresh();
      onStart?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Please try again.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card style={{ gap: 16, backgroundColor: "#fff", borderColor: "#e7e7e7", alignItems: "center", padding: 28 }}>
      <Icon name="calendar" size={30} color="#242424" />
      <Text style={{ ...T.h2, color: "#181818", textAlign: "center" }}>Daily Challenge</Text>
      <Text style={{ ...T.body, color: "#737373", textAlign: "center" }}>Organise your ideas on a whiteboard, then speak your response.</Text>
      <Text style={{ ...T.small, color: "#737373" }}>45s brainstorm · 1 min speaking</Text>
      <Text style={T.body}>
        Read Aloud + Spin &amp; Speak. Complete both to secure your daily streak
        and earn 25 XP plus one cosmetic seed. Extra practice stays available.
      </Text>
      <Text style={T.small}>
        Switching replaces future classic quest rewards. Your earned XP, plants
        and saved responses stay with you. Read Aloud currently uses clearly
        labelled self-review without speech scores.
      </Text>
      <ErrorNote message={error} />
      <Button
        label="Start my daily workout"
        icon="mic"
        style={{ backgroundColor: "#242424", borderRadius: 28 }}
        onPress={() => void enroll()}
        loading={busy}
      />
    </Card>
  );
}

export function DailyHome({
  state,
  start,
}: {
  state: AppState;
  start: (mode: Mode) => void;
}) {
  const { width } = useWindowDimensions();
  const gardenNow = useGardenClock();
  const daily = state.dailyWorkout!;
  const reading = daily.activities.find(
    (activity) => activity.type === "read_aloud",
  )!;
  const spin = daily.activities.find(
    (activity) => activity.type === "spin_speak",
  )!;
  const complete = daily.completed === 2;
  const next = !reading.completed
    ? () => router.push("/read-aloud")
    : !spin.completed
      ? () => start("spin_speak")
      : () => router.push("/garden" as never);
  return (
    <View style={{ gap: 22 }}>
      <Text accessibilityRole="header" style={T.title}>
        Hi, {state.profile.displayName.split(" ")[0]}.
      </Text>
      <Card style={{ backgroundColor: "#fff", borderColor: "#e7e7e7", gap: 16, alignItems: "center", padding: 28 }}>
        <Icon name="calendar" size={30} color="#242424" />
        <Text style={{ ...T.h2, color: "#181818" }}>Daily Challenge</Text>
        <Text style={{ ...T.body, color: "#737373", textAlign: "center" }}>Organise your thoughts, then share your point of view.</Text>
        <Text style={{ ...T.small, color: "#737373" }}>45s whiteboard · 1 min speaking</Text>
        {spin.completed ? <Text style={T.small}>Today’s speaking challenge is complete. Extra practice is available.</Text> : null}
        <Button label="Open Daily Challenge" icon="mic" onPress={() => start("spin_speak")} style={{ backgroundColor: "#242424", borderRadius: 28 }} />
      </Card>
      <Card style={{ backgroundColor: C.sage, gap: 16 }}>
        <Text style={T.label}>Today’s Mind Workout</Text>
        <Text
          accessibilityLiveRegion="polite"
          testID="daily-progress"
          style={T.title}
        >
          {daily.completed}/2
        </Text>
        <Text style={T.h2}>
          {complete
            ? "Your daily workout is complete"
            : "A little practice, in your own words"}
        </Text>
        <Text testID="daily-streak-status" style={T.body}>
          {complete
            ? "Streak secured · one cosmetic seed earned. Your skill growth is a separate journey."
            : daily.completed === 1
              ? "One activity done. Complete the other to secure today’s streak."
              : "Read Aloud and Spin & Speak are both required to secure today’s streak."}
        </Text>
        <Text style={T.small}>
          {daily.xp}/25 daily XP · {daily.streak.current} day streak ·{" "}
          {daily.timezone}
        </Text>
        <View testID="home-next-action">
          <Button
            label={
              complete
                ? "Enjoy my garden"
                : !reading.completed
                  ? "Continue Read Aloud"
                  : "Continue Spin & Speak"
            }
            icon="arrow-right"
            onPress={next}
          />
        </View>
      </Card>
      <View style={{ flexDirection: width > 750 ? "row" : "column", gap: 16 }}>
        {[
          {
            title: "Read Aloud",
            icon: "book-open",
            activity: reading,
            copy: "Read a short passage, notice one phrase and practise it again.",
            action: () => router.push("/read-aloud"),
          },
          {
            title: "Spin & Speak",
            icon: "mic",
            activity: spin,
            copy: "Explore a fresh question and put your own ideas into words.",
            action: () => start("spin_speak"),
          },
        ].map((item) => (
          <Card
            key={item.title}
            style={{ flex: width > 750 ? 1 : undefined, gap: 12 }}
          >
            <Icon name={item.icon} size={26} />
            <Text style={T.h2}>{item.title}</Text>
            <Tag>
              {item.activity.completed
                ? "Completed today"
                : `${item.activity.xp} XP · first completion`}
            </Tag>
            <Text style={T.body}>{item.copy}</Text>
            <Button
              label={item.title}
              variant="secondary"
              onPress={item.action}
            />
          </Card>
        ))}
      </View>
      <Card style={{ gap: 12 }}>
        <Text style={T.h2}>Your growing space</Text>
        <View style={{ maxWidth: 520, width: "100%" }}>
          <GardenPreview
            plots={state.plots}
            decorations={state.decorations}
            now={gardenNow}
          />
        </View>
        <Text style={T.small}>
          XP recognises participation. AI feedback is provisional and does not
          establish skill mastery.
        </Text>
        <Button
          label="Visit my garden"
          variant="secondary"
          onPress={() => router.push("/garden" as never)}
        />
      </Card>
      <Text style={T.h2}>Explore · optional practice</Text>
      <Text style={T.body}>
        Debate and Read &amp; Reflect are here when you want them. They do not
        replace either daily activity.
      </Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
        <Button
          label="Explore practice"
          variant="secondary"
          onPress={() => router.push("/play" as never)}
        />
        <Button
          label="Read & Reflect"
          variant="ghost"
          onPress={() => router.push("/discover" as never)}
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
          if (!abort.signal.aborted && isDraftOwner(uid)) setNotes(draft);
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
    <View style={{ gap: 20 }}>
      <Button
        label="Back to daily workout"
        variant="ghost"
        onPress={() => router.push("/")}
      />
      <Text accessibilityRole="header" style={T.title}>
        Read Aloud
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
          <Card style={{ gap: 14 }}>
            <Tag>About 2 minutes · your assigned passage</Tag>
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
              Focus: {assignment.passage.target}. Original editorial passage ·{" "}
              {assignment.passage.id}
            </Text>
          </Card>
          <Card style={{ gap: 12, backgroundColor: C.yellow }}>
            <Text style={T.h3}>Self-review · no speech scores</Text>
            <Text style={T.body}>{assignment.speech.message}</Text>
            <Text style={T.small}>
              Read aloud at a comfortable pace. You can record and replay
              privately, or use accessible self-review without a microphone.
              This fallback recognises participation; it cannot judge your
              pronunciation or prove skill improvement.
            </Text>
          </Card>
          {result && !attemptAgain ? (
            <Card style={{ gap: 14 }}>
              <Text accessibilityRole="header" style={T.h2}>
                Reading practice saved
              </Text>
              <Text style={T.body}>
                Your reading observation is saved as self-review. It does not
                include acoustic or ability scores.
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
                  : `${state?.dailyWorkout?.completed || 0}/2 today · both daily activities are needed to secure today’s streak.`}
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
              {recording ? (
                <AudioInput
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
                    <RecordingConsent
                      busy={busy}
                      onAllow={() => void allowRecording()}
                      onWrite={() => setRecording(false)}
                    />
                  )}
                  <Text style={T.small}>
                    Accessible self-review is available below if you cannot or
                    prefer not to record.
                  </Text>
                </Card>
              )}
              <Card style={{ gap: 16 }}>
                <Text style={T.h2}>Notice one small thing</Text>
                <Field
                  label="Your reading observation"
                  value={notes}
                  onChangeText={(value: string) => {
                    setNotes(value);
                    requestKey.current = null;
                    draftWrites.current = draftWrites.current
                      .then(async () => {
                        if (isDraftOwner(uid))
                          await saveDraft(`read-aloud:${assignment.id}`, value);
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
                    I practised this passage and reviewed my reading. I
                    understand this is self-review, with no acoustic assessment.
                  </Text>
                </Pressable>
                <Button
                  label="Save reading self-review"
                  onPress={() => void submit()}
                  loading={busy}
                  disabled={!confirmed || notes.trim().length < 20}
                />
              </Card>
            </>
          )}
        </>
      )}
    </View>
  );
}
