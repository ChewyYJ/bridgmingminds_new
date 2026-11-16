export interface GuidedResponseDraft {
  vocabularyTier?: "advanced" | typeof DAILY_VOCABULARY_TIER;
  vocabularyEligibleCount?: number;
  vocabulary?: {
    wordId: string;
    word: string;
    meaning: string;
    spans: { start: number; end: number }[];
  }[];
  text: string;
  annotations: {
    start: number;
    end: number;
    quote: string;
    label: string;
    explanation: string;
  }[];
  provider: "openai";
  model: string;
  createdAt: string;
}
export const GUIDED_RESPONSE_LIMITS: {
  text: number;
  quote: number;
  label: number;
  explanation: number;
};
export const DAILY_VOCABULARY_TIER: "advanced-phrases";
export function dailyVocabularyMinimum(eligibleCount: number): number;
export function isGuidedResponseDraft(
  value: unknown,
): value is GuidedResponseDraft;
