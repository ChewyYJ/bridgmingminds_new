import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from "react-native";
import {
  api,
  deleteDraft,
  loadDraft,
  saveDraft,
  uploadAudio,
} from "../lib/api";
import { useApp } from "../lib/state";
import type {
  Attempt,
  Evaluation,
  BrainstormBoard,
  Job,
  Session,
  WordBloomSummary,
} from "../types";
import { getThoughtGuide } from "../../shared/thought-guide.mjs";
import { getBridgeRubric } from "../../shared/bridge-rubric.mjs";
import {
  isGuidedResponseDraft,
  type GuidedResponseDraft,
} from "../../shared/guided-response.mjs";
import AudioInput, { type RecordedAudio } from "../components/AudioInput";
import { DailyBoard, createDailyBoard } from "../components/DailyBoard";
import { NewsWheel } from "../components/NewsWheel";
import { useReducedMotion } from "../hooks/useReducedMotion";
import { ThoughtMapView } from "../components/ThoughtMap";
import { C, Icon } from "../components/ui";
import Svg, { Path } from "react-native-svg";

type Step =
  | "entry"
  | "board"
  | "speak"
  | "processing"
  | "transcript"
  | "feedback"
  | "guide"
  | "sample-offer"
  | "script"
  | "complete";
interface GuideFeedback {
  status: "answered" | "partly_answered" | "not_answered";
  feedback: string;
  next_step: string;
  evidence_quote: string;
}
interface Draft {
  version: 1;
  step: Step;
  session: Session;
  board: BrainstormBoard | null;
  attempt: Attempt | null;
  answers: string[];
  script: GuidedResponseDraft | null;
  submissionKey: string;
  guideFeedback?: (GuideFeedback | null)[];
  selectedWordIds?: string[];
  savedWordIds?: string[];
}
function unique() {
  return `daily-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}
function message(error: unknown) {
  return error instanceof Error
    ? error.message
    : "Please try again. Your saved work is still here.";
}

export function DailySpeaking({
  onClose,
  onComplete,
  onStepChange,
  retryAttempt: requestedAttempt,
}: {
  onClose: () => void;
  onComplete: (attempt: Attempt) => void;
  onStepChange?: () => void;
  retryAttempt?: Attempt;
}) {
  const { state, refresh } = useApp();
  const { width } = useWindowDimensions();
  const wide = width >= 900;
  const [retryAttempt] = useState(requestedAttempt);
  const [step, setStep] = useState<Step>("entry");
  const [session, setSession] = useState<Session | null>(null);
  const [board, setBoard] = useState<BrainstormBoard | null>(null);
  const [attempt, setAttempt] = useState<Attempt | null>(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [spinning, setSpinning] = useState(false);
  const reducedMotion = useReducedMotion();
  const [error, setError] = useState("");
  const [seconds, setSeconds] = useState(60);
  const [loadVersion, setLoadVersion] = useState(0);
  const [consent, setConsent] = useState(
    Boolean(state?.profile.consent?.recording),
  );
  const [capturing, setCapturing] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [processing, setProcessing] = useState<
    "upload" | "transcribe" | "analyse"
  >("upload");
  const [tab, setTab] = useState("Overall");
  const [showMap, setShowMap] = useState(false);
  const [answers, setAnswers] = useState(["", "", ""]);
  const [guideIndex, setGuideIndex] = useState<number | null>(null);
  const [guideTyping, setGuideTyping] = useState(false);
  const [expandedGuide, setExpandedGuide] = useState<number | null>(null);
  const [script, setScript] = useState<GuidedResponseDraft | null>(null);
  const [guideFeedback, setGuideFeedback] = useState<(GuideFeedback | null)[]>([
    null,
    null,
    null,
  ]);
  const [selectedWordIds, setSelectedWordIds] = useState<string[]>([]);
  const [savedWordIds, setSavedWordIds] = useState<string[]>([]);
  const submissionKey = useRef(unique());
  const sessionKey = useRef(unique());
  const spinKey = useRef<string | null>(null);
  const lock = useRef(false);
  const mounted = useRef(true);
  const complete = useRef(onComplete);
  const stepChange = useRef(onStepChange);
  const storage = `daily-speaking-v2:${state?.dailyWorkout?.day || "today"}:${retryAttempt?.id || "new"}`;
  useEffect(() => {
    complete.current = onComplete;
  }, [onComplete]);
  useEffect(() => {
    stepChange.current = onStepChange;
  }, [onStepChange]);
  useEffect(() => {
    const frame = requestAnimationFrame(() => stepChange.current?.());
    return () => cancelAnimationFrame(frame);
  }, [step]);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    async function init() {
      try {
        const raw = await loadDraft(storage);
        if (!active) return;
        const saved = raw ? (JSON.parse(raw) as Draft) : null;
        if (
          saved?.version === 1 &&
          !(
            saved.step === "entry" &&
            !saved.attempt &&
            !saved.board &&
            !saved.session.newsSource
          )
        ) {
          setSession(saved.session);
          setBoard(saved.board);
          setAttempt(saved.attempt);
          setAnswers(saved.answers);
          setScript(saved.script);
          setGuideFeedback(saved.guideFeedback || [null, null, null]);
          setSelectedWordIds(saved.selectedWordIds || []);
          setSavedWordIds(saved.savedWordIds || []);
          submissionKey.current = saved.submissionKey;
          setTranscript(saved.attempt?.text || "");
          setStep(
            saved.step === "processing" && saved.attempt?.status === "draft"
              ? "transcript"
              : saved.step === "processing" && !saved.attempt
                ? "speak"
                : saved.step,
          );
        } else {
          const current = retryAttempt
            ? await api<Session>(`/sessions/${retryAttempt.sessionId}`)
            : await api<Session>("/sessions", {
                method: "POST",
                body: {
                  mode: "spin_speak",
                  idempotencyKey: sessionKey.current,
                },
              });
          if (!active) return;
          setSession(current);
          if (retryAttempt?.status === "draft") {
            setAttempt(retryAttempt);
            setTranscript(retryAttempt.text);
            setStep("transcript");
          }
        }
      } catch (cause) {
        if (active) setError(message(cause));
      } finally {
        if (active) setReady(true);
      }
    }
    void init();
    return () => {
      active = false;
    };
  }, [storage, retryAttempt, loadVersion]);

  useEffect(() => {
    if (!ready || !session) return;
    const draft: Draft = {
      version: 1,
      session,
      board,
      attempt,
      answers,
      script,
      step,
      submissionKey: submissionKey.current,
      guideFeedback,
      selectedWordIds,
      savedWordIds,
    };
    void saveDraft(storage, JSON.stringify(draft)).catch(() => {
      if (mounted.current)
        setError(
          "This device couldn’t save your draft. Keep this screen open.",
        );
    });
  }, [
    ready,
    session,
    board,
    attempt,
    answers,
    script,
    step,
    storage,
    guideFeedback,
    selectedWordIds,
    savedWordIds,
  ]);

  const sessionId = session?.id;
  useEffect(() => {
    if (!board || !sessionId) return;
    let active = true;
    const timer = setTimeout(() => {
      void api(`/sessions/${sessionId}/brainstorm`, {
        method: "PUT",
        body: board,
      }).catch(() => {
        if (active)
          setError("Your board is saved on this device. Reconnect to sync it.");
      });
    }, 600);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [board, sessionId]);
  const expiresAt = board?.expiresAt;
  useEffect(() => {
    if (step !== "board" || !expiresAt) return;
    const tick = () => {
      const remaining = Math.max(
        0,
        Math.ceil((Date.parse(expiresAt) - Date.now()) / 1000),
      );
      setSeconds(remaining);
      if (!remaining) {
        setBoard((b) =>
          b ? { ...b, completedAt: new Date().toISOString() } : b,
        );
        setStep("speak");
      }
    };
    const first = setTimeout(tick, 0);
    const timer = setInterval(tick, 250);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [step, expiresAt]);

  const pendingId = attempt?.id;
  const pendingStatus = attempt?.status;
  useEffect(() => {
    if (step !== "processing" || !pendingId || pendingStatus === "draft")
      return;
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const current = await api<Attempt>(`/attempts/${pendingId}`);
        if (!active) return;
        if (current.status === "completed" && current.evaluation) {
          setAttempt(current);
          setStep("feedback");
          setError("");
          complete.current(current);
          return;
        }
        if (current.status === "failed") {
          setError(
            "Your response is saved. Analysis couldn’t finish; please retry.",
          );
          return;
        }
      } catch (cause) {
        if (active) {
          setError(message(cause));
          return;
        }
      }
      if (active) timer = setTimeout(() => void poll(), 1200);
    };
    void poll();
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [step, pendingId, pendingStatus]);

  async function queue(saved: Attempt) {
    await api<Job>(`/attempts/${saved.id}/evaluate`, { method: "POST" });
    setProcessing("analyse");
    setAttempt({ ...saved, status: "queued" });
    setStep("processing");
  }
  async function transcribe(saved: Attempt) {
    setProcessing("transcribe");
    const result = await api<{ text: string }>(
      `/attempts/${saved.id}/transcribe`,
      { method: "POST" },
    );
    const text = result.text?.trim() || "";
    setTranscript(text);
    const next = { ...saved, text };
    setAttempt(next);
    if (text.length < 20) {
      setStep("transcript");
      setError(
        "Your recording is saved. Review or retry its transcript before continuing.",
      );
    } else await queue(next);
  }
  async function recorded(audio: RecordedAudio) {
    if (!session || lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      // Keep the recorder mounted until upload succeeds so a failed upload can be retried.
      const media = await uploadAudio(audio.uri, audio.mime);
      const saved = await api<Attempt>("/attempts", {
        method: "POST",
        body: {
          sessionId: session.id,
          responseType: "audio",
          audioId: media.id,
          ...(board && retryAttempt?.status !== "completed"
            ? {
                planningNotes: board.notes
                  .map(({ text }) => text.trim())
                  .filter(Boolean)
                  .join("\n")
                  .slice(0, 2000),
              }
            : {}),
          retryOf:
            retryAttempt?.status === "completed" ? retryAttempt.id : undefined,
          idempotencyKey: submissionKey.current,
        },
      });
      setAttempt(saved);
      setStep("processing");
      await transcribe(saved);
    } catch (cause) {
      setError(message(cause));
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  async function retryProcessing() {
    if (!attempt || lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      const current = await api<Attempt>(`/attempts/${attempt.id}`);
      if (current.text.trim().length >= 20) await queue(current);
      else await transcribe(current);
    } catch (cause) {
      setError(message(cause));
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  async function submitTranscript() {
    if (!attempt || lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      const saved = await api<Attempt>(`/attempts/${attempt.id}/transcript`, {
        method: "PATCH",
        body: { text: transcript.trim() },
      });
      setAttempt(saved);
      await queue(saved);
    } catch (cause) {
      setError(message(cause));
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  async function allow() {
    setBusy(true);
    setError("");
    try {
      await api("/me", {
        method: "PATCH",
        body: { consent: { recording: true } },
      });
      setConsent(true);
      await refresh();
    } catch (cause) {
      setError(message(cause));
    } finally {
      setBusy(false);
    }
  }
  const questions = getThoughtGuide("spin_speak", attempt?.evaluation);
  async function guideRecording(audio: RecordedAudio) {
    if (!attempt || guideIndex === null || lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      const media = await uploadAudio(audio.uri, audio.mime);
      const saved = await api<Attempt>("/attempts", {
        method: "POST",
        body: {
          sessionId: attempt.sessionId,
          responseType: "audio",
          audioId: media.id,
          retryOf: attempt.id,
          idempotencyKey: unique(),
        },
      });
      const result = await api<{ text: string }>(
        `/attempts/${saved.id}/transcribe`,
        { method: "POST" },
      );
      if (!result.text?.trim())
        throw new Error(
          "No transcript returned. Please try your guiding response again.",
        );
      setAnswers((items) =>
        items.map((value, i) => (i === guideIndex ? result.text : value)),
      );
      setScript(null);
      setSelectedWordIds([]);
      setGuideFeedback((items) =>
        items.map((value, i) => (i === guideIndex ? null : value)),
      );
      setGuideIndex(null);
      await assessGuide(guideIndex, result.text);
    } catch (cause) {
      setError(message(cause));
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  async function assessGuide(index: number, answer = answers[index]) {
    if (!attempt) return;
    const result = await api<GuideFeedback>(
      `/attempts/${attempt.id}/guiding-answer`,
      { method: "POST", body: { index, answer } },
    );
    setGuideFeedback((items) =>
      items.map((value, i) => (i === index ? result : value)),
    );
    setExpandedGuide(index);
  }
  async function retryGuide(index: number) {
    setBusy(true);
    setError("");
    try {
      await assessGuide(index);
    } catch (cause) {
      setError(message(cause));
    } finally {
      setBusy(false);
    }
  }
  async function saveWords() {
    if (!attempt || busy || !selectedWordIds.length) return;
    setBusy(true);
    setError("");
    try {
      const summary = await api<WordBloomSummary>(
        `/attempts/${attempt.id}/vocabulary`,
        { method: "POST", body: { wordIds: selectedWordIds } },
      );
      setSavedWordIds(summary.words.map((word) => word.wordId));
      setSelectedWordIds([]);
      await refresh();
      setStep("complete");
    } catch (cause) {
      setError(message(cause));
    } finally {
      setBusy(false);
    }
  }
  async function generateScript() {
    if (!attempt || lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    setStep("script");
    try {
      const result = await api<unknown>(
        `/attempts/${attempt.id}/guided-response`,
        {
          method: "POST",
          body: {
            daily: true,
            questions,
            answers,
          },
        },
      );
      if (!isGuidedResponseDraft(result))
        throw new Error(
          "The sample script couldn’t be checked. Please try again.",
        );
      setScript(result);
      setSelectedWordIds([]);
    } catch (cause) {
      setError(message(cause));
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  async function spinNews() {
    if (!ready || lock.current || board || attempt || retryAttempt) return;
    lock.current = true;
    setBusy(true);
    setSpinning(true);
    setError("");
    spinKey.current ||= unique();
    try {
      const [next] = await Promise.all([
        api<Session>("/sessions", {
          method: "POST",
          body: { mode: "spin_speak", idempotencyKey: spinKey.current },
        }),
        // Let the wheel complete one turn; reduced-motion users get the result immediately.
        new Promise<void>((resolve) =>
          setTimeout(resolve, reducedMotion ? 0 : 1100),
        ),
      ]);
      if (!mounted.current) return;
      setSession(next);
      submissionKey.current = unique();
      spinKey.current = null;
    } catch (cause) {
      if (mounted.current) setError(message(cause));
    } finally {
      lock.current = false;
      if (mounted.current) {
        setBusy(false);
        setSpinning(false);
      }
    }
  }
  function nextBoard() {
    if (!session || lock.current) return;
    setBoard(createDailyBoard());
    setSeconds(60);
    setStep("board");
    setError("");
  }
  function finishBoard() {
    setBoard((value) =>
      value ? { ...value, completedAt: new Date().toISOString() } : value,
    );
    setStep("speak");
    setError("");
  }
  async function leave() {
    if (step === "complete") await deleteDraft(storage).catch(() => undefined);
    onClose();
  }
  function back() {
    if (capturing || busy) return;
    setError("");
    if (step === "entry" || step === "processing") void leave();
    else if (step === "board") setStep("entry");
    else if (step === "speak") setStep("entry");
    else if (step === "guide" && guideIndex !== null) setGuideIndex(null);
    else if (
      step === "guide" ||
      step === "script" ||
      step === "sample-offer" ||
      step === "complete"
    )
      setStep("feedback");
    else void leave();
  }
  const evaluation = attempt?.evaluation;
  const feedback = evaluation?.feedback;
  const title = (
    {
      board: "Gather your ideas",
      speak: "Your one-minute pitch",
      feedback: "Your feedback",
      guide: "Go a little deeper",
      script: "Your sample script",
      "sample-offer": "See another way to say it",
      transcript: "Check your words",
    } as Partial<Record<Step, string>>
  )[step];
  const rewards = attempt?.rewards;
  const dailyCompleted = state?.dailyWorkout?.activities.find(
    (v) => v.type === "spin_speak",
  )?.completed;

  return (
    <KeyboardAvoidingView
      style={s.root}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        key={step}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={s.scroll}
      >
        <View
          style={{
            width: "100%",
            maxWidth: wide && step === "feedback" && showMap ? 1240 : 900,
            flexDirection: wide ? "row" : "column",
            gap: 32,
            alignItems: "flex-start",
          }}
        >
          {wide ? (
            <View style={{ width: 180, paddingTop: 24, gap: 24 }}>
              <Pressable
                accessibilityRole="button"
                disabled={busy || capturing}
                onPress={() => void leave()}
                style={{
                  flexDirection: "row",
                  gap: 8,
                  alignItems: "center",
                  minHeight: 44,
                }}
              >
                <Icon name="arrow-left" size={18} />
                <Text style={s.small}>Daily challenge</Text>
              </Pressable>
              {["Plan", "Speak", "Reflect"].map((label, i) => (
                <View
                  key={label}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 12,
                  }}
                >
                  <View
                    style={[
                      s.number,
                      {
                        backgroundColor:
                          (i === 0 && ["entry", "board"].includes(step)) ||
                          (i === 1 &&
                            ["speak", "processing", "transcript"].includes(
                              step,
                            )) ||
                          (i === 2 &&
                            [
                              "feedback",
                              "guide",
                              "sample-offer",
                              "script",
                              "complete",
                            ].includes(step))
                            ? C.sage
                            : C.cream,
                      },
                    ]}
                  >
                    <Text style={s.name}>{i + 1}</Text>
                  </View>
                  <Text style={s.body}>{label}</Text>
                </View>
              ))}
            </View>
          ) : null}
          <View
            style={[
              s.phone,
              {
                maxWidth: wide ? (step === "feedback" && showMap ? 1028 : 680) : 560,
                flex: wide ? 1 : undefined,
                padding: wide ? 32 : 20,
              },
            ]}
            testID={`daily-screen-${step}`}
          >
            {step !== "entry" ? (
              <View style={s.header}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Back"
                  disabled={capturing || busy}
                  onPress={back}
                  style={s.back}
                >
                  <Icon name="chevron-left" color="#181818" size={24} />
                </Pressable>
                {title && !["speak"].includes(step) ? (
                  <Text accessibilityRole="header" style={s.heading}>
                    {title}
                  </Text>
                ) : null}
                <View style={{ width: 38 }} />
              </View>
            ) : null}
            {error ? (
              <View accessibilityRole="alert" style={s.error}>
                <Text style={s.small}>{error}</Text>
                {!session ? (
                  <Action
                    label="Retry question"
                    secondary
                    onPress={() => {
                      setError("");
                      setReady(false);
                      setLoadVersion((version) => version + 1);
                    }}
                  />
                ) : null}
              </View>
            ) : null}
            {!ready ? (
              <ActivityIndicator color="#242424" style={{ margin: 80 }} />
            ) : null}
            {step === "entry" && (
              <>
                <View style={s.center}>
                  <Text style={s.small}>
                    {session?.prompt.category || "Today’s question"}
                  </Text>
                  <Text accessibilityRole="header" style={s.title}>
                    Spin and reflect
                  </Text>
                  <Text style={s.copy}>
                    {dailyCompleted
                      ? "Done today. Keep exploring."
                      : "One minute to plan. One minute to speak."}
                  </Text>
                </View>
                {!board && !attempt && !retryAttempt ? (
                  <NewsWheel
                    busy={spinning}
                    disabled={!ready || busy}
                    onSpin={() => void spinNews()}
                  />
                ) : null}
                <View
                  style={s.topicCard}
                  accessibilityLiveRegion="polite"
                  testID="daily-news-question"
                >
                  <Icon name="message-circle" color="#242424" size={24} />
                  <Text style={s.small}>
                    {session?.newsSource ? "In the news" : "Your prompt"}
                  </Text>
                  {session?.newsSource ? (
                    <>
                      <Text style={s.body}>{session.newsSource.title}</Text>
                      <Pressable
                        accessibilityRole="link"
                        accessibilityLabel={`Read source at ${session.newsSource.source}`}
                        onPress={() =>
                          void Linking.openURL(
                            session.newsSource!.sourceUrl,
                          ).catch(() =>
                            setError(
                              "Couldn’t open the source. Please try again.",
                            ),
                          )
                        }
                        style={s.quiet}
                      >
                        <Text style={s.small}>
                          {session.newsSource.source} ·{" "}
                          {new Date(
                            session.newsSource.publishedAt,
                          ).toLocaleDateString("en", {
                            month: "short",
                            day: "numeric",
                          })}{" "}
                          ↗
                        </Text>
                      </Pressable>
                    </>
                  ) : null}
                  <Text style={s.topic}>
                    {session?.prompt.question ||
                      (ready
                        ? "Your news question is unavailable."
                        : "Loading today’s question…")}
                  </Text>
                </View>
                <Action
                  label="Start brainstorming"
                  icon="mic"
                  disabled={!session || busy}
                  onPress={nextBoard}
                />
                <Pressable
                  accessibilityRole="button"
                  disabled={busy}
                  onPress={() => void leave()}
                  style={s.quiet}
                >
                  <Text style={s.small}>Back to Home</Text>
                </Pressable>
              </>
            )}
            {step === "board" && board && (
              <>
                <Text style={s.copy}>
                  {session?.newsSource
                    ? session.prompt.question
                    : "A point. A reason. An example."}
                </Text>
                <View style={s.timerPill}>
                  <Icon name="clock" color="#242424" size={17} />
                  <Text style={s.name}>
                    {String(Math.floor(seconds / 60)).padStart(2, "0")}:
                    {String(seconds % 60).padStart(2, "0")}
                  </Text>
                </View>
                <View
                  style={{ width: "100%", maxWidth: 430, alignSelf: "center" }}
                >
                  <DailyBoard
                    board={board}
                    onChange={setBoard}
                    topic={
                      session?.newsSource?.title ||
                      session?.prompt.question ||
                      "My view"
                    }
                    onDone={finishBoard}
                  />
                </View>
                <Text style={s.small}>Typed notes help build your Thought Map when AI feedback is enabled.</Text>
              </>
            )}
            {step === "speak" && (
              <>
                <View style={s.center}>
                  <Text accessibilityRole="header" style={s.title}>
                    Your one-minute pitch
                  </Text>
                  <Text style={s.copy}>One minute. In your own words.</Text>
                </View>
                <AudioInput
                  appearance="daily"
                  onRecorded={recorded}
                  onCancel={() => setStep("entry")}
                  onCaptureActive={setCapturing}
                  busy={busy || !consent}
                />
                {!consent ? (
                  <View style={{ gap: 12 }}>
                    <Text style={s.small}>
                      Allow private recording to begin. Audio is stored for up
                      to 30 days and sent for transcription.
                    </Text>
                    <Action
                      label="Allow Private Recording"
                      onPress={() => void allow()}
                      disabled={busy}
                    />
                  </View>
                ) : null}
              </>
            )}
            {step === "processing" && (
              <>
                <View style={[s.center, { marginTop: 34 }]}>
                  <Svg width={44} height={44} viewBox="0 0 44 44">
                    <Path
                      d="M22 3 Q25 19 41 22 Q25 25 22 41 Q19 25 3 22 Q19 19 22 3Z"
                      fill="none"
                      stroke="#181818"
                      strokeWidth={1.8}
                    />
                  </Svg>
                  <Text accessibilityRole="header" style={s.title}>
                    Analysing Your Response
                  </Text>
                  <Text style={s.copy}>
                    Preparing your speech transcript{`\n`}and personalised
                    feedback…
                  </Text>
                </View>
                <View style={[s.card, { marginTop: 26 }]}>
                  <Status
                    icon="mic"
                    label="Transcribing your response"
                    done={processing === "analyse"}
                  />
                  <View style={s.divider} />
                  <Status
                    icon="bar-chart"
                    label="Analysing your ideas"
                    done={false}
                  />
                </View>
                {error ? (
                  <Action
                    label="Retry Analysis"
                    disabled={busy}
                    onPress={() => void retryProcessing()}
                  />
                ) : null}
              </>
            )}
            {step === "transcript" && (
              <>
                <Text style={s.copy}>
                  Your recording is saved. Check the words before receiving
                  feedback.
                </Text>
                <TextInput
                  accessibilityLabel="Transcript"
                  value={transcript}
                  multiline
                  onChangeText={setTranscript}
                  style={s.input}
                />
                <Action
                  label="Get Feedback"
                  disabled={busy || transcript.trim().length < 20}
                  onPress={() => void submitTranscript()}
                />
                <Action
                  label="Retry Transcription"
                  secondary
                  disabled={busy}
                  onPress={() => void retryProcessing()}
                />
              </>
            )}
            {step === "feedback" && evaluation && (
              <>
                <View style={s.tabs}>
                  {["Overall", "Strengths", "Areas to Improve"].map((name) => (
                    <Pressable
                      key={name}
                      accessibilityRole="tab"
                      accessibilityState={{ selected: tab === name }}
                      aria-selected={tab === name}
                      onPress={() => setTab(name)}
                      style={[s.tab, tab === name && s.tabActive]}
                    >
                      <Text
                        style={[
                          s.tabText,
                          tab === name && { fontFamily: "DMBold" },
                        ]}
                      >
                        {name}
                      </Text>
                    </Pressable>
                  ))}
                </View>
                <View
                  style={{ flexDirection: "row", alignItems: "center", gap: 8 }}
                >
                  {typeof evaluation.overall_score === "number" ? (
                    <Text style={s.score}>
                      {evaluation.overall_score}
                      <Text style={s.copy}> /100</Text>
                    </Text>
                  ) : (
                    <>
                      <Icon name="check-circle" size={16} color={C.forest} />
                    </>
                  )}
                  <Text style={s.small}>
                    {evaluation.provider === "local"
                      ? "Saved · AI feedback unavailable"
                      : "First try · AI feedback"}
                  </Text>
                </View>
                {tab !== "Areas to Improve" ? (
                  <FeedbackLine
                    icon="star"
                    label={tab === "Overall" ? "What worked" : undefined}
                    text={feedback?.strength || evaluation.key_takeaway}
                  />
                ) : null}
                {tab !== "Strengths" ? (
                  <FeedbackLine
                    icon="target"
                    label={tab === "Overall" ? "Try next" : undefined}
                    text={feedback?.priority_gap || evaluation.retry_prompt}
                  />
                ) : null}
                <BridgeSummary evaluation={evaluation} tab={tab} />
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Thought map"
                  onPress={() => setShowMap(!showMap)}
                  aria-expanded={showMap}
                  style={s.disclosure}
                >
                  <Icon name="git-branch" color="#242424" size={18} />
                  <Text style={[s.name, { flex: 1 }]}>Thought map</Text>
                  <Icon
                    name={showMap ? "chevron-up" : "chevron-down"}
                    color="#242424"
                    size={18}
                  />
                </Pressable>
                {showMap && evaluation.thought_map?.nodes.length ? (
                  <ThoughtMapView
                    map={evaluation.thought_map}
                    answer={attempt!.text}
                    topic={attempt!.prompt}
                    notes={attempt!.planningNotes}
                  />
                ) : showMap ? (
                  <Text style={s.small}>
                    A map wasn’t available for this response.
                  </Text>
                ) : null}
                <Action
                  label="Practise guiding questions"
                  icon="mic"
                  onPress={() => setStep("guide")}
                />
                <Action
                  label="Skip practice"
                  secondary
                  onPress={() => setStep("sample-offer")}
                />
              </>
            )}
            {step === "guide" && (
              <>
                {busy ? (
                  <View style={s.center}>
                    <ActivityIndicator color={C.forest} />
                    <Text style={s.small}>Checking your answer…</Text>
                  </View>
                ) : null}
                <Text style={s.copy}>
                  Choose a question. Build on your first answer.
                </Text>
                {guideIndex === null ? (
                  <>
                    {questions.map((q, i) => (
                      <View key={q.question} style={{ gap: 10 }}>
                        <Pressable
                          accessibilityRole="button"
                          disabled={busy}
                          accessibilityLabel={`Practise question ${i + 1}`}
                          onPress={() => {
                            setGuideIndex(i);
                            setGuideTyping(false);
                          }}
                          style={[s.card, s.question]}
                        >
                          <View style={s.number}>
                            <Text style={s.name}>{i + 1}</Text>
                          </View>
                          <Text style={[s.body, { flex: 1 }]}>
                            {q.question}
                          </Text>
                          {answers[i] ? (
                            <Icon name="check" size={17} color="#555" />
                          ) : null}
                        </Pressable>
                        {answers[i] ? (
                          <Pressable
                            accessibilityRole="button"
                            accessibilityLabel={`Review answer ${i + 1}`}
                            onPress={() =>
                              setExpandedGuide(expandedGuide === i ? null : i)
                            }
                            style={s.reviewLink}
                          >
                            <Text style={s.small}>
                              {guideFeedback[i]
                                ? "View feedback"
                                : "Answer saved"}
                            </Text>
                            <Icon
                              name={
                                expandedGuide === i
                                  ? "chevron-up"
                                  : "chevron-down"
                              }
                              size={14}
                            />
                          </Pressable>
                        ) : null}
                        {answers[i] && expandedGuide === i ? (
                          <View style={s.card}>
                            {guideFeedback[i] ? (
                              <>
                                <Text style={s.name}>
                                  {
                                    {
                                      answered: "Answered the question",
                                      partly_answered: "Partly answered",
                                      not_answered: "Question not yet answered",
                                    }[guideFeedback[i]!.status]
                                  }
                                </Text>
                                <Text style={s.body}>
                                  {guideFeedback[i]!.feedback}
                                </Text>
                                <Text style={s.body}>
                                  {guideFeedback[i]!.next_step}
                                </Text>
                                <Text style={s.small}>
                                  AI feedback · provisional
                                </Text>
                              </>
                            ) : (
                              <Action
                                label={`Check answer ${i + 1}`}
                                secondary
                                disabled={busy}
                                onPress={() => void retryGuide(i)}
                              />
                            )}
                          </View>
                        ) : null}
                      </View>
                    ))}
                    <Pressable
                      accessibilityRole="button"
                      disabled={busy}
                      onPress={() => setStep("sample-offer")}
                      style={s.quiet}
                    >
                      <Text style={s.body}>
                        {answers.some(Boolean) ? "Continue" : "Skip practice"}
                      </Text>
                    </Pressable>
                  </>
                ) : (
                  <>
                    <Text style={s.topic}>
                      {questions[guideIndex].question}
                    </Text>
                    {!guideTyping ? (
                      <AudioInput
                        key={guideIndex}
                        appearance="daily"
                        onRecorded={guideRecording}
                        onCancel={() => setGuideIndex(null)}
                        onCaptureActive={setCapturing}
                        busy={busy}
                      />
                    ) : (
                      <>
                        <TextInput
                          accessibilityLabel={`Answer question ${guideIndex + 1}`}
                          multiline
                          value={answers[guideIndex]}
                          placeholder="Your thoughts…"
                          style={s.input}
                          editable={!busy && !capturing}
                          onChangeText={(text) => {
                            setAnswers((items) =>
                              items.map((value, i) =>
                                i === guideIndex ? text : value,
                              ),
                            );
                            setGuideFeedback((items) =>
                              items.map((value, i) =>
                                i === guideIndex ? null : value,
                              ),
                            );
                            setScript(null);
                          }}
                          maxLength={2000}
                        />
                        <Action
                          label="Check my answer"
                          disabled={
                            busy || capturing || !answers[guideIndex].trim()
                          }
                          onPress={() => {
                            const index = guideIndex;
                            setGuideIndex(null);
                            void retryGuide(index);
                          }}
                        />
                      </>
                    )}
                    <Action
                      label={guideTyping ? "Record instead" : "Type instead"}
                      secondary
                      disabled={busy || capturing}
                      onPress={() => setGuideTyping(!guideTyping)}
                    />
                    <Pressable
                      accessibilityRole="button"
                      disabled={capturing || busy}
                      onPress={() => setGuideIndex(null)}
                      style={s.quiet}
                    >
                      <Text style={s.small}>Back to questions</Text>
                    </Pressable>
                  </>
                )}
              </>
            )}
            {step === "sample-offer" && (
              <>
                <Text style={s.copy}>
                  Your ideas, expressed more clearly, with 1–3 new words when available.
                </Text>
                <Action
                  label="View sample script"
                  disabled={busy}
                  onPress={() =>
                    script ? setStep("script") : void generateScript()
                  }
                />
                <Action
                  label="Skip and finish"
                  secondary
                  onPress={() => setStep("complete")}
                />
              </>
            )}
            {step === "script" && (
              <>
                <Text style={s.copy}>Based on what you said.</Text>
                {busy ? (
                  <ActivityIndicator color="#242424" style={{ margin: 50 }} />
                ) : script ? (
                  <View style={s.card}>
                    <Text selectable style={[s.body, { lineHeight: 25 }]}>
                      <ScriptText script={script} />
                    </Text>
                  </View>
                ) : (
                  <Action
                    label="Generate My Script"
                    onPress={() => void generateScript()}
                  />
                )}
                {script ? (
                  <>
                    <Text style={s.name}>
                      New vocabulary ({script.vocabulary?.length || 0})
                    </Text>
                    {script.vocabulary?.length ? (
                      <Text style={s.small}>Pick words to save to My Dictionary.</Text>
                    ) : null}
                    {(script.vocabulary || []).map((word) => {
                      const saved = savedWordIds.includes(word.wordId);
                      const selected = selectedWordIds.includes(word.wordId);
                      return (
                        <Pressable
                          key={word.wordId}
                          accessibilityRole="checkbox"
                          accessibilityLabel={`Save ${word.word}`}
                          aria-checked={saved || selected}
                          accessibilityState={{
                            checked: saved || selected,
                            disabled: busy || saved,
                          }}
                          disabled={busy || saved}
                          style={[
                            s.card,
                            selected && {
                              borderColor: C.forest,
                              backgroundColor: C.cream,
                            },
                          ]}
                          onPress={() =>
                            setSelectedWordIds((ids) =>
                              selected
                                ? ids.filter((id) => id !== word.wordId)
                                : [...ids, word.wordId],
                            )
                          }
                        >
                          <View
                            style={{
                              flexDirection: "row",
                              alignItems: "center",
                              gap: 10,
                            }}
                          >
                            <Icon
                              name={
                                saved || selected ? "check-square" : "square"
                              }
                              size={20}
                              color={C.forest}
                            />
                            <Text style={s.name}>
                              {word.word}
                              {saved ? " · Saved" : ""}
                            </Text>
                          </View>
                          <Text style={s.body}>{word.meaning}</Text>
                        </Pressable>
                      );
                    })}
                    {!script.vocabulary?.length ? (
                      script.vocabularyEligibleCount === 0 ? (
                        <Text style={s.small}>There are no eligible new words for this sample.</Text>
                      ) : (
                        <Action
                          label="Regenerate with vocabulary"
                          secondary
                          disabled={busy}
                          onPress={() => void generateScript()}
                        />
                      )
                    ) : (
                      <Action
                        label="Save selected words"
                        disabled={busy || !selectedWordIds.length}
                        onPress={() => void saveWords()}
                      />
                    )}
                  </>
                ) : null}
                <Action
                  label="Skip and finish"
                  secondary
                  disabled={busy}
                  onPress={() => setStep("complete")}
                />
              </>
            )}
            {step === "complete" && (
              <>
                <View style={[s.center, { marginTop: 38 }]}>
                  <Svg width={64} height={64} viewBox="0 0 64 64">
                    <Path
                      d="M19 8H45V23C45 42 19 42 19 23ZM19 13H10V20C10 28 16 30 21 29M45 13H54V20C54 28 48 30 43 29M32 37V49M24 49H40L43 56H21Z"
                      fill="none"
                      stroke="#242424"
                      strokeWidth={2}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </Svg>
                  <Text accessibilityRole="header" style={s.title}>
                    Challenge Complete!
                  </Text>
                </View>
                <View style={[s.card, s.rewardRow]}>
                  <Reward
                    icon="sun"
                    value={`+${rewards?.seeds || 0}`}
                    label="Seeds"
                  />
                  <Reward
                    icon="bar-chart"
                    value={`+${rewards?.xp || 0}`}
                    label="XP"
                  />
                  <Reward
                    icon="zap"
                    value={String(state?.dailyWorkout?.streak.current || 0)}
                    label="Day Streak"
                  />
                </View>
                <Text style={s.small}>
                  {rewards?.reason || "Rewards recognise your participation."}
                </Text>
                {savedWordIds.length ? (
                  <Text style={s.copy}>
                    Your selected words are saved to My Dictionary.
                  </Text>
                ) : null}
                <Action label="Continue" onPress={() => void leave()} />
              </>
            )}
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const bridgeCriteria = getBridgeRubric().criteria;
const bridgeHints: Record<string, string> = {
  B: "Your main point",
  R: "Why you think so",
  I: "Examples that support your point",
  D: "Other views, when relevant",
  G: "How your ideas connect",
  E: "Clear wording, not pronunciation",
};
function BridgeSummary({
  evaluation,
  tab,
}: {
  evaluation: Evaluation;
  tab: string;
}) {
  return (
    <View accessibilityLabel="BRIDGE framework" style={{ gap: 12 }}>
      {bridgeCriteria.map((criterion) => {
        const dimension = evaluation.dimensions.find(
          (item) => item.key === criterion.key,
        );
        const unavailable = evaluation.provider === "local";
        const unassessed = !dimension || dimension.status === "not_assessed";
        return (
          <View
            key={criterion.key}
            testID={`bridge-criterion-${criterion.key}`}
            style={s.bridgeCard}
          >
            <View style={s.bridgeHeader}>
              <View style={s.bridgeLetter}>
                <Text style={s.bridgeLetterText}>{criterion.key}</Text>
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={s.name}>{criterion.label}</Text>
                <Text style={s.small}>{bridgeHints[criterion.key]}</Text>
              </View>
            </View>
            {unavailable ? (
              <Text style={s.small}>AI feedback unavailable.</Text>
            ) : unassessed ? (
              <Text style={s.small}>Not assessed for this question.</Text>
            ) : (
              <>
                {dimension.status === "insufficient_evidence" ? (
                  <Text style={s.small}>Not enough evidence yet.</Text>
                ) : null}
                {tab !== "Areas to Improve" && dimension.strength ? (
                  <View style={s.bridgeFeedback}>
                    <Text style={s.bridgeLabel}>What worked</Text>
                    <Text style={s.bridgeText}>{dimension.strength}</Text>
                  </View>
                ) : null}
                {tab !== "Strengths" && dimension.improvement ? (
                  <View style={[s.bridgeFeedback, s.bridgeNext]}>
                    <Text style={s.bridgeLabel}>Try next</Text>
                    <Text style={s.bridgeText}>{dimension.improvement}</Text>
                  </View>
                ) : null}
              </>
            )}
          </View>
        );
      })}
    </View>
  );
}

function ScriptText({ script }: { script: GuidedResponseDraft }) {
  let cursor = 0;
  const fragments: React.ReactNode[] = [];
  const highlights = (script.vocabulary || [])
    .flatMap((word) =>
      word.spans.map((span) => ({
        ...span,
        quote: script.text.slice(span.start, span.end),
      })),
    )
    .sort((a, b) => a.start - b.start);
  for (const annotation of highlights) {
    fragments.push(script.text.slice(cursor, annotation.start));
    fragments.push(
      <Text key={annotation.start} style={{ backgroundColor: C.sage }}>
        {annotation.quote}
      </Text>,
    );
    cursor = annotation.end;
  }
  fragments.push(script.text.slice(cursor));
  return <>{fragments}</>;
}

function Action({
  label,
  onPress,
  icon,
  disabled = false,
  secondary = false,
}: {
  label: string;
  onPress: () => void;
  icon?: string;
  disabled?: boolean;
  secondary?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        s.action,
        secondary && s.actionSecondary,
        (disabled || pressed) && { opacity: 0.55 },
      ]}
    >
      {icon ? (
        <Icon name={icon} color={secondary ? "#242424" : "#fff"} size={19} />
      ) : null}
      <Text style={[s.actionText, secondary && { color: "#242424" }]}>
        {label}
      </Text>
      {!secondary ? <Icon name="chevron-right" color="#fff" size={19} /> : null}
    </Pressable>
  );
}
function Status({
  icon,
  label,
  done,
}: {
  icon: string;
  label: string;
  done: boolean;
}) {
  return (
    <View style={s.status}>
      <Icon name={icon} color="#242424" size={21} />
      <Text style={[s.body, { flex: 1, fontSize: 13 }]}>{label}</Text>
      {done ? (
        <Icon name="check" color="#242424" size={20} />
      ) : (
        <ActivityIndicator size="small" color="#bbb" />
      )}
    </View>
  );
}
function FeedbackLine({
  icon,
  text,
  label,
}: {
  icon: string;
  text: string;
  label?: string;
}) {
  return (
    <View style={s.feedbackLine}>
      <Icon name={icon} color="#555" size={19} />
      <View style={{ flex: 1, gap: 6 }}>
        {label ? <Text style={s.name}>{label}</Text> : null}
        <Text style={[s.body, { fontSize: 14 }]}>{text}</Text>
      </View>
    </View>
  );
}
function Reward({
  icon,
  value,
  label,
}: {
  icon: string;
  value: string;
  label: string;
}) {
  return (
    <View style={s.reward}>
      <Icon name={icon} color="#242424" size={30} />
      <Text style={[s.name, { marginTop: 8 }]}>{value}</Text>
      <Text style={s.body}>{label}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  bridgeCard: {
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 12,
    padding: 14,
    gap: 12,
    backgroundColor: C.paper,
  },
  bridgeHeader: { flexDirection: "row", alignItems: "center", gap: 10 },
  bridgeLetter: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: C.sage,
    alignItems: "center",
    justifyContent: "center",
  },
  bridgeLetterText: { fontFamily: "DMBold", fontSize: 18, color: C.ink },
  bridgeFeedback: { gap: 4 },
  bridgeNext: {
    backgroundColor: C.cream,
    borderRadius: 8,
    padding: 10,
  },
  bridgeLabel: { fontFamily: "DMBold", fontSize: 12, color: C.muted },
  bridgeText: { fontFamily: "DM", fontSize: 14, lineHeight: 21, color: C.ink },
  root: { flex: 1, backgroundColor: C.cream },
  scroll: {
    flexGrow: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: C.cream,
    paddingHorizontal: 12,
    paddingVertical: 24,
  },
  phone: {
    width: "100%",
    maxWidth: 680,
    backgroundColor: C.paper,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 24,
    padding: 24,
    gap: 20,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginHorizontal: -12,
    minHeight: 34,
    gap: 2,
  },
  back: {
    width: 38,
    height: 38,
    justifyContent: "center",
    alignItems: "center",
  },
  heading: {
    flex: 1,
    fontFamily: "DMBold",
    fontSize: 20,
    lineHeight: 26,
    color: C.ink,
    textAlign: "center",
  },
  title: {
    fontFamily: "DMBold",
    fontSize: 24,
    lineHeight: 30,
    color: C.ink,
    textAlign: "center",
  },
  center: { alignItems: "center", gap: 14 },
  copy: {
    fontFamily: "DM",
    fontSize: 14,
    lineHeight: 21,
    color: "#181818",
    textAlign: "center",
  },
  body: { fontFamily: "DM", fontSize: 15, lineHeight: 22, color: "#181818" },
  small: { fontFamily: "DM", fontSize: 12, lineHeight: 18, color: "#666" },
  name: { fontFamily: "DMBold", fontSize: 14, color: "#181818" },
  profile: {
    flexDirection: "row",
    gap: 10,
    alignItems: "center",
    marginHorizontal: -4,
  },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: 24,
    borderWidth: 1.3,
    borderColor: "#242424",
    alignItems: "center",
    justifyContent: "center",
  },
  wallet: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    padding: 8,
    borderWidth: 1,
    borderColor: "#eee",
    borderRadius: 24,
  },
  progress: {
    width: 104,
    height: 7,
    borderRadius: 5,
    backgroundColor: "#eee",
    overflow: "hidden",
  },
  progressFill: { height: "100%", backgroundColor: "#666", borderRadius: 5 },
  topicCard: {
    backgroundColor: C.cream,
    borderRadius: 18,
    padding: 20,
    minHeight: 160,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    marginTop: 0,
  },
  topic: {
    fontFamily: "DMBold",
    fontSize: 18,
    lineHeight: 24,
    color: "#111",
    textAlign: "center",
  },
  action: {
    minHeight: 48,
    borderRadius: 10,
    backgroundColor: C.forest,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 9,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  actionSecondary: { backgroundColor: "transparent" },
  actionText: {
    fontFamily: "DMBold",
    fontSize: 14,
    color: "#fff",
    textAlign: "center",
  },
  quiet: { minHeight: 44, alignItems: "center", justifyContent: "center" },
  timerPill: {
    alignSelf: "center",
    flexDirection: "row",
    gap: 7,
    paddingVertical: 7,
    paddingHorizontal: 17,
    borderRadius: 10,
    backgroundColor: C.sage,
  },
  card: {
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 12,
    padding: 17,
    backgroundColor: C.paper,
    gap: 10,
  },
  status: {
    flexDirection: "row",
    gap: 14,
    alignItems: "center",
    minHeight: 38,
  },
  divider: { height: 1, backgroundColor: "#f3f3f3" },
  tabs: {
    flexDirection: "row",
    gap: 3,
    padding: 3,
    backgroundColor: C.cream,
    borderRadius: 12,
  },
  tab: {
    flex: 1,
    minHeight: 40,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: "transparent",
    backgroundColor: "transparent",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 5,
  },
  tabActive: { backgroundColor: C.sage, borderColor: C.border },
  tabText: {
    fontFamily: "DMMedium",
    fontSize: 11,
    color: "#181818",
    textAlign: "center",
  },
  score: { fontFamily: "DMBold", fontSize: 38, color: "#111" },
  feedbackLine: {
    flexDirection: "row",
    gap: 12,
    alignItems: "flex-start",
    paddingVertical: 12,
  },
  reviewLink: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 6,
  },
  disclosure: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minHeight: 48,
    backgroundColor: C.cream,
    paddingHorizontal: 10,
    borderRadius: 10,
  },
  number: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#eee",
    alignItems: "center",
    justifyContent: "center",
  },
  question: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    gap: 13,
  },
  rewardRow: {
    flexDirection: "row",
    justifyContent: "space-around",
    marginTop: 28,
    paddingVertical: 24,
  },
  reward: { alignItems: "center", gap: 4, flex: 1 },
  input: {
    fontFamily: "DM",
    color: "#181818",
    fontSize: 15,
    lineHeight: 22,
    minHeight: 170,
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 14,
    padding: 14,
    textAlignVertical: "top",
  },
  error: { padding: 12, backgroundColor: "#fff3ef", borderRadius: 12 },
});
