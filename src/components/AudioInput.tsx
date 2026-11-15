import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  AppState,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioPlayer,
  useAudioPlayerStatus,
  useAudioRecorder,
  useAudioRecorderState,
} from "expo-audio";
import { Button, C, ErrorNote, Icon, T } from "./ui";

export interface RecordedAudio {
  uri: string;
  mime: string;
  duration: number;
}

export function AudioPlayback({
  uri,
  startSeconds = 0,
}: {
  uri: string;
  startSeconds?: number;
}) {
  return Platform.OS === "web" ? (
    <WebAudioPlayback uri={uri} startSeconds={startSeconds} />
  ) : (
    <NativeAudioPlayback uri={uri} startSeconds={startSeconds} />
  );
}

// Await the browser play promise: quickly leaving during playback otherwise causes
// an unhandled AbortError in the SDK's current web player.
function WebAudioPlayback({
  uri,
  startSeconds,
}: {
  uri: string;
  startSeconds: number;
}) {
  const audio = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [error, setError] = useState("");
  useEffect(() => {
    const media = new Audio(uri);
    audio.current = media;
    media.preload = "metadata";
    const update = () => {
      setPlaying(!media.paused && !media.ended);
      setTime(media.currentTime || 0);
      if (Number.isFinite(media.duration)) setDuration(media.duration);
    };
    const failed = () =>
      setError(
        "The recording could not be played. Reopen the saved response to refresh its private playback link.",
      );
    const events = ["play", "pause", "ended", "timeupdate", "loadedmetadata"];
    events.forEach((event) => media.addEventListener(event, update));
    media.addEventListener("error", failed);
    return () => {
      events.forEach((event) => media.removeEventListener(event, update));
      media.removeEventListener("error", failed);
      audio.current = null;
      media.pause();
      media.removeAttribute("src");
      media.load();
    };
  }, [uri]);
  async function toggle() {
    const media = audio.current;
    if (!media) return;
    setError("");
    try {
      if (!media.paused) media.pause();
      else {
        if (media.ended || media.currentTime === 0)
          media.currentTime = Math.max(
            0,
            Math.min(
              startSeconds,
              Number.isFinite(media.duration)
                ? Math.max(0, media.duration - 0.01)
                : startSeconds,
            ),
          );
        await media.play();
      }
    } catch (e) {
      if (
        audio.current === media &&
        !(e instanceof DOMException && e.name === "AbortError")
      )
        setError(
          "Playback is unavailable. Your transcript can still be reviewed below.",
        );
    }
  }
  return (
    <View style={{ gap: 8 }}>
      <View style={s.row}>
        <Button
          label={playing ? "Pause playback" : "Play recording"}
          icon={playing ? "pause" : "play"}
          variant="secondary"
          onPress={() => void toggle()}
          style={s.playbackButton}
        />
        <Text style={T.small}>
          {Math.floor(time)}s{duration > 0 ? ` / ${Math.floor(duration)}s` : ""}
        </Text>
      </View>
      <ErrorNote message={error} />
    </View>
  );
}

function NativeAudioPlayback({
  uri,
  startSeconds,
}: {
  uri: string;
  startSeconds: number;
}) {
  const player = useAudioPlayer(uri);
  const status = useAudioPlayerStatus(player);
  const [error, setError] = useState("");
  async function toggle() {
    try {
      setError("");
      if (status.playing) player.pause();
      else {
        if (
          status.currentTime === 0 ||
          status.didJustFinish ||
          (status.duration > 0 && status.currentTime >= status.duration - 0.1)
        )
          await player.seekTo(
            Math.max(
              0,
              Math.min(
                startSeconds,
                status.duration > 0
                  ? Math.max(0, status.duration - 0.01)
                  : startSeconds,
              ),
            ),
          );
        player.play();
      }
    } catch {
      setError(
        "Playback is unavailable. Your transcript can still be reviewed below.",
      );
    }
  }
  return (
    <View style={{ gap: 8 }}>
      <View style={s.row}>
        <Button
          label={status.playing ? "Pause playback" : "Play recording"}
          icon={status.playing ? "pause" : "play"}
          variant="secondary"
          onPress={() => void toggle()}
          style={s.playbackButton}
        />
        <Text style={T.small}>
          {Math.floor(status.currentTime || 0)}s /{" "}
          {Math.floor(status.duration || 0)}s
        </Text>
      </View>
      <ErrorNote
        message={
          error ||
          (status.error
            ? "The recording could not be played. Reopen the saved response to refresh its private playback link."
            : "")
        }
      />
    </View>
  );
}

