import { useTheme, createThemedStyles } from "../theme/ThemeProvider";
import React, { useState } from "react";
import {
  Keyboard,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import {
  MAX_PLAN_NODES,
  type PlanningBoard,
  type PlanPort,
} from "../../shared/planning-board.mjs";
import {
  CanvasAction,
  DrawingCanvas,
  MindMapCanvas,
  planId,
} from "./PlanningCanvas";
import { Button, Icon } from "./ui";

const modes = [
  { id: "notepad", label: "Notepad", icon: "file-text" },
  { id: "mindmap", label: "Mind map", icon: "git-branch" },
  { id: "draw", label: "Draw", icon: "edit-2" },
] as const;

export function IdeasBoard({
  board,
  onChange,
  onDone,
  onInteractionChange,
  doneLabel = "Ready to speak",
  doneDisabled = false,
  hint = "Notes are optional. You can start speaking anytime.",
}: {
  board: PlanningBoard;
  onChange: (board: PlanningBoard) => void;
  onDone: () => void;
  onInteractionChange?: (active: boolean) => void;
  doneLabel?: string;
  doneDisabled?: boolean;
  hint?: string;
}) {
  const { C, T } = useTheme();
  const s = useStyles();

  const [selectedId, setSelectedId] = useState<string>();
  const [connecting, setConnecting] = useState(false);
  const [selectedPort, setSelectedPort] = useState<PlanPort>();
  const [history, setHistory] = useState<
    Pick<PlanningBoard, "nodes" | "links">[]
  >([]);
  const selected = board.nodes.find((node) => node.id === selectedId);
  function changeMap(next: Pick<PlanningBoard, "nodes" | "links">) {
    setHistory((previous) => [
      ...previous.slice(-19),
      { nodes: board.nodes, links: board.links },
    ]);
    onChange({ ...board, ...next });
  }
  function add(shape: "box" | "circle") {
    if (board.nodes.length >= MAX_PLAN_NODES) return;
    const id = planId();
    // Keep new shapes apart, while allowing learners to arrange them freely.
    const positions = [
      [0.25, 0.2],
      [0.75, 0.2],
      [0.5, 0.5],
      [0.25, 0.8],
      [0.75, 0.8],
    ];
    const [x, y] = positions.find(([x, y]) =>
      board.nodes.every((node) => Math.hypot(node.x - x, node.y - y) > 0.15),
    ) || [0.5, 0.5];
    changeMap({
      nodes: [...board.nodes, { id, shape, text: "", x, y }],
      links: board.links,
    });
    setSelectedId(id);
    setConnecting(false);
  }
  function connect(
    from: string,
    to: string,
    fromPort: PlanPort,
    toPort: PlanPort,
  ) {
    if (from === to) return;
    const existing = board.links.find(
      (link) =>
        (link.from === from && link.to === to) ||
        (link.to === from && link.from === to),
    );
    if (existing || board.links.length < 36) {
      const link = { id: existing?.id || planId(), from, to, fromPort, toPort };
      changeMap({
        nodes: board.nodes,
        links: existing
          ? board.links.map((item) => (item.id === existing.id ? link : item))
          : [...board.links, link],
      });
    }
    setConnecting(false);
    setSelectedId(from);
  }
  function select(id: string) {
    if (connecting && selectedId && id !== selectedId) {
      const existing = board.links.find(
        (link) =>
          (link.from === selectedId && link.to === id) ||
          (link.to === selectedId && link.from === id),
      );
      if (existing || board.links.length < 36)
        changeMap({
          nodes: board.nodes,
          links: existing
            ? board.links.filter((link) => link.id !== existing.id)
            : [
                ...board.links,
                {
                  id: planId(),
                  from: selectedId,
                  to: id,
                  fromPort: selectedPort,
                },
              ],
        });
      setConnecting(false);
    } else {
      setSelectedId(id);
      setConnecting(false);
    }
  }
  return (
    <View style={s.container}>
      <View
        style={s.tabs}
        accessibilityRole="tablist"
        accessibilityLabel="Planning style"
      >
        {modes.map((mode) => (
          <Pressable
            key={mode.id}
            accessibilityRole="tab"
            accessibilityLabel={mode.label}
            accessibilityState={{ selected: board.mode === mode.id }}
            aria-selected={board.mode === mode.id}
            onPress={() => {
              Keyboard.dismiss();
              setConnecting(false);
              onChange({ ...board, mode: mode.id });
            }}
            style={[s.tab, board.mode === mode.id && s.selectedTab]}
          >
            <Icon
              name={mode.icon}
              size={18}
              color={board.mode === mode.id ? C.paper : C.muted}
            />
            <Text
              style={[
                T.small,
                {
                  color: board.mode === mode.id ? C.paper : C.ink,
                  fontFamily: "DMBold",
                },
              ]}
            >
              {mode.label}
            </Text>
          </Pressable>
        ))}
      </View>
      {board.mode === "notepad" ? (
        <View style={s.board}>
          <View style={s.heading}>
            <Icon name="edit-3" size={18} />
            <Text style={T.h3}>Your ideas</Text>
          </View>
          <Text style={T.small}>A few words or short points are enough.</Text>
          <TextInput
            accessibilityLabel="Your ideas"
            value={board.notepad}
            onChangeText={(notepad) => onChange({ ...board, notepad })}
            multiline
            maxLength={2000}
            textAlignVertical="top"
            placeholder={"What do you think?\nWhy?\nAny examples?"}
            placeholderTextColor={C.muted}
            style={[T.body, s.input]}
          />
        </View>
      ) : board.mode === "mindmap" ? (
        <View style={{ gap: 10 }}>
          <View style={s.tools}>
            <CanvasAction
              label="Box"
              icon="square"
              disabled={board.nodes.length >= MAX_PLAN_NODES}
              onPress={() => add("box")}
            />
            <CanvasAction
              label="Circle"
              icon="circle"
              disabled={board.nodes.length >= MAX_PLAN_NODES}
              onPress={() => add("circle")}
            />
            <CanvasAction
              label="Connect"
              icon="link"
              selected={connecting}
              disabled={!selected || board.nodes.length < 2}
              onPress={() => {
                Keyboard.dismiss();
                setConnecting(!connecting);
              }}
            />
          </View>
          <Text style={T.small}>
            {connecting
              ? "Tap another idea to connect or unlink."
              : "Tap to edit. Drag shapes to move, or dots to connect."}
          </Text>
          <MindMapCanvas
            board={board}
            onConnect={connect}
            onTextChange={(id, text) =>
              changeMap({
                nodes: board.nodes.map((node) =>
                  node.id === id ? { ...node, text } : node,
                ),
                links: board.links,
              })
            }
            onConnectFrom={(id, port) => {
              setSelectedId(id);
              setSelectedPort(port);
              setConnecting(true);
            }}
            selectedId={selectedId}
            connecting={connecting}
            onSelect={select}
            onMove={(id, x, y) =>
              changeMap({
                nodes: board.nodes.map((node) =>
                  node.id === id ? { ...node, x, y } : node,
                ),
                links: board.links,
              })
            }
            onInteractionChange={onInteractionChange}
          />
          {selected && !connecting && (
            <View style={s.editor}>
              <Text style={T.small}>Selected idea</Text>
              <TextInput
                accessibilityLabel="Selected idea"
                value={selected.text}
                onChangeText={(text) =>
                  changeMap({
                    nodes: board.nodes.map((node) =>
                      node.id === selectedId ? { ...node, text } : node,
                    ),
                    links: board.links,
                  })
                }
                placeholder={"Idea title\nA short detail (optional)"}
                placeholderTextColor={C.muted}
                multiline
                maxLength={120}
                style={[T.body, s.nodeInput]}
              />
              <CanvasAction
                label="Remove idea"
                icon="trash-2"
                onPress={() => {
                  changeMap({
                    nodes: board.nodes.filter((node) => node.id !== selectedId),
                    links: board.links.filter(
                      (link) =>
                        link.from !== selectedId && link.to !== selectedId,
                    ),
                  });
                  setSelectedId(undefined);
                }}
              />
            </View>
          )}
          {!!history.length && (
            <CanvasAction
              label="Undo map change"
              icon="corner-up-left"
              onPress={() => {
                const previous = history[history.length - 1];
                setHistory(history.slice(0, -1));
                onChange({ ...board, ...previous });
                setConnecting(false);
              }}
            />
          )}
          {board.nodes.length >= MAX_PLAN_NODES && (
            <Text style={T.small}>
              Your map has 12 ideas. Edit or remove one to make room.
            </Text>
          )}
        </View>
      ) : (
        <DrawingCanvas
          strokes={board.strokes}
          onChange={(strokes) => onChange({ ...board, strokes })}
          onInteractionChange={onInteractionChange}
        />
      )}
      <Button
        label={doneLabel}
        disabled={doneDisabled}
        icon="mic"
        onPress={() => {
          Keyboard.dismiss();
          onDone();
        }}
      />
      <Text style={[T.small, s.hint]}>{hint}</Text>
    </View>
  );
}

export function IdeasPreview({
  value,
  board,
}: {
  value?: string;
  board?: PlanningBoard;
}) {
  const { T } = useTheme();
  const s = useStyles();

  const note = board?.notepad ?? value ?? "";
  if (!note.trim() && !board?.nodes.length && !board?.strokes.length)
    return null;
  return (
    <View style={s.preview} testID="speaking-notes">
      <Text style={T.h3}>Your ideas</Text>
      <ScrollView
        style={{
          maxHeight: board?.nodes.length || board?.strokes.length ? 280 : 144,
        }}
        nestedScrollEnabled
      >
        <View style={{ gap: 12 }}>
          {!!note.trim() && <Text style={T.body}>{note}</Text>}
          {!!board?.nodes.length && <MindMapCanvas board={board} />}
          {!!board?.strokes.length && <DrawingCanvas strokes={board.strokes} />}
        </View>
      </ScrollView>
    </View>
  );
}

const useStyles = createThemedStyles(({ C }) =>
  StyleSheet.create({
    container: { gap: 14, width: "100%" },
    tabs: {
      flexDirection: "row",
      padding: 4,
      gap: 4,
      backgroundColor: C.sage,
      borderRadius: 12,
    },
    tab: {
      flex: 1,
      minHeight: 56,
      gap: 4,
      padding: 6,
      justifyContent: "center",
      alignItems: "center",
      borderRadius: 9,
    },
    selectedTab: { backgroundColor: C.forest },
    tools: { flexDirection: "row", gap: 8 },
    board: {
      backgroundColor: C.paper,
      borderWidth: 1,
      borderColor: C.border,
      borderRadius: 16,
      padding: 18,
      gap: 8,
    },
    heading: { flexDirection: "row", gap: 8, alignItems: "center" },
    input: {
      minHeight: 180,
      maxHeight: 320,
      fontSize: 16,
      lineHeight: 28,
      padding: 10,
      marginTop: 6,
      borderRadius: 8,
    },
    editor: {
      padding: 12,
      gap: 8,
      backgroundColor: C.paper,
      borderWidth: 1,
      borderColor: C.border,
      borderRadius: 12,
    },
    nodeInput: {
      minHeight: 44,
      padding: 8,
      borderWidth: 1,
      borderColor: C.border,
      borderRadius: 8,
    },
    hint: { textAlign: "center" },
    preview: {
      width: "100%",
      padding: 16,
      gap: 8,
      borderRadius: 12,
      backgroundColor: C.peach,
    },
  }),
);
