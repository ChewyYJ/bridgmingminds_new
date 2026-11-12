export type AssessmentMode = "spin_speak" | "debate" | "read_reflect";
export type AssessmentKey =
  "grounded" | "reasoned" | "organised" | "well_rounded";
export interface AssessmentRubric {
  id: string;
  title: string;
  criteria: {
    key: AssessmentKey;
    label: string;
    description: string;
    levels: [string, string, string, string];
  }[];
  foundations: { title: string; url: string }[];
  limitations: string[];
}
export function getAssessmentRubric(mode: AssessmentMode): AssessmentRubric;
