import React, { useEffect, useRef, useState } from "react";
import { Text, View } from "react-native";
import { api } from "../lib/api";
import { Button, Card, ErrorNote, Icon, T } from "./ui";
import { PrivateRecordingPlayback } from "./PrivateRecording";

export function ReadingSample({
  attemptId,
  passage,
}: {
  attemptId: string;
  passage: string;
}) {
  const [capability, setCapability] = useState<{
    available: boolean;
    sample: { audioId: string } | null;
  } | null>(null);
  const [opened, setOpened] = useState(false);
  const [audioId, setAudioId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const controller = useRef<AbortController | null>(null);
  const lock = useRef(false);
  useEffect(() => {
    const abort = new AbortController();
    controller.current = abort;
    void api<{ available: boolean; sample: { audioId: string } | null }>(
      `/read-aloud/attempts/${attemptId}/sample`,
      { signal: abort.signal },
    )
      .then((result) => {
        if (!abort.signal.aborted) setCapability(result);
      })
      .catch(() => {
        if (!abort.signal.aborted)
          setCapability({ available: false, sample: null });
      });
    return () => abort.abort();
  }, [attemptId]);

  async function open() {
    if (lock.current) return;
    setOpened(true);
    if (audioId) return;
    if (capability?.sample) {
      setAudioId(capability.sample.audioId);
      return;
    }
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      const result = await api<{ audioId: string }>(
        `/read-aloud/attempts/${attemptId}/sample`,
        {
          method: "POST",
          body: {},
          signal: controller.current?.signal,
        },
      );
      if (!controller.current?.signal.aborted) setAudioId(result.audioId);
    } catch (cause) {
      if (!controller.current?.signal.aborted)
        setError(
          cause instanceof Error
            ? cause.message
            : "Please try the sample again.",
        );
    } finally {
      lock.current = false;
      if (!controller.current?.signal.aborted) setBusy(false);
    }
  }

  return (
    <Card style={{ gap: 14 }} testID="reading-sample">
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <Icon name="headphones" size={20} />
        <Text accessibilityRole="header" style={T.h3}>
          Listen, then try again
        </Text>
      </View>
      <Text style={T.body}>
        Hear the same passage. Notice the pauses, emphasis and rhythm.
      </Text>
      <Text style={T.small}>AI sample voice · ElevenLabs</Text>
      {opened && audioId ? (
        <>
          <PrivateRecordingPlayback
            key={audioId}
            id={audioId}
            autoLoad
            playLabel="Play sample"
          />
          <Text style={T.body}>{passage}</Text>
          <Text style={T.small}>Try one phrase in your own voice.</Text>
        </>
      ) : (
        <Button
          label={error ? "Retry sample" : "Listen to a sample"}
          icon="play"
          variant="secondary"
          loading={busy}
          disabled={!capability?.available}
          onPress={() => void open()}
        />
      )}
      {capability && !capability.available ? (
        <Text style={T.small}>
          Sample audio isn’t available yet. You can still replay your recording
          and practise again.
        </Text>
      ) : null}
      {busy ? (
        <Text accessibilityLiveRegion="polite" style={T.small}>
          Preparing your sample…
        </Text>
      ) : null}
      <ErrorNote message={error} />
    </Card>
  );
}
