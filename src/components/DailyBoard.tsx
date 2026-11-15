import React, { useRef, useState } from "react";
import {
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import Svg, { Line, Polyline } from "react-native-svg";
import type {
  BrainstormBoard,
  BrainstormNote,
  BrainstormPoint,
} from "../types";
import { C, Icon } from "./ui";

function key() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}
export function createDailyBoard(): BrainstormBoard {
  const startedAt = new Date().toISOString();
  return {
    version: "daily-whiteboard-v1",
    startedAt,
    expiresAt: new Date(Date.parse(startedAt) + 60000).toISOString(),
    strokes: [],
    notes: [
      { id: "benefits", text: "", x: 8, y: 25 },
      { id: "concerns", text: "", x: 184, y: 25 },
      { id: "view", text: "", x: 94, y: 218 },
    ],
    connectors: [],
    snapshot: { version: 1, savedAt: startedAt, elementCount: 3 },
  };
}

export function DailyBoard({
  board,
  onChange,
  topic,
  onDone,
}: {
  board: BrainstormBoard;
  onChange: (board: BrainstormBoard) => void;
  topic: string;
  onDone: () => void;
}) {
  const [tool, setTool] = useState<"pen" | "text" | "erase" | "link">("text");
  const [width, setWidth] = useState(320);
  const [drawing, setDrawing] = useState<BrainstormPoint[]>([]);
  const strokePoints = useRef<BrainstormPoint[]>([]);
  const [history, setHistory] = useState<BrainstormBoard[]>([]);
  const [future, setFuture] = useState<BrainstormBoard[]>([]);
  const [clearOpen, setClearOpen] = useState(false);
  const [linkFrom, setLinkFrom] = useState<string | null>(null);
  const scale = width / 320;
  function commit(next: BrainstormBoard) {
    setHistory((items) => [...items.slice(-49), board]);
    setFuture([]);
    onChange({
      ...next,
      snapshot: {
        version: 1,
        savedAt: new Date().toISOString(),
        elementCount:
          next.notes.length + next.strokes.length + next.connectors.length,
      },
    });
  }
  function selectNote(note: BrainstormNote) {
    if (tool === "erase")
      commit({
        ...board,
        notes: board.notes.filter((n) => n.id !== note.id),
        connectors: board.connectors.filter(
          (e) => e.from !== note.id && e.to !== note.id,
        ),
      });
    if (tool === "link") {
      if (linkFrom && linkFrom !== note.id) {
        commit({
          ...board,
          connectors: [
            ...board.connectors,
            { id: key(), from: linkFrom, to: note.id },
          ],
        });
        setLinkFrom(null);
      } else setLinkFrom(note.id);
    }
  }
  // PanResponder stores these event callbacks; it does not read the gesture ref during render.
  // eslint-disable-next-line react-hooks/refs
  const responder = PanResponder.create({
    onStartShouldSetPanResponder: () => tool === "pen" || tool === "erase",
    onPanResponderGrant: (e) => {
      const p = {
        x: e.nativeEvent.locationX / scale,
        y: e.nativeEvent.locationY / scale,
      };
      if (tool === "pen") { strokePoints.current = [p]; setDrawing([p]); }
      else
        commit({
          ...board,
          strokes: board.strokes.filter(
            (s) => !s.points.some((v) => Math.hypot(v.x - p.x, v.y - p.y) < 18),
          ),
        });
    },
    onPanResponderMove: (e) => {
      if (tool === "pen") {
        const p = {
          x: Math.max(0, Math.min(320, e.nativeEvent.locationX / scale)),
          y: Math.max(0, Math.min(330, e.nativeEvent.locationY / scale)),
        };
        if (strokePoints.current.length < 1499) strokePoints.current = [...strokePoints.current, p];
        setDrawing(strokePoints.current);
      }
    },
    onPanResponderRelease: () => {
      if (strokePoints.current.length > 1 && board.strokes.length < 120)
        commit({
          ...board,
          strokes: [...board.strokes, { id: key(), points: strokePoints.current }],
        });
      setDrawing([]);
      strokePoints.current = [];
    },
    onPanResponderTerminate: () => { strokePoints.current = []; setDrawing([]); },
  });
  const positions = Object.fromEntries(board.notes.map((n) => [n.id, n]));
  return (
    <View style={{ gap: 12 }}>
      <View
        testID="daily-board-canvas"
        onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
        style={{ height: 330 * scale, position: "relative" }}
      >
        <Svg
          width="100%"
          height="100%"
          viewBox="0 0 320 330"
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        >
          {board.notes
            .filter((n) => ["benefits", "concerns", "view"].includes(n.id))
            .map((n) => (
              <Line
                key={n.id}
                x1="150"
                y1="170"
                x2={n.x + 50}
                y2={n.y + 48}
                stroke="#d4d4d4"
                strokeWidth="1.5"
              />
            ))}
          {board.connectors.map((edge) =>
            positions[edge.from] && positions[edge.to] ? (
              <Line
                key={edge.id}
                x1={positions[edge.from].x + 48}
                y1={positions[edge.from].y + 40}
                x2={positions[edge.to].x + 48}
                y2={positions[edge.to].y + 40}
                stroke="#999"
                strokeWidth="1.5"
              />
            ) : null,
          )}
          {[...board.strokes, { id: "live", points: drawing }].map((stroke) => (
            <Polyline
              key={stroke.id}
              points={stroke.points.map((p) => `${p.x},${p.y}`).join(" ")}
              fill="none"
              stroke="#333"
              strokeWidth="2"
              strokeLinecap="round"
            />
          ))}
        </Svg>
        <View
          pointerEvents="none"
          style={[
            s.topic,
            {
              left: 100 * scale,
              top: 139 * scale,
              width: 104 * scale,
              height: 66 * scale,
            },
          ]}
        >
          <Text numberOfLines={3} style={s.topicText}>
            {topic}
          </Text>
        </View>
        {tool === "erase" ? (
          <View {...responder.panHandlers} style={StyleSheet.absoluteFill} />
        ) : null}
        {board.notes.map((note) => (
          <BoardNote
            key={note.id}
            note={note}
            scale={scale}
            editable={tool === "text"}
            selected={linkFrom === note.id}
            onSelect={() => selectNote(note)}
            onChange={(next) =>
              commit({
                ...board,
                notes: board.notes.map((n) => (n.id === next.id ? next : n)),
              })
            }
          />
        ))}
        {tool === "pen" ? (
          <View {...responder.panHandlers} style={StyleSheet.absoluteFill} />
        ) : null}
        <View style={s.tools}>
          {(
            [
              ["pen", "edit-3", "Draw"],
              ["text", "type", "Edit notes"],
              ["erase", "delete", "Erase"],
              ["link", "git-branch", "Link notes"],
            ] as const
          ).map(([value, icon, label]) => (
            <Pressable
              key={value}
              accessibilityRole="button"
              accessibilityLabel={label}
              accessibilityState={{ selected: tool === value }}
              onPress={() => {
                setTool(value);
                setLinkFrom(null);
              }}
              style={[s.tool, tool === value && s.selected]}
            >
              <Icon name={icon} color="#242424" size={20} />
              {value === "link" ? (
                <Text style={{ fontFamily: "DMMedium", fontSize: 10, color: C.ink }}>Link</Text>
              ) : null}
            </Pressable>
          ))}
        </View>
      </View>
      {tool === "text" ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Add idea note"
          onPress={() => {
            if (board.notes.length < 40)
              commit({
                ...board,
                notes: [...board.notes, { id: key(), text: "", x: 18, y: 120 }],
              });
          }}
        >
          <Text style={s.hint}>
            + Add idea · drag a note’s handle to move it
          </Text>
        </Pressable>
      ) : (
        <Text style={s.hint}>
          {tool === "link"
            ? "Tap two notes to connect them."
            : tool === "erase"
              ? "Tap a note or drawing to erase it."
              : "Draw your ideas on the board."}
        </Text>
      )}
      {clearOpen ? (
        <View style={s.confirm}>
          <Text style={s.hint}>Clear all notes and drawings?</Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              commit({ ...board, notes: [], strokes: [], connectors: [] });
              setClearOpen(false);
            }}
          >
            <Text style={s.label}>Clear board</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={() => setClearOpen(false)}
          >
            <Text style={s.label}>Cancel</Text>
          </Pressable>
        </View>
      ) : null}
      <View style={s.footer}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Undo board change"
          disabled={!history.length}
          onPress={() => {
            const previous = history[history.length - 1];
            if (previous) {
              setFuture((v) => [...v, board]);
              setHistory((v) => v.slice(0, -1));
              onChange(previous);
            }
          }}
          style={[s.round, !history.length && s.disabled]}
        >
          <Icon name="corner-up-left" color="#242424" size={18} />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Redo board change"
          disabled={!future.length}
          onPress={() => {
            const next = future[future.length - 1];
            if (next) {
              setHistory((v) => [...v, board]);
              setFuture((v) => v.slice(0, -1));
              onChange(next);
            }
          }}
          style={[s.round, !future.length && s.disabled]}
        >
          <Icon name="corner-up-right" color="#242424" size={18} />
        </Pressable>
        <View style={{ flex: 1 }} />
        <Pressable
          accessibilityRole="button"
          onPress={() => setClearOpen(true)}
          style={s.pill}
        >
          <Text style={s.label}>Clear</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Done brainstorming"
          onPress={onDone}
          style={[s.pill, { backgroundColor: C.forest }]}
        >
          <Text style={[s.label, { color: "#fff" }]}>Done</Text>
        </Pressable>
      </View>
    </View>
  );
}

