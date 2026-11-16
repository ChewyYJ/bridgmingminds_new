import { useTheme } from "../theme/ThemeProvider";
import React, { useEffect, useRef, useState } from "react";
import { Text, View } from "react-native";
import { api, isDraftOwner } from "../lib/api";
import { useApp } from "../lib/state";
import { Button, Card, ErrorNote } from "./ui";

interface LearnerSummary {
  enabled: boolean;
  status: string;
  observationCount: number;
  notice: string;
  recommendation: null | {
    id: string;
    label: string;
    focus: string;
    explanation: string;
    evidence: { observationId: string; quote: string; feedback: string }[];
  };
}
export function LearnerProfile({ start }: { start: () => void }) {
  const { T } = useTheme();

  const { state } = useApp();
  const uid = state!.profile.id;
  const [data, setData] = useState<LearnerSummary | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [version, setVersion] = useState(0);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => {
    const abort = new AbortController();
    controller.current = abort;
    void api<LearnerSummary>("/me/learner-profile", { signal: abort.signal })
      .then((next) => {
        if (!abort.signal.aborted && isDraftOwner(uid)) {
          setData(next);
          setError("");
        }
      })
      .catch((e) => {
        if (!abort.signal.aborted) setError(e.message);
      });
    return () => {
      abort.abort();
      controller.current = null;
    };
  }, [uid, version]);
  async function change(
    body: { enabled?: boolean; dismissId?: string } | null,
  ) {
    const signal = controller.current?.signal;
    if (!signal || signal.aborted) return;
    setBusy(true);
    setError("");
    try {
      const next = await api<LearnerSummary>(
        body ? "/me/learner-profile" : "/me/learner-profile/import",
        {
          method: body ? "PATCH" : "POST",
          body: body || {},
          signal,
        },
      );
      if (isDraftOwner(uid) && !signal.aborted) setData(next);
    } catch (e) {
      if (isDraftOwner(uid) && !signal.aborted)
        setError(e instanceof Error ? e.message : "Please retry.");
    } finally {
      if (isDraftOwner(uid) && !signal.aborted) setBusy(false);
    }
  }
  const recommendation = data?.recommendation;
  return (
    <Card testID="learner-profile" style={{ gap: 12 }}>
      <Text style={T.h2}>A focus for your next practice</Text>
      <ErrorNote message={error} />
      {busy ? (
        <Text accessibilityLiveRegion="polite" style={T.small}>
          Updating your saved practice suggestions…
        </Text>
      ) : null}
      {error ? (
        <Button
          label="Refresh practice suggestion"
          variant="secondary"
          onPress={() => setVersion((value) => value + 1)}
        />
      ) : null}
      {!data ? (
        <Text style={T.body}>Loading your saved practice observations…</Text>
      ) : (
        <>
          <Text style={T.small}>{data.notice}</Text>
          {recommendation ? (
            <View testID="learner-recommendation" style={{ gap: 10 }}>
              <Text style={T.h3}>{recommendation.label}</Text>
              <Text style={T.body}>{recommendation.explanation}</Text>
              <Text style={T.body}>{recommendation.focus}</Text>
              {recommendation.evidence.map((item) => (
                <View key={item.observationId} style={{ gap: 4 }}>
                  <Text selectable style={T.body}>
                    “{item.quote}”
                  </Text>
                  <Text style={T.small}>{item.feedback}</Text>
                </View>
              ))}
              <Text style={T.small}>
                Your next all-topic spin will offer this focus. You can choose
                another category instead. Focused practice does not establish
                independent mastery.
              </Text>
              <Button label="Start focused speaking" onPress={start} />
              <Button
                label="Dismiss this practice suggestion"
                variant="ghost"
                loading={busy}
                onPress={() => void change({ dismissId: recommendation.id })}
              />
            </View>
          ) : (
            <Text style={T.body}>
              {!data.enabled
                ? "Practice suggestions are paused."
                : data.status === "dismissed"
                  ? "You dismissed the current practice suggestion. You can choose any fresh question."
                  : data.status === "insufficient_evidence"
                    ? "There is not enough eligible, comparable feedback to select a personal focus yet. Local self-review does not supply ability scores."
                    : "No repeated target is supported by the recent comparable feedback. You can choose any fresh question."}
            </Text>
          )}
          <Text style={T.small}>
            {data.observationCount} saved criterion observations · mastery not
            assessed
          </Text>
          <Button
            label={
              data.enabled
                ? "Pause practice suggestions"
                : "Resume practice suggestions"
            }
            variant="secondary"
            disabled={busy}
            onPress={() => void change({ enabled: !data.enabled })}
          />
          <Text style={T.small}>
            You can include up to 100 recent saved responses. Their existing
            BRIDGE feedback is copied without regrading.
          </Text>
          <Button
            label="Include saved BRIDGE feedback"
            variant="ghost"
            disabled={busy}
            onPress={() => void change(null)}
          />
        </>
      )}
    </Card>
  );
}
