import { useTheme, createThemedStyles } from "../theme/ThemeProvider";
import React, { useEffect, useId, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Easing,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Svg, {
  Circle,
  Defs,
  G,
  LinearGradient,
  Path,
  Stop,
} from "react-native-svg";
import {
  api,
  API_BASE,
  deleteDraft,
  loadDraft,
  saveDraft,
  uploadAudio,
} from "../lib/api";
import { useApp } from "../lib/state";
import { DailySpeaking } from "./DailySpeaking";
import { ConfirmedUnlocks } from "../role3/ConfirmedUnlocks";
import { Article, Attempt, Job, Mode, Prompt, Session } from "../types";
import {
  Button,
  Card,
  ErrorNote,
  Field,
  Heading,
  Icon,
  Tag,
} from "../components/ui";
import { GrowBreakdown } from "../components/GrowBreakdown";
import { AssessmentCriteria } from "../components/AssessmentCriteria";
import { BridgeFeedback } from "../components/BridgeFeedback";
import { ThoughtTrail } from "../components/ThoughtTrail";
import { ThoughtGuide } from "../components/ThoughtGuide";
import {
  createPlanningBoard,
  planningBoardNotes,
  type PlanningBoard,
} from "../../shared/planning-board.mjs";
import { IdeasBoard, IdeasPreview } from "../components/IdeasBoard";
import { RecordingConsent } from "../components/RecordingConsent";
import { SelfReflection } from "../components/SelfReflection";
import { MotionPulse, MotionView } from "../components/Motion";
import { useReducedMotion } from "../hooks/useReducedMotion";
import AudioInput, {
  AudioPlayback,
  RecordedAudio,
} from "../components/AudioInput";

const names: Record<Mode, string> = {
  spin_speak: "Spin & Speak",
  debate: "AI Debate",
  read_reflect: "Read & Reflect",
};
const categories = [
  "All topics",
  "Technology",
  "Science",
  "Society",
  "Culture",
  "Environment",
  "Business",
];
type Stage =
  "setup" | "prep" | "edit" | "debate" | "reflect" | "processing" | "result";
type DebateSession = Session & {
  attemptId?: string;
  jobId?: string;
  provider?: string;
};
interface PracticeDraft {
  session: Session;
  text: string;
  selfReflection?: string;
  planningNotes?: string;
  planningBoard?: PlanningBoard;
  prepDeadline?: number;
  transcriptEdited?: boolean;
  transcriptionMessage?: string;
  stage: Stage;
  attempt: Attempt | null;
  jobId: string;
  audioUri: string;
  audioId: string;
  responseType: "text" | "audio";
  retryOf?: string;
  submissionKey: string;
  turnKey: string;
}
function newKey() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}
function errorMessage(e: unknown) {
  return e instanceof Error
    ? e.message
    : "Something went wrong. Your draft is still here; please try again.";
}

function Chip({
  children,
  selected,
  onPress,
}: {
  children: React.ReactNode;
  selected: boolean;
  onPress: () => void;
}) {
  const { C, T } = useTheme();
  const s = useStyles();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[s.chip, selected && s.chipSelected]}
    >
      <Text
        style={[
          T.small,
          { fontFamily: "DMMedium", color: selected ? C.onPrimary : C.forest },
        ]}
      >
        {children}
      </Text>
    </Pressable>
  );
}

function PetalWheel({
  rotation,
  busy,
  onSpin,
}: {
  rotation: Animated.Value;
  busy: boolean;
  onSpin: () => void;
}) {
  const { C } = useTheme();
  const s = useStyles();

  const gradientId = useId().replace(/:/g, "");
  const [focused, setFocused] = useState(false);
  const [hovered, setHovered] = useState(false);
  const colors = [
    ["#DCE7C8", "#B7CDA4"],
    ["#F3DDCD", "#DEBCA7"],
    [C.accentSurface, C.accent],
    ["#F3E8B9", "#DFCE8E"],
    ["#D9E7D6", "#AFCBAF"],
    ["#F3DDCD", "#DEBCA7"],
    [C.accentSurface, C.accent],
    ["#F3E8B9", "#DFCE8E"],
  ];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Spin flower wheel to choose a challenge"
      accessibilityState={{ disabled: busy, busy }}
      aria-busy={busy}
      disabled={busy}
      onPress={onSpin}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      style={[s.wheelContainer, focused && s.wheelFocused]}
    >
      {({ pressed }) => (
        <>
          <View pointerEvents="none" style={s.wheelTrack}>
            <Svg width="100%" height="100%" viewBox="0 0 280 280">
              <Circle cx="140" cy="140" r="136" fill="none" stroke="#E3E7DB" />
            </Svg>
          </View>
          <Animated.View
            pointerEvents="none"
            style={[
              s.wheel,
              {
                transform: [
                  {
                    rotate: rotation.interpolate({
                      inputRange: [0, 1],
                      outputRange: ["0deg", "1080deg"],
                    }),
                  },
                ],
              },
            ]}
          >
            <Svg width="100%" height="100%" viewBox="0 0 280 280">
              <Defs>
                {colors.map(([light, shade], index) => (
                  <LinearGradient
                    key={index}
                    id={`${gradientId}-petal-${index}`}
                    x1="0"
                    y1="0"
                    x2="0.4"
                    y2="1"
                  >
                    <Stop offset="0" stopColor={light} />
                    <Stop offset="1" stopColor={shade} />
                  </LinearGradient>
                ))}
              </Defs>
              {colors.map((_, index) => (
                <G key={index} rotation={index * 45} origin="140, 140">
                  <Path
                    d="M140 140 L98 39 Q94 29 103 23 C124 9 156 9 177 23 Q186 29 182 39 Z"
                    fill={`url(#${gradientId}-petal-${index})`}
                    stroke={C.cream}
                    strokeWidth="3"
                    strokeLinejoin="round"
                  />
                  <Path
                    d="M125 27 Q140 21 155 27"
                    fill="none"
                    stroke={C.paper}
                    strokeOpacity="0.5"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                </G>
              ))}
            </Svg>
          </Animated.View>
          <View pointerEvents="none" style={s.wheelHubPosition}>
            <View
              style={[
                s.wheelMiddle,
                !busy && (pressed || hovered) && s.wheelMiddleActive,
              ]}
            >
              {busy ? (
                <ActivityIndicator color={C.cream} />
              ) : (
                <Icon name="rotate-cw" size={22} color={C.cream} />
              )}
              <Text style={s.wheelLabel}>{busy ? "Spinning" : "Spin"}</Text>
            </View>
          </View>
          <View pointerEvents="none" style={s.pointer}>
            <Svg width="24" height="28" viewBox="0 0 24 28">
              <Path
                d="M4 5 Q12 1 20 5 Q22 6 21 9 L14 24 Q12 27 10 24 L3 9 Q2 6 4 5 Z"
                fill={C.forest}
                stroke={C.cream}
                strokeWidth="2"
              />
            </Svg>
          </View>
        </>
      )}
    </Pressable>
  );
}

export function Practice(props: React.ComponentProps<typeof ClassicPractice>) {
  const { state } = useApp();
  if (props.mode === "spin_speak" && state?.profile.dailyWorkout)
    return (
      <DailySpeaking
        onClose={props.onClose}
        onComplete={props.onComplete}
        onStepChange={props.onResultShown}
        retryAttempt={props.retryAttempt}
      />
    );
  return <ClassicPractice {...props} />;
}

