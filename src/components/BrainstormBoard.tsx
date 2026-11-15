import React, { useMemo, useRef, useState } from "react";
import {
  Alert,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import Svg, { Line, Polyline } from "react-native-svg";
import type { BrainstormBoard, BrainstormNote, BrainstormPoint } from "../types";
import { Icon } from "./ui";

type Tool = "pen" | "text" | "move" | "connect" | "erase";
const ink = "#242424";
let sequence = 0;
const itemId = (prefix: string) => `${prefix}-${++sequence}`;

function clone(board: BrainstormBoard): BrainstormBoard {
  return JSON.parse(JSON.stringify(board)) as BrainstormBoard;
}

export function emptyBrainstorm(startedAt = new Date().toISOString()): BrainstormBoard {
  return {
    version: "daily-whiteboard-v1",
    startedAt,
    expiresAt: new Date(new Date(startedAt).getTime() + 45_000).toISOString(),
    strokes: [], notes: [], connectors: [],
    snapshot: { version: 1, savedAt: startedAt, elementCount: 0 },
  };
}

export function BrainstormBoardView({ board, onChange }: { board: BrainstormBoard; onChange: (board: BrainstormBoard) => void }) {
  const [tool, setTool] = useState<Tool>("pen");
  const [selected, setSelected] = useState<string | null>(null);
  const [connectFrom, setConnectFrom] = useState<string | null>(null);
  const history = useRef<BrainstormBoard[]>([]);
  const future = useRef<BrainstormBoard[]>([]);
  const stroke = useRef<BrainstormPoint[]>([]);
  const movedNote = useRef<{ id: string; x: number; y: number } | null>(null);

  const commit = (next: BrainstormBoard, undoable = true) => {
    const decorated = { ...next, snapshot: { version: 1 as const, savedAt: new Date().toISOString(), elementCount: next.strokes.length + next.notes.length + next.connectors.length } };
    if (undoable) { history.current.push(clone(board)); future.current = []; }
    onChange(decorated);
  };
  const addNote = () => {
    const id = itemId("note");
    commit({ ...board, notes: [...board.notes, { id, text: "My idea", x: 34 + (board.notes.length % 3) * 82, y: 64 + (board.notes.length % 2) * 78 }] });
    setSelected(id); setTool("move");
  };
  const editNote = (id: string, text: string) => commit({ ...board, notes: board.notes.map((note) => note.id === id ? { ...note, text: text.slice(0, 240) } : note) }, false);
  const activateNote = (id: string) => {
    if (tool === "erase") return commit({ ...board, notes: board.notes.filter((note) => note.id !== id), connectors: board.connectors.filter((edge) => edge.from !== id && edge.to !== id) });
    if (tool === "connect") {
      if (connectFrom && connectFrom !== id) {
        commit({ ...board, connectors: [...board.connectors, { id: itemId("edge"), from: connectFrom, to: id }] }); setConnectFrom(null);
      } else setConnectFrom(id);
      return;
    }
    setSelected(id);
  };
  // eslint-disable-next-line react-hooks/refs
  const responder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => tool === "pen" || tool === "move" || tool === "erase",
    onMoveShouldSetPanResponder: () => tool === "pen" || tool === "move" || tool === "erase",
    onPanResponderGrant: (event) => {
      const { locationX: x, locationY: y } = event.nativeEvent;
      if (tool === "pen") stroke.current = [{ x, y }];
      if (tool === "move" && selected) {
        const note = board.notes.find((item) => item.id === selected);
        if (note) movedNote.current = { id: note.id, x: x - note.x, y: y - note.y };
      }
    },
    onPanResponderMove: (event) => {
      const { locationX: x, locationY: y } = event.nativeEvent;
      if (tool === "pen") { stroke.current = [...stroke.current, { x, y }]; onChange({ ...board, strokes: [...board.strokes, { id: "drawing", points: stroke.current }], snapshot: board.snapshot }); }
      if (tool === "move" && movedNote.current) {
        const moving = movedNote.current;
        onChange({ ...board, notes: board.notes.map((note) => note.id === moving.id ? { ...note, x: Math.max(4, x - moving.x), y: Math.max(4, y - moving.y) } : note) });
      }
    },
    onPanResponderRelease: () => {
      if (tool === "pen" && stroke.current.length > 1) commit({ ...board, strokes: [...board.strokes.filter((item) => item.id !== "drawing"), { id: itemId("stroke"), points: stroke.current }] });
      stroke.current = []; movedNote.current = null;
    },
  }), [board, selected, tool]);
  const positions = Object.fromEntries(board.notes.map((note) => [note.id, note]));
  return <View style={styles.wrap}>
    <View style={styles.toolbar}>
      {([ ["pen", "edit-3", "Draw"], ["text", "type", "Note"], ["move", "move", "Move"], ["connect", "git-branch", "Link"], ["erase", "trash-2", "Erase"] ] as const).map(([value, icon, label]) => <Pressable key={value} accessibilityRole="button" accessibilityLabel={label} onPress={() => value === "text" ? addNote() : setTool(value)} style={[styles.tool, tool === value && styles.toolActive]}><Icon name={icon} size={17} color={tool === value ? "#fff" : ink} /></Pressable>)}
      <View style={{ flex: 1 }} />
      <Pressable accessibilityRole="button" accessibilityLabel="Undo board change" onPress={() => { const previous = history.current.pop(); if (previous) { future.current.push(clone(board)); onChange(previous); } }} style={styles.tool}><Icon name="undo-2" size={17} color={ink} /></Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="Redo board change" onPress={() => { const next = future.current.pop(); if (next) { history.current.push(clone(board)); onChange(next); } }} style={styles.tool}><Icon name="redo-2" size={17} color={ink} /></Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="Clear brainstorm board" onPress={() => Alert.alert("Clear your board?", "This removes your notes and drawings.", [{ text: "Keep board", style: "cancel" }, { text: "Clear", style: "destructive", onPress: () => commit({ ...board, strokes: [], notes: [], connectors: [] }) }])} style={styles.tool}><Icon name="x" size={18} color={ink} /></Pressable>
    </View>
    <View {...responder.panHandlers} style={styles.canvas} accessibilityLabel="Brainstorm whiteboard">
      <Svg pointerEvents="none" style={StyleSheet.absoluteFill}>
        {board.connectors.map((edge) => positions[edge.from] && positions[edge.to] ? <Line key={edge.id} x1={positions[edge.from].x + 55} y1={positions[edge.from].y + 36} x2={positions[edge.to].x + 55} y2={positions[edge.to].y + 36} stroke="#9a9a9a" strokeWidth="2" /> : null)}
        {board.strokes.map((item) => <Polyline key={item.id} points={item.points.map((point) => `${point.x},${point.y}`).join(" ")} fill="none" stroke={ink} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />)}
      </Svg>
      {board.notes.map((note: BrainstormNote) => <Pressable key={note.id} accessibilityRole="button" accessibilityLabel={`Idea note: ${note.text}`} onPress={() => activateNote(note.id)} style={[styles.note, { left: note.x, top: note.y }, selected === note.id && styles.noteSelected, connectFrom === note.id && styles.noteLinked]}>{selected === note.id && tool !== "erase" ? <TextInput value={note.text} onChangeText={(value) => editNote(note.id, value)} multiline style={styles.noteInput} /> : <Text style={styles.noteText}>{note.text}</Text>}</Pressable>)}
      {!board.notes.length && !board.strokes.length ? <View pointerEvents="none" style={styles.empty}><Text style={styles.emptyTitle}>Start with one idea</Text><Text style={styles.emptyCopy}>Draw, add a note, then link ideas that belong together.</Text></View> : null}
    </View>
    <Text style={styles.disclosure}>Drawings stay as drawings—handwriting is not turned into invented text.</Text>
  </View>;
}

