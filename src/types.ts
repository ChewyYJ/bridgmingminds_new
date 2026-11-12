export type Mode = "spin_speak" | "debate" | "read_reflect";
export type Page =
  "home" | "play" | "discover" | "garden" | "profile" | "settings";
export interface Profile {
  id: string;
  displayName: string;
  email: string | null;
  isGuest: boolean;
  interests: string[];
  goal: string;
  timezone: string;
  onboardingComplete: boolean;
  reducedMotion?: boolean;
  dailyWorkout?: boolean;
  dailyEnrolledAt?: string;
  wordBloomEnabled?: boolean;
  consent?: { recording: boolean; analytics: boolean };
  createdAt: string;
}
export interface Wallet {
  seeds: number;
  water: number;
  sunlight: number;
}
export interface Plot {
  carePolicy?: "non_punitive_v1";
  id: string;
  plantType:
    | null
    | "daisy"
    | "sunflower"
    | "lavender"
    | "tulip"
    | "fern"
    | "cactus"
    | "monstera"
    | "bamboo"
    | "doodle";
  position?: GardenPosition;
  doodle?: Doodle;
  growth: number;
  plantedAt?: string;
  lastWateredAt?: string;
  plantId?: string;
  waterDueAt?: string;
}
export interface ArchivedPlant extends Plot {
  archivedAt: string;
  careRemainingMs: number;
}
export interface GardenPosition {
  x: number;
  y: number;
}
export interface Doodle {
  strokes: { color: string; points: GardenPosition[] }[];
}
export interface Dimension {
  status?: "assessed" | "not_assessed" | "insufficient_evidence";
  key: string;
  label?: string;
  level: number | null;
  confidence: string;
  evidence_spans: { start: number; end: number; quote: string }[];
  strength: string;
  improvement: string;
}
export interface Evaluation {
  feedback?: {
    strength: string;
    priority_gap: string;
    next_question: string;
    evidence_spans: { start: number; end: number; quote: string }[];
  };
  thought_map?: ThoughtMap;
  applicability?: string[];
  assessment?: {
    framework_id: string;
    title: string;
    validation_status: "unvalidated";
    scoring_method: "llm_rubric" | "local_prompts";
    source_scope: "provided_summary" | "response_only";
    foundations: { title: string; url: string }[];
  };
  rubric_version: string;
  model_version: string;
  prompt_template_version: string;
  created_at?: string;
  attempt_id: string;
  mode: Mode;
  provider: "local" | "openai";
  dimensions: Dimension[];
  overall_score: null | number;
  key_takeaway: string;
  retry_prompt: string;
  guiding_questions?: { question: string; placeholder: string }[];
  verification_flags: string[];
  needs_review: boolean;
}
export interface Attempt {
  wordBloom?: { version: string; discoveredWordIds: string[] };
  id: string;
  sessionId: string;
  mode: Mode;
  prompt: string;
  text: string;
  responseType: "text" | "audio";
  selfReflection?: string;
  status: "draft" | "queued" | "processing" | "completed" | "failed";
  retryOf?: string;
  audioId?: string;
  createdAt: string;
  completedAt?: string;
  evaluation?: Evaluation;
  rewards?: Partial<Wallet> & { xp?: number; reason?: string };
  articleId?: string;
}
export interface Quest {
  id: string;
  title: string;
  description: string;
  target: number;
  progress: number;
  completed: boolean;
  reward: Wallet & { xp: number };
}
export interface JournalEntry {
  id: string;
  attemptId: string;
  articleId?: string;
  body: string;
  createdAt: string;
}
export interface AppState {
  dailyWorkout?: DailyWorkoutStatus | null;
  readAloudAttempts?: ReadAloudAttempt[];
  profile: Profile;
  wallet: Wallet;
  plots: Plot[];
  archivedPlants: ArchivedPlant[];
  attempts: Attempt[];
  quests: Quest[];
  journal: JournalEntry[];
  decorations: string[];
  streak: number;
  practiceWeek: {
    day: string;
    timezone: string;
    days: string[];
    target: 3;
  };
  xp: number;
}
export interface DailyWorkoutStatus {
  day: string;
  timezone: string;
  completed: number;
  required: 2;
  xp: number;
  activities: {
    type: "read_aloud" | "spin_speak";
    xp: number;
    completed: boolean;
  }[];
  streak: { current: number; longest: number; securedToday: boolean };
}
export interface ReadingAssignment {
  wordbloom?: { version: string; words: ReadingWord[] };
  id: string;
  localDate: string;
  timezone: string;
  passage: { id: string; title: string; text: string; target: string };
  speech: { status: string; message: string };
  latestAttempt?: ReadAloudAttempt;
}
export interface ReadingWord {
  vocabularyId: string;
  wordId: string;
  word: string;
  meaning: string;
  example: string;
  firstExposure: boolean;
  spans: { start: number; end: number }[];
}
export type WordReviewOutcome =
  "not_assessed" | "needs_practice" | "comfortable";