function ClassicPractice({
  mode,
  article,
  retryAttempt,
  onClose,
  onComplete,
  onResultShown,
  onGarden,
}: {
  mode: Mode;
  article?: Article;
  retryAttempt?: Attempt;
  onClose: () => void;
  onComplete: (attempt: Attempt) => void;
  onResultShown?: () => void;
  onGarden: () => void;
}) {
  const { C, T } = useTheme();
  const s = useStyles();

  // The router remounts on a new challenge/retry ID. Keep this snapshot stable
  // when a global refresh replaces the same saved attempt with a new object.
  const [startingRetryAttempt] = useState(retryAttempt);
  const { state: appState, refresh } = useApp();
  const prefersReducedMotion = useReducedMotion();
  const [recordingConsent, setRecordingConsent] = useState(
    Boolean(appState?.profile.consent?.recording),
  );
  const [stage, setStage] = useState<Stage>("setup");
  const [session, setSession] = useState<Session | null>(null);
  const [text, setText] = useState("");
  const [planningNotes, setPlanningNotes] = useState("");
  const [planningBoard, setPlanningBoard] = useState<PlanningBoard>(() =>
    createPlanningBoard(),
  );
  const [planningGesture, setPlanningGesture] = useState(false);
  const [selfReflection, setSelfReflection] = useState("");
  const [reflectionExpanded, setReflectionExpanded] = useState(false);
  const [showResponse, setShowResponse] = useState(false);
  const [transcriptEdited, setTranscriptEdited] = useState(false);
  const [transcriptionMessage, setTranscriptionMessage] = useState("");
  const [category, setCategory] = useState("All topics");
  const [prompts, setPrompts] = useState<Prompt[]>([]);
  const [promptId, setPromptId] = useState("");
  const [position, setPosition] = useState("for");
  const [rounds, setRounds] = useState(2);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [prep, setPrep] = useState(15);
  const [prepDeadline, setPrepDeadline] = useState<number>();
  const [input, setInput] = useState<"text" | "audio">(
    mode === "read_reflect" ? "audio" : "text",
  );
  const [audioUri, setAudioUri] = useState("");
  const [audioId, setAudioId] = useState("");
  const [attempt, setAttempt] = useState<Attempt | null>(null);
  const [jobId, setJobId] = useState("");
  const [retryOf, setRetryOf] = useState(
    startingRetryAttempt?.status === "draft"
      ? startingRetryAttempt.retryOf
      : startingRetryAttempt?.id,
  );
  const [retryGuide, setRetryGuide] = useState<Pick<
    Attempt,
    "id" | "evaluation"
  > | null>(startingRetryAttempt?.evaluation ? startingRetryAttempt : null);
  const savedRetryGuide = appState?.attempts.find(
    (savedAttempt) => savedAttempt.id === retryOf,
  );
  const guideEvaluation =
    retryGuide?.id === retryOf
      ? retryGuide?.evaluation
      : savedRetryGuide?.evaluation;
  const [busy, setBusy] = useState(false);
  const [recordingActive, setRecordingActive] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [ready, setReady] = useState(false);
  const [pollVersion, setPollVersion] = useState(0);
  const [debateProvider, setDebateProvider] = useState("");
  const [jobFailed, setJobFailed] = useState(false);
  const [rotation] = useState(() => new Animated.Value(0));
  const reducedMotion = useRef(prefersReducedMotion);
  const wheelAnimation = useRef<Animated.CompositeAnimation | null>(null);
  const finishWheel = useRef<(() => void) | null>(null);
  const mounted = useRef(true);
  const submissionKey = useRef(newKey());
  const turnKey = useRef(newKey());
  const sessionKey = useRef(newKey());
  const inFlight = useRef(false);
  const completeRef = useRef(onComplete);
  useEffect(() => {
    completeRef.current = onComplete;
  }, [onComplete]);
  useEffect(() => {
    if (stage !== "result") return;
    const frame = requestAnimationFrame(() => onResultShown?.());
    return () => cancelAnimationFrame(frame);
  }, [stage, onResultShown]);
  // Server-saved audio drafts resume the original editor, including corrections
  // saved only on this device, rather than starting a new retry of the draft.
  const draftKey = `practice:${mode}:${article?.id || ""}:${startingRetryAttempt?.status === "draft" ? startingRetryAttempt.retryOf || "" : startingRetryAttempt?.id || ""}`;
  const draftStorageKey = useRef(draftKey);
  const pendingAttemptId = attempt?.id;

  useEffect(() => {
    reducedMotion.current = prefersReducedMotion;
    if (prefersReducedMotion) {
      wheelAnimation.current?.stop();
      finishWheel.current?.();
      rotation.setValue(1);
    }
  }, [prefersReducedMotion, rotation]);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      wheelAnimation.current?.stop();
      finishWheel.current?.();
    };
  }, []);

  useEffect(() => {
    if (!retryOf || guideEvaluation || retryGuide?.id === retryOf) return;
    let active = true;
    const controller = new AbortController();
    void api<Attempt>(`/attempts/${retryOf}`, { signal: controller.signal })
      .then((source) => {
        if (active) setRetryGuide(source);
      })
      .catch(() => {
        // Notes already on this device can still be used offline. Legacy or
        // unavailable feedback receives the same mode-specific fallback.
        if (active) setRetryGuide({ id: retryOf });
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [retryOf, guideEvaluation, retryGuide?.id]);

  useEffect(() => {
    let active = true;
    async function hydrate() {
      try {
        let saved = await loadDraft(draftKey);
        if (!active) return;
        let draft = saved ? (JSON.parse(saved) as PracticeDraft) : null;
        const matchesRequested = (candidate: PracticeDraft | null) =>
          startingRetryAttempt?.status !== "draft" ||
          (candidate?.attempt?.id
            ? candidate.attempt.id === startingRetryAttempt.id
            : candidate?.session?.id === startingRetryAttempt.sessionId);
        if (
          startingRetryAttempt?.status === "draft" &&
          (!draft || !matchesRequested(draft))
        ) {
          // Another current practice may occupy the activity's normal slot.
          // Keep it intact and resume this requested draft in its own slot.
          draftStorageKey.current = `practice:${mode}:${article?.id || ""}:${startingRetryAttempt.id}`;
          saved = await loadDraft(draftStorageKey.current);
          if (!active) return;
          draft = saved ? (JSON.parse(saved) as PracticeDraft) : null;
        }
        if (draft) {
          if (draft.session?.id && matchesRequested(draft)) {
            setSession(draft.session);
            setText(draft.text || "");
            setPlanningNotes(
              draft.planningNotes ?? draft.attempt?.planningNotes ?? "",
            );
            setPlanningBoard(
              draft.planningBoard ??
                draft.attempt?.planningBoard ??
                createPlanningBoard(
                  draft.planningNotes ?? draft.attempt?.planningNotes ?? "",
                ),
            );
            setTranscriptEdited(
              draft.transcriptEdited ??
                Boolean(!draft.text?.trim() && draft.attempt?.text?.trim()),
            );
            setTranscriptionMessage(draft.transcriptionMessage || "");
            setSelfReflection(
              draft.selfReflection ?? draft.attempt?.selfReflection ?? "",
            );
            setAttempt(draft.attempt);
            setJobId(draft.jobId || "");
            setAudioUri(draft.audioUri || "");
            setAudioId(draft.audioId || "");
            setInput(
              mode === "read_reflect" ? "audio" : draft.responseType || "text",
            );
            setRetryOf(draft.retryOf);
            submissionKey.current = draft.submissionKey || newKey();
            turnKey.current = draft.turnKey || newKey();
            const legacyWrittenDraft =
              mode === "read_reflect" &&
              !draft.audioId &&
              !draft.attempt &&
              draft.responseType === "text" &&
              ["edit", "reflect"].includes(draft.stage);
            const deadline = draft.prepDeadline || Date.now() + 60000;
            setPrepDeadline(deadline);
            setPrep(Math.max(0, Math.ceil((deadline - Date.now()) / 1000)));
            setStage(
              legacyWrittenDraft
                ? "prep"
                : draft.audioId && draft.stage === "edit"
                  ? "reflect"
                  : draft.stage,
            );
            if (legacyWrittenDraft) {
              const notes = [draft.planningNotes, draft.text]
                .filter(Boolean)
                .join("\n\n")
                .slice(0, 2000);
              setPlanningNotes(notes);
              setPlanningBoard(createPlanningBoard(notes));
            }
            setNotice(
              legacyWrittenDraft
                ? "Your written draft is in your notes. Record your response when ready."
                : "Your saved practice is ready to continue.",
            );
            if (draft.audioId) {
              void api<{ url: string }>(`/audio/${draft.audioId}/url`)
                .then((result) => {
                  if (active)
                    setAudioUri(
                      result.url.startsWith("/")
                        ? `${API_BASE}${result.url}`
                        : result.url,
                    );
                })
                .catch(() => {
                  if (active) setAudioUri("");
                });
              if (draft.attempt?.id) {
                const current = await api<Attempt>(
                  `/attempts/${draft.attempt.id}`,
                );
                if (!active) return;
                setAttempt(current);
                // A lost transcription response can leave only the device
                // draft blank. Recover saved words, but preserve deliberate
                // edits (including clearing a previously populated field).
                if (
                  !draft.text?.trim() &&
                  !draft.transcriptEdited &&
                  (draft.transcriptEdited === false ||
                    !draft.attempt.text?.trim()) &&
                  current.text.trim()
                ) {
                  setText(current.text);
                  setTranscriptionMessage("");
                }
                if (
                  ["queued", "processing", "completed"].includes(current.status)
                ) {
                  setJobId("");
                  setStage("processing");
                }
              }
            }
            if (mode === "debate" && draft.stage === "debate") {
              const current = await api<DebateSession>(
                `/sessions/${draft.session.id}`,
              );
              if (!active) return;
              setSession(current);
              setDebateProvider(current.provider || "");
              const submitted = current.turns.find(
                (turn) =>
                  (turn as typeof turn & { idempotencyKey?: string })
                    .idempotencyKey === draft.turnKey,
              );
              if (
                submitted &&
                current.turns.some(
                  (turn) =>
                    turn.speaker === "ai" && turn.round === submitted.round,
                )
              ) {
                setText("");
                turnKey.current = newKey();
              }
              if (current.attemptId) {
                const savedAttempt = await api<Attempt>(
                  `/attempts/${current.attemptId}`,
                );
                if (!active) return;
                setAttempt(savedAttempt);
                setText(savedAttempt.text);
                setSelfReflection(
                  draft.selfReflection ?? savedAttempt.selfReflection ?? "",
                );
                setJobId(current.jobId || "");
                setStage(
                  savedAttempt.status === "draft" ? "reflect" : "processing",
                );
              }
            }
            return;
          }
        }
        if (startingRetryAttempt) {
          const current = await api<Session>(
            `/sessions/${startingRetryAttempt.sessionId}`,
          );
          if (!active) return;
          setSession(current);
          setPlanningNotes(startingRetryAttempt.planningNotes || "");
          setPlanningBoard(
            startingRetryAttempt.planningBoard ||
              createPlanningBoard(startingRetryAttempt.planningNotes),
          );
          setStage("edit");
          if (startingRetryAttempt.status === "draft") {
            setAttempt(startingRetryAttempt);
            setRetryOf(startingRetryAttempt.retryOf);
            setText(startingRetryAttempt.text);
            setSelfReflection(startingRetryAttempt.selfReflection || "");
            setStage("reflect");
            setAudioId(startingRetryAttempt.audioId || "");
            setInput(startingRetryAttempt.responseType);
            setNotice("");
            if (startingRetryAttempt.audioId) {
              const media = await api<{ url: string }>(
                `/audio/${startingRetryAttempt.audioId}/url`,
              );
              if (active)
                setAudioUri(
                  media.url.startsWith("/")
                    ? `${API_BASE}${media.url}`
                    : media.url,
                );
            }
          } else {
            setText(
              mode === "debate" && !startingRetryAttempt.retryOf
                ? current.turns.find((turn) => turn.speaker === "user")?.text ||
                    startingRetryAttempt.text
                : startingRetryAttempt.text,
            );
            if (mode === "read_reflect") planReflection();
            setNotice("Your original response is ready to revise.");
          }
        }
      } catch (e) {
        if (active) setError(errorMessage(e));
      } finally {
        if (active) setReady(true);
      }
    }
    void hydrate();
    return () => {
      active = false;
    };
  }, [draftKey, mode, article?.id, startingRetryAttempt]);

  useEffect(() => {
    if (mode !== "debate") return;
    let active = true;
    api<Prompt[]>("/prompts?mode=debate")
      .then((result) => {
        if (active) {
          setPrompts(result);
          setPromptId((current) => current || result[0]?.id || "");
        }
      })
      .catch((e) => {
        if (active) setError(errorMessage(e));
      });
    return () => {
      active = false;
    };
  }, [mode]);

  useEffect(() => {
    if (!ready || !session || stage === "result") return;
    const timeout = setTimeout(() => {
      const draft: PracticeDraft = {
        session,
        text,
        selfReflection,
        planningNotes,
        planningBoard,
        prepDeadline,
        transcriptEdited,
        transcriptionMessage,
        stage,
        attempt,
        jobId,
        audioUri,
        audioId,
        responseType: input,
        retryOf,
        submissionKey: submissionKey.current,
        turnKey: turnKey.current,
      };
      saveDraft(draftStorageKey.current, JSON.stringify(draft)).catch(() =>
        setError(
          "This device could not save your draft. Keep this screen open until your response is submitted.",
        ),
      );
    }, 200);
    return () => clearTimeout(timeout);
  }, [
    ready,
    session,
    text,
    selfReflection,
    planningNotes,
    planningBoard,
    prepDeadline,
    transcriptEdited,
    transcriptionMessage,
    stage,
    attempt,
    jobId,
    audioUri,
    audioId,
    input,
    retryOf,
    draftKey,
  ]);

  useEffect(() => {
    if (stage !== "prep" || !prepDeadline) return;
    const tick = () => {
      const remaining = Math.max(
        0,
        Math.ceil((prepDeadline - Date.now()) / 1000),
      );
      setPrep(remaining);
      if (!remaining) {
        setPlanningGesture(false);
        setStage("edit");
      }
    };
    tick();
    const timer = setInterval(tick, 250);
    return () => clearInterval(timer);
  }, [prepDeadline, stage]);

  function planReflection() {
    setPlanningGesture(false);
    setInput("audio");
    setPrep(60);
    setPrepDeadline(Date.now() + 60000);
    setStage("prep");
  }

  useEffect(() => {
    if (stage !== "processing" || !pendingAttemptId) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try {
        if (jobId) {
          const job = await api<Job>(`/jobs/${jobId}`);
          if (!active) return;
          if (job.status === "failed") {
            setJobFailed(true);
            setError(
              job.error ||
                "Evaluation could not finish. Your answer is saved. You can retry it.",
            );
            return;
          }
        }
        const current = await api<Attempt>(`/attempts/${pendingAttemptId}`);
        if (!active) return;
        if (current.status === "completed" && current.evaluation) {
          setAttempt(current);
          setStage("result");
          setError("");
          await deleteDraft(draftStorageKey.current).catch(() => undefined);
          completeRef.current(current);
          return;
        }
        if (current.status === "failed") {
          setJobFailed(true);
          setError(
            "Evaluation could not finish. Your answer is saved. Retry when you’re ready.",
          );
          return;
        }
        setError("");
        setJobFailed(false);
      } catch (e) {
        if (active)
          setError(
            `${errorMessage(e)} Your answer is saved; reconnect to continue.`,
          );
      }
      if (active) timer = setTimeout(poll, 1200);
    }
    void poll();
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [stage, pendingAttemptId, jobId, draftKey, pollVersion]);

  async function close() {
    if (session && stage !== "result") {
      try {
        await saveDraft(
          draftStorageKey.current,
          JSON.stringify({
            session,
            text,
            selfReflection,
            planningNotes,
            planningBoard,
            prepDeadline,
            transcriptEdited,
            transcriptionMessage,
            stage,
            attempt,
            jobId,
            audioUri,
            audioId,
            responseType: input,
            retryOf,
            submissionKey: submissionKey.current,
            turnKey: turnKey.current,
          }),
        );
      } catch {
        setError("Could not save this draft. Please try again before leaving.");
        return;
      }
    }
    onClose();
  }

  async function start() {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const created = await api<DebateSession>("/sessions", {
        method: "POST",
        body: {
          mode,
          topic: category === "All topics" ? undefined : category,
          articleId: article?.id,
          questionIndex,
          promptId: mode === "debate" ? promptId : undefined,
          position,
          rounds,
          idempotencyKey: sessionKey.current,
        },
      });
      if (!mounted.current) return;
      if (mode === "spin_speak" && !reducedMotion.current) {
        rotation.setValue(0);
        await new Promise<void>((resolve) => {
          let settled = false;
          const finish = () => {
            if (settled) return;
            settled = true;
            wheelAnimation.current = null;
            finishWheel.current = null;
            resolve();
          };
          finishWheel.current = finish;
          const animation = Animated.timing(rotation, {
            toValue: 1,
            duration: 1100,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: Platform.OS !== "web",
            isInteraction: false,
          });
          wheelAnimation.current = animation;
          animation.start(finish);
        });
      }
      if (!mounted.current) return;
      setSession(created);
      setDebateProvider(created.provider || "");
      setPlanningNotes("");
      setPlanningBoard(createPlanningBoard());
      const duration =
        mode === "read_reflect"
          ? 60
          : created.assessmentFramework === "bridge-v1"
            ? 45
            : 15;
      setPrep(duration);
      setPrepDeadline(Date.now() + duration * 1000);
      if (mode === "read_reflect") setInput("audio");
      setStage(mode === "debate" ? "debate" : "prep");
    } catch (e) {
      if (mounted.current) setError(errorMessage(e));
    } finally {
      inFlight.current = false;
      if (mounted.current) setBusy(false);
    }
  }

  async function queueEvaluation(saved: Attempt) {
    setAttempt(saved);
    try {
      const job = await api<Job>(`/attempts/${saved.id}/evaluate`, {
        method: "POST",
      });
      setJobId(job.id);
    } catch (e) {
      // A lost HTTP response must not make an already queued answer look unsaved.
      const current = await api<Attempt>(`/attempts/${saved.id}`).catch(
        () => null,
      );
      if (
        !current ||
        !["queued", "processing", "completed"].includes(current.status)
      )
        throw e;
      setAttempt(current);
      setJobId("");
    }
    setStage("processing");
    setJobFailed(false);
    setNotice("");
    setPollVersion((value) => value + 1);
  }

  function beginReflection() {
    setReflectionExpanded(true);
    setShowResponse(false);
    setNotice("");
    setError("");
    setStage("reflect");
  }

  function editResponse(value: string) {
    setText(value.slice(0, 10000));
    if (audioId) {
      setTranscriptEdited(true);
      if (value.trim()) setTranscriptionMessage("");
    }
    setError("");
  }

  async function requestTranscript(saved: Attempt) {
    const result = await api<{
      text: string;
      requiresManualTranscription?: boolean;
    }>(`/attempts/${saved.id}/transcribe`, { method: "POST" });
    if (result.text?.trim()) {
      setText(result.text);
      setTranscriptEdited(false);
      setAttempt({ ...saved, text: result.text });
      setTranscriptionMessage("");
    } else {
      setTranscriptionMessage(
        result.requiresManualTranscription
          ? "Automatic transcription isn’t enabled. Type what you said below."
          : "No transcript was returned. Try again or type what you said.",
      );
    }
  }

  async function generateTranscript() {
    if (!attempt?.audioId || inFlight.current || text.trim()) return;
    inFlight.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    setTranscriptionMessage("");
    try {
      // Recover a successful saved result before making another provider call.
      const current = await api<Attempt>(`/attempts/${attempt.id}`);
      setAttempt(current);
      if (["queued", "processing", "completed"].includes(current.status)) {
        setJobId("");
        setStage("processing");
        return;
      }
      if (current.text.trim()) {
        setText(current.text);
        setTranscriptEdited(false);
      } else {
        await requestTranscript(current);
      }
      setShowResponse(true);
    } catch (e) {
      setTranscriptionMessage(errorMessage(e));
      setShowResponse(true);
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  async function submit(skipReflection = false) {
    if (!session || inFlight.current) return;
    const note = skipReflection ? "" : selfReflection.trim();
    if (skipReflection) setSelfReflection("");
    if (text.trim().length < 20) {
      setShowResponse(true);
      setError(
        audioId
          ? "Add a transcript of your recording to get feedback. Your reflection is optional."
          : "Add your original response to get feedback. Your reflection is optional.",
      );
      return;
    }
    inFlight.current = true;
    setBusy(true);
    setError("");
    setTranscriptionMessage("");
    try {
      let saved = attempt;
      if (saved) {
        const current = await api<Attempt>(`/attempts/${saved.id}`);
        if (["queued", "processing", "completed"].includes(current.status)) {
          setAttempt(current);
          setJobId("");
          setStage("processing");
          return;
        }
        saved = current;
      }
      if (saved && saved.text !== text.trim())
        saved = await api<Attempt>(`/attempts/${saved.id}/transcript`, {
          method: "PATCH",
          body: { text: text.trim() },
        });
      else if (!saved)
        saved = await api<Attempt>("/attempts", {
          method: "POST",
          body: {
            sessionId: session.id,
            text: text.trim(),
            selfReflection: note,
            planningNotes: planningNotes.trim(),
            planningBoard: mode === "read_reflect" ? planningBoard : undefined,
            responseType: audioId ? "audio" : "text",
            audioId: audioId || undefined,
            retryOf,
            idempotencyKey: submissionKey.current,
          },
        });
      if (["queued", "processing", "completed"].includes(saved.status)) {
        setAttempt(saved);
        setJobId("");
        setStage("processing");
        return;
      }
      if (saved.text !== text.trim())
        saved = await api<Attempt>(`/attempts/${saved.id}/transcript`, {
          method: "PATCH",
          body: { text: text.trim() },
        });
      if ((saved.selfReflection || "") !== note)
        saved = await api<Attempt>(`/attempts/${saved.id}/reflection`, {
          method: "PATCH",
          body: { selfReflection: note },
        });
      setAttempt(saved);
      await queueEvaluation(saved);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  async function handleAudio(recording: RecordedAudio) {
    if (!session || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError("");
    setAudioUri(recording.uri);
    setTranscriptionMessage("");
    setNotice("Saving your recording and preparing a transcript…");
    try {
      const uploaded = await uploadAudio(recording.uri, recording.mime);
      const saved = await api<Attempt>("/attempts", {
        method: "POST",
        body: {
          sessionId: session.id,
          text: "",
          planningNotes: planningNotes.trim(),
          planningBoard: mode === "read_reflect" ? planningBoard : undefined,
          responseType: "audio",
          audioId: uploaded.id,
          durationSeconds: recording.duration,
          retryOf,
          idempotencyKey: submissionKey.current,
        },
      });
      setAttempt(saved);
      setAudioId(saved.audioId || uploaded.id);
      setText("");
      setTranscriptEdited(false);
      try {
        if (saved.text.trim()) setText(saved.text);
        else await requestTranscript(saved);
      } catch (e) {
        setTranscriptionMessage(errorMessage(e));
      }
      setNotice("");
      setReflectionExpanded(false);
      setShowResponse(false);
      setStage("reflect");
    } catch (e) {
      setError(errorMessage(e));
      setAudioUri("");
      setNotice("");
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  async function allowRecordingStorage() {
    setBusy(true);
    setError("");
    try {
      await api("/me", {
        method: "PATCH",
        body: { consent: { recording: true } },
      });
      setRecordingConsent(true);
      await refresh();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function sendTurn(reflectFirst = false) {
    if (!session || inFlight.current || text.trim().length < 20) return;
    inFlight.current = true;
    setBusy(true);
    setError("");
    try {
      const result = await api<DebateSession>(`/debates/${session.id}/turn`, {
        method: "POST",
        body: {
          text: text.trim(),
          idempotencyKey: turnKey.current,
          // Save the full debate before queuing feedback so a queue failure
          // leaves a recoverable response for either choice.
          deferEvaluation: true,
        },
      });
      setSession(result);
      setDebateProvider(result.provider || debateProvider);
      if (result.attemptId) {
        const saved = await api<Attempt>(`/attempts/${result.attemptId}`);
        setAttempt(saved);
        setText(saved.text);
        setSelfReflection(saved.selfReflection || "");
        setJobId(result.jobId || "");
        if (saved.status === "draft") {
          if (reflectFirst) beginReflection();
          else {
            // Evaluate the complete saved conversation, including when the
            // final turn is recovered after a lost response.
            setReflectionExpanded(false);
            setShowResponse(false);
            try {
              await queueEvaluation(saved);
            } catch (cause) {
              setStage("reflect");
              throw cause;
            }
          }
        } else setStage("processing");
      } else {
        setText("");
      }
      // Preserve the final argument and its key until the saved attempt loads,
      // so retrying a lost response cannot submit a second debate turn.
      turnKey.current = newKey();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  async function retryEvaluation() {
    if (!attempt || busy) return;
    setBusy(true);
    setError("");
    try {
      await queueEvaluation(attempt);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  function retry(current: Attempt) {
    setRetryOf(current.id);
    setRetryGuide(current);
    setAttempt(null);
    setJobId("");
    setAudioId("");
    setAudioUri("");
    setInput("text");
    setSelfReflection("");
    setPlanningNotes(current.planningNotes || "");
    setPlanningBoard(
      current.planningBoard || createPlanningBoard(current.planningNotes),
    );
    setShowResponse(false);
    setTranscriptEdited(false);
    setTranscriptionMessage("");
    setText(
      mode === "debate" && !current.retryOf
        ? session?.turns.find((turn) => turn.speaker === "user")?.text ||
            current.text
        : current.text,
    );
    submissionKey.current = newKey();
    setNotice("Your original response is ready to revise.");
    if (mode === "read_reflect") planReflection();
    else setStage("edit");
  }

  if (stage === "result" && attempt)
    return (
      <Feedback
        attempt={attempt}
        onRetry={retry}
        onClose={onClose}
        onGarden={onGarden}
        celebrateRewards
        onRefresh={() => completeRef.current(attempt)}
        onOpposite={
          mode === "debate"
            ? () => {
                setSession(null);
                setAttempt(null);
                setText("");
                setSelfReflection("");
                setShowResponse(false);
                setTranscriptEdited(false);
                setTranscriptionMessage("");
                setPosition(session?.position === "for" ? "against" : "for");
                setStage("setup");
                sessionKey.current = newKey();
                submissionKey.current = newKey();
                setRetryOf(undefined);
              }
            : undefined
        }
      />
    );

  const debateRound =
    (session?.turns.filter((turn) => turn.speaker === "ai").length || 0) + 1;
  const selectedPrompt = prompts.find((prompt) => prompt.id === promptId);
  const responseLabel = audioId
    ? !text.trim()
      ? "Type transcript"
      : "Review transcript"
    : "Review response";
  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={{ flex: 1, backgroundColor: C.cream }}
    >
      <ScrollView
        scrollEnabled={stage !== "prep" || !planningGesture}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={s.scroll}
      >
        <View style={s.container}>
          <View style={s.topbar}>
            <View style={s.inline}>
              <Icon
                name={
                  mode === "debate"
                    ? "message-circle"
                    : mode === "read_reflect"
                      ? "book-open"
                      : "sun"
                }
              />
              <Text style={T.h3}>{names[mode]}</Text>
            </View>
            <Button
              label={stage === "processing" ? "Back to Home" : "Save & close"}
              icon="x"
              variant="ghost"
              disabled={busy || recordingActive}
              onPress={() => void close()}
            />
          </View>
          {!ready ? (
            <ActivityIndicator style={{ margin: 60 }} color={C.forest} />
          ) : (
            <>
              <ErrorNote message={error} />
              {session?.learningFocus &&
              (stage === "prep" || stage === "edit") ? (
                <Card testID="practice-learning-focus" style={{ gap: 8 }}>
                  <Text style={T.h3}>
                    Practice focus · {session.learningFocus.label}
                  </Text>
                  <Text style={T.body}>
                    {session.learningFocus.instruction}
                  </Text>
                  <Text style={T.small}>
                    Suggested from repeated provisional feedback. This guided
                    practice does not establish mastery.
                  </Text>
                </Card>
              ) : null}
              {stage !== "processing" &&
                stage !== "reflect" &&
                stage !== "prep" && (
                  <AssessmentCriteria
                    mode={mode}
                    framework={
                      session?.assessmentFramework ||
                      (!session &&
                      mode === "spin_speak" &&
                      appState?.profile.dailyWorkout
                        ? "bridge-v1"
                        : undefined)
                    }
                  />
                )}
              {notice &&
              (stage !== "prep" || notice.startsWith("Your written draft")) ? (
                <View style={s.notice}>
                  <Icon name="info" size={18} />
                  <Text style={[T.body, { flex: 1, fontSize: 13 }]}>
                    {notice}
                  </Text>
                </View>
              ) : null}
              {stage === "setup" && mode === "spin_speak" && (
                <>
                  <View style={s.centered}>
                    <Text style={[T.title, s.centerText]}>Choose a topic</Text>
                  </View>
                  <View style={[s.chips, { justifyContent: "center" }]}>
                    {categories.map((item) => (
                      <Chip
                        key={item}
                        selected={category === item}
                        onPress={() => setCategory(item)}
                      >
                        {item}
                      </Chip>
                    ))}
                  </View>
                  <PetalWheel
                    rotation={rotation}
                    busy={busy}
                    onSpin={() => void start()}
                  />
                  <View style={s.centered}>
                    <Button
                      label="Spin a prompt"
                      icon="shuffle"
                      loading={busy}
                      style={{ alignSelf: "center" }}
                      onPress={() => void start()}
                    />
                    <Text style={[T.small, { marginTop: 13 }]}>
                      15s prep · 60s recording · or write
                    </Text>
                  </View>
                </>
              )}
              {stage === "setup" && mode === "debate" && (
                <>
                  <Heading>Choose a debate</Heading>
                  <Card style={{ gap: 18 }}>
                    <Text style={T.label}>CHOOSE A PROPOSITION</Text>
                    {!prompts.length ? (
                      <View style={{ gap: 10 }}>
                        <Text style={T.body}>Loading debate topics…</Text>
                        <Button
                          label="Reload topics"
                          variant="secondary"
                          onPress={() =>
                            void api<Prompt[]>("/prompts?mode=debate")
                              .then((result) => {
                                setPrompts(result);
                                setPromptId(result[0]?.id || "");
                                setError("");
                              })
                              .catch((e) => setError(errorMessage(e)))
                          }
                        />
                      </View>
                    ) : (
                      prompts.map((prompt) => (
                        <Pressable
                          key={prompt.id}
                          accessibilityRole="radio"
                          accessibilityState={{
                            checked: promptId === prompt.id,
                          }}
                          onPress={() => setPromptId(prompt.id)}
                          style={[
                            s.topicOption,
                            promptId === prompt.id && {
                              backgroundColor: C.sage,
                              borderColor: "#A5BAA0",
                            },
                          ]}
                        >
                          <View style={{ flex: 1, gap: 4 }}>
                            <Text style={T.small}>{prompt.category}</Text>
                            <Text style={[T.body, { fontFamily: "DMMedium" }]}>
                              {prompt.question}
                            </Text>
                          </View>
                          <Icon
                            name={
                              promptId === prompt.id ? "check-circle" : "circle"
                            }
                            size={20}
                          />
                        </Pressable>
                      ))
                    )}
                  </Card>
                  {selectedPrompt && (
                    <View style={s.notice}>
                      <Icon name="compass" />
                      <Text style={[T.body, { flex: 1 }]}>
                        {selectedPrompt.context}
                      </Text>
                    </View>
                  )}
                  <Card style={{ gap: 18 }}>
                    <Text style={T.label}>YOUR PRACTICE POSITION</Text>
                    <View style={s.chips}>
                      <Chip
                        selected={position === "for"}
                        onPress={() => setPosition("for")}
                      >
                        For the proposition
                      </Chip>
                      <Chip
                        selected={position === "against"}
                        onPress={() => setPosition("against")}
                      >
                        Against the proposition
                      </Chip>
                      <Chip
                        selected={position === "surprise"}
                        onPress={() => setPosition("surprise")}
                      >
                        Surprise me
                      </Chip>
                    </View>
                    <Text style={T.small}>
                      Practising a position isn’t endorsement. Challenge ideas,
                      not people.
                    </Text>
                    <Text style={T.label}>LENGTH</Text>
                    <View style={s.chips}>
                      {[2, 3].map((value) => (
                        <Chip
                          key={value}
                          selected={rounds === value}
                          onPress={() => setRounds(value)}
                        >
                          {value} rounds
                        </Chip>
                      ))}
                    </View>
                    <Button
                      label="Start debate"
                      icon="arrow-right"
                      loading={busy}
                      disabled={!promptId}
                      onPress={() => void start()}
                    />
                  </Card>
                </>
              )}
              {stage === "setup" &&
                mode === "read_reflect" &&
                (article ? (
                  <>
                    <View style={s.chips}>
                      <Tag>{article.category}</Tag>
                      <Tag color={C.peach}>
                        {article.readMinutes} minute read
                      </Tag>
                    </View>
                    <Heading
                      sub={`${article.source} · ${new Date(article.publishedAt).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" })}`}
                    >
                      {article.title}
                    </Heading>
                    <Card style={{ gap: 18 }}>
                      <Text style={T.label}>ORIGINAL EDITORIAL SUMMARY</Text>
                      <Text style={[T.body, { fontSize: 17, lineHeight: 29 }]}>
                        {article.summary}
                      </Text>
                      <Text style={T.small}>
                        {article.license ||
                          "Original summary of the linked source. Visit the publisher for the full article."}
                      </Text>
                      <Button
                        label={`Read at ${article.source}`}
                        icon="external-link"
                        variant="secondary"
                        onPress={() =>
                          void Linking.openURL(article.sourceUrl).catch(() =>
                            setError(
                              "The source link could not open. Please try again.",
                            ),
                          )
                        }
                      />
                    </Card>
                    <View style={{ gap: 12, marginTop: 8 }}>
                      <Text style={T.h2}>Choose a question</Text>
                      {article.questions.slice(0, 3).map((question, index) => (
                        <Pressable
                          key={question}
                          accessibilityRole="radio"
                          accessibilityState={{
                            checked: questionIndex === index,
                          }}
                          onPress={() => setQuestionIndex(index)}
                          style={[
                            s.topicOption,
                            questionIndex === index && {
                              backgroundColor: C.sage,
                              borderColor: "#A5BAA0",
                            },
                          ]}
                        >
                          <Text style={[T.body, { flex: 1 }]}>{question}</Text>
                          <Icon
                            name={
                              questionIndex === index
                                ? "check-circle"
                                : "circle"
                            }
                          />
                        </Pressable>
                      ))}
                    </View>
                    <Button
                      label="Plan your response"
                      icon="edit-3"
                      loading={busy}
                      onPress={() => void start()}
                    />
                  </>
                ) : (
                  <ErrorNote message="Choose an article from Discover to begin your reflection." />
                ))}
              {stage === "prep" && session && mode === "read_reflect" && (
                <View style={{ gap: 18 }}>
                  <Heading sub={session.prompt.question}>
                    Plan your response
                  </Heading>
                  <View
                    style={{
                      flexDirection: "row",
                      gap: 8,
                      alignItems: "center",
                      alignSelf: "center",
                    }}
                  >
                    <Icon name="clock" size={18} />
                    <Text
                      accessibilityLabel={`${prep} seconds preparation time`}
                      style={T.h3}
                    >
                      {String(Math.floor(prep / 60)).padStart(2, "0")}:
                      {String(prep % 60).padStart(2, "0")}
                    </Text>
                  </View>
                  <IdeasBoard
                    board={planningBoard}
                    onChange={(next) => {
                      setPlanningBoard(next);
                      setPlanningNotes(planningBoardNotes(next));
                    }}
                    onDone={() => setStage("edit")}
                    onInteractionChange={setPlanningGesture}
                  />
                </View>
              )}
              {stage === "prep" && session && mode !== "read_reflect" && (
                <>
                  <View style={s.centered}>
                    <Tag>{session.prompt.category}</Tag>
                    <Text style={[T.title, s.centerText, { marginTop: 20 }]}>
                      {session.prompt.question}
                    </Text>
                    <Text
                      style={[
                        T.body,
                        s.centerText,
                        { color: C.muted, maxWidth: 520 },
                      ]}
                    >
                      {session.prompt.context}
                    </Text>
                  </View>
                  <View style={s.prepClock}>
                    <Text style={[T.label, { color: C.forest }]}>PREPARE</Text>
                    <Text
                      accessibilityLabel={`${prep} seconds preparation time`}
                      style={s.countdown}
                    >
                      {prep}
                    </Text>
                    <Text style={T.small}>
                      Find one point. Give it a reason.
                    </Text>
                  </View>
                  {session.assessmentFramework === "bridge-v1" ? (
                    <Card style={{ gap: 8 }}>
                      <Field
                        label="Planning notes (optional)"
                        value={planningNotes}
                        onChangeText={setPlanningNotes}
                        maxLength={2000}
                        multiline
                        placeholder="Jot down your points, reasons or examples…"
                        style={{ minHeight: 105 }}
                      />
                      <Text style={T.small}>
                        When AI feedback is enabled, your notes are submitted
                        with your response to build the Thought Map.
                      </Text>
                    </Card>
                  ) : null}
                  <View style={s.centered}>
                    <Button
                      label="Skip prep"
                      icon="arrow-right"
                      onPress={() => setStage("edit")}
                    />
                  </View>
                </>
              )}
              {stage === "edit" && session && (
                <>
                  <View style={s.chips}>
                    <Tag>{session.prompt.category}</Tag>
                    {retryOf && <Tag color={C.lilac}>A SECOND BLOOM</Tag>}
                  </View>
                  <Heading
                    sub={
                      mode === "read_reflect" &&
                      article?.summary === session.prompt.context
                        ? undefined
                        : session.prompt.context
                    }
                  >
                    {session.prompt.question}
                  </Heading>
                  {mode === "read_reflect" && (
                    <IdeasPreview board={planningBoard} />
                  )}
                  {retryOf ? (
                    <ThoughtGuide
                      attemptId={retryOf}
                      mode={mode}
                      evaluation={guideEvaluation}
                      loading={!guideEvaluation && retryGuide?.id !== retryOf}
                      collapsed
                    />
                  ) : null}
                  <Card style={{ gap: 20 }}>
                    {mode !== "read_reflect" &&
                      !audioId &&
                      !busy &&
                      !recordingActive && (
                        <View style={s.chips}>
                          <Chip
                            selected={input === "text"}
                            onPress={() => setInput("text")}
                          >
                            Write a response
                          </Chip>
                          <Chip
                            selected={input === "audio"}
                            onPress={() => setInput("audio")}
                          >
                            Speak a response
                          </Chip>
                        </View>
                      )}
                    {(mode === "read_reflect" || input === "audio") &&
                    !audioId ? (
                      recordingConsent ? (
                        <AudioInput
                          appearance={
                            mode === "read_reflect" ? "daily" : "garden"
                          }
                          onRecorded={handleAudio}
                          onCancel={() =>
                            mode === "read_reflect"
                              ? planReflection()
                              : setInput("text")
                          }
                          onCaptureActive={setRecordingActive}
                          busy={busy}
                        />
                      ) : (
                        <RecordingConsent
                          busy={busy}
                          onAllow={() => void allowRecordingStorage()}
                          onWrite={
                            mode === "read_reflect"
                              ? undefined
                              : () => setInput("text")
                          }
                        />
                      )
                    ) : (
                      <>
                        {Boolean(audioUri) && <AudioPlayback uri={audioUri} />}
                        <Field
                          label={audioId ? "Transcript" : "Your response"}
                          value={text}
                          onChangeText={editResponse}
                          editable={!busy}
                          multiline
                          placeholder="Your idea, reason, and example…"
                          style={{ minHeight: 235 }}
                        />
                        <View style={s.between}>
                          <Text style={T.small}>
                            {text.trim() ? text.trim().split(/\s+/).length : 0}{" "}
                            words · {text.length}/10,000 characters
                          </Text>
                          <Text style={T.small}>Saved on this device</Text>
                        </View>
                        <Text style={T.small}>
                          {audioId
                            ? "Feedback uses your corrected transcript. Audio delivery is not assessed."
                            : mode === "read_reflect"
                              ? "Connect your answer to the supplied reading."
                              : "Include a claim, reason, and example."}
                        </Text>
                        <Button
                          label="Get feedback"
                          icon="arrow-right"
                          loading={busy}
                          disabled={text.trim().length < 20}
                          onPress={() => void submit()}
                        />
                        <Button
                          label="Reflect first"
                          variant="ghost"
                          disabled={busy || text.trim().length < 20}
                          onPress={beginReflection}
                        />
                        {text.trim().length < 20 && (
                          <Text style={T.small}>At least 20 characters.</Text>
                        )}
                      </>
                    )}
                  </Card>
                </>
              )}
              {stage === "reflect" && session && (
                <SelfReflection
                  value={selfReflection}
                  onChangeText={setSelfReflection}
                  onSubmit={(skip) => void submit(skip)}
                  busy={busy}
                  initiallyExpanded={reflectionExpanded}
                  audioUri={audioUri}
                >
                  <View style={{ gap: 10 }}>
                    {audioId && !text.trim() ? (
                      <View style={{ gap: 10 }}>
                        <Text style={T.small}>
                          {transcriptionMessage || "No transcript yet."}
                        </Text>
                        <Button
                          label="Generate transcript"
                          variant="secondary"
                          icon="file-text"
                          loading={busy}
                          disabled={!attempt?.audioId}
                          onPress={() => void generateTranscript()}
                        />
                      </View>
                    ) : null}
                    <Pressable
                      testID="original-response-toggle"
                      accessibilityRole="button"
                      accessibilityLabel={responseLabel}
                      accessibilityState={{ expanded: showResponse }}
                      aria-expanded={showResponse}
                      onPress={() => setShowResponse((shown) => !shown)}
                      style={[s.between, { minHeight: 44, gap: 12 }]}
                    >
                      <Text
                        style={[
                          T.small,
                          { color: C.forest, fontFamily: "DMBold" },
                        ]}
                      >
                        {responseLabel}
                      </Text>
                      <Icon
                        name={showResponse ? "chevron-up" : "chevron-down"}
                        size={18}
                      />
                    </Pressable>
                    {showResponse && (
                      <View
                        testID="original-response-details"
                        style={{ gap: 12 }}
                      >
                        {mode === "debate" && !retryOf && !audioId ? (
                          <Text style={T.body}>{text}</Text>
                        ) : (
                          <Field
                            label={audioId ? "Transcript" : "Your response"}
                            value={text}
                            onChangeText={editResponse}
                            editable={!busy}
                            placeholder={
                              audioId
                                ? "What you said in your recording…"
                                : "Your response…"
                            }
                            multiline
                            style={{ minHeight: 180 }}
                          />
                        )}
                        <Text style={T.small}>
                          Feedback uses this response. Your reflection isn’t
                          assessed.
                        </Text>
                      </View>
                    )}
                  </View>
                </SelfReflection>
              )}
              {stage === "debate" && session && (
                <>
                  <View style={s.between}>
                    <Tag color={C.lilac}>
                      ROUND {Math.min(debateRound, session.rounds)} OF{" "}
                      {session.rounds}
                    </Tag>
                    <Text style={T.small}>
                      Practising{" "}
                      {session.position === "against" ? "against" : "for"} the
                      proposition
                    </Text>
                  </View>
                  <Heading sub={session.prompt.context}>
                    {session.prompt.question}
                  </Heading>
                  <Text style={T.small}>
                    {debateProvider === "openai"
                      ? "AI challenger"
                      : "Local practice coach · structured questions, no live AI."}
                  </Text>
                  {session.turns.map((turn) => (
                    <View
                      key={turn.id}
                      style={[
                        s.turn,
                        turn.speaker === "user"
                          ? { backgroundColor: C.sage, marginLeft: 28 }
                          : { backgroundColor: C.paper, marginRight: 28 },
                      ]}
                    >
                      <View style={s.inline}>
                        <Icon
                          name={turn.speaker === "user" ? "user" : "sun"}
                          size={15}
                        />
                        <Text style={T.label}>
                          {turn.speaker === "user"
                            ? "YOUR PERSPECTIVE"
                            : debateProvider === "openai"
                              ? "AI CHALLENGER"
                              : "PRACTICE COACH"}
                        </Text>
                      </View>
                      <Text style={T.body}>{turn.text}</Text>
                    </View>
                  ))}
                  <Card style={{ gap: 16 }}>
                    <Field
                      label={
                        debateRound === 1
                          ? "Your opening argument"
                          : "Your response to the challenge"
                      }
                      value={text}
                      onChangeText={(value) => setText(value.slice(0, 6000))}
                      editable={!busy}
                      multiline
                      placeholder={
                        debateRound === 1
                          ? "My position is… My strongest reason is…"
                          : "That is a fair concern. Here is how I would address it…"
                      }
                    />
                    <Text style={T.small}>
                      At least 20 characters. Give reasons and note any
                      uncertainty.
                    </Text>
                    <Button
                      label={
                        debateRound >= session.rounds
                          ? "Get feedback"
                          : "Send my argument"
                      }
                      icon="send"
                      disabled={text.trim().length < 20}
                      loading={busy}
                      onPress={() => void sendTurn()}
                    />
                    {debateRound >= session.rounds ? (
                      <Button
                        label="Reflect first"
                        variant="ghost"
                        disabled={busy || text.trim().length < 20}
                        onPress={() => void sendTurn(true)}
                      />
                    ) : null}
                  </Card>
                </>
              )}
              {stage === "processing" && (
                <View style={[s.centered, { paddingVertical: 45, gap: 22 }]}>
                  <View style={s.processingIcon}>
                    {jobFailed ? (
                      <Icon name="cloud-off" size={34} />
                    ) : (
                      <ActivityIndicator size="large" color={C.forest} />
                    )}
                  </View>
                  <Text style={[T.title, s.centerText]}>
                    {jobFailed ? "Response saved" : "Preparing feedback…"}
                  </Text>
                  <Text style={[T.body, s.centerText, { maxWidth: 480 }]}>
                    {jobFailed
                      ? "Retry the evaluation when you’re ready."
                      : "Your response is saved. You can return Home and find the result in Profile."}
                  </Text>
                  {Boolean(session?.summary) && (
                    <Card style={{ gap: 12 }}>
                      <Text style={T.label}>
                        BOTH SIDES OF THE CONVERSATION
                      </Text>
                      <Text style={T.body}>{session?.summary}</Text>
                    </Card>
                  )}
                  {jobFailed && (
                    <Button
                      label="Retry evaluation"
                      icon="refresh-cw"
                      loading={busy}
                      onPress={() => void retryEvaluation()}
                    />
                  )}
                </View>
              )}
            </>
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

interface FeedbackProps {
  attempt: Attempt;
  onRetry: (attempt: Attempt) => void;
  onClose: () => void;
  onRefresh?: () => void;
  onOpposite?: () => void;
  onGarden: () => void;
  celebrateRewards?: boolean;
}
export function Feedback(props: FeedbackProps) {
  if (props.attempt.evaluation?.assessment?.framework_id === "bridge-v1")
    return <BridgeFeedback key={props.attempt.id} {...props} />;
  return <FeedbackContent key={props.attempt.id} {...props} />;
}
function FeedbackContent({
  attempt: initialAttempt,
  onRetry,
  onClose,
  onRefresh,
  onOpposite,
  onGarden,
  celebrateRewards = false,
}: FeedbackProps) {
  const { C, T } = useTheme();
  const s = useStyles();

  const [attempt, setAttempt] = useState(initialAttempt);
  const [previous, setPrevious] = useState<Attempt | null>(null);
  const [debateOpening, setDebateOpening] = useState("");
  const [comparisonError, setComparisonError] = useState(false);
  const [comparisonVersion, setComparisonVersion] = useState(0);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [showAnswer, setShowAnswer] = useState(false);
  const [showMethod, setShowMethod] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const [report, setReport] = useState("");
  const [reported, setReported] = useState(false);
  const [audioUrl, setAudioUrl] = useState("");
  const [pollVersion, setPollVersion] = useState(0);
  const [summary, setSummary] = useState("");
  const evaluation = attempt.evaluation;
  const refreshRef = useRef(onRefresh);
  useEffect(() => {
    refreshRef.current = onRefresh;
  }, [onRefresh]);

  useEffect(() => {
    let active = true;
    if (attempt.retryOf)
      api<Attempt>(`/attempts/${attempt.retryOf}`)
        .then((result) => {
          if (active) setPrevious(result);
        })
        .catch(() => {
          if (active) setComparisonError(true);
        });
    if (attempt.mode === "debate")
      api<Session>(`/sessions/${attempt.sessionId}`)
        .then((result) => {
          if (active) {
            setSummary(result.summary || "");
            setDebateOpening(
              result.turns.find((turn) => turn.speaker === "user")?.text || "",
            );
          }
        })
        .catch(() => {
          if (active && attempt.retryOf) setComparisonError(true);
        });
    return () => {
      active = false;
    };
  }, [
    attempt.id,
    attempt.retryOf,
    attempt.mode,
    attempt.sessionId,
    comparisonVersion,
  ]);

  useEffect(() => {
    if (attempt.status !== "queued" && attempt.status !== "processing") return;
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try {
        const current = await api<Attempt>(`/attempts/${attempt.id}`);
        if (!active) return;
        setAttempt(current);
        if (current.status === "completed" || current.status === "failed") {
          refreshRef.current?.();
          return;
        }
      } catch (e) {
        if (active) setError(errorMessage(e));
      }
      if (active) timer = setTimeout(poll, 1500);
    }
    void poll();
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [attempt.id, attempt.status, pollVersion]);

  async function retryEvaluation() {
    setBusy(true);
    setError("");
    try {
      await api<Job>(`/attempts/${attempt.id}/evaluate`, { method: "POST" });
      setAttempt({ ...attempt, status: "queued" });
      setPollVersion((value) => value + 1);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  async function saveJournal() {
    setBusy(true);
    setError("");
    try {
      await api("/journal", {
        method: "POST",
        body: {
          attemptId: attempt.id,
          articleId: attempt.articleId,
          body: attempt.text,
        },
      });
      setSaved(true);
      onRefresh?.();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  async function sendReport() {
    setBusy(true);
    setError("");
    try {
      await api("/reports", {
        method: "POST",
        body: { attemptId: attempt.id, reason: report },
      });
      setReported(true);
      setShowReport(false);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  async function playback() {
    setBusy(true);
    setError("");
    try {
      const result = await api<{ url: string }>(
        `/audio/${attempt.audioId}/url`,
      );
      setAudioUrl(
        result.url.startsWith("/") ? `${API_BASE}${result.url}` : result.url,
      );
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={s.feedbackContainer}>
      <View style={s.topbar}>
        <Text style={T.h3}>Your feedback</Text>
        <Button label="Close" variant="ghost" icon="x" onPress={onClose} />
      </View>
      <ErrorNote message={error} />
      {!evaluation ? (
        <Card style={{ gap: 18 }}>
          <Text style={T.h2}>
            {attempt.status === "failed"
              ? "Your response is saved."
              : attempt.status === "draft"
                ? "Saved draft"
                : "Preparing feedback…"}
          </Text>
          <Text style={T.body}>{attempt.prompt}</Text>
          <Text style={T.small}>
            {attempt.status === "failed"
              ? "Evaluation failed. Retry without submitting your answer again."
              : attempt.status === "draft"
                ? "Continue when you’re ready for feedback."
                : "You can leave. Your result will appear in Profile."}
          </Text>
          {attempt.status === "failed" && (
            <Button
              label="Retry evaluation"
              icon="refresh-cw"
              loading={busy}
              onPress={() => void retryEvaluation()}
            />
          )}
          {attempt.status === "draft" && (
            <Button
              label="Continue this response"
              onPress={() => onRetry(attempt)}
            />
          )}
          <Text style={T.body}>{attempt.text}</Text>
        </Card>
      ) : (
        <>
          <View style={{ gap: 12 }}>
            <View style={s.chips}>
              <Tag>{names[attempt.mode]}</Tag>
              <Tag color={C.lilac}>
                {evaluation.provider === "local"
                  ? evaluation.assessment
                    ? "Coaching only · no scores"
                    : "Legacy local feedback"
                  : "Provisional AI feedback"}
              </Tag>
              {attempt.retryOf && <Tag color={C.peach}>SECOND BLOOM</Tag>}
            </View>
            <Text accessibilityRole="header" style={s.feedbackTitle}>
              Practice complete
            </Text>
          </View>
          <MotionView testID="feedback-takeaway" style={s.takeawayCard}>
            <View style={s.inline}>
              <Icon name="feather" size={17} color="#D4E2C7" />
              <Text style={[T.label, { color: "#D4E2C7" }]}>NEXT STEP</Text>
            </View>
            <Text style={[T.h2, { color: C.onPrimary, fontSize: 23 }]}>
              {evaluation.key_takeaway}
            </Text>
          </MotionView>
          <ThoughtGuide
            attemptId={attempt.id}
            mode={attempt.mode}
            evaluation={evaluation}
          >
            <View style={s.chips}>
              <Button
                label={
                  attempt.mode === "debate" ? "Revise opening" : "Try again"
                }
                icon="refresh-cw"
                variant="secondary"
                onPress={() => onRetry(attempt)}
              />
              {onOpposite && (
                <Button
                  label="Switch sides"
                  variant="secondary"
                  onPress={onOpposite}
                />
              )}
            </View>
          </ThoughtGuide>
          {attempt.rewards && (
            <View style={s.rewardStrip}>
              <Text style={T.label}>LEARNING REWARDS</Text>
              <View style={s.chips}>
                {Object.entries(attempt.rewards)
                  .filter(
                    (entry): entry is [string, number] =>
                      ["coins", "xp"].includes(entry[0]) &&
                      typeof entry[1] === "number" &&
                      entry[1] > 0,
                  )
                  .map(([key, value]) => (
                    <MotionPulse
                      key={key}
                      triggerKey={`${attempt.id}:${key}:${value}`}
                      animateOnMount={celebrateRewards}
                      testID={`feedback-reward-${key}`}
                      style={s.rewardPill}
                    >
                      <Icon
                        name={
                          {
                            coins: "circle",
                            xp: "zap",
                          }[key] || "gift"
                        }
                        size={15}
                      />
                      <Text
                        style={[
                          T.small,
                          { color: C.forest, fontFamily: "DMBold" },
                        ]}
                      >
                        +{value}{" "}
                        {key === "xp" ? "XP" : key === "coins" ? "Coins" : key}
                      </Text>
                    </MotionPulse>
                  ))}
              </View>
              <Text style={T.small}>
                {Object.values(attempt.rewards).some(
                  (value) => typeof value === "number" && value > 0,
                )
                  ? "Earned for practice, regardless of ratings."
                  : "Practice saved. Eligible rewards already earned."}
              </Text>
              <ConfirmedUnlocks receipt={attempt.rewards.reward} />
              <Button
                label="View my avatar"
                icon="user"
                variant="ghost"
                onPress={onGarden}
              />
            </View>
          )}
          {summary ? (
            <Card style={{ gap: 12 }}>
              <Text style={T.label}>DEBATE SUMMARY</Text>
              <Text style={T.body}>{summary}</Text>
            </Card>
          ) : null}
          <View style={{ gap: 14 }}>
            <View style={{ gap: 4 }}>
              <Text accessibilityRole="header" style={T.h2}>
                {evaluation.assessment
                  ? "Response review"
                  : "Your GROW snapshot"}
              </Text>
              <Text style={T.small}>Tap an area for details.</Text>
            </View>
            {evaluation.provider === "local" && (
              <View style={s.feedbackNotice}>
                <Icon name="info" size={16} />
                <Text style={[T.small, { flex: 1 }]}>
                  {evaluation.assessment
                    ? "Local coaching offers revision prompts, not an assessment of reasoning or facts."
                    : "Legacy local ratings are unvalidated text-pattern checks, excluded from charts."}
                </Text>
              </View>
            )}
            {evaluation.provider !== "local" && (
              <Text style={T.small}>
                These ratings describe this response; they are not validated
                measures of ability.
              </Text>
            )}
            {evaluation.needs_review && (
              <View
                style={[
                  s.feedbackNotice,
                  { backgroundColor: C.yellow, padding: 14, borderRadius: 12 },
                ]}
              >
                <Icon name="alert-circle" size={17} />
                <Text style={[T.small, { flex: 1, color: C.ink }]}>
                  {evaluation.provider === "local" && evaluation.assessment
                    ? "This feedback needs review. No ratings were assigned."
                    : "This feedback needs review. Treat its ratings as tentative."}
                </Text>
              </View>
            )}
            <GrowBreakdown
              evaluation={evaluation}
              previous={previous?.evaluation}
            />
          </View>
          {attempt.retryOf &&
            (previous &&
            (attempt.mode !== "debate" || previous.retryOf || debateOpening) ? (
              <ThoughtTrail
                earlier={
                  attempt.mode === "debate" && !previous.retryOf
                    ? debateOpening
                    : previous.text
                }
                revision={attempt.text}
                openingOnly={attempt.mode === "debate"}
              />
            ) : (
              <Card style={{ gap: 8, padding: 18 }}>
                <Text style={T.small}>
                  {comparisonError
                    ? "Your earlier response couldn’t be loaded."
                    : "Loading your earlier response…"}
                </Text>
                {comparisonError && (
                  <Button
                    label="Reload comparison"
                    variant="ghost"
                    onPress={() => {
                      setComparisonError(false);
                      setComparisonVersion((value) => value + 1);
                    }}
                  />
                )}
              </Card>
            ))}
          {attempt.mode === "read_reflect" && (
            <Button
              label={saved ? "Saved to journal" : "Save to journal"}
              icon={saved ? "check" : "bookmark"}
              disabled={saved}
              loading={busy}
              variant="secondary"
              onPress={() => void saveJournal()}
            />
          )}
          <View style={s.feedbackDetails}>
            <FeedbackDisclosure
              label={
                showAnswer
                  ? "Hide my saved response"
                  : "Review my saved response"
              }
              icon="file-text"
              expanded={showAnswer}
              onPress={() => setShowAnswer(!showAnswer)}
            />
            {showAnswer && (
              <>
                <Text style={T.h3}>{attempt.prompt}</Text>
                <Text style={T.body}>{attempt.text}</Text>
                {attempt.selfReflection ? (
                  <View style={{ gap: 6 }}>
                    <Text style={T.label}>YOUR REFLECTION</Text>
                    <Text style={T.body}>{attempt.selfReflection}</Text>
                  </View>
                ) : null}
                <Text style={T.small}>
                  {new Date(attempt.createdAt).toLocaleString()} ·{" "}
                  {attempt.responseType === "audio"
                    ? "Corrected audio transcript"
                    : "Written response"}
                </Text>
                {attempt.audioId &&
                  (audioUrl ? (
                    <AudioPlayback uri={audioUrl} />
                  ) : (
                    <Button
                      label="Listen to my recording"
                      icon="play"
                      loading={busy}
                      variant="secondary"
                      onPress={() => void playback()}
                    />
                  ))}
              </>
            )}
            <FeedbackDisclosure
              label={
                showMethod
                  ? "Hide assessment method"
                  : "How this feedback works"
              }
              icon="info"
              expanded={showMethod}
              onPress={() => setShowMethod(!showMethod)}
            />
            {showMethod && (
              <View style={{ gap: 10 }}>
                {evaluation.verification_flags.length > 0 && (
                  <View style={{ gap: 8 }}>
                    <Text
                      style={[T.small, { fontFamily: "DMBold", color: C.ink }]}
                    >
                      A note on certainty
                    </Text>
                    {evaluation.verification_flags.map((flag, index) => (
                      <Text key={index} style={T.small}>
                        • {flag}
                      </Text>
                    ))}
                  </View>
                )}
                {evaluation.assessment ? (
                  <AssessmentCriteria
                    mode={attempt.mode}
                    evaluation={evaluation}
                    disclosure={false}
                  />
                ) : (
                  <>
                    <Text style={T.small}>
                      This saved response uses the original, unvalidated GROW
                      rubric for evidence, reasoning, organisation, and
                      perspectives. Its ratings do not measure ability or
                      intelligence, or reward agreement.
                    </Text>
                    <Text style={T.small}>
                      1 Seedling: important gaps. 2 Sprout: some support, with
                      weak links. 3 Blooming: mostly clear and supported. 4
                      Flourishing: coherent, well supported and nuanced. N/A
                      means the dimension could not be assessed.
                    </Text>
                    <Text style={T.small}>Audio delivery is not assessed.</Text>
                  </>
                )}
                <Text style={T.small}>
                  Feedback quotes are checked against the saved answer.
                  Unverified claims are not automatically false. Quote checks do
                  not establish rating accuracy.
                </Text>
                <Text style={T.small}>
                  Rubric {evaluation.rubric_version} · evaluator{" "}
                  {evaluation.model_version} · prompt{" "}
                  {evaluation.prompt_template_version}
                </Text>
              </View>
            )}
            <FeedbackDisclosure
              label={
                reported
                  ? "Concern saved for review"
                  : "Flag questionable feedback"
              }
              icon="flag"
              expanded={showReport}
              disabled={reported}
              onPress={() => setShowReport(!showReport)}
            />
            {showReport && (
              <View style={{ gap: 12 }}>
                <Field
                  value={report}
                  onChangeText={(value) => setReport(value.slice(0, 1000))}
                  label="What should be reviewed?"
                  multiline
                  placeholder="Tell us which quote, rating or suggestion seems off."
                />
                <Button
                  label="Save feedback concern"
                  loading={busy}
                  disabled={report.trim().length < 5}
                  onPress={() => void sendReport()}
                />
              </View>
            )}
          </View>
          <Button
            label="Done"
            icon="check"
            variant="secondary"
            onPress={onClose}
          />
        </>
      )}
    </View>
  );
}

function FeedbackDisclosure({
  label,
  icon,
  expanded,
  disabled,
  onPress,
}: {
  label: string;
  icon: string;
  expanded: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  const { C, T } = useTheme();
  const s = useStyles();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ expanded, disabled }}
      aria-expanded={expanded}
      aria-disabled={disabled}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        s.feedbackDisclosure,
        pressed && { backgroundColor: C.sage },
      ]}
    >
      <Icon name={icon} size={17} />
      <Text
        style={[T.small, { flex: 1, fontFamily: "DMBold", color: C.forest }]}
      >
        {label}
      </Text>
      <Icon
        name={disabled ? "check" : expanded ? "chevron-up" : "chevron-down"}
        size={17}
      />
    </Pressable>
  );
}

const useStyles = createThemedStyles(({ C, T }) =>
  StyleSheet.create({
    scroll: {
      padding: 22,
      paddingBottom: 60,
      flexGrow: 1,
      backgroundColor: C.cream,
    },
    container: { width: "100%", maxWidth: 860, alignSelf: "center", gap: 22 },
    topbar: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 10,
      borderBottomWidth: 1,
      borderBottomColor: C.border,
      paddingBottom: 14,
      marginBottom: 8,
      flexWrap: "wrap",
    },
    inline: { flexDirection: "row", alignItems: "center", gap: 9 },
    between: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      flexWrap: "wrap",
      gap: 10,
    },
    centered: { alignItems: "center", gap: 12 },
    centerText: { textAlign: "center" },
    chips: {
      flexDirection: "row",
      gap: 8,
      flexWrap: "wrap",
      alignItems: "center",
    },
    chip: {
      borderRadius: 24,
      paddingHorizontal: 16,
      minHeight: 44,
      justifyContent: "center",
      borderWidth: 1,
      borderColor: C.border,
      backgroundColor: C.input,
    },
    chipSelected: { backgroundColor: C.forest, borderColor: C.forest },
    notice: {
      backgroundColor: C.sage,
      borderRadius: 14,
      padding: 17,
      gap: 12,
      flexDirection: "row",
      alignItems: "flex-start",
    },
    wheelContainer: {
      width: 280,
      maxWidth: "100%",
      aspectRatio: 1,
      borderRadius: 150,
      borderWidth: 2,
      borderColor: "transparent",
      alignSelf: "center",
      justifyContent: "center",
      alignItems: "center",
      marginTop: 14,
      marginBottom: 4,
    },
    wheelFocused: { borderColor: C.forest },
    wheelTrack: { ...StyleSheet.absoluteFill },
    wheel: { width: "100%", aspectRatio: 1 },
    wheelHubPosition: {
      ...StyleSheet.absoluteFill,
      alignItems: "center",
      justifyContent: "center",
    },
    wheelMiddle: {
      width: 94,
      height: 94,
      borderRadius: 47,
      backgroundColor: C.forest,
      borderWidth: 5,
      borderColor: C.cream,
      alignItems: "center",
      justifyContent: "center",
      gap: 5,
    },
    wheelMiddleActive: { backgroundColor: "#244835" },
    wheelLabel: { fontFamily: "DMBold", fontSize: 13, color: C.cream },
    pointer: { position: "absolute", top: -7, alignSelf: "center" },
    prepClock: {
      width: 238,
      height: 238,
      borderRadius: 119,
      borderWidth: 10,
      borderColor: "#DEE6D1",
      backgroundColor: C.successSurface,
      alignItems: "center",
      justifyContent: "center",
      alignSelf: "center",
      gap: 10,
      marginVertical: 18,
    },
    countdown: {
      fontFamily: "Lora",
      fontSize: 74,
      lineHeight: 85,
      color: C.forest,
    },
    topicOption: {
      flexDirection: "row",
      alignItems: "center",
      gap: 14,
      padding: 17,
      borderRadius: 13,
      borderWidth: 1,
      borderColor: C.border,
      backgroundColor: C.input,
      minHeight: 64,
    },
    turn: {
      padding: 22,
      borderRadius: 19,
      borderWidth: 1,
      borderColor: C.border,
      gap: 12,
    },
    processingIcon: {
      width: 96,
      height: 96,
      borderRadius: 48,
      backgroundColor: C.sage,
      alignItems: "center",
      justifyContent: "center",
    },
    feedbackContainer: {
      width: "100%",
      maxWidth: 780,
      alignSelf: "center",
      gap: 22,
      paddingBottom: 20,
    },
    feedbackTitle: { ...T.title, fontSize: 30, lineHeight: 39 },
    takeawayCard: {
      padding: 24,
      gap: 15,
      borderRadius: 22,
      backgroundColor: C.forest,
    },
    rewardStrip: { gap: 10, paddingVertical: 4 },
    rewardPill: {
      flexGrow: 1,
      flexBasis: 130,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      paddingVertical: 8,
      paddingHorizontal: 12,
      borderRadius: 12,
      backgroundColor: C.successSurface,
    },
    feedbackNotice: { flexDirection: "row", alignItems: "flex-start", gap: 9 },
    feedbackDetails: {
      gap: 12,
      borderTopWidth: 1,
      borderTopColor: C.border,
      paddingTop: 10,
    },
    feedbackDisclosure: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      minHeight: 48,
      paddingVertical: 12,
      paddingHorizontal: 10,
      borderRadius: 10,
    },
  }),
);
