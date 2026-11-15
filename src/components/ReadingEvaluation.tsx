import React, { useState } from "react";
import { Linking, Pressable, Text, View } from "react-native";
import {
  READING_CRITERIA,
  READING_FOUNDATION,
} from "../../shared/reading-rubric.mjs";
import type { ReadingEvaluationResult } from "../types";
import { Button, C, Card, Icon, T } from "./ui";
import { PrivateRecordingPlayback } from "./PrivateRecording";

export function ReadingEvaluation({
  evaluation,
  audioId,
}: {
  evaluation: ReadingEvaluationResult;
  audioId?: string;
}) {
  const [transcriptOpen, setTranscriptOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [example, setExample] = useState<string | null>(null);
  const m = evaluation.measurements;
  return (
    <View testID="reading-evaluation" style={{ gap: 14 }}>
      <Card style={{ gap: 14 }}>
        <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
          <Icon name="headphones" size={18} />
          <Text style={T.h3}>Here’s what we heard</Text>
        </View>
        <Text style={T.body}>{evaluation.summary}</Text>
        <View
          style={{
            backgroundColor: C.cream,
            padding: 14,
            borderRadius: 10,
            gap: 5,
          }}
        >
          <Text style={[T.small, { fontFamily: "DMBold" }]}>
            YOUR NEXT STEP
          </Text>
          <Text style={T.body}>{evaluation.nextStep}</Text>
        </View>
      </Card>
      <View style={{ flexDirection: "row", gap: 10 }}>
        <View
          style={{
            flex: 1,
            backgroundColor: C.paper,
            borderWidth: 1,
            borderColor: C.border,
            borderRadius: 12,
            padding: 14,
            gap: 4,
          }}
        >
          <Text style={T.small}>Estimated pace</Text>
          <Text style={T.h2}>
            {m.estimatedWordsPerMinute ?? "—"}
            <Text style={T.small}> words/min</Text>
          </Text>
          <Text style={T.small}>From the audible reading span</Text>
        </View>
        <View
          style={{
            flex: 1,
            backgroundColor: C.paper,
            borderWidth: 1,
            borderColor: C.border,
            borderRadius: 12,
            padding: 14,
            gap: 4,
          }}
        >
          <Text style={T.small}>Passage matched</Text>
          <Text style={T.h2}>
            {m.transcriptCoveragePercent === null
              ? "—"
              : `${m.matchedWords}/${m.referenceWords}`}
            <Text style={T.small}> words</Text>
          </Text>
          <Text style={T.small}>Estimated from the transcript</Text>
        </View>
      </View>
      <Text style={[T.small, { paddingHorizontal: 4 }]}>
        AI listening feedback · estimates may vary. Listen back to check.
      </Text>
      {READING_CRITERIA.map((criterion) => {
        const detail = evaluation.criteria.find(
          (item) => item.key === criterion.key,
        );
        if (!detail) return null;
        const status =
          detail.status === "strength"
            ? "Going well"
            : detail.status === "practice"
              ? "Try next"
              : "Not assessed";
        return (
          <View
            key={criterion.key}
            testID={`reading-criterion-${criterion.key}`}
            style={{
              backgroundColor: C.paper,
              borderColor: C.border,
              borderWidth: 1,
              borderRadius: 12,
              padding: 16,
              gap: 12,
            }}
          >
            <View
              style={{ flexDirection: "row", alignItems: "center", gap: 10 }}
            >
              <View
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 8,
                  backgroundColor: C.sage,
                  justifyContent: "center",
                  alignItems: "center",
                }}
              >
                <Icon name={criterion.icon} size={18} />
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={T.h3}>{criterion.label}</Text>
                <Text style={T.small}>{criterion.hint}</Text>
              </View>
            </View>
            <Text
              style={[
                T.small,
                {
                  alignSelf: "flex-start",
                  borderRadius: 6,
                  paddingHorizontal: 8,
                  paddingVertical: 4,
                  backgroundColor:
                    detail.status === "practice" ? C.peach : C.sage,
                  color: C.ink,
                },
              ]}
            >
              {status}
            </Text>
            <Text style={T.body}>{detail.observation}</Text>
            <View
              style={{
                backgroundColor: C.cream,
                padding: 12,
                borderRadius: 8,
                gap: 4,
              }}
            >
              <Text style={[T.small, { fontFamily: "DMBold" }]}>
                Practise this
              </Text>
              <Text style={T.body}>{detail.nextStep}</Text>
            </View>
            {detail.evidence && audioId ? (
              <>
                <Button
                  label={`Listen from ${Math.floor(detail.evidence.startSeconds)}s`}
                  icon="play"
                  variant="ghost"
                  onPress={() =>
                    setExample(example === criterion.key ? null : criterion.key)
                  }
                />
                {example === criterion.key ? (
                  <PrivateRecordingPlayback
                    id={audioId}
                    startSeconds={detail.evidence.startSeconds}
                    autoLoad
                  />
                ) : null}
              </>
            ) : null}
          </View>
        );
      })}
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: transcriptOpen }}
        onPress={() => setTranscriptOpen(!transcriptOpen)}
        style={{
          minHeight: 44,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          padding: 12,
        }}
      >
        <Text style={T.h3}>Your transcript</Text>
        <Icon name={transcriptOpen ? "chevron-up" : "chevron-down"} />
      </Pressable>
      {transcriptOpen ? (
        <Card>
          <Text selectable style={T.body}>
            {evaluation.transcript || "No clear speech was detected."}
          </Text>
        </Card>
      ) : null}
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: aboutOpen }}
        onPress={() => setAboutOpen(!aboutOpen)}
        style={{
          minHeight: 44,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          padding: 12,
        }}
      >
        <Text style={T.small}>About this evaluation</Text>
        <Icon name={aboutOpen ? "chevron-up" : "chevron-down"} size={16} />
      </Pressable>
      {aboutOpen ? (
        <Card style={{ gap: 8 }}>
          <Text style={T.small}>{READING_FOUNDATION.note}</Text>
          <Text style={T.small}>
            Pace uses transcript word count and sound activity. Passage matches
            are recognition estimates, not proof of skipped words. Quiet
            intervals can be natural pauses. Example timestamps are approximate.
          </Text>
          <Button
            label="Research foundation"
            variant="ghost"
            icon="external-link"
            onPress={() =>
              void Linking.openURL(READING_FOUNDATION.url).catch(() => {})
            }
          />
        </Card>
      ) : null}
    </View>
  );
}
