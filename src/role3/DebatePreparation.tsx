import React, { useCallback, useEffect, useRef, useState } from "react";
import { Animated, Easing, Platform, StyleSheet, Text, View } from "react-native";
import type { DebateSession } from "../../shared/debate.mjs";
import {
  createPlanningBoard,
  type PlanningBoard,
} from "../../shared/planning-board.mjs";
import { IdeasBoard } from "../components/IdeasBoard";
import { C, ErrorNote, Icon, T } from "../components/ui";
import { useReducedMotion } from "../hooks/useReducedMotion";
import { deleteDraft, isDraftOwner, loadDraft, saveDraft } from "../lib/api";
import { Action, errorMessage, R } from "./common";
import { debateApi } from "./debate-api";
import { TopicContext } from "./TournamentLobby";

const PreparationBoard = React.memo(IdeasBoard);

function PositionRoll({
  position,
  onReveal,
}: {
  position: DebateSession["position"];
  onReveal: () => void;
}) {
  const reducedMotion = useReducedMotion();
  const [offset] = useState(() => new Animated.Value(0));
  const finish = useRef(onReveal);
  useEffect(() => { finish.current = onReveal; }, [onReveal]);
  const last = position === "for" ? 12 : 13;
  useEffect(() => {
    if (reducedMotion) {
      finish.current();
      return;
    }
    offset.setValue(0);
    const animation = Animated.timing(offset, {
      toValue: -last * 64,
      duration: 1900,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: Platform.OS !== "web",
    });
    animation.start(({ finished }) => {
      if (finished) finish.current();
    });
    return () => animation.stop();
  }, [last, offset, reducedMotion]);
  return (
    <View
      style={s.roll}
      testID="debate-position-roll"
      accessibilityLabel="Rolling your position"
    >
      {reducedMotion ? (
        <Text style={s.rollText}>{position === "for" ? "FOR" : "AGAINST"}</Text>
      ) : (
        <Animated.View
          style={{ transform: [{ translateY: offset }] }}
          aria-hidden
        >
          {Array.from({ length: 14 }, (_, index) => (
            <Text key={index} style={s.rollText}>
              {index % 2 === 0 ? "FOR" : "AGAINST"}
            </Text>
          ))}
        </Animated.View>
      )}
    </View>
  );
}