/** Permission is deliberately requested by start(), never on mount. */
export default function AudioInput({
  onRecorded,
  onCancel,
  onCaptureActive,
  busy = false,
  sharing = false,
  appearance = "garden",
}: {
  onRecorded: (audio: RecordedAudio) => Promise<void>;
  onCancel: () => void;
  onCaptureActive?: (active: boolean) => void;
  busy?: boolean;
  sharing?: boolean;
  appearance?: "garden" | "daily";
}) {
  const recorder = useAudioRecorder({
    ...RecordingPresets.HIGH_QUALITY,
    isMeteringEnabled: true,
  });
  const state = useAudioRecorderState(recorder, 150);
  const [phase, setPhase] = useState<
    "idle" | "recording" | "paused" | "review"
  >("idle");
  const [recorded, setRecorded] = useState<RecordedAudio | null>(null);
  const [error, setError] = useState("");
  const [working, setWorking] = useState(false);
  const finishing = useRef(false);
  const prepared = useRef(false);
  const elapsed = Math.min(60, Math.floor(state.durationMillis / 1000));

  useEffect(() => {
    onCaptureActive?.(phase !== "idle");
    return () => onCaptureActive?.(false);
  }, [phase, onCaptureActive]);

  const finish = useCallback(async () => {
    if (finishing.current || !prepared.current) return;
    finishing.current = true;
    setWorking(true);
    try {
      const duration = Math.min(60, recorder.getStatus().durationMillis / 1000);
      await recorder.stop();
      prepared.current = false;
      await setAudioModeAsync({ allowsRecording: false });
      if (!recorder.uri)
        throw new Error(
          "No audio file was created. Please try recording again.",
        );
      // Safari may select MP4 even when the preferred web preset is WebM.
      const mime =
        Platform.OS === "web"
          ? (await (await fetch(recorder.uri)).blob()).type.split(";")[0] ||
            "audio/webm"
          : "audio/mp4";
      setRecorded({ uri: recorder.uri, mime, duration });
      setPhase("review");
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Could not finish the recording. Please try again.",
      );
    } finally {
      setWorking(false);
      finishing.current = false;
    }
  }, [recorder]);

  useEffect(() => {
    if (phase !== "recording") return;
    const timeout = setTimeout(
      () => void finish(),
      Math.max(0, 60000 - state.durationMillis),
    );
    return () => clearTimeout(timeout);
  }, [state.durationMillis, phase, finish]);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (next) => {
      if (
        next !== "active" &&
        prepared.current &&
        recorder.getStatus().isRecording
      ) {
        recorder.pause();
        setPhase("paused");
      }
    });
    return () => {
      subscription.remove();
    };
  }, [recorder]);

  useEffect(
    () => () => {
      if (prepared.current) {
        try {
          void recorder.stop().catch(() => undefined);
        } catch {
          /* The native hook may already have released the recorder. */
        }
        prepared.current = false;
      }
      void setAudioModeAsync({ allowsRecording: false }).catch(() => undefined);
    },
    [recorder],
  );

  async function start() {
    if (working || busy) return;
    setWorking(true);
    setError("");
    try {
      const permission = await requestRecordingPermissionsAsync();
      if (!permission.granted)
        throw new Error(
          "Microphone access is off. Enable it in your device or browser settings, then try again.",
        );
      await setAudioModeAsync({
        allowsRecording: true,
        playsInSilentMode: true,
      });
      await recorder.prepareToRecordAsync();
      prepared.current = true;
      recorder.record();
      setRecorded(null);
      setPhase("recording");
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Microphone unavailable. Check your device settings and try again.",
      );
    } finally {
      setWorking(false);
    }
  }

  async function discard(cancel: boolean) {
    if (working || busy) return;
    setWorking(true);
    setError("");
    try {
      if (prepared.current) await recorder.stop();
      prepared.current = false;
      await setAudioModeAsync({ allowsRecording: false });
      setRecorded(null);
      setPhase("idle");
      if (cancel) onCancel();
    } catch {
      setError("Could not reset recording. Please try again.");
    } finally {
      setWorking(false);
    }
  }

  function pauseResume() {
    try {
      if (phase === "recording") {
        recorder.pause();
        setPhase("paused");
      } else {
        recorder.record();
        setPhase("recording");
      }
    } catch {
      setError(
        "The microphone was interrupted. Finish this take or restart the recording.",
      );
    }
  }

  const level = Math.max(0, Math.min(1, ((state.metering ?? -55) + 60) / 60));
  if (appearance === "daily")
    return (
      <View style={{ alignItems: "center", gap: 24, width: "100%" }}>
        <ErrorNote message={error} />
        {phase === "review" && recorded ? (
          <>
            <View style={dailyAudio.ring}>
              <Icon name="check" size={46} color="#555" />
            </View>
            <Text style={dailyAudio.hint}>Your recording is ready</Text>
            <AudioPlayback uri={recorded.uri} />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Use recording"
              disabled={busy || working}
              onPress={() => void onRecorded(recorded)}
              style={dailyAudio.button}
            >
              <Text style={dailyAudio.buttonText}>
                {busy ? "Saving…" : "Use recording"}
              </Text>
              <Icon name="chevron-right" color="#fff" />
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={() => void discard(false)}
              disabled={busy || working}
              style={dailyAudio.secondary}
            >
              <Text style={dailyAudio.hint}>Record again</Text>
            </Pressable>
          </>
        ) : (
          <>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={
                phase === "idle" ? "Record my response" : "Finish recording"
              }
              disabled={working || busy || (phase !== "idle" && elapsed < 1)}
              onPress={() => void (phase === "idle" ? start() : finish())}
              style={dailyAudio.outerRing}
            >
              <View style={dailyAudio.middleRing}>
                <View style={dailyAudio.ring}>
                  <Icon
                    name={phase === "idle" ? "mic" : "square"}
                    size={48}
                    color="#555"
                  />
                </View>
              </View>
            </Pressable>
            <Text
              accessibilityLabel={`${phase === "idle" ? 60 : 60 - elapsed} seconds remaining`}
              style={dailyAudio.timer}
            >
              {phase === "idle"
                ? "01:00"
                : `00:${String(60 - elapsed).padStart(2, "0")}`}
            </Text>
            <View style={dailyAudio.wave}>
              {[8, 12, 18, 13, 28, 46, 28, 19, 14, 10, 6].map((height, i) => (
                <View
                  key={i}
                  style={{
                    width: 6,
                    borderRadius: 4,
                    backgroundColor: "#c4c4c4",
                    height: phase === "recording" ? 6 + level * height : height,
                  }}
                />
              ))}
            </View>
            <Text style={dailyAudio.hint}>
              {working
                ? "Preparing microphone…"
                : phase === "idle"
                  ? "Tap the microphone to begin"
                  : phase === "paused"
                    ? "Recording paused"
                    : "Tap to finish your response"}
            </Text>
            {phase !== "idle" ? (
              <Pressable
                accessibilityRole="button"
                disabled={working}
                onPress={pauseResume}
                style={dailyAudio.secondary}
              >
                <Text style={dailyAudio.hint}>
                  {phase === "paused" ? "Resume recording" : "Pause recording"}
                </Text>
              </Pressable>
            ) : null}
          </>
        )}
        <Pressable accessibilityRole="button" accessibilityLabel="Cancel recording" disabled={working || busy} onPress={() => void discard(true)} style={dailyAudio.secondary}><Text style={dailyAudio.hint}>Cancel recording</Text></Pressable>
      </View>
    );
  return (
    <View style={[s.container, phase === "review" && s.reviewContainer]}>
      <ErrorNote message={error} />
      {phase === "idle" ? (
        <>
          <View style={s.mic}>
            <Icon name="mic" size={29} />
          </View>
          <Text style={[T.h2, { textAlign: "center" }]}>Record a response</Text>
          <Text style={[T.body, s.center]}>Up to 60 seconds.</Text>
          <Text style={[T.small, s.center]}>
            {sharing
              ? "Audio and transcript are shared with your partner only when you send."
              : "Private recording. Review the transcript before evaluation."}
          </Text>
          <Button
            label="Record my response"
            icon="mic"
            loading={working}
            onPress={() => void start()}
          />
          <Button label="Write instead" variant="ghost" onPress={onCancel} />
        </>
      ) : phase === "review" && recorded ? (
        <View style={s.review}>
          <Text style={[T.h3, s.center]}>Your recording is ready</Text>
          <AudioPlayback uri={recorded.uri} />
          <Text style={[T.small, s.center]}>Review your transcript next.</Text>
          <View style={s.reviewActions}>
            <Button
              label="Use recording"
              loading={busy}
              disabled={working}
              icon="check"
              onPress={() => void onRecorded(recorded)}
              style={s.primaryAction}
            />
            <View style={s.secondaryActions}>
              <Button
                label="Record again"
                variant="secondary"
                disabled={busy || working}
                onPress={() => void discard(false)}
                style={s.secondaryAction}
              />
              <Button
                label="Discard recording"
                variant="ghost"
                disabled={busy || working}
                onPress={() => void discard(true)}
                style={s.secondaryAction}
              />
            </View>
          </View>
        </View>
      ) : (
        <>
          <Text style={T.label}>
            {phase === "paused" ? "PAUSED" : "RECORDING"}
          </Text>
          <Text
            accessibilityLabel={`${60 - elapsed} seconds remaining`}
            accessibilityLiveRegion={elapsed >= 50 ? "polite" : "none"}
            style={s.timer}
          >
            0:{String(60 - elapsed).padStart(2, "0")}
          </Text>
          <View
            accessibilityLabel={
              phase === "recording"
                ? "Recording in progress"
                : "Recording paused"
            }
            style={s.wave}
          >
            {Array.from({ length: 25 }, (_, i) => (
              <View
                key={i}
                style={{
                  flex: 1,
                  borderRadius: 4,
                  backgroundColor: C.forest,
                  height:
                    phase === "recording"
                      ? 8 + level * (16 + ((i * 13) % 40))
                      : 8,
                  opacity: 0.45 + (i % 3) * 0.18,
                }}
              />
            ))}
          </View>
          <View style={s.row}>
            <Button
              label={phase === "paused" ? "Resume" : "Pause"}
              icon={phase === "paused" ? "play" : "pause"}
              variant="secondary"
              disabled={working}
              onPress={pauseResume}
            />
            <Button
              label="Finish recording"
              icon="check"
              loading={working}
              disabled={elapsed < 1}
              onPress={() => void finish()}
            />
          </View>
          <View style={s.row}>
            <Button
              label="Restart"
              variant="ghost"
              disabled={working}
              onPress={() => void discard(false)}
            />
            <Button
              label="Cancel recording"
              variant="ghost"
              disabled={working}
              onPress={() => void discard(true)}
            />
          </View>
        </>
      )}
    </View>
  );
}

