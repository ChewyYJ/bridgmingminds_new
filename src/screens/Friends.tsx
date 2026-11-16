import { useTheme, createThemedStyles } from "../theme/ThemeProvider";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Share,
  StyleSheet,
  Text,
  View,
} from "react-native";
import {
  api,
  ApiError,
  API_BASE,
  deleteDraft,
  isDraftOwner,
  loadDraft,
  saveDraft,
  uploadAudio,
} from "../lib/api";
import { useApp } from "../lib/state";
import { Prompt } from "../types";
import AudioInput, {
  AudioPlayback,
  RecordedAudio,
} from "../components/AudioInput";
import {
  Button,
  Card,
  ErrorNote,
  Field,
  Heading,
  Icon,
  Tag,
} from "../components/ui";

export interface FriendRoom {
  id: string;
  code: string;
  prompt: Pick<Prompt, "id" | "question" | "category" | "context">;
  rounds: number;
  status: "waiting" | "active" | "completed" | "closed";
  participants: {
    id: string;
    displayName: string;
    position: "for" | "against";
  }[];
  turns: {
    id: string;
    userId: string;
    text: string;
    audioId?: string;
    round: number;
    createdAt: string;
  }[];
  nextUserId: string | null;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
}
interface FriendDraft {
  text: string;
  audioId: string;
  turnKey: string;
  expectedTurn: number;
  submitted?: boolean;
}
const key = () =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
const message = (error: unknown) =>
  error instanceof Error
    ? error.message
    : "The connection wandered. Your draft is still here; please try again.";
const activeStatuses = ["waiting", "active"];
const characters = (value: string) => Array.from(value).length;
const rejectedRequest = (error: unknown) =>
  error instanceof ApiError &&
  error.status >= 400 &&
  error.status < 500 &&
  error.status !== 408 &&
  error.status !== 429;
