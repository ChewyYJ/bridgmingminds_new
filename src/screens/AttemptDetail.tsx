import React, { useState, useEffect } from "react";
import { View, Text, ActivityIndicator } from "react-native";
import { useTheme } from "../theme/ThemeProvider";
import { Button, Card, ErrorNote } from "../components/ui";
import { api } from "../lib/api";
import type { Attempt } from "../types";
import { Feedback } from "./Practice";
export function AttemptDetail({
  id,
  onClose,
  onRetry,
  refresh,
  onGarden,
}: {
  id: string;
  onClose: () => void;
  onRetry: (a: Attempt) => void;
  refresh: () => Promise<void>;
  onGarden: () => void;
}) {
  const { C, T } = useTheme();

  const [attempt, setAttempt] = useState<Attempt | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let live = true;
    async function load() {
      try {
        const a = await api<Attempt>(`/attempts/${id}`);
        if (live) setAttempt(a);
      } catch (e: any) {
        if (live) setError(e.message);
      }
    }
    void load();
    const t = setInterval(load, 1800);
    return () => {
      live = false;
      clearInterval(t);
    };
  }, [id]);
  if (attempt && (attempt.evaluation || attempt.status === "draft"))
    return (
      <Feedback
        attempt={attempt}
        onClose={onClose}
        onRetry={onRetry}
        onRefresh={() => void refresh()}
        onGarden={onGarden}
      />
    );
  return (
    <View style={{ gap: 20 }}>
      <Button label="Back to profile" variant="ghost" onPress={onClose} />
      <Text style={T.title}>
        {attempt?.status === "failed"
          ? "Response saved"
          : "Preparing feedback…"}
      </Text>
      <ErrorNote message={error} />
      {attempt && (
        <Card style={{ gap: 15 }}>
          <Text style={T.h3}>{attempt.prompt}</Text>
          <Text style={T.body}>{attempt.text}</Text>
          {attempt.status === "failed" ? (
            <Button
              label="Retry evaluation"
              loading={busy}
              onPress={async () => {
                setBusy(true);
                try {
                  await api(`/attempts/${id}/evaluate`, {
                    method: "POST",
                    body: {},
                  });
                  setAttempt(await api(`/attempts/${id}`));
                } catch (e: any) {
                  setError(e.message);
                } finally {
                  setBusy(false);
                }
              }}
            />
          ) : (
            <>
              <ActivityIndicator color={C.forest} />
              <Text style={T.small}>
                Evaluation {attempt.status}. You can return home and open this
                saved response later.
              </Text>
            </>
          )}
        </Card>
      )}
    </View>
  );
}