const dailyAudio = StyleSheet.create({
  outerRing: {
    width: 192,
    height: 192,
    borderRadius: 96,
    backgroundColor: "#fcfcfc",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 22,
  },
  middleRing: {
    width: 156,
    height: 156,
    borderRadius: 78,
    backgroundColor: "#f6f6f6",
    alignItems: "center",
    justifyContent: "center",
  },
  ring: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: "#ededed",
    alignItems: "center",
    justifyContent: "center",
  },
  timer: { fontFamily: "DMBold", fontSize: 28, color: "#181818" },
  hint: { fontFamily: "DM", fontSize: 14, color: "#555", textAlign: "center" },
  wave: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    height: 48,
  },
  button: {
    borderRadius: 28,
    minHeight: 50,
    backgroundColor: "#242424",
    alignSelf: "stretch",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 10,
    padding: 12,
  },
  buttonText: { color: "#fff", fontFamily: "DMBold", fontSize: 15 },
  secondary: { padding: 12, minHeight: 44 },
});

const s = StyleSheet.create({
  container: {
    backgroundColor: C.cream,
    borderRadius: 18,
    padding: 24,
    gap: 18,
    alignItems: "center",
  },
  row: {
    flexDirection: "row",
    gap: 10,
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "center",
  },
  review: {
    width: "100%",
    maxWidth: 400,
    alignItems: "center",
    gap: 18,
  },
  reviewContainer: { paddingHorizontal: 16 },
  playbackButton: { paddingHorizontal: 12 },
  reviewActions: { alignSelf: "stretch", gap: 8 },
  primaryAction: { alignSelf: "stretch", paddingHorizontal: 12 },
  secondaryActions: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  secondaryAction: {
    flexBasis: 160,
    flexGrow: 1,
    flexShrink: 1,
    minWidth: 0,
    alignSelf: "stretch",
    paddingHorizontal: 12,
  },
  center: { textAlign: "center", maxWidth: 430 },
  mic: {
    width: 70,
    height: 70,
    backgroundColor: C.sage,
    borderRadius: 35,
    alignItems: "center",
    justifyContent: "center",
  },
  timer: { fontFamily: "Lora", fontSize: 60, lineHeight: 76, color: C.forest },
  wave: {
    flexDirection: "row",
    gap: 3,
    height: 64,
    width: "100%",
    maxWidth: 230,
    alignItems: "center",
  },
});