export interface WordBloomItem {
  id: string;
  wordId: string;
  word: string;
  meaning: string;
  example: string;
  status: "scheduled" | "introduced" | "review_due" | "familiar" | "dismissed";
  source: {
    attemptId: string;
    span: { start: number; end: number; quote: string };
    kind: string;
    reason: string;
    confidence: string;
  };
  dueAt: string;
  intervalDays: number;
  exposureCount: number;
  productiveUseCandidates: number;
  pronunciationReview?: {
    policyVersion: string;
    validationStatus: "unvalidated";
    locale: string;
    observationStatus: "observed" | "insufficient_evidence";
    outcome: string;
    action: "unchanged" | "review_sooner" | "review_later";
  };
}
export interface WordBloomSummary {
  enabled: boolean;
  version: string;
  words: WordBloomItem[];
}
export interface ReadAloudAttempt {
  id: string;
  sessionId: string;
  mode: "read_aloud";
  text: string;
  audioId?: string;
  speechAssessment?: SpeechAssessment;
  createdAt: string;
  passage: ReadingAssignment["passage"];
  evaluation: {
    key_takeaway: string;
    next_step: string;
    speech: { status: "not_assessed"; metrics: null };
  };
  rewards: {
    xp: number;
    seeds: number;
    completed: number;
    streakSecured: boolean;
  };
}
export interface SpeechAssessment {
  status: "assessed" | "partial" | "no_speech";
  provider: "azure";
  sdkVersion: string;
  locale: string;
  validationStatus: "unvalidated";
  metrics: null;
  limitations: string[];
  utterances: {
    startMs: number;
    durationMs: number;
    transcript: string;
    metrics: Record<string, number | null>;
  }[];
  words: {
    word: string;
    startMs: number;
    durationMs: number;
    accuracy: number | null;
    providerErrorType: string;
    sourceSpan: { start: number; end: number; text: string } | null;
  }[];
}
export interface Prompt {
  bridgeDimensions?: ("B" | "R" | "I" | "D" | "G" | "E")[];
  id: string;
  mode: Mode;
  question: string;
  category: string;
  context?: string;
  difficulty?: string;
}
export interface Article {
  id: string;
  title: string;
  source: string;
  sourceUrl: string;
  publishedAt: string;
  category: string;
  summary: string;
  questions: string[];
  readMinutes: number;
  license: string;
  image?: string;
}
export interface Session {
  learningFocus?: { recommendationId: string; dimension: string; label: string; instruction: string; policyVersion: string };
  assessmentFramework?: "bridge-v1";
  id: string;
  mode: Mode;
  prompt: Prompt;
  articleId?: string;
  position?: string;
  rounds: number;
  turns: { id: string; speaker: "user" | "ai"; text: string; round: number }[];
  status: string;
  summary?: string;
}
export interface ThoughtMapNode {
  id: string;
  type:
    | "claim"
    | "reason"
    | "evidence"
    | "warrant"
    | "backing"
    | "qualifier"
    | "rebuttal";
  text: string | null;
  status: "explicit" | "inferred" | "missing";
  source_span?: { start: number; end: number };
  quote?: string;
  confidence: string;
  feedback: string;
}
export interface ThoughtMap {
  version: string;
  status: "provisional" | "insufficient_evidence" | "not_assessed";
  nodes: ThoughtMapNode[];
  edges: {
    id: string;
    source: string;
    target: string;
    relation:
      | "supports"
      | "explains"
      | "challenges"
      | "qualifies"
      | "needs_explanation";
  }[];
}
export interface Job {
  id: string;
  status: "queued" | "processing" | "completed" | "failed";
  attemptId: string;
  error?: string;
}
