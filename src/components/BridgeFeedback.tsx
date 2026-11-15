import React, { useEffect, useRef, useState } from "react";
import { Text, View } from "react-native";
import { getBridgeRubric } from "../../shared/bridge-rubric.mjs";
import {
  THOUGHT_MAP_SAMPLE,
  THOUGHT_MAP_SAMPLE_TEXT,
  THOUGHT_MAP_SAMPLE_NOTES,
} from "../../shared/thought-map-sample.mjs";
import { api } from "../lib/api";
import { ConfirmedUnlocks } from "../role3/ConfirmedUnlocks";
import type { Attempt } from "../types";
import { AssessmentCriteria } from "./AssessmentCriteria";
import { PrivateRecordingPlayback } from "./PrivateRecording";
import { ThoughtGuide } from "./ThoughtGuide";
import { ThoughtMapView } from "./ThoughtMap";
import { ThoughtTrail } from "./ThoughtTrail";
import { WordBloomPreview } from "./WordBloom";
import { Button, C, Card, ErrorNote, Field, T, Tag } from "./ui";

export function BridgeFeedback({
  attempt,
  onClose,
  onRetry,
  onGarden,
  onRefresh,
}: {
  attempt: Attempt;
  onClose: () => void;
  onRetry: (attempt: Attempt) => void;
  onGarden: () => void;
  onRefresh?: () => void;
}) {
  const evaluation = attempt.evaluation!;
  const [breakdown, setBreakdown] = useState(false);
  const [showAnswer, setShowAnswer] = useState(false);
  const [sample, setSample] = useState(false);
  const [previous, setPrevious] = useState<Attempt | null>(null);
  const [comparisonError, setComparisonError] = useState("");
  const [comparisonVersion, setComparisonVersion] = useState(0);
  const [reportOpen, setReportOpen] = useState(false);
  const [report, setReport] = useState("");
  const [reported, setReported] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const refresh = useRef(onRefresh);
  useEffect(() => {
    refresh.current = onRefresh;
  }, [onRefresh]);
  useEffect(() => {
    refresh.current?.();
  }, [attempt.id]);
  useEffect(() => {
    if (!attempt.retryOf) return;
    const controller = new AbortController();
    void api<Attempt>(`/attempts/${attempt.retryOf}`, {
      signal: controller.signal,
    })
      .then((value) => {
        if (!controller.signal.aborted) {
          setPrevious(value);
          setComparisonError("");
        }
      })
      .catch((e) => {
        if (!controller.signal.aborted) setComparisonError(e.message);
      });
    return () => controller.abort();
  }, [attempt.retryOf, comparisonVersion]);
  async function sendReport() {
    setBusy(true);
    setError("");
    try {
      await api("/reports", {
        method: "POST",
        body: { attemptId: attempt.id, reason: report },
      });
      setReported(true);
      setReportOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Please try again.");
    } finally {
      setBusy(false);
    }
  }
  const map = evaluation.thought_map;
  const primary = evaluation.feedback!;
  return (
    <View style={{ gap: 20 }}>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
        <Button label="Done" variant="ghost" onPress={onClose} />
        <Tag>BRIDGE · response coaching</Tag>
        <Tag color={C.lilac}>
          {evaluation.provider === "local"
            ? "Coaching only · no scores"
            : "Provisional AI feedback"}
        </Tag>
      </View>
      <Text accessibilityRole="header" style={T.title}>
        Practice complete
      </Text>
      <Text style={T.body}>{attempt.prompt}</Text>
      <Card
        style={{ gap: 14, backgroundColor: C.sage }}
        testID="bridge-priority-feedback"
      >
        <Text style={T.label}>
          {evaluation.provider === "local" ? "Self-review" : "One next step"}
        </Text>
        <Text style={T.h3}>What to keep</Text>
        <Text style={T.body}>{primary.strength}</Text>
        <Text style={T.h3}>
          {evaluation.provider === "local"
            ? "What is not assessed"
            : "What to explore"}
        </Text>
        <Text style={T.body}>{primary.priority_gap}</Text>
        {primary.evidence_spans.map((span, index) => (
          <Text
            selectable
            key={`${span.start}-${span.end}`}
            testID={`bridge-primary-evidence-${index}`}
            style={[T.body, { fontStyle: "italic" }]}
          >
            “{span.quote}”
          </Text>
        ))}
        <Text style={T.h3}>{primary.next_question}</Text>
        <Button
          label={attempt.retryOf ? "Revise again" : "Try again"}
          onPress={() => onRetry(attempt)}
        />
      </Card>
      {map?.nodes.length ? (
        <ThoughtMapView
          map={map}
          topic={attempt.prompt}
          answer={attempt.text}
          notes={attempt.planningNotes}
          written={attempt.responseType === "text"}
        />
      ) : (
        <Card style={{ gap: 12 }}>
          <Text style={T.h2}>
            Thought Map{" "}
            {evaluation.provider === "local" ? "not assessed" : "unavailable"}
          </Text>
          <Text style={T.body}>
            {evaluation.provider === "local"
              ? "Local coaching has not extracted claims or reasoning from your response. Your saved words remain available below."
              : map?.validationIncomplete
                ? "The AI map could not be verified against your saved sources. Your BRIDGE feedback is available."
                : "There was insufficient interpretable evidence for an extracted map. Missing evidence is not a low score."}
          </Text>
          <Button
            label={sample ? "Close sample map" : "View sample map"}
            variant="secondary"
            onPress={() => setSample((value) => !value)}
          />
        </Card>
      )}
      {sample && !map?.nodes.length ? (
        <ThoughtMapView
          map={THOUGHT_MAP_SAMPLE}
          topic="How could a shared garden help a neighbourhood?"
          answer={THOUGHT_MAP_SAMPLE_TEXT}
          notes={THOUGHT_MAP_SAMPLE_NOTES}
          sample
        />
      ) : null}
      <WordBloomPreview ids={attempt.wordBloom?.discoveredWordIds} />
      <ThoughtGuide
        attemptId={attempt.id}
        mode={attempt.mode}
        evaluation={evaluation}
        collapsed
      >
        <Button
          label="Revise after reflection"
          variant="secondary"
          onPress={() => onRetry(attempt)}
        />
      </ThoughtGuide>
      <Button
        label={
          breakdown ? "Hide full BRIDGE breakdown" : "See full BRIDGE breakdown"
        }
        variant="secondary"
        onPress={() => setBreakdown((value) => !value)}
      />
      {breakdown ? (
        <Card style={{ gap: 18 }} testID="bridge-breakdown">
          {evaluation.dimensions.map((dimension) => (
            <View
              key={dimension.key}
              testID={`bridge-dimension-${dimension.key}`}
              style={{
                gap: 7,
                paddingBottom: 14,
                borderBottomWidth: 1,
                borderColor: C.border,
              }}
            >
              <Text style={T.h3}>
                {dimension.key} · {dimension.label}
              </Text>
              <Text style={T.body}>
                {dimension.level === null
                  ? dimension.status === "insufficient_evidence"
                    ? "Insufficient evidence · N/A"
                    : "Not assessed · N/A"
                  : `${dimension.level}/4 · provisional`}
              </Text>
              <Text style={T.body}>{dimension.strength}</Text>
              <Text style={T.body}>{dimension.improvement}</Text>
              {dimension.evidence_spans.map((span) => (
                <Text
                  selectable
                  key={`${span.start}-${span.end}`}
                  style={T.body}
                >
                  “{span.quote}”
                </Text>
              ))}
            </View>
          ))}
          <Text style={T.small}>
            Expression concerns wording. Pronunciation, accent and vocal
            delivery are not assessed.
          </Text>
          <AssessmentCriteria
            mode={attempt.mode}
            evaluation={evaluation}
            framework="bridge-v1"
          />
        </Card>
      ) : null}
      <Card style={{ gap: 12 }}>
        <Text style={T.label}>Participation rewards</Text>
        {(["coins", "xp"] as const)
          .filter((key) => (attempt.rewards?.[key] || 0) > 0)
          .map((key) => (
            <Text key={key} testID={`feedback-reward-${key}`} style={T.h3}>
              +{attempt.rewards![key]} {key === "xp" ? "XP" : "Coins"}
            </Text>
          ))}
        <Text style={T.small}>
          {attempt.rewards?.reason ||
            "Your response is saved. Rewards recognise participation, not ratings or mastery."}
        </Text>
        <ConfirmedUnlocks receipt={attempt.rewards?.reward} />
        <Button label="View my avatar" variant="secondary" onPress={onGarden} />
      </Card>
      {attempt.retryOf ? (
        previous ? (
          <>
            <ThoughtTrail earlier={previous.text} revision={attempt.text} />
            {previous.evaluation?.thought_map?.nodes.length ? (
              <View style={{ gap: 12 }}>
                <Text accessibilityRole="header" style={T.h2}>
                  Earlier attempt · saved map
                </Text>
                <ThoughtMapView
                  map={previous.evaluation.thought_map}
                  topic={previous.prompt}
                  answer={previous.text}
                  notes={previous.planningNotes}
                  written={previous.responseType === "text"}
                />
                <Text style={T.small}>
                  The current map above uses your revised response. Compare the
                  actual evidence; no ability gain is inferred from a score
                  change.
                </Text>
              </View>
            ) : (
              <Text style={T.small}>
                The earlier response has no extracted map. Its original feedback
                is preserved.
              </Text>
            )}
          </>
        ) : (
          <Card style={{ gap: 10 }}>
            <ErrorNote message={comparisonError} />
            <Text style={T.small}>
              {comparisonError
                ? "The earlier response could not be loaded."
                : "Loading earlier response…"}
            </Text>
            {comparisonError ? (
              <Button
                label="Reload comparison"
                variant="ghost"
                onPress={() => setComparisonVersion((value) => value + 1)}
              />
            ) : null}
          </Card>
        )
      ) : null}
      <Button
        label={
          showAnswer ? "Hide my saved response" : "Review my saved response"
        }
        variant="ghost"
        onPress={() => setShowAnswer((value) => !value)}
      />
      {showAnswer ? (
        <Card style={{ gap: 12 }}>
          <Text selectable style={T.body}>
            {attempt.text}
          </Text>
          {attempt.audioId ? (
            <PrivateRecordingPlayback id={attempt.audioId} />
          ) : null}
        </Card>
      ) : null}
      <Text style={T.small}>
        {getBridgeRubric().limitations[0]} No overall ability or mastery score
        is calculated.
      </Text>
      <Text style={T.small}>
        Rubric {evaluation.rubric_version} · model {evaluation.model_version} ·
        template {evaluation.prompt_template_version}
      </Text>
      <ErrorNote message={error} />
      <Button
        label={
          reported
            ? "Feedback reported"
            : reportOpen
              ? "Cancel report"
              : "Report a feedback concern"
        }
        variant="ghost"
        disabled={reported}
        onPress={() => setReportOpen((value) => !value)}
      />
      {reportOpen ? (
        <Card style={{ gap: 10 }}>
          <Field
            label="Your feedback concern"
            value={report}
            onChangeText={setReport}
            multiline
          />
          <Button
            label="Send feedback report"
            loading={busy}
            disabled={report.trim().length < 5}
            onPress={() => void sendReport()}
          />
        </Card>
      ) : null}
    </View>
  );
}
