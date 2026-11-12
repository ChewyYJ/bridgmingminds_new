import React, { useEffect, useRef, useState } from "react";
import { View } from "react-native";
import { API_BASE, api } from "../lib/api";
import { AudioPlayback } from "./AudioInput";
import { Button, ErrorNote } from "./ui";

export function PrivateRecordingPlayback({
  id,
  startSeconds = 0,
}: {
  id: string;
  startSeconds?: number;
}) {
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  async function load() {
    setBusy(true);
    setError("");
    const abort = new AbortController();
    controller.current?.abort();
    controller.current = abort;
    try {
      const saved = await api<{ url: string }>(`/audio/${id}/url`, {
        signal: abort.signal,
      });
      if (!abort.signal.aborted)
        setUrl(
          saved.url.startsWith("/") ? `${API_BASE}${saved.url}` : saved.url,
        );
    } catch (e) {
      if (!abort.signal.aborted)
        setError(e instanceof Error ? e.message : "Recording unavailable.");
    } finally {
      if (!abort.signal.aborted) setBusy(false);
    }
  }
  return (
    <View style={{ gap: 10 }}>
      <ErrorNote message={error} />
      {url ? (
        <AudioPlayback
          key={`${id}:${startSeconds}`}
          uri={url}
          startSeconds={startSeconds}
        />
      ) : null}
      <Button
        label={url ? "Refresh private playback link" : "Open saved recording"}
        variant="secondary"
        loading={busy}
        onPress={() => void load()}
      />
    </View>
  );
}