export function DebatePreparation({
  session,
  owner,
  onSession,
  onLeave,
}: {
  session: DebateSession;
  owner: string;
  onSession: (session: DebateSession) => void;
  onLeave: () => void;
}) {
  const plan = session.preparation!;
  const [board, setBoard] = useState(
    () => plan.planningBoard || createPlanningBoard(),
  );
  const [hydrated, setHydrated] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [background, setBackground] = useState(false);
  const [now, setNow] = useState(Date.now);
  const latestBoard = useRef(board);
  const mounted = useRef(true);
  const lock = useRef(false);
  const expired = useRef(false);
  const writes = useRef(Promise.resolve());
  const callbacks = useRef({ onSession, onLeave });
  useEffect(() => { callbacks.current = { onSession, onLeave }; }, [onSession, onLeave]);
  const draftKey = `debate-plan-${session.id}`;

  useEffect(() => {
    mounted.current = true;
    void loadDraft(draftKey)
      .then((raw) => {
        if (!mounted.current || !isDraftOwner(owner)) return;
        if (raw) {
          try {
            const saved = JSON.parse(raw) as PlanningBoard;
            if (
              saved.version === 1 &&
              typeof saved.notepad === "string" &&
              Array.isArray(saved.nodes) &&
              Array.isArray(saved.links) &&
              Array.isArray(saved.strokes)
            ) {
              latestBoard.current = saved;
              setBoard(saved);
            }
          } catch {
            /* The server copy remains available if a local draft is damaged. */
          }
        }
      })
      .catch(() => {
        if (mounted.current)
          setError(
            "Local notes could not be restored. Your account copy is shown.",
          );
      })
      .finally(() => {
        if (mounted.current) setHydrated(true);
      });
    return () => {
      mounted.current = false;
    };
  }, [draftKey, owner]);

  const changeBoard = useCallback((next: PlanningBoard) => {
    if (lock.current || !isDraftOwner(owner)) return;
    latestBoard.current = next;
    setBoard(next);
    const snapshot = JSON.stringify(next);
    writes.current = writes.current
      .catch(() => undefined)
      .then(async () => {
        if (isDraftOwner(owner)) await saveDraft(draftKey, snapshot);
      });
    void writes.current.catch(() => {
      if (mounted.current && isDraftOwner(owner))
        setError(
          "Notes are still here, but could not save on this device. Use Save & leave to save them to your account.",
        );
    });
  }, [draftKey, owner]);

  const act = useCallback(
    async (action: "reveal" | "save" | "begin") => {
      if (lock.current || !isDraftOwner(owner)) return;
      lock.current = true;
      setBusy(true);
      setError("");
      try {
        const next = await debateApi.preparation(
          session.id,
          action,
          action === "reveal" ? undefined : latestBoard.current,
        );
        if (!mounted.current || !isDraftOwner(owner)) return;
        setNow(Date.now());
        if (action === "save") {
          // A failed local write may have left an older draft behind. The
          // account copy is now current, so drain writes and remove that draft
          // before a later resume can load it over the saved notes.
          await writes.current.catch(() => undefined);
          if (!mounted.current || !isDraftOwner(owner)) return;
          try { await deleteDraft(draftKey); }
          catch { throw new Error("Your notes are saved to your account, but this device could not clear its older draft. Try Save & leave again."); }
          if (!mounted.current || !isDraftOwner(owner)) return;
          callbacks.current.onLeave();
        } else callbacks.current.onSession(next);
        if (action === "begin") {
          await writes.current.catch(() => undefined);
          if (isDraftOwner(owner))
            await deleteDraft(draftKey).catch(() => undefined);
        }
      } catch (cause) {
        if (mounted.current && isDraftOwner(owner))
          setError(errorMessage(cause));
      } finally {
        lock.current = false;
        if (mounted.current && isDraftOwner(owner)) setBusy(false);
      }
    },
    [draftKey, owner, session.id],
  );
  const begin = useCallback(() => { void act("begin"); }, [act]);

  useEffect(() => {
    if (!plan.endsAt) return;
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [plan.endsAt]);
  const seconds = plan.endsAt
    ? Math.max(0, Math.ceil((Date.parse(plan.endsAt) - now) / 1000))
    : 300;
  useEffect(() => {
    if (plan.endsAt && seconds === 0 && hydrated && !busy && !expired.current) {
      expired.current = true;
      void act("begin");
    }
  }, [act, busy, hydrated, plan.endsAt, seconds]);

  if (!plan.startedAt)
    return (
      <View style={[R.card, s.reveal]} testID="debate-roll-screen">
        <Icon name="shuffle" size={28} />
        <Text accessibilityRole="header" style={T.h2}>
          A new perspective
        </Text>
        <Text style={[T.small, s.center]}>Let chance choose your side.</Text>
        <PositionRoll
          position={session.position}
          onReveal={() => void act("reveal")}
        />
        <Text style={[T.body, s.center]}>{session.topic.title}</Text>
        <Text style={[T.small, s.center]}>Then, five minutes to prepare.</Text>
        <ErrorNote message={error} />
        {!!error && (
          <Action
            label="Reveal my position"
            primary
            busy={busy}
            onPress={() => void act("reveal")}
          />
        )}
      </View>
    );

  return (
    <View style={{ gap: 16 }} testID="debate-preparation">
      <View style={[R.row, { justifyContent: "space-between" }]}>
        <Action
          label="Save & leave"
          icon="arrow-left"
          disabled={busy || !hydrated}
          onPress={() => void act("save")}
          testID="save-leave-preparation"
        />
        <Text style={T.small}>{session.mode === "tournament" ? "Boss challenge" : "Practice"} with {session.opponent.name}</Text>
      </View>
      <View style={[R.card, { gap: 16 }]}>
        <View
          style={[
            R.row,
            { justifyContent: "space-between", alignItems: "center" },
          ]}
        >
          <View style={{ gap: 5 }}>
            <Text style={T.label}>YOUR ASSIGNED SIDE</Text>
            <Text
              style={s.stance}
              testID="assigned-debate-position"
              accessibilityLiveRegion="polite"
            >
              Argue {session.position}
            </Text>
          </View>
          <View style={s.clock}>
            <Icon name="clock" size={17} />
            <Text
              style={s.time}
              testID="debate-preparation-timer"
              accessibilityLabel={`Preparation time remaining: ${Math.floor(seconds / 60)} minutes ${seconds % 60} seconds`}
            >
              {Math.floor(seconds / 60)
                .toString()
                .padStart(2, "0")}
              :{(seconds % 60).toString().padStart(2, "0")}
            </Text>
          </View>
        </View>
        <Text accessibilityRole="header" style={[T.h3, { lineHeight: 26 }]}>
          {session.topic.title}
        </Text>
        <Action
          label={background ? "Hide background" : "Read background"}
          selected={background}
          onPress={() => setBackground(!background)}
        />
        {background && <TopicContext topic={session.topic} />}
      </View>
      <View style={{ gap: 5 }}>
        <Text accessibilityRole="header" style={T.h2}>
          Build your case
        </Text>
        <Text style={T.small}>
          One claim, a reason, an example. Anticipate the other side.
        </Text>
      </View>
      <ErrorNote message={error} />
      {hydrated && (
        <View pointerEvents={busy ? "none" : "auto"}>
          <PreparationBoard
            board={board}
            onChange={changeBoard}
            onDone={begin}
            doneLabel={busy ? "Saving…" : "Start battle"}
            doneDisabled={busy}
            hint={
              seconds === 0
                ? "Preparation is complete. Start battle to continue."
                : "Battle opens when time is up. Ready sooner? Start anytime."
            }
          />
        </View>
      )}
      <Text style={[T.small, s.center]}>
        Your notes stay with you during the debate.
      </Text>
    </View>
  );
}

const s = StyleSheet.create({
  center: { textAlign: "center" },
  reveal: { alignItems: "center", gap: 18, paddingVertical: 36 },
  roll: {
    height: 64,
    width: "100%",
    maxWidth: 300,
    overflow: "hidden",
    backgroundColor: C.sage,
    borderColor: C.border,
    borderWidth: 1,
    borderRadius: 14,
    marginVertical: 10,
  },
  rollText: {
    height: 64,
    lineHeight: 64,
    textAlign: "center",
    fontFamily: "DMBold",
    fontSize: 30,
    letterSpacing: 3,
    color: C.ink,
  },
  stance: { fontFamily: "DMBold", fontSize: 27, color: C.ink },
  clock: {
    flexDirection: "row",
    gap: 7,
    alignItems: "center",
    backgroundColor: C.sage,
    padding: 12,
    borderRadius: 12,
  },
  time: {
    fontFamily: "DMBold",
    fontSize: 22,
    fontVariant: ["tabular-nums"],
    color: C.ink,
  },
});
