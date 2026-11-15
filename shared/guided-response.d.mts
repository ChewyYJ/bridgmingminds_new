export interface GuidedResponseDraft {
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
export function isGuidedResponseDraft(
  value: unknown,
): value is GuidedResponseDraft;
