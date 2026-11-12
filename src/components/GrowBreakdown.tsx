import React, { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import type { Dimension, Evaluation } from "../types";
import { C, Icon, T } from "./ui";
import { MotionView } from "./Motion";

const GROW_KEYS = ["grounded", "reasoned", "organised", "well_rounded"];
const DIMENSIONS: Record<
  string,
  { name: string; letter: string; color: string }
> = {
  grounded: { name: "Grounded", letter: "G", color: C.sage },
  reasoned: { name: "Reasoned", letter: "R", color: C.peach },
  organised: { name: "Organised", letter: "O", color: C.lilac },
  well_rounded: { name: "Well-rounded", letter: "W", color: C.yellow },
  delivery: { name: "Delivery", letter: "", color: "#EDF0E9" },
};
const LEVELS = [
  "Not assessed",
  "Seedling",
  "Sprout",
  "Blooming",
  "Flourishing",
];

function DimensionRow({
  dimension,
  prior,
  divided = false,
  provisional = false,
  local = false,
}: {
  dimension: Dimension;
  prior?: Dimension;
  divided?: boolean;
  provisional?: boolean;
  local?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [focused, setFocused] = useState(false);
  const appearance = DIMENSIONS[dimension.key];
  const name = dimension.label || appearance?.name || dimension.key;
  const assessed = dimension.level != null && !(provisional && local);
  const levelName = provisional
    ? assessed
      ? "Provisional rating"
      : local && dimension.key !== "delivery"
        ? "Coaching only"
        : "Not assessed"
    : LEVELS[dimension.level || 0] || "Not assessed";
  const comparison = prior?.level != null && dimension.level != null;
  return (
    <View style={[divided && s.divider, expanded && s.expandedRow]}>
      <Pressable
        testID={`grow-dimension-${dimension.key}`}
        accessibilityRole="button"
        accessibilityLabel={
          assessed
            ? `${name} feedback, ${levelName}, ${dimension.level} out of 4`
            : `${name} feedback, ${levelName.toLowerCase()}`
        }
        accessibilityHint="Show or hide the strength, evidence, and next step."
        accessibilityState={{ expanded }}
        aria-expanded={expanded}
        onPress={() => setExpanded((value) => !value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={({ pressed }) => [
          s.rowButton,
          pressed && { backgroundColor: C.sage },
          focused && { borderColor: C.forest },
        ]}
      >
        <View
          style={[s.letter, { backgroundColor: appearance?.color || C.sage }]}
          accessible={false}
          aria-hidden
        >
          {dimension.key === "delivery" ? (
            <Icon name="mic" size={17} />
          ) : (
            <Text style={s.letterText}>
              {provisional
                ? name[0]?.toUpperCase()
                : appearance?.letter || name[0]?.toUpperCase()}
            </Text>
          )}
        </View>
        <View style={s.nameColumn}>
          <Text style={[T.h3, s.dimensionName]} numberOfLines={2}>
            {name}
          </Text>
          <Text style={[T.small, s.levelName]}>{levelName}</Text>
        </View>
        <View style={s.scoreColumn} accessible={false} aria-hidden>
          <Text style={[T.small, s.score]}>
            {assessed ? `${dimension.level} / 4` : "N/A"}
          </Text>
          {assessed && (
            <View style={s.levelBar}>
              {[1, 2, 3, 4].map((level) => (
                <View
                  key={level}
                  style={[
                    s.levelSegment,
                    {
                      backgroundColor:
                        level <= dimension.level! ? C.forest : "#E1E7D8",
                    },
                  ]}
                />
              ))}
            </View>
          )}
        </View>
        <View accessible={false} aria-hidden>
          <Icon
            name={expanded ? "chevron-up" : "chevron-down"}
            size={17}
            color={C.muted}
          />
        </View>
      </Pressable>
      {expanded && (
        <MotionView
          testID={`grow-detail-${dimension.key}`}
          style={s.details}
          distance={4}
          duration={180}
        >
          <View style={s.detailRule} />
          <View style={s.detailHeader}>
            <Text style={s.detailLabel}>
              {assessed ? "STRENGTH" : "ASSESSMENT NOTE"}
            </Text>
            {!local && (
              <Text style={[T.small, s.confidence]}>
                Model certainty: {dimension.confidence} (uncalibrated)
              </Text>
            )}
          </View>
          <Text style={[T.body, s.detailBody]}>{dimension.strength}</Text>
          {dimension.evidence_spans.length > 0 && (
            <View style={{ gap: 8 }}>
              {dimension.evidence_spans.map((evidence, index) => (
                <View
                  key={`${evidence.start}-${evidence.end}-${index}`}
                  style={s.quote}
                >
                  <Text
                    testID={`grow-evidence-${dimension.key}-${index}`}
                    selectable
                    style={[T.body, s.quoteText]}
                  >
                    “{evidence.quote}”
                  </Text>
                  <Text style={[T.small, { fontSize: 11 }]}>
                    From your saved answer
                  </Text>
                </View>
              ))}
            </View>
          )}
          <View style={s.nextStep}>
            <Text style={s.detailLabel}>NEXT STEP</Text>
            <Text style={[T.body, s.detailBody]}>{dimension.improvement}</Text>
          </View>
          {comparison && (
            <View style={s.comparison}>
              <Text style={[T.small, { color: C.ink, fontFamily: "DMBold" }]}>
                Previous attempt: {prior.level}/4 → this attempt:{" "}
                {dimension.level}/4
              </Text>
              <Text style={T.small}>One pair of responses is not a trend.</Text>
            </View>
          )}
        </MotionView>
      )}
    </View>
  );
}

export function GrowBreakdown({
  evaluation,
  previous,
}: {
  evaluation: Evaluation;
  previous?: Evaluation;
}) {
  const grow = GROW_KEYS.flatMap((key) =>
    evaluation.dimensions.filter((dimension) => dimension.key === key),
  );
  const supplemental = evaluation.dimensions.filter(
    (dimension) => !GROW_KEYS.includes(dimension.key),
  );
  const comparable =
    !evaluation.assessment &&
    !previous?.assessment &&
    previous?.rubric_version === evaluation.rubric_version &&
    previous.provider === evaluation.provider &&
    previous.model_version === evaluation.model_version &&
    previous.prompt_template_version === evaluation.prompt_template_version;
  const priorFor = (dimension: Dimension) =>
    comparable
      ? previous?.dimensions.find((item) => item.key === dimension.key)
      : undefined;
  return (
    <View style={s.container}>
      {grow.length > 0 && (
        <View style={s.card}>
          {grow.map((dimension, index) => (
            <DimensionRow
              key={`${evaluation.attempt_id}-${dimension.key}`}
              dimension={dimension}
              prior={priorFor(dimension)}
              divided={index > 0}
              provisional={Boolean(evaluation.assessment)}
              local={evaluation.provider === "local"}
            />
          ))}
        </View>
      )}
      {supplemental.map((dimension) => (
        <View key={`${evaluation.attempt_id}-${dimension.key}`} style={s.card}>
          <DimensionRow
            dimension={dimension}
            prior={priorFor(dimension)}
            provisional={Boolean(evaluation.assessment)}
            local={evaluation.provider === "local"}
          />
        </View>
      ))}
    </View>
  );
}

const s = StyleSheet.create({
  container: { width: "100%", alignSelf: "center", gap: 10 },
  card: {
    backgroundColor: C.paper,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 18,
    overflow: "hidden",
  },
  divider: { borderTopWidth: 1, borderTopColor: C.border },
  expandedRow: { backgroundColor: "#FCFDF8" },
  rowButton: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 76,
    paddingHorizontal: 13,
    paddingVertical: 12,
    gap: 10,
    borderWidth: 2,
    borderColor: "transparent",
    borderRadius: 14,
  },
  letter: {
    width: 34,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  letterText: {
    fontFamily: "Lora",
    color: C.forest,
    fontSize: 19,
    lineHeight: 25,
  },
  nameColumn: { flex: 1, minWidth: 0, gap: 2 },
  dimensionName: { fontSize: 15, lineHeight: 21, flexShrink: 1 },
  levelName: { fontSize: 11, lineHeight: 16 },
  scoreColumn: { alignItems: "flex-end", gap: 7, flexShrink: 0 },
  score: { color: C.forest, fontFamily: "DMBold", fontSize: 12 },
  levelBar: { width: 49, flexDirection: "row", gap: 3 },
  levelSegment: { height: 4, borderRadius: 3, flex: 1 },
  details: { paddingHorizontal: 18, paddingBottom: 19, gap: 12 },
  detailRule: { height: 1, backgroundColor: C.border, marginBottom: 2 },
  detailHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: 8,
  },
  detailLabel: { ...T.label, fontSize: 9, letterSpacing: 1.2 },
  confidence: { fontSize: 11, lineHeight: 16 },
  detailBody: { fontSize: 14, lineHeight: 22 },
  quote: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderLeftWidth: 3,
    borderLeftColor: "#B7C6A6",
    backgroundColor: C.cream,
    gap: 5,
  },
  quoteText: { fontSize: 14, lineHeight: 22, fontStyle: "italic" },
  nextStep: { gap: 6 },
  comparison: {
    borderTopWidth: 1,
    borderTopColor: C.border,
    paddingTop: 10,
    gap: 3,
  },
});