function BoardNote({
  note,
  scale,
  editable,
  selected,
  onChange,
  onSelect,
}: {
  note: BrainstormNote;
  scale: number;
  editable: boolean;
  selected: boolean;
  onChange: (note: BrainstormNote) => void;
  onSelect: () => void;
}) {
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const drag = PanResponder.create({
    onStartShouldSetPanResponder: () => editable,
    onPanResponderMove: (_, g) =>
      setOffset({ x: g.dx / scale, y: g.dy / scale }),
    onPanResponderRelease: (_, g) => {
      onChange({
        ...note,
        x: Math.max(0, Math.min(220, note.x + g.dx / scale)),
        y: Math.max(0, Math.min(240, note.y + g.dy / scale)),
      });
      setOffset({ x: 0, y: 0 });
    },
    onPanResponderTerminate: () => setOffset({ x: 0, y: 0 }),
  });
  const label =
    (
      { benefits: "Benefits", concerns: "Concerns", view: "My View" } as Record<
        string,
        string
      >
    )[note.id] || "Idea";
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Idea note: ${label}`}
      onPress={onSelect}
      style={[
        s.note,
        {
          left: (note.x + offset.x) * scale,
          top: (note.y + offset.y) * scale,
          width: 102 * scale,
        },
        selected && { borderColor: "#242424" },
      ]}
    >
      <View {...drag.panHandlers} style={s.noteHeading}>
        <Text style={s.noteTitle}>{label}</Text>
        <Icon name="more-horizontal" size={12} color="#aaa" />
      </View>
      {editable ? (
        <TextInput
          accessibilityLabel={`${label} note`}
          multiline
          maxLength={240}
          value={note.text}
          onChangeText={(text) => onChange({ ...note, text })}
          placeholder={"• __________\n• __________\n• __________"}
          placeholderTextColor="#c1c1c1"
          style={s.noteInput}
        />
      ) : (
        <Text style={s.noteInput}>
          {note.text || "• __________\n• __________\n• __________"}
        </Text>
      )}
    </Pressable>
  );
}

const s = StyleSheet.create({
  topic: {
    position: "absolute",
    borderWidth: 1.5,
    borderColor: "#242424",
    borderRadius: 60,
    backgroundColor: "#fff",
    padding: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  topicText: {
    fontFamily: "DMMedium",
    fontSize: 12,
    textAlign: "center",
    color: "#181818",
  },
  note: {
    position: "absolute",
    backgroundColor: "#fff",
    borderRadius: 17,
    borderWidth: 1,
    borderColor: "#eee",
    padding: 7,
    minHeight: 87,
    boxShadow: "0 2px 3px #00000006",
  },
  noteHeading: {
    backgroundColor: "#f5f5f5",
    borderRadius: 20,
    paddingVertical: 3,
    paddingHorizontal: 5,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  noteTitle: { fontFamily: "DMMedium", fontSize: 12, color: "#181818" },
  noteInput: {
    fontFamily: "DM",
    fontSize: 12,
    lineHeight: 17,
    minHeight: 54,
    padding: 2,
    color: "#333",
  },
  tools: { position: "absolute", right: 0, top: 112, gap: 8 },
  tool: {
    width: 36,
    height: 40,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#eee",
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },
  selected: { backgroundColor: C.sage, borderColor: C.border },
  footer: { flexDirection: "row", alignItems: "center", gap: 6 },
  round: {
    width: 38,
    height: 38,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#eee",
    alignItems: "center",
    justifyContent: "center",
  },
  disabled: { opacity: 0.35 },
  pill: {
    minWidth: 66,
    minHeight: 38,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#eee",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 15,
  },
  label: { fontFamily: "DMMedium", fontSize: 13, color: "#242424" },
  hint: {
    fontFamily: "DM",
    fontSize: 11,
    lineHeight: 16,
    color: "#888",
    textAlign: "center",
  },
  confirm: {
    padding: 12,
    borderRadius: 12,
    backgroundColor: "#f7f7f7",
    gap: 12,
    alignItems: "center",
  },
});