function draftKey(id: string) {
  return `friends:room:${id}`;
}
function Chip({
  label,
  selected,
  onPress,
  disabled = false,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  disabled?: boolean;
}) {
  const { C, T } = useTheme();
  const s = useStyles();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected, disabled }}
      aria-pressed={selected}
      aria-disabled={disabled}
      disabled={disabled}
      onPress={onPress}
      style={[
        s.chip,
        selected && { backgroundColor: C.forest, borderColor: C.forest },
      ]}
    >
      <Text
        style={[
          T.small,
          { fontFamily: "DMMedium", color: selected ? C.onPrimary : C.forest },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}
function VoiceMessage({ audioId }: { audioId: string }) {
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function listen() {
    setBusy(true);
    setError("");
    try {
      const result = await api<{ url: string }>(`/audio/${audioId}/url`);
      setUrl(
        result.url.startsWith("/") ? `${API_BASE}${result.url}` : result.url,
      );
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <View style={{ gap: 8 }}>
      {Boolean(url) && <AudioPlayback uri={url} />}
      <Button
        label={url ? "Refresh voice playback" : "Listen to voice message"}
        icon={url ? "refresh-cw" : "play"}
        variant={url ? "ghost" : "secondary"}
        loading={busy}
        onPress={() => void listen()}
      />
      <ErrorNote message={error} />
    </View>
  );
}

interface CreationRequest {
  promptId: string;
  position: "for" | "against";
  rounds: number;
  idempotencyKey: string;
}
const emptyDraft = (expectedTurn = 0): FriendDraft => ({
  text: "",
  audioId: "",
  turnKey: key(),
  expectedTurn,
});
function readDraft(saved: string): FriendDraft | null {
  if (!saved) return null;
  try {
    const value = JSON.parse(saved);
    return value &&
      typeof value.text === "string" &&
      typeof value.audioId === "string" &&
      typeof value.turnKey === "string" &&
      value.turnKey &&
      (value.submitted === undefined || typeof value.submitted === "boolean") &&
      Number.isInteger(value.expectedTurn) &&
      value.expectedTurn >= 0 &&
      value.expectedTurn <= 6
      ? value
      : null;
  } catch {
    return null;
  }
}
function committedDraft(room: FriendRoom, draft: FriendDraft, userId: string) {
  const turn = room.turns[draft.expectedTurn];
  return (
    turn?.userId === userId &&
    turn.text === draft.text.trim() &&
    turn.audioId === (draft.audioId || undefined)
  );
}

export default function Friends(props: {
  userId: string;
  onClose: () => void;
}) {
  // The screen can remain mounted while auth changes. Never carry a room or draft
  // into another account, including an outstanding callback from the old screen.
  return <FriendsContent key={props.userId} {...props} />;
}
function FriendsContent({
  userId,
  onClose,
}: {
  userId: string;
  onClose: () => void;
}) {
  const { C, T } = useTheme();
  const s = useStyles();

  const { state, refresh } = useApp();
  const [rooms, setRooms] = useState<FriendRoom[]>([]);
  const [room, setRoom] = useState<FriendRoom | null>(null);
  const [prompts, setPrompts] = useState<Prompt[]>([]);
  const [promptId, setPromptId] = useState("");
  const [position, setPosition] = useState<"for" | "against">("for");
  const [rounds, setRounds] = useState(2);
  const [code, setCode] = useState("");
  const [text, setText] = useState("");
  const [audioId, setAudioId] = useState("");
  const [audioUri, setAudioUri] = useState("");
  const [input, setInput] = useState<"text" | "audio">("text");
  const [consent, setConsent] = useState(
    Boolean(state?.profile.consent?.recording),
  );
  const [recording, setRecording] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadVersion, setLoadVersion] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [networkError, setNetworkError] = useState("");
  const [notice, setNotice] = useState("");
  const [confirmClose, setConfirmClose] = useState(false);
  const [draftReady, setDraftReady] = useState(false);
  const [unconfirmed, setUnconfirmed] = useState(false);
  const [creationPending, setCreationPending] = useState(false);
  const creationKey = useRef(key());
  const creationRequest = useRef<CreationRequest | null>(null);
  const pending = useRef(false);
  const pendingSubmission = useRef<(FriendDraft & { roomId: string }) | null>(
    null,
  );
  const selectedRoom = useRef<string | null>(null);
  const roomSnapshot = useRef<FriendRoom | null>(null);
  const draftSnapshot = useRef<FriendDraft>(emptyDraft());
  const draftRevision = useRef(0);
  const mounted = useRef(true);
  const roomId = room?.id;
  const me = room?.participants.find((person) => person.id === userId);
  const friend = room?.participants.find((person) => person.id !== userId);
  const isMyTurn = room?.status === "active" && room.nextUserId === userId;
  const finished = room?.status === "completed" || room?.status === "closed";

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      selectedRoom.current = null;
    };
  }, []);
  const isCurrent = useCallback(
    () => mounted.current && isDraftOwner(userId),
    [userId],
  );
  const isCurrentRoom = useCallback(
    (id: string) => isCurrent() && selectedRoom.current === id,
    [isCurrent],
  );
  const applyDraft = useCallback((next: FriendDraft) => {
    draftSnapshot.current = next;
    setText(next.text);
    setAudioId(next.audioId);
    setUnconfirmed(Boolean(next.submitted));
  }, []);
  const persistDraft = useCallback(
    (id: string, next: FriendDraft) => {
      if (!isCurrentRoom(id)) return Promise.resolve();
      // Invoke storage now, while the account owner is known. No debounce can lose
      // the last keystroke or run later under a newly signed-in account.
      return saveDraft(draftKey(id), JSON.stringify(next));
    },
    [isCurrentRoom],
  );
  const saveEditableDraft = useCallback(
    (id: string, next: FriendDraft) => {
      if (!isCurrentRoom(id)) return;
      applyDraft(next);
      const revision = ++draftRevision.current;
      void persistDraft(id, next).catch(() => {
        if (isCurrentRoom(id) && revision === draftRevision.current)
          setError(
            "This device could not save your draft. Keep this screen open until you send your turn.",
          );
      });
    },
    [applyDraft, isCurrentRoom, persistDraft],
  );
  const updateRoom = useCallback(
    (next: FriendRoom) => {
      if (!isCurrentRoom(next.id)) return false;
      const current = roomSnapshot.current;
      if (
        !current ||
        current.id !== next.id ||
        current.turns.length > next.turns.length ||
        current.updatedAt > next.updatedAt
      )
        return false;
      if (
        (!activeStatuses.includes(current.status) &&
          activeStatuses.includes(next.status)) ||
        (current.status === "active" && next.status === "waiting")
      )
        return false;
      roomSnapshot.current = next;
      setRoom(next);
      return true;
    },
    [isCurrentRoom],
  );
  const clearSentDraft = useCallback(
    (next: FriendRoom) => {
      if (!isCurrentRoom(next.id)) return;
      pendingSubmission.current = null;
      ++draftRevision.current;
      applyDraft(emptyDraft(next.turns.length));
      setAudioUri("");
      setInput("text");
      setError("");
      setNotice("");
      void deleteDraft(draftKey(next.id)).catch(() => undefined);
    },
    [applyDraft, isCurrentRoom],
  );

  const enterRoom = useCallback(
    async (next: FriendRoom) => {
      if (!isCurrent()) return;
      selectedRoom.current = next.id;
      setDraftReady(false);
      setError("");
      setNetworkError("");
      setNotice("");
      setConfirmClose(false);
      setAudioUri("");
      let draft: FriendDraft | null = null;
      try {
        draft = readDraft(await loadDraft(draftKey(next.id)));
      } catch {
        if (isCurrentRoom(next.id))
          setNotice(
            "This device could not load your draft. Your shared conversation is still available.",
          );
      }
      if (!isCurrentRoom(next.id)) return;
      const alreadySent = draft && committedDraft(next, draft, userId);
      const restored =
        alreadySent || !draft ? emptyDraft(next.turns.length) : draft;
      applyDraft(restored);
      setInput(restored.audioId ? "audio" : "text");
      pendingSubmission.current = restored.submitted
        ? { ...restored, text: restored.text.trim(), roomId: next.id }
        : null;
      roomSnapshot.current = next;
      setRoom(next);
      setDraftReady(true);
      if (alreadySent)
        void deleteDraft(draftKey(next.id)).catch(() => undefined);
      // Losing an active-room pointer must not hide a successfully joined room.
      void saveDraft(`friends:active:${userId}`, next.id).catch(() => {
        if (isCurrentRoom(next.id))
          setNotice(
            "Your conversation is saved. Reopen it from Your debates if this device cannot remember it.",
          );
      });
      if (restored.audioId) {
        const restoredAudioId = restored.audioId;
        void api<{ url: string }>(`/audio/${restoredAudioId}/url`)
          .then((result) => {
            if (
              isCurrentRoom(next.id) &&
              draftSnapshot.current.audioId === restoredAudioId
            )
              setAudioUri(
                result.url.startsWith("/")
                  ? `${API_BASE}${result.url}`
                  : result.url,
              );
          })
          .catch(() => {
            if (
              isCurrentRoom(next.id) &&
              draftSnapshot.current.audioId === restoredAudioId
            )
              setNotice(
                "Voice playback is unavailable. You can remove the attachment and send your words.",
              );
          });
      }
    },
    [applyDraft, isCurrent, isCurrentRoom, userId],
  );

  useEffect(() => {
    let live = true;
    async function load() {
      try {
        const [topics, recent, saved, savedCreation] = await Promise.all([
          api<Prompt[]>("/prompts?mode=debate"),
          api<FriendRoom[]>("/friends/rooms"),
          loadDraft(`friends:active:${userId}`),
          loadDraft(`friends:create:${userId}`),
        ]);
        if (!live || !isCurrent()) return;
        setPrompts(topics);
        setPromptId(topics[0]?.id || "");
        setRooms(recent);
        if (savedCreation) {
          setCreationPending(true);
          let original: CreationRequest | null = null;
          try {
            const value = JSON.parse(savedCreation);
            if (
              value &&
              typeof value.idempotencyKey === "string" &&
              typeof value.promptId === "string" &&
              ["for", "against"].includes(value.position) &&
              [2, 3].includes(value.rounds)
            )
              original = value;
          } catch {
            /* Older clients persisted the retry key alone. */
          }
          creationKey.current = original?.idempotencyKey || savedCreation;
          if (original) {
            creationRequest.current = original;
            setCreationPending(true);
            setPromptId(original.promptId);
            setPosition(original.position);
            setRounds(original.rounds);
          }
        }
        if (saved) {
          const existing = recent.find((item) => item.id === saved);
          if (existing) await enterRoom(existing);
        }
      } catch (e) {
        if (live && isCurrent()) setError(message(e));
      } finally {
        if (live && isCurrent()) setLoading(false);
      }
    }
    void load();
    return () => {
      live = false;
    };
  }, [userId, enterRoom, isCurrent, loadVersion]);

  useEffect(() => {
    if (!roomId) return;
    let live = true;
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try {
        if (!isCurrentRoom(roomId!)) return;
        const next = await api<FriendRoom>(`/friends/rooms/${roomId}`);
        if (!live || !isCurrentRoom(roomId!)) return;
        if (updateRoom(next)) {
          setNetworkError("");
          const request = pendingSubmission.current;
          if (
            request &&
            request.roomId === roomId &&
            committedDraft(next, request, userId)
          )
            clearSentDraft(next);
          else if (
            next.nextUserId === userId &&
            !pending.current &&
            !request &&
            draftSnapshot.current.expectedTurn !== next.turns.length
          ) {
            saveEditableDraft(next.id, {
              ...draftSnapshot.current,
              expectedTurn: next.turns.length,
            });
          }
          if (!activeStatuses.includes(next.status)) return;
        }
      } catch (e) {
        if (live && isCurrentRoom(roomId!))
          setNetworkError(`${message(e)} Reconnecting to your conversation…`);
      }
      if (live && isCurrentRoom(roomId!)) timer = setTimeout(poll, 1500);
    }
    timer = setTimeout(poll, 1500);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [
    roomId,
    updateRoom,
    userId,
    isCurrentRoom,
    clearSentDraft,
    saveEditableDraft,
  ]);

  function editText(value: string) {
    const current = roomSnapshot.current;
    if (
      !current ||
      pending.current ||
      !draftReady ||
      !isCurrentRoom(current.id) ||
      current.status !== "active" ||
      current.nextUserId !== userId ||
      pendingSubmission.current
    )
      return;
    saveEditableDraft(current.id, {
      ...draftSnapshot.current,
      text: Array.from(value).slice(0, 5000).join(""),
    });
  }
  function removeAudio() {
    const current = roomSnapshot.current;
    if (
      !current ||
      pending.current ||
      pendingSubmission.current ||
      !isCurrentRoom(current.id)
    )
      return;
    saveEditableDraft(current.id, { ...draftSnapshot.current, audioId: "" });
    setAudioUri("");
    setInput("text");
    setNotice(
      "Voice attachment removed. You can still send these words as text.",
    );
  }
  function persist() {
    const current = roomSnapshot.current;
    return current
      ? persistDraft(
          current.id,
          pendingSubmission.current?.roomId === current.id
            ? pendingSubmission.current
            : draftSnapshot.current,
        )
      : Promise.resolve();
  }
  async function leave(allRooms: boolean) {
    if (pending.current || recording || !isCurrent()) return;
    pending.current = true;
    setBusy(true);
    try {
      await persist();
      if (!isCurrent()) return;
      if (allRooms) {
        await deleteDraft(`friends:active:${userId}`);
        if (!isCurrent()) return;
        selectedRoom.current = null;
        roomSnapshot.current = null;
        pendingSubmission.current = null;
        ++draftRevision.current;
        applyDraft(emptyDraft());
        setRoom(null);
        setAudioUri("");
        setNetworkError("");
        setNotice("");
        setDraftReady(false);
        const recent = await api<FriendRoom[]>("/friends/rooms");
        if (isCurrent() && selectedRoom.current === null) setRooms(recent);
      } else onClose();
    } catch (e) {
      if (isCurrent()) setError(message(e));
    } finally {
      if (isCurrent()) {
        pending.current = false;
        setBusy(false);
      }
    }
  }
  async function openRoom(id: string) {
    if (pending.current || !isCurrent()) return;
    pending.current = true;
    setBusy(true);
    setError("");
    try {
      const next = await api<FriendRoom>(`/friends/rooms/${id}`);
      if (isCurrent()) await enterRoom(next);
    } catch (e) {
      if (isCurrent()) setError(message(e));
    } finally {
      if (isCurrent()) {
        pending.current = false;
        setBusy(false);
      }
    }
  }
  async function create() {
    if (pending.current || !promptId || !isCurrent()) return;
    pending.current = true;
    setBusy(true);
    setError("");
    const previousRequest = creationRequest.current;
    const retrying = creationPending || Boolean(previousRequest);
    const body = previousRequest || {
      promptId,
      position,
      rounds,
      idempotencyKey: creationKey.current,
    };
    creationRequest.current = body;
    setCreationPending(true);
    let sent = false;
    try {
      await saveDraft(`friends:create:${userId}`, JSON.stringify(body));
      if (!isCurrent()) return;
      sent = true;
      const next = await api<FriendRoom>("/friends/rooms", {
        method: "POST",
        body,
      });
      if (!isCurrent()) return;
      await enterRoom(next);
      if (!isCurrent()) return;
      creationRequest.current = null;
      creationKey.current = key();
      setCreationPending(false);
      try {
        await deleteDraft(`friends:create:${userId}`);
      } catch {
        if (isCurrentRoom(next.id))
          setNotice(
            "Your invitation is ready. This device could not clear its recovery copy; reopening may recover this invite once more.",
          );
      }
    } catch (e) {
      if (!isCurrent()) return;
      if ((!sent && !retrying) || rejectedRequest(e)) {
        creationRequest.current = null;
        creationKey.current = key();
        setCreationPending(false);
        void deleteDraft(`friends:create:${userId}`).catch(() => undefined);
      }
      setError(message(e));
    } finally {
      if (isCurrent()) {
        pending.current = false;
        setBusy(false);
      }
    }
  }
  async function join() {
    if (pending.current || code.length !== 6 || !isCurrent()) return;
    pending.current = true;
    setBusy(true);
    setError("");
    try {
      const next = await api<FriendRoom>("/friends/join", {
        method: "POST",
        body: { code },
      });
      if (!isCurrent()) return;
      await enterRoom(next);
      if (isCurrent()) setCode("");
    } catch (e) {
      if (isCurrent()) setError(message(e));
    } finally {
      if (isCurrent()) {
        pending.current = false;
        setBusy(false);
      }
    }
  }
  async function invite() {
    if (!room || !isCurrentRoom(room.id)) return;
    const id = room.id;
    try {
      if (Platform.OS === "web" && navigator.clipboard) {
        await navigator.clipboard.writeText(room.code);
        if (isCurrentRoom(id))
          setNotice(
            "Invite code copied. Share it with the friend you’d like to practise with.",
          );
      } else
        await Share.share({
          message: `Let’s explore an idea in BridgingMinds. Open Debate with a friend and enter invite code ${room.code}. We’ll each take a turn, by text or voice.`,
        });
    } catch {
      if (isCurrentRoom(id))
        setNotice(
          "Select the invite code above to copy it and share it with your friend.",
        );
    }
  }
  async function allowVoice() {
    const id = selectedRoom.current;
    if (!id || pending.current || !isCurrentRoom(id)) return;
    pending.current = true;
    setBusy(true);
    setError("");
    try {
      await api("/me", {
        method: "PATCH",
        body: { consent: { recording: true } },
      });
      if (!isCurrentRoom(id)) return;
      setConsent(true);
      await refresh();
    } catch (e) {
      if (isCurrentRoom(id)) setError(message(e));
    } finally {
      if (isCurrentRoom(id)) {
        pending.current = false;
        setBusy(false);
      }
    }
  }
  async function recorded(result: RecordedAudio) {
    const current = roomSnapshot.current;
    if (
      !current ||
      pending.current ||
      !isCurrentRoom(current.id) ||
      current.status !== "active" ||
      current.nextUserId !== userId
    )
      return;
    pending.current = true;
    setBusy(true);
    setError("");
    setNotice("Saving your voice message. You can review it before sharing.");
    try {
      const uploaded = await uploadAudio(result.uri, result.mime);
      if (!isCurrentRoom(current.id)) return;
      const attached = { ...draftSnapshot.current, audioId: uploaded.id };
      applyDraft(attached);
      setAudioUri(result.uri);
      await persistDraft(current.id, attached);
      if (!isCurrentRoom(current.id)) return;
      try {
        const transcript = await api<{
          text: string;
          requiresManualTranscription?: boolean;
          message?: string;
        }>(`/audio/${uploaded.id}/transcribe`, { method: "POST" });
        if (
          !isCurrentRoom(current.id) ||
          draftSnapshot.current.audioId !== uploaded.id
        )
          return;
        if (transcript.text)
          saveEditableDraft(current.id, {
            ...draftSnapshot.current,
            text: transcript.text,
          });
        setNotice(
          transcript.requiresManualTranscription || !transcript.text
            ? "Automatic transcription is unavailable. Type what you said below so your friend can read along. Your recording is ready to share when you send this turn."
            : "Correct the words below. Your friend will receive this recording and your corrected transcript when you send the turn.",
        );
      } catch {
        if (isCurrentRoom(current.id))
          setNotice(
            "Your recording is saved. Transcription is unavailable, so type what you said below before sharing this turn.",
          );
      }
    } catch (e) {
      if (isCurrentRoom(current.id)) {
        setError(message(e));
        setNotice("");
      }
    } finally {
      if (isCurrentRoom(current.id)) {
        pending.current = false;
        setBusy(false);
      }
    }
  }
  async function send() {
    const current = roomSnapshot.current;
    if (
      !current ||
      !isCurrentRoom(current.id) ||
      current.status !== "active" ||
      current.nextUserId !== userId ||
      characters(draftSnapshot.current.text.trim()) < 10 ||
      characters(draftSnapshot.current.text.trim()) > 5000 ||
      pending.current
    )
      return;
    pending.current = true;
    setBusy(true);
    setError("");
    let recoveredRoom: FriendRoom | null = null;
    let sent = false;
    const previousRequest =
      pendingSubmission.current?.roomId === current.id
        ? pendingSubmission.current
        : null;
    const draft = previousRequest || draftSnapshot.current;
    const body = {
      text: draft.text.trim(),
      audioId: draft.audioId || undefined,
      expectedTurn: previousRequest
        ? previousRequest.expectedTurn
        : current.turns.length,
      idempotencyKey: draft.turnKey,
    };
    try {
      pendingSubmission.current = {
        text: body.text,
        roomId: current.id,
        audioId: body.audioId || "",
        turnKey: body.idempotencyKey,
        expectedTurn: body.expectedTurn,
        submitted: true,
      };
      applyDraft(pendingSubmission.current);
      await persistDraft(current.id, pendingSubmission.current);
      if (!isCurrentRoom(current.id)) return;
      sent = true;
      let next: FriendRoom;
      try {
        next = await api<FriendRoom>(`/friends/rooms/${current.id}/turn`, {
          method: "POST",
          body,
        });
      } catch (e) {
        if (!isCurrentRoom(current.id)) return;
        const recovered = await api<FriendRoom>(
          `/friends/rooms/${current.id}`,
        ).catch(() => null);
        if (!isCurrentRoom(current.id)) return;
        recoveredRoom = recovered;
        if (
          !recovered ||
          !committedDraft(
            recovered,
            { ...draft, text: body.text, expectedTurn: body.expectedTurn },
            userId,
          )
        )
          throw e;
        next = recovered;
      }
      if (!isCurrentRoom(current.id)) return;
      updateRoom(next);
      clearSentDraft(roomSnapshot.current || next);
    } catch (e) {
      if (!isCurrentRoom(current.id)) return;
      // A poll can confirm a committed turn before a late request error arrives.
      if (!pendingSubmission.current) {
        setError("");
        return;
      }
      if ((!sent && !previousRequest) || rejectedRequest(e)) {
        pendingSubmission.current = null;
        if (recoveredRoom) updateRoom(recoveredRoom);
        saveEditableDraft(current.id, {
          text: body.text,
          audioId: body.audioId || "",
          turnKey: key(),
          expectedTurn:
            roomSnapshot.current?.turns.length ?? current.turns.length,
        });
      } else setUnconfirmed(true);
      setError(message(e));
    } finally {
      if (isCurrentRoom(current.id)) {
        pending.current = false;
        setBusy(false);
      }
    }
  }
  async function closeRoom() {
    const current = roomSnapshot.current;
    if (!current || pending.current || !isCurrentRoom(current.id)) return;
    pending.current = true;
    setBusy(true);
    setError("");
    try {
      await persist();
      if (!isCurrentRoom(current.id)) return;
      const next = await api<FriendRoom>(`/friends/rooms/${current.id}/close`, {
        method: "POST",
      });
      if (!isCurrentRoom(current.id)) return;
      updateRoom(next);
      setConfirmClose(false);
    } catch (e) {
      if (isCurrentRoom(current.id)) setError(message(e));
    } finally {
      if (isCurrentRoom(current.id)) {
        pending.current = false;
        setBusy(false);
      }
    }
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={{ flex: 1, backgroundColor: C.cream }}
    >
      <View style={s.container}>
        <View style={s.between}>
          <View style={s.row}>
            <View style={s.logo}>
              <Icon name="users" size={24} />
            </View>
            <Text style={T.h3}>Debate with a friend</Text>
          </View>
          <Button
            label="Save & close"
            icon="x"
            variant="ghost"
            disabled={busy || recording}
            onPress={() => void leave(false)}
          />
        </View>
        <ErrorNote message={error || networkError} />
        {Boolean(notice) && (
          <View style={s.note}>
            <Icon name="info" size={18} />
            <Text style={[T.small, { flex: 1, color: C.ink }]}>{notice}</Text>
          </View>
        )}
        {loading ? (
          <ActivityIndicator
            accessibilityLabel="Loading"
            color={C.forest}
            style={{ padding: 60 }}
          />
        ) : room ? (
          <>
            <View style={s.between}>
              <Button
                label="All debates"
                icon="arrow-left"
                variant="ghost"
                disabled={busy || recording}
                onPress={() => void leave(true)}
              />
              <Tag color={finished ? C.sage : C.lilac}>
                {room.status === "waiting"
                  ? "WAITING FOR FRIEND"
                  : room.status === "completed"
                    ? "COMPLETE"
                    : room.status === "closed"
                      ? "CLOSED"
                      : `ROUND ${Math.min(room.rounds, Math.floor(room.turns.length / 2) + 1)} OF ${room.rounds}`}
              </Tag>
            </View>
            <Heading sub={room.prompt.context}>{room.prompt.question}</Heading>
            <View style={s.participants}>
              {room.participants.map((person) => (
                <View
                  key={person.id}
                  style={[
                    s.person,
                    person.id === userId && { backgroundColor: C.sage },
                  ]}
                >
                  <Icon name="user" />
                  <View style={{ flex: 1, gap: 3 }}>
                    <Text style={T.h3}>
                      {person.displayName}
                      {person.id === userId ? " · you" : ""}
                    </Text>
                    <Text style={T.small}>
                      {person.position === "for" ? "For" : "Against"} the
                      proposition
                    </Text>
                  </View>
                </View>
              ))}
              {!friend && (
                <View
                  style={[
                    s.person,
                    { borderStyle: "dashed", backgroundColor: "transparent" },
                  ]}
                >
                  <Icon name="user-plus" />
                  <Text style={[T.small, { flex: 1 }]}>
                    Your friend ·{" "}
                    {me?.position === "for" ? "opposing" : "supporting"}{" "}
                    perspective
                  </Text>
                </View>
              )}
            </View>
            {room.status === "waiting" && (
              <Card
                style={{
                  gap: 18,
                  alignItems: "center",
                  backgroundColor: C.lilac,
                }}
              >
                <Text style={T.label}>INVITE CODE</Text>
                <Text
                  selectable
                  accessibilityLabel={`Invite code ${room.code}`}
                  style={s.code}
                >
                  {room.code}
                </Text>
                <Text style={[T.body, { textAlign: "center", maxWidth: 430 }]}>
                  Share this code so your friend can join.
                </Text>
                <Button
                  label={
                    Platform.OS === "web"
                      ? "Copy invite code"
                      : "Share invite code"
                  }
                  icon="share-2"
                  onPress={() => void invite()}
                />
                <Text style={[T.small, { textAlign: "center" }]}>
                  You go first. Invite expires{" "}
                  {new Date(room.expiresAt).toLocaleString()}.
                </Text>
                <Text style={[T.small, { textAlign: "center" }]}>
                  Both devices must use the same BridgingMinds server.
                </Text>
              </Card>
            )}
            <View style={s.note}>
              <Icon name="heart" size={18} />
              <Text style={[T.small, { flex: 1, color: C.ink }]}>
                Practising a position isn’t endorsement. Only you and your
                friend can access this conversation and shared recordings.
              </Text>
            </View>
            {room.turns.map((turn) => {
              const own = turn.userId === userId;
              const author = room.participants.find(
                (person) => person.id === turn.userId,
              );
              return (
                <Card
                  key={turn.id}
                  style={{
                    gap: 14,
                    backgroundColor: own ? C.sage : C.paper,
                    marginLeft: own ? 18 : 0,
                    marginRight: own ? 0 : 18,
                  }}
                >
                  <View style={s.between}>
                    <Text style={[T.label, { color: C.forest }]}>
                      {own
                        ? "YOUR PERSPECTIVE"
                        : author?.displayName || "YOUR FRIEND"}
                    </Text>
                    <Text style={T.small}>Round {turn.round}</Text>
                  </View>
                  <Text style={T.body}>{turn.text}</Text>
                  {Boolean(turn.audioId) && (
                    <VoiceMessage audioId={turn.audioId!} />
                  )}
                  <Text style={T.small}>
                    {new Date(turn.createdAt).toLocaleTimeString(undefined, {
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                    {turn.audioId
                      ? " · Shared voice & transcript"
                      : " · Written response"}
                  </Text>
                </Card>
              );
            })}
            {room.status === "active" &&
              (isMyTurn ? (
                <Card style={{ gap: 19 }}>
                  <View style={s.between}>
                    <Text style={T.h2}>Your turn</Text>
                    <Tag>
                      {room.turns.length === 0
                        ? "OPENING ARGUMENT"
                        : "YOUR RESPONSE"}
                    </Tag>
                  </View>
                  <Text style={T.small}>
                    {room.turns.length === 0
                      ? "Give a claim, reason, and example."
                      : "Respond to your friend’s point with reasons."}
                  </Text>
                  {!recording && !audioId && !busy && !unconfirmed && (
                    <View style={s.row}>
                      <Chip
                        label="Write my turn"
                        selected={input === "text"}
                        onPress={() => setInput("text")}
                      />
                      <Chip
                        label="Record my turn"
                        selected={input === "audio"}
                        onPress={() => setInput("audio")}
                      />
                    </View>
                  )}
                  {input === "audio" && !audioId ? (
                    consent ? (
                      <AudioInput
                        sharing
                        onRecorded={recorded}
                        onCancel={() => setInput("text")}
                        onCaptureActive={setRecording}
                        busy={busy}
                      />
                    ) : (
                      <View style={{ gap: 14 }}>
                        <Text style={T.h3}>Voice recording</Text>
                        <Text style={T.body}>
                          Store recordings for playback and optional
                          transcription. Sending shares your audio and corrected
                          transcript with your friend. Audio is deleted after 30
                          days.
                        </Text>
                        <Text style={T.small}>
                          With AI transcription enabled, Use recording sends
                          audio to that provider. You can write instead.
                        </Text>
                        <Button
                          label="Allow voice recording"
                          icon="mic"
                          loading={busy}
                          onPress={() => void allowVoice()}
                        />
                        <Button
                          label="Write my turn instead"
                          disabled={busy}
                          variant="ghost"
                          onPress={() => setInput("text")}
                        />
                      </View>
                    )
                  ) : (
                    <>
                      {Boolean(audioUri) && <AudioPlayback uri={audioUri} />}
                      {unconfirmed ? (
                        <View style={{ gap: 12 }}>
                          <Text style={T.h3}>Confirming your turn…</Text>
                          <Text style={T.body}>{text}</Text>
                          <Text style={T.small}>
                            Retrying sends this saved turn without duplicating
                            it.
                          </Text>
                        </View>
                      ) : (
                        <Field
                          value={text}
                          editable={!busy && draftReady}
                          onChangeText={editText}
                          label={
                            audioId
                              ? "Transcript to share"
                              : "Your argument to your friend"
                          }
                          multiline
                          placeholder="Your idea, reason, and example…"
                        />
                      )}
                      <View style={s.between}>
                        <Text style={T.small}>
                          {characters(text)}/5,000 characters · at least 10 to
                          send
                        </Text>
                        <Text style={T.small}>Saved on this device</Text>
                      </View>
                      {Boolean(audioId) && (
                        <>
                          <View style={s.note}>
                            <Icon name="users" size={18} />
                            <Text style={[T.small, { flex: 1, color: C.ink }]}>
                              Sending shares this audio and transcript with{" "}
                              {friend?.displayName || "your friend"}.
                            </Text>
                          </View>
                          <Button
                            label="Remove voice attachment"
                            variant="ghost"
                            disabled={busy || unconfirmed}
                            onPress={removeAudio}
                          />
                        </>
                      )}
                      <Button
                        label={
                          unconfirmed
                            ? "Retry saved turn"
                            : audioId
                              ? "Send voice & text"
                              : "Send my turn"
                        }
                        icon="send"
                        loading={busy}
                        disabled={
                          characters(text.trim()) < 10 ||
                          characters(text.trim()) > 5000 ||
                          !isMyTurn
                        }
                        onPress={() => void send()}
                      />
                    </>
                  )}
                </Card>
              ) : (
                <Card style={{ backgroundColor: C.lilac, gap: 11 }}>
                  <View style={s.row}>
                    <Icon name="coffee" />
                    <Text style={T.h2}>Your friend’s turn</Text>
                  </View>
                  <Text style={T.body}>
                    It’s {friend?.displayName || "your friend"}’s turn. Their
                    response will appear here.
                  </Text>
                  <Text style={T.small}>You can leave and return later.</Text>
                </Card>
              ))}
            {finished && (
              <Card style={{ gap: 15, backgroundColor: C.lilac }}>
                <Icon name="sun" size={30} />
                <Text style={T.h2}>
                  {room.status === "completed"
                    ? "Debate complete"
                    : "Conversation closed"}
                </Text>
                <Text style={T.body}>
                  {room.status === "completed"
                    ? `You each took ${room.rounds} turns. What changed your perspective?`
                    : "Either participant can close a conversation. Both can revisit the shared turns."}
                </Text>
                <Text style={T.small}>No AI scores or Coin rewards.</Text>
                <Button
                  label="New debate"
                  icon="users"
                  onPress={() => void leave(true)}
                />
              </Card>
            )}
            {!finished && (
              <View style={{ gap: 12 }}>
                {confirmClose ? (
                  <Card style={{ gap: 14 }}>
                    <Text style={T.h3}>
                      Close this conversation for both of you?
                    </Text>
                    <Text style={T.body}>
                      No more turns can be added. Shared messages will remain
                      available to both participants.
                    </Text>
                    <View style={s.row}>
                      <Button
                        label="Yes, close conversation"
                        loading={busy}
                        onPress={() => void closeRoom()}
                      />
                      <Button
                        label="Keep talking"
                        variant="secondary"
                        onPress={() => setConfirmClose(false)}
                      />
                    </View>
                  </Card>
                ) : (
                  <Button
                    label="Close conversation"
                    variant="ghost"
                    disabled={busy || recording}
                    onPress={() => setConfirmClose(true)}
                  />
                )}
              </View>
            )}
          </>
        ) : (
          <>
            <Text style={[T.body, { color: C.muted }]}>
              Take opposite sides and alternate turns.
            </Text>
            {!prompts.length && Boolean(error) && (
              <Button
                label="Retry loading debates"
                icon="refresh-cw"
                disabled={busy}
                onPress={() => {
                  setError("");
                  setLoading(true);
                  setLoadVersion((value) => value + 1);
                }}
              />
            )}
            <Card style={{ gap: 16, backgroundColor: C.lilac }}>
              <View style={s.row}>
                <Icon name="key" />
                <Text style={T.h2}>Join with a code</Text>
              </View>
              <Field
                value={code}
                editable={!busy}
                onChangeText={(value) =>
                  setCode(
                    value
                      .toUpperCase()
                      .replace(/[^A-Z0-9]/g, "")
                      .slice(0, 6),
                  )
                }
                label="Six-character invite code"
                placeholder="ABC123"
                autoCapitalize="characters"
              />
              <Button
                label="Join debate"
                icon="arrow-right"
                disabled={code.length !== 6}
                loading={busy}
                onPress={() => void join()}
              />
            </Card>
            <Card style={{ gap: 20 }}>
              <View style={s.row}>
                <Icon name="feather" />
                <Text style={T.h2}>New debate</Text>
              </View>
              <Text style={T.body}>
                Choose a topic. Your friend takes the opposite side.
              </Text>
              {creationPending && (
                <Text style={T.small}>
                  Create invite will recover your previous invitation.
                </Text>
              )}
              <Text style={T.label}>PICK A PROPOSITION</Text>
              {prompts.map((prompt) => (
                <Pressable
                  key={prompt.id}
                  accessibilityRole="radio"
                  accessibilityState={{
                    checked: prompt.id === promptId,
                    disabled: busy || creationPending,
                  }}
                  aria-checked={prompt.id === promptId}
                  aria-disabled={busy || creationPending}
                  disabled={busy || creationPending}
                  onPress={() => setPromptId(prompt.id)}
                  style={[
                    s.topic,
                    prompt.id === promptId && {
                      backgroundColor: C.sage,
                      borderColor: "#A8BE9F",
                    },
                  ]}
                >
                  <View style={{ flex: 1, gap: 5 }}>
                    <Text style={T.small}>{prompt.category}</Text>
                    <Text style={T.body}>{prompt.question}</Text>
                  </View>
                  <Icon
                    name={prompt.id === promptId ? "check-circle" : "circle"}
                  />
                </Pressable>
              ))}
              <Text style={T.label}>YOUR POSITION</Text>
              <View style={s.row}>
                <Chip
                  disabled={busy || creationPending}
                  label="For the proposition"
                  selected={position === "for"}
                  onPress={() => setPosition("for")}
                />
                <Chip
                  disabled={busy || creationPending}
                  label="Against the proposition"
                  selected={position === "against"}
                  onPress={() => setPosition("against")}
                />
              </View>
              <Text style={T.label}>TURNS PER PERSON</Text>
              <View style={s.row}>
                {[2, 3].map((value) => (
                  <Chip
                    key={value}
                    disabled={busy || creationPending}
                    label={`${value} rounds`}
                    selected={rounds === value}
                    onPress={() => setRounds(value)}
                  />
                ))}
              </View>
              <Button
                label="Create invite"
                icon="user-plus"
                disabled={!promptId}
                loading={busy}
                onPress={() => void create()}
              />
              <Text style={T.small}>
                Text or voice · no AI scores or Coin rewards
              </Text>
            </Card>
            <View style={{ gap: 14 }}>
              <Text style={T.h2}>Your debates</Text>
              {rooms.length ? (
                rooms.map((item) => (
                  <Pressable
                    key={item.id}
                    accessibilityRole="button"
                    accessibilityLabel={`Open friend debate: ${item.prompt.question}`}
                    disabled={busy}
                    accessibilityState={{ disabled: busy }}
                    aria-disabled={busy}
                    onPress={() => void openRoom(item.id)}
                    style={s.recent}
                  >
                    <View style={{ flex: 1, gap: 7 }}>
                      <Text style={T.body}>{item.prompt.question}</Text>
                      <Text style={T.small}>
                        {item.participants.find(
                          (person) => person.id !== userId,
                        )?.displayName || "Waiting for a friend"}{" "}
                        · {item.status} · {item.turns.length} turns
                      </Text>
                    </View>
                    <Icon name="arrow-up-right" />
                  </Pressable>
                ))
              ) : (
                <Card style={{ backgroundColor: C.cream, gap: 10 }}>
                  <Text style={T.small}>
                    Your invitations and debates appear here.
                  </Text>
                </Card>
              )}
            </View>
          </>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

const useStyles = createThemedStyles(({ C }) =>
  StyleSheet.create({
    container: { width: "100%", maxWidth: 880, alignSelf: "center", gap: 23 },
    row: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      flexWrap: "wrap",
    },
    between: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      gap: 12,
      flexWrap: "wrap",
    },
    logo: {
      backgroundColor: C.lilac,
      width: 46,
      height: 46,
      borderRadius: 16,
      alignItems: "center",
      justifyContent: "center",
    },
    chip: {
      minHeight: 44,
      justifyContent: "center",
      borderWidth: 1,
      borderColor: C.border,
      borderRadius: 24,
      paddingHorizontal: 16,
      backgroundColor: C.paper,
    },
    note: {
      borderRadius: 15,
      backgroundColor: C.sage,
      padding: 16,
      flexDirection: "row",
      gap: 12,
    },
    code: {
      fontFamily: "DMBold",
      fontSize: 36,
      lineHeight: 48,
      letterSpacing: 7,
      color: C.forest,
      textAlign: "center",
    },
    participants: { flexDirection: "row", gap: 12, flexWrap: "wrap" },
    person: {
      flex: 1,
      minWidth: 215,
      flexDirection: "row",
      gap: 12,
      alignItems: "center",
      borderWidth: 1,
      borderColor: C.border,
      borderRadius: 15,
      padding: 16,
      backgroundColor: C.paper,
    },
    topic: {
      borderWidth: 1,
      borderColor: C.border,
      borderRadius: 14,
      padding: 16,
      flexDirection: "row",
      gap: 12,
      alignItems: "center",
      minHeight: 65,
    },
    recent: {
      borderWidth: 1,
      borderColor: C.border,
      backgroundColor: C.paper,
      borderRadius: 16,
      padding: 18,
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      minHeight: 75,
    },
  }),
);
