import React, { useState } from "react";
import { Linking, Pressable, StyleSheet, Text, View } from "react-native";
import { getAssessmentRubric } from "../../shared/assessment-rubrics.mjs";
import { getBridgeRubric } from "../../shared/bridge-rubric.mjs";
import type { Evaluation, Mode } from "../types";
import { C, ErrorNote, Icon, T } from "./ui";

export function AssessmentCriteria({
  mode,
  evaluation,
  disclosure = true,
  framework,
}: {
  mode: Mode;
  evaluation?: Evaluation;
  disclosure?: boolean;
  framework?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const [focused, setFocused] = useState(false);
  const [error, setError] = useState("");
  const rubric = framework === "bridge-v1" || evaluation?.assessment?.framework_id === "bridge-v1" ? getBridgeRubric() : getAssessmentRubric(mode);
  const matchingVersion =
    !evaluation || evaluation.assessment?.framework_id === rubric.id;
  const foundations = evaluation?.assessment?.foundations || rubric.foundations;

  async function openSource(url: string) {
    setError("");
    try {
      if (!url.startsWith("https://")) throw new Error("Invalid source link.");
      await Linking.openURL(url);
    } catch {
      setError("This source could not be opened. Please try again.");
    }
  }

  return (
    <View style={disclosure ? s.container : undefined}>
      {disclosure && (
        <Pressable
          testID="assessment-criteria-toggle"
          accessibilityRole="button"
          accessibilityLabel="Criteria"
          accessibilityState={{ expanded }}
          aria-expanded={expanded}
          onPress={() => setExpanded((value) => !value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          style={({ pressed }) => [
            s.toggle,
            pressed && { backgroundColor: C.sage },
            focused && { borderColor: C.forest },
          ]}
        >
          <Icon name="list" size={17} />
          <Text style={[T.small, s.toggleText]}>Criteria</Text>
          <Icon name={expanded ? "chevron-up" : "chevron-down"} size={17} />
        </Pressable>
      )}
      {(!disclosure || expanded) && (
        <View
          testID="assessment-criteria-details"
          style={[s.details, disclosure && s.inset]}
        >
          <Text style={T.h3}>
            {evaluation?.assessment?.title || rubric.title}
          </Text>
          <Text style={T.small}>
            {rubric.criteria.length} criteria for this response. AI ratings are provisional; local
            coaching has no scores.
          </Text>
          {matchingVersion ? (
            rubric.criteria.map((criterion) => (
              <View
                key={criterion.key}
                testID={`assessment-criterion-${criterion.key}`}
                style={s.criterion}
              >
                <Text style={[T.body, s.criterionTitle]}>
                  {criterion.label}
                </Text>
                <Text style={T.small}>{criterion.description}</Text>
                {criterion.levels.map((anchor, index) => (
                  <View key={index} style={s.anchor}>
                    <Text style={[T.small, s.number]}>{index + 1}</Text>
                    <Text style={[T.small, s.anchorText]}>{anchor}</Text>
                  </View>
                ))}
              </View>
            ))
          ) : (
            <Text style={T.small}>
              This response used an earlier rubric version. Its saved feedback
              is preserved; current criteria are not substituted.
            </Text>
          )}
          <Text style={T.small}>
            {evaluation?.assessment?.source_scope === "provided_summary" ||
            (!evaluation && mode === "read_reflect")
              ? "Reading feedback uses the supplied summary and your answer, not the full publisher article."
              : "Feedback uses your response and task context; outside claims are not independently verified."}
          </Text>
          <Text style={T.small}>
            Audio delivery is not assessed. Recordings use your corrected
            transcript; accent and pronunciation are not rated.
          </Text>
          {matchingVersion &&
            rubric.limitations.map((limitation) => (
              <Text key={limitation} style={T.small}>
                {limitation}
              </Text>
            ))}
          {!matchingVersion && (
            <Text style={T.small}>
              This adaptation has not been validated as a measure of ability.
              N/A is different from a low rating. Model certainty is
              uncalibrated.
            </Text>
          )}
          <View style={s.sources}>
            <Text style={[T.small, s.criterionTitle]}>
              Research foundations
            </Text>
            {foundations.map((foundation) => (
              <Pressable
                key={foundation.url}
                accessibilityRole="link"
                accessibilityLabel={foundation.title}
                accessibilityHint="Open the research source in your browser."
                onPress={() => void openSource(foundation.url)}
                style={({ pressed }) => [
                  s.source,
                  pressed && { backgroundColor: C.sage },
                ]}
              >
                <Text style={[T.small, s.sourceText]}>{foundation.title}</Text>
                <Icon name="external-link" size={14} />
              </Pressable>
            ))}
            <ErrorNote message={error} />
          </View>
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  container: {
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 15,
    backgroundColor: C.paper,
    overflow: "hidden",
  },
  toggle: {
    minHeight: 48,
    paddingHorizontal: 14,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 2,
    borderColor: "transparent",
    borderRadius: 14,
  },
  toggleText: { flex: 1, color: C.forest, fontFamily: "DMBold" },
  details: { gap: 14 },
  inset: { padding: 16, paddingTop: 4 },
  criterion: {
    gap: 8,
    borderTopWidth: 1,
    borderColor: C.border,
    paddingTop: 13,
  },
  criterionTitle: { color: C.ink, fontFamily: "DMBold" },
  anchor: { flexDirection: "row", alignItems: "flex-start", gap: 9 },
  number: { color: C.forest, fontFamily: "DMBold", width: 14 },
  anchorText: { flex: 1 },
  sources: { gap: 4 },
  source: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 8,
    borderRadius: 6,
  },
  sourceText: { flex: 1, color: C.forest, textDecorationLine: "underline" },
});