const styles = StyleSheet.create({
  wrap: { gap: 10 }, toolbar: { flexDirection: "row", gap: 7, alignItems: "center", flexWrap: "wrap" },
  tool: { width: 42, height: 42, borderRadius: 10, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "#e7e7e7", backgroundColor: "#fff" }, toolActive: { backgroundColor: ink, borderColor: ink },
  canvas: { height: 330, overflow: "hidden", borderWidth: 1, borderColor: "#e7e7e7", borderRadius: 20, backgroundColor: "#f8f8f8", position: "relative" },
  note: { position: "absolute", width: 112, minHeight: 72, padding: 10, borderRadius: 14, backgroundColor: "#fff", borderWidth: 1, borderColor: "#e7e7e7", justifyContent: "center" }, noteSelected: { borderColor: ink, borderWidth: 2 }, noteLinked: { backgroundColor: "#ede6dd" }, noteText: { color: "#181818", fontSize: 13, lineHeight: 18 }, noteInput: { color: "#181818", fontSize: 13, lineHeight: 18, minHeight: 46, padding: 0 },
  empty: { position: "absolute", left: 24, right: 24, top: 112, alignItems: "center", gap: 6 }, emptyTitle: { color: ink, fontSize: 17, fontWeight: "700" }, emptyCopy: { color: "#737373", textAlign: "center", fontSize: 13 }, disclosure: { color: "#737373", fontSize: 12, lineHeight: 17 },
});
