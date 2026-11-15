import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
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
  BrainstormBoard,
  Job,
  Session,
  WordBloomSummary,
} from "../types";
import { getThoughtGuide } from "../../shared/thought-guide.mjs";
import {
  isGuidedResponseDraft,
  type GuidedResponseDraft,
} from "../../shared/guided-response.mjs";
import AudioInput, { type RecordedAudio } from "../components/AudioInput";
import { DailyBoard, createDailyBoard } from "../components/DailyBoard";
import { ThoughtMapView } from "../components/ThoughtMap";
import { Icon } from "../components/ui";
import Svg, { Path } from "react-native-svg";

type Step =
  | "entry"
  | "board"
  | "speak"
  | "processing"
  | "transcript"
  | "feedback"
  | "guide"
  | "script"
  | "complete";
interface Draft {
  version: 1;
  step: Step;
  session: Session;
  board: BrainstormBoard | null;
  attempt: Attempt | null;
  answers: string[];
  script: GuidedResponseDraft | null;
  submissionKey: string;
  words?: WordBloomSummary["words"];
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
  const [retryAttempt] = useState(requestedAttempt);
  const [step, setStep] = useState<Step>("entry");
  const [session, setSession] = useState<Session | null>(null);
  const [board, setBoard] = useState<BrainstormBoard | null>(null);
  const [attempt, setAttempt] = useState<Attempt | null>(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [seconds, setSeconds] = useState(45);
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
  const [script, setScript] = useState<GuidedResponseDraft | null>(null);
  const [vocab, setVocab] = useState(false);
  const [words, setWords] = useState<WordBloomSummary["words"]>([]);
  const submissionKey = useRef(unique());
  const sessionKey = useRef(unique());
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
        if (saved?.version === 1) {
          setSession(saved.session);
          setBoard(saved.board);
          setAttempt(saved.attempt);
          setAnswers(saved.answers);
          setScript(saved.script);
          setWords(saved.words || []);
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
  }, [storage, retryAttempt]);

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
      words,
    };
    void saveDraft(storage, JSON.stringify(draft)).catch(() => {
      if (mounted.current)
        setError(
          "This device couldn’t save your draft. Keep this screen open.",
        );
    });
  }, [ready, session, board, attempt, answers, script, step, storage, words]);

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
      setGuideIndex(null);
    } catch (cause) {
      setError(message(cause));
    } finally {
      lock.current = false;
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
            questions,
            answers: answers.some((v) => v.trim())
              ? answers
              : [attempt.text, "", ""],
          },
        },
      );
      if (!isGuidedResponseDraft(result))
        throw new Error(
          "The sample script couldn’t be checked. Please try again.",
        );
      setScript(result);
      const summary = await api<WordBloomSummary>("/wordbloom/summary").catch(
        () => null,
      );
      setWords(
        summary?.words
          .filter((word) =>
            attempt.wordBloom?.discoveredWordIds.includes(word.id),
          )
          .slice(0, 3) || [],
      );
    } catch (cause) {
      setError(message(cause));
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  function nextBoard() {
    setBoard(createDailyBoard());
    setSeconds(45);
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
    else if (step === "guide" || step === "script" || step === "complete")
      setStep("feedback");
    else void leave();
  }
  const evaluation = attempt?.evaluation;
  const feedback = evaluation?.feedback;
  const title = (
    {
      board: "Prepare Your Answer",
      speak: "Speak Your Response",
      feedback: "Your Feedback",
      guide: "Guiding Questions",
      script: "Your Improved Script",
      transcript: "Review Your Transcript",
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
        <View style={s.phone} testID={`daily-screen-${step}`}>
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
            </View>
          ) : null}
          {!ready ? (
            <ActivityIndicator color="#242424" style={{ margin: 80 }} />
          ) : null}
          {step === "entry" && (
            <>
              <View style={s.profile}>
                <View style={s.avatar}>
                  <Icon name="user" color="#242424" size={28} />
                </View>
                <View style={{ flex: 1, gap: 6 }}>
                  <Text style={s.name}>
                    {state?.profile.displayName}{" "}
                    <Text style={s.small}> {state?.xp || 0} XP</Text>
                  </Text>
                  <View style={s.progress}>
                    <View
                      style={[
                        s.progressFill,
                        {
                          width: `${Math.min(100, (state?.dailyWorkout?.completed || 0) * 50)}%`,
                        },
                      ]}
                    />
                  </View>
                </View>
                <View style={s.wallet}>
                  <Icon name="sun" size={17} color="#a8894c" />
                  <Text style={s.name}>{state?.wallet.seeds || 0} {state?.wallet.seeds === 1 ? "seed" : "seeds"}</Text>
                </View>
              </View>
              <View style={[s.center, { marginTop: 36 }]}>
                <Icon name="calendar" color="#181818" size={32} />
                <Text accessibilityRole="header" style={s.title}>
                  Daily Challenge
                </Text>
                <Text style={s.copy}>
                  {dailyCompleted
                    ? "Today’s speaking challenge is complete.\nKeep practising with another response."
                    : "A new speaking challenge is ready!\nComplete it to earn XP and work\ntowards your daily streak."}
                </Text>
              </View>
              <View style={s.topicCard}>
                <Icon name="message-circle" color="#242424" size={24} />
                <Text style={s.small}>Today’s Topic</Text>
                <Text style={s.topic}>
                  {session?.prompt.question || "Loading today’s question…"}
                </Text>
              </View>
              <Action
                label="Speak a Response"
                icon="mic"
                disabled={!session || busy}
                onPress={nextBoard}
              />
              <Pressable
                accessibilityRole="button"
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
                Jot down and organise your ideas{`\n`}on the whiteboard. (45s)
              </Text>
              <View style={s.timerPill}>
                <Icon name="clock" color="#242424" size={17} />
                <Text style={s.name}>
                  00:{String(seconds).padStart(2, "0")}
                </Text>
              </View>
              <DailyBoard
                board={board}
                onChange={setBoard}
                topic={session?.prompt.question || "My view"}
                onDone={finishBoard}
              />
            </>
          )}
          {step === "speak" && (
            <>
              <View style={s.center}>
                <Text accessibilityRole="header" style={s.title}>
                  Speak Your Response
                </Text>
                <Text style={s.copy}>
                  Share your thoughts clearly and{`\n`}confidently in 1 minute.
                </Text>
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
                    Allow private recording to begin. Audio is stored for up to
                    30 days and sent for transcription.
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
                <Svg width={44} height={44} viewBox="0 0 44 44"><Path d="M22 3 Q25 19 41 22 Q25 25 22 41 Q19 25 3 22 Q19 19 22 3Z" fill="none" stroke="#181818" strokeWidth={1.8} /></Svg>
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
                    onPress={() => setTab(name)}
                    style={[s.tab, tab === name && s.tabActive]}
                  >
                    <Text
                      style={[s.tabText, tab === name && { color: "#fff" }]}
                    >
                      {name}
                    </Text>
                  </Pressable>
                ))}
              </View>
              <View
                style={[
                  s.card,
                  { alignItems: "center", gap: 9, paddingVertical: 22 },
                ]}
              >
                {typeof evaluation.overall_score === "number" ? (
                  <Text style={s.score}>
                    {evaluation.overall_score}
                    <Text style={s.copy}> /100</Text>
                  </Text>
                ) : (
                  <>
                    <Icon name="check-circle" size={32} color="#555" />
                    <Text style={s.heading}>
                      {evaluation.provider === "local"
                        ? "Response saved"
                        : "Feedback ready"}
                    </Text>
                  </>
                )}
                <Text style={s.small}>
                  {evaluation.provider === "local"
                    ? "Self-review · no scores"
                    : "Provisional BRIDGE feedback"}
                </Text>
              </View>
              {tab !== "Areas to Improve" ? (
                <FeedbackLine
                  icon="star"
                  text={feedback?.strength || evaluation.key_takeaway}
                />
              ) : null}
              {tab !== "Strengths" ? (
                <FeedbackLine
                  icon="target"
                  text={feedback?.priority_gap || evaluation.retry_prompt}
                />
              ) : null}
              {tab === "Overall" ? (
                <FeedbackLine
                  icon="trending-up"
                  text={feedback?.next_question || evaluation.retry_prompt}
                />
              ) : (
                evaluation.dimensions
                  .filter((d) =>
                    tab === "Strengths" ? d.strength : d.improvement,
                  )
                  .map((d) => (
                    <FeedbackLine
                      key={d.key}
                      icon="check"
                      text={`${d.label || d.key}: ${tab === "Strengths" ? d.strength : d.improvement}`}
                    />
                  ))
              )}
              <Pressable
                accessibilityRole="button"
                onPress={() => setShowMap(!showMap)}
                style={s.disclosure}
              >
                <Icon name="git-branch" color="#242424" size={18} />
                <Text style={s.name}>Your Thought Map</Text>
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
                />
              ) : showMap ? (
                <Text style={s.small}>
                  A map wasn’t available for this response.
                </Text>
              ) : null}
              <Action label="Continue" onPress={() => setStep("guide")} />
            </>
          )}
          {step === "guide" && (
            <>
              <Text style={s.copy}>
                Practise these questions to strengthen{`\n`}your response.
              </Text>
              {guideIndex === null ? (
                <>
                  {questions.map((q, i) => (
                    <Pressable
                      key={q.question}
                      accessibilityRole="button"
                      accessibilityLabel={`Practise question ${i + 1}`}
                      onPress={() => setGuideIndex(i)}
                      style={[s.card, s.question]}
                    >
                      <View style={s.number}>
                        <Text style={s.name}>{i + 1}</Text>
                      </View>
                      <Text style={[s.body, { flex: 1 }]}>{q.question}</Text>
                      {answers[i] ? (
                        <Icon name="check" size={17} color="#555" />
                      ) : null}
                    </Pressable>
                  ))}
                  <Action
                    label="Practise Guiding Questions"
                    icon="mic"
                    onPress={() => setGuideIndex(0)}
                  />
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => void generateScript()}
                    style={s.quiet}
                  >
                    <Text style={s.body}>
                      {answers.some(Boolean)
                        ? "Create My Improved Script"
                        : "Skip for Now"}
                    </Text>
                  </Pressable>
                </>
              ) : (
                <>
                  <Text style={s.topic}>{questions[guideIndex].question}</Text>
                  <AudioInput
                    key={guideIndex}
                    appearance="daily"
                    onRecorded={guideRecording}
                    onCancel={() => setGuideIndex(null)}
                    onCaptureActive={setCapturing}
                    busy={busy}
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
          {step === "script" && (
            <>
              <Text style={s.copy}>
                A sample response based on your answer,{`\n`}with your ideas
                expressed more clearly.
              </Text>
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
              <Pressable
                accessibilityRole="button"
                onPress={() => setVocab(!vocab)}
                style={s.disclosure}
              >
                <Icon name="book-open" color="#242424" size={20} />
                <Text style={[s.name, { flex: 1 }]}>
                  New Vocabulary ({words.length})
                </Text>
                <Icon
                  name={vocab ? "chevron-up" : "chevron-down"}
                  size={20}
                  color="#242424"
                />
              </Pressable>
              {vocab ? (
                words.length ? (
                  words.map((word) => (
                    <View key={word.id} style={s.card}>
                      <Text style={s.name}>{word.word}</Text>
                      <Text style={s.body}>{word.meaning}</Text>
                    </View>
                  ))
                ) : (
                  <Text style={s.small}>
                    No new WordBloom words were added for this response.
                  </Text>
                )
              ) : null}
              <Action
                label="Continue"
                disabled={busy}
                onPress={() => setStep("complete")}
              />
            </>
          )}
          {step === "complete" && (
            <>
              <View style={[s.center, { marginTop: 38 }]}>
                <Svg width={64} height={64} viewBox="0 0 64 64"><Path d="M19 8H45V23C45 42 19 42 19 23ZM19 13H10V20C10 28 16 30 21 29M45 13H54V20C54 28 48 30 43 29M32 37V49M24 49H40L43 56H21Z" fill="none" stroke="#242424" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" /></Svg>
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
              <Action label="Continue" onPress={() => void leave()} />
            </>
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function ScriptText({ script }: { script: GuidedResponseDraft }) {
  let cursor = 0;
  const fragments: React.ReactNode[] = [];
  for (const annotation of script.annotations.slice(0, 3)) {
    fragments.push(script.text.slice(cursor, annotation.start));
    fragments.push(<Text key={annotation.start} style={{ backgroundColor: "#ede6dd" }}>{annotation.quote}</Text>);
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
function FeedbackLine({ icon, text }: { icon: string; text: string }) {
  return (
    <View style={s.feedbackLine}>
      <Icon name={icon} color="#555" size={19} />
      <Text style={[s.body, { flex: 1, fontSize: 14 }]}>{text}</Text>
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
  root: { flex: 1, backgroundColor: "#fff" },
  scroll: {
    flexGrow: 1,
    alignItems: "center",
    backgroundColor: "#fff",
    paddingHorizontal: 12,
    paddingVertical: 16,
  },
  phone: {
    width: "100%",
    maxWidth: 390,
    minHeight: 540,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#e7e7e7",
    borderRadius: 26,
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
    color: "#111",
    textAlign: "center",
  },
  title: {
    fontFamily: "DMBold",
    fontSize: 24,
    lineHeight: 30,
    color: "#111",
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
    backgroundColor: "#f8f8f8",
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
    borderRadius: 28,
    backgroundColor: "#242424",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 9,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  actionSecondary: { backgroundColor: "#f5f5f5" },
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
    borderRadius: 22,
    backgroundColor: "#f1eeea",
  },
  card: {
    borderWidth: 1,
    borderColor: "#eee",
    borderRadius: 17,
    padding: 17,
    backgroundColor: "#fff",
    gap: 10,
    boxShadow: "0 2px 4px #00000004",
  },
  status: {
    flexDirection: "row",
    gap: 14,
    alignItems: "center",
    minHeight: 38,
  },
  divider: { height: 1, backgroundColor: "#f3f3f3" },
  tabs: { flexDirection: "row", gap: 4 },
  tab: {
    flex: 1,
    minHeight: 36,
    borderRadius: 22,
    backgroundColor: "#f4f4f4",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 5,
  },
  tabActive: { backgroundColor: "#242424" },
  tabText: {
    fontFamily: "DMMedium",
    fontSize: 11,
    color: "#181818",
    textAlign: "center",
  },
  score: { fontFamily: "DMBold", fontSize: 38, color: "#111" },
  feedbackLine: { flexDirection: "row", gap: 15, alignItems: "flex-start" },
  disclosure: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minHeight: 48,
    backgroundColor: "#fafafa",
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
