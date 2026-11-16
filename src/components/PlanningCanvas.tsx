import React, {
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Keyboard,
  PanResponder,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type ViewStyle,
  type PanResponderCallbacks,
} from "react-native";
import Svg, {
  Circle,
  Defs,
  Path,
  Pattern,
  Polyline,
  Rect,
} from "react-native-svg";
import type {
  PlanNode,
  PlanPort,
  PlanStroke,
  PlanningBoard,
} from "../../shared/planning-board.mjs";
import {
  MAX_PLAN_POINTS,
  MAX_PLAN_STROKES,
} from "../../shared/planning-board.mjs";
import { C, Icon, T } from "./ui";

const WIDTH = 320,
  HEIGHT = 300;
const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));
const decorative =
  Platform.OS === "web"
    ? { "aria-hidden": true as const }
    : { accessible: false };
const touchStyle: ViewStyle & { touchAction?: "none"; userSelect?: "none" } =
  Platform.OS === "web"
    ? { touchAction: "none" as const, userSelect: "none" as const }
    : {};
export const planId = () =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

export function CanvasAction({
  label,
  icon,
  onPress,
  disabled = false,
  selected = false,
}: {
  label: string;
  icon: string;
  onPress: () => void;
  disabled?: boolean;
  selected?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled, selected }}
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        s.action,
        selected && s.active,
        { opacity: disabled ? 0.35 : pressed ? 0.6 : 1 },
      ]}
    >
      <Icon name={icon} size={17} color={selected ? C.paper : C.ink} />
      <Text style={[T.small, { color: selected ? C.paper : C.ink }]}>
        {label}
      </Text>
    </Pressable>
  );
}

// Keep a single responder across renders; timers and gesture updates must not reset a drag.
function useCanvasGesture(callbacks: PanResponderCallbacks) {
  const latest = useRef(callbacks);
  useLayoutEffect(() => {
    latest.current = callbacks;
  });
  const responder = useMemo(
    () =>
      // These callbacks read refs only when React Native dispatches an input event.
      // eslint-disable-next-line react-hooks/refs
      PanResponder.create({
        onStartShouldSetPanResponderCapture: (...args) =>
          latest.current.onStartShouldSetPanResponderCapture?.(...args) ??
          false,
        onMoveShouldSetPanResponderCapture: (...args) =>
          latest.current.onMoveShouldSetPanResponderCapture?.(...args) ?? false,
        onStartShouldSetPanResponder: (...args) =>
          latest.current.onStartShouldSetPanResponder?.(...args) ?? false,
        onMoveShouldSetPanResponder: (...args) =>
          latest.current.onMoveShouldSetPanResponder?.(...args) ?? false,
        onPanResponderGrant: (...args) =>
          latest.current.onPanResponderGrant?.(...args),
        onPanResponderMove: (...args) =>
          latest.current.onPanResponderMove?.(...args),
        onPanResponderRelease: (...args) =>
          latest.current.onPanResponderRelease?.(...args),
        onPanResponderTerminate: (...args) =>
          latest.current.onPanResponderTerminate?.(...args),
        onPanResponderTerminationRequest: () => false,
      }),
    [],
  );
  return responder.panHandlers;
}

const ports: PlanPort[] = [
  "top-left",
  "top-right",
  "bottom-right",
  "bottom-left",
];
const nodeSize = (node: PlanNode) => ({
  width: node.shape === "circle" ? 92 : 128,
  height: node.shape === "circle" ? 92 : 80,
});
function portPoint(node: PlanNode, port?: PlanPort) {
  const size = nodeSize(node);
  const inset = node.shape === "circle" ? Math.SQRT1_2 : 1;
  return {
    x:
      node.x * WIDTH +
      (port
        ? (((port.endsWith("right") ? 1 : -1) * size.width) / 2) * inset
        : 0),
    y:
      node.y * HEIGHT +
      (port
        ? (((port.startsWith("bottom") ? 1 : -1) * size.height) / 2) * inset
        : 0),
  };
}

function MovableIdea({
  node,
  scale,
  selected,
  targeted,
  connecting,
  onSelect,
  onMove,
  onTextChange,
  onInteractionChange,
}: {
  node: PlanNode;
  scale: number;
  selected: boolean;
  targeted: boolean;
  connecting: boolean;
  onSelect: () => void;
  onMove: (x: number, y: number) => void;
  onTextChange?: (text: string) => void;
  onInteractionChange?: (active: boolean) => void;
}) {
  const [editing, setEditing] = useState(false);
  const didDrag = useRef(false);
  const origin = useRef({ x: node.x, y: node.y });
  const pointerOrigin = useRef<{ x: number; y: number } | null>(null);
  const size = nodeSize(node);
  const handlers = useCanvasGesture({
    onMoveShouldSetPanResponderCapture: (_, gesture) =>
      !connecting && !editing && Math.hypot(gesture.dx, gesture.dy) > 5,
    onMoveShouldSetPanResponder: (_, gesture) =>
      !connecting && !editing && Math.hypot(gesture.dx, gesture.dy) > 5,
    onPanResponderGrant: () => {
      didDrag.current = true;
      origin.current = { x: node.x, y: node.y };
      Keyboard.dismiss();
      onInteractionChange?.(true);
    },
    onPanResponderMove: (event, gesture) => {
      const dx = pointerOrigin.current
        ? event.nativeEvent.pageX - pointerOrigin.current.x
        : gesture.dx;
      const dy = pointerOrigin.current
        ? event.nativeEvent.pageY - pointerOrigin.current.y
        : gesture.dy;
      onMove(
        clamp(
          origin.current.x + dx / (WIDTH * scale),
          (size.width / 2 + 8) / WIDTH,
          1 - (size.width / 2 + 8) / WIDTH,
        ),
        clamp(
          origin.current.y + dy / (HEIGHT * scale),
          (size.height / 2 + 8) / HEIGHT,
          1 - (size.height / 2 + 8) / HEIGHT,
        ),
      );
    },
    onPanResponderRelease: () => {
      pointerOrigin.current = null;
      onInteractionChange?.(false);
    },
    onPanResponderTerminate: () => {
      pointerOrigin.current = null;
      onInteractionChange?.(false);
    },
  });
  return (
    <View
      {...handlers}
      style={[
        s.nodePosition,
        touchStyle,
        {
          left: node.x * WIDTH * scale - (size.width * scale) / 2,
          top: node.y * HEIGHT * scale - (size.height * scale) / 2,
          width: size.width * scale,
          height: size.height * scale,
        },
      ]}
    >
      {editing && onTextChange ? (
        <TextInput
          accessibilityLabel="Edit idea"
          autoFocus
          multiline
          maxLength={120}
          value={node.text}
          onChangeText={onTextChange}
          onBlur={() => setEditing(false)}
          placeholder={"Idea title\nA short detail…"}
          placeholderTextColor="#88919B"
          style={[
            s.node,
            {
              borderRadius: node.shape === "circle" ? 100 : 7,
              padding: 10,
              fontFamily: "DM",
              fontSize: Math.max(11, 11 * scale),
              lineHeight: Math.max(14, 14 * scale),
              textAlignVertical: "center",
              textAlign: node.shape === "circle" ? "center" : "left",
              color: "#3F4854",
            },
          ]}
        />
      ) : (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Idea: ${node.text || "Untitled"}`}
          accessibilityState={{ selected }}
          accessibilityHint={
            connecting
              ? "Connect to this idea"
              : "Tap a selected idea to type inside it. Drag to move. Arrow keys also move this idea."
          }
          onPressIn={(event) => {
            didDrag.current = false;
            pointerOrigin.current = {
              x: event.nativeEvent.pageX,
              y: event.nativeEvent.pageY,
            };
          }}
          onPress={() => {
            // Browsers may emit a click after a drag has finished.
            if (didDrag.current) { didDrag.current = false; return; }
            if (selected && !connecting && onTextChange) setEditing(true);
            else onSelect();
          }}
          onLongPress={() => {
            if (!connecting && onTextChange) {
              onSelect();
              setEditing(true);
            }
          }}
          {...(Platform.OS === "web"
            ? {
                onKeyDown: (event: {
                  key: string;
                  preventDefault: () => void;
                }) => {
                  const delta = {
                    ArrowLeft: [-0.04, 0],
                    ArrowRight: [0.04, 0],
                    ArrowUp: [0, -0.04],
                    ArrowDown: [0, 0.04],
                  }[event.key];
                  if (!delta) return;
                  event.preventDefault();
                  onMove(
                    clamp(
                      node.x + delta[0],
                      (size.width / 2 + 8) / WIDTH,
                      1 - (size.width / 2 + 8) / WIDTH,
                    ),
                    clamp(
                      node.y + delta[1],
                      (size.height / 2 + 8) / HEIGHT,
                      1 - (size.height / 2 + 8) / HEIGHT,
                    ),
                  );
                },
              }
            : {})}
          style={[
            s.node,
            touchStyle,
            {
              borderRadius: node.shape === "circle" ? 100 : 7,
              borderWidth: targeted ? 2 : 1,
              borderColor: selected || targeted ? "#68737D" : "#E2E5E8",
              backgroundColor: "#FFFFFF",
            },
          ]}
        >
          <NodeContent node={node} scale={scale} />
        </Pressable>
      )}
    </View>
  );
}

function NodeContent({ node, scale }: { node: PlanNode; scale: number }) {
  const [title, ...detail] = node.text.split("\n");
  const circle = node.shape === "circle";
  return (
    <View
      style={{
        width: "100%",
        gap: 5 * scale,
        padding: 3 * scale,
        alignItems: circle ? "center" : "stretch",
      }}
    >
      <View
        style={{ flexDirection: "row", gap: 5 * scale, alignItems: "center" }}
      >
        {!circle && (
          <Icon
            name="file-text"
            size={Math.max(11, 12 * scale)}
            color="#78828D"
          />
        )}
        <Text
          numberOfLines={circle ? 3 : 2}
          style={{
            flexShrink: 1,
            fontFamily: "DMBold",
            fontSize: Math.max(11, 11 * scale),
            lineHeight: Math.max(14, 14 * scale),
            color: "#3F4854",
            textAlign: circle ? "center" : "left",
          }}
        >
          {title || "Your idea"}
        </Text>
      </View>
      {!circle && (
        <Text
          numberOfLines={2}
          style={{
            fontFamily: "DM",
            fontSize: Math.max(10, 9 * scale),
            lineHeight: Math.max(12, 12 * scale),
            color: "#7A828C",
          }}
        >
          {detail.join("\n") || "Add a supporting detail…"}
        </Text>
      )}
    </View>
  );
}
function curve(
  start: { x: number; y: number },
  end: { x: number; y: number },
  fromPort?: PlanPort,
  toPort?: PlanPort,
) {
  const bend = Math.max(20, Math.min(65, Math.abs(end.x - start.x) * 0.5));
  const a = start.x + (fromPort?.endsWith("left") ? -bend : bend);
  const b = end.x + (toPort?.endsWith("right") ? bend : -bend);
  return `M ${start.x} ${start.y} C ${a} ${start.y}, ${b} ${end.y}, ${end.x} ${end.y}`;
}

type Connection = { from: string; port: PlanPort; x: number; y: number };
function ConnectionDot({
  node,
  port,
  scale,
  onStart,
  onDrag,
  onDrop,
  onPick,
  onCancel,
}: {
  node: PlanNode;
  port: PlanPort;
  scale: number;
  onStart: (value: Connection) => void;
  onDrag: (value: Connection) => void;
  onDrop: (value: Connection) => void;
  onPick: () => void;
  onCancel: () => void;
}) {
  const point = portPoint(node, port);
  const current = (dx: number, dy: number): Connection => ({
    from: node.id,
    port,
    x: point.x + dx / scale,
    y: point.y + dy / scale,
  });
  const handlers = useCanvasGesture({
    onStartShouldSetPanResponderCapture: () => true,
    onStartShouldSetPanResponder: () => true,
    onPanResponderGrant: () => {
      Keyboard.dismiss();
      onStart(current(0, 0));
    },
    onPanResponderMove: (_, gesture) => onDrag(current(gesture.dx, gesture.dy)),
    onPanResponderRelease: (_, gesture) => {
      if (Math.hypot(gesture.dx, gesture.dy) < 5) {
        onCancel();
        onPick();
      } else onDrop(current(gesture.dx, gesture.dy));
    },
    onPanResponderTerminate: onCancel,
  });
  return (
    <View
      {...handlers}
      style={[
        s.nodePosition,
        touchStyle,
        {
          left: point.x * scale - 16,
          top: point.y * scale - 16,
          width: 32,
          height: 32,
        },
      ]}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Connect ${node.text || "untitled idea"}, ${port}`}
        accessibilityHint="Drag to another shape, or select then choose an idea."
        onPress={onPick}
        hitSlop={6}
        style={[
          touchStyle,
          { flex: 1, alignItems: "center", justifyContent: "center" },
        ]}
      >
        <View
          style={{
            width: 11,
            height: 11,
            borderRadius: 6,
            borderWidth: 1.5,
            borderColor: C.ink,
            backgroundColor: C.paper,
          }}
        />
      </Pressable>
    </View>
  );
}

export function MindMapCanvas({
  board,
  selectedId,
  connecting = false,
  onSelect,
  onMove,
  onConnect,
  onConnectFrom,
  onTextChange,
  onInteractionChange,
}: {
  board: PlanningBoard;
  selectedId?: string;
  connecting?: boolean;
  onSelect?: (id: string) => void;
  onMove?: (id: string, x: number, y: number) => void;
  onConnect?: (
    from: string,
    to: string,
    fromPort: PlanPort,
    toPort: PlanPort,
  ) => void;
  onConnectFrom?: (from: string, port: PlanPort) => void;
  onTextChange?: (id: string, text: string) => void;
  onInteractionChange?: (active: boolean) => void;
}) {
  const [width, setWidth] = useState(280);
  const [connection, setConnection] = useState<Connection | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const panOrigin = useRef({ x: 0, y: 0 });
  const viewportHeight = Math.min(520, Math.max(320, width * 0.72));
  const scale = Math.min(width / WIDTH, (viewportHeight - 56) / HEIGHT) * zoom;
  const gridId = "plan-grid-" + useId().replace(/:/g, "");
  const panHandlers = useCanvasGesture({
    onStartShouldSetPanResponder: () => Boolean(onSelect),
    onPanResponderGrant: () => {
      Keyboard.dismiss();
      panOrigin.current = pan;
      onInteractionChange?.(true);
    },
    onPanResponderMove: (_, gesture) =>
      setPan({
        x: clamp(
          panOrigin.current.x + gesture.dx,
          (-WIDTH * scale) / 2,
          (WIDTH * scale) / 2,
        ),
        y: clamp(
          panOrigin.current.y + gesture.dy,
          (-HEIGHT * scale) / 2,
          (HEIGHT * scale) / 2,
        ),
      }),
    onPanResponderRelease: () => onInteractionChange?.(false),
    onPanResponderTerminate: () => onInteractionChange?.(false),
  });
  function hitTarget(value: Connection) {
    return [...board.nodes].reverse().find((node) => {
      if (node.id === value.from) return false;
      const size = nodeSize(node);
      return (
        Math.abs(value.x - node.x * WIDTH) <= size.width / 2 + 12 &&
        Math.abs(value.y - node.y * HEIGHT) <= size.height / 2 + 12
      );
    });
  }
  function cancelConnection() {
    setConnection(null);
    onInteractionChange?.(false);
  }
  const target = connection ? hitTarget(connection) : null;
  const source = connection
    ? board.nodes.find((node) => node.id === connection.from)
    : null;
  return (
    <View
      testID="mind-map-canvas"
      style={[
        s.mapViewport,
        onSelect && touchStyle,
        { height: viewportHeight },
      ]}
      onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
    >
      <View {...panHandlers} style={StyleSheet.absoluteFill}>
        <Svg width="100%" height="100%" {...decorative} pointerEvents="none">
          <Defs>
            <Pattern
              id={gridId}
              width={22}
              height={22}
              patternUnits="userSpaceOnUse"
            >
              <Circle cx={2} cy={2} r={1} fill="#E9ECEF" />
            </Pattern>
          </Defs>
          <Rect width="100%" height="100%" fill={`url(#${gridId})`} />
        </Svg>
      </View>
      <View
        pointerEvents="box-none"
        style={{
          position: "absolute",
          width: WIDTH * scale,
          height: HEIGHT * scale,
          left: (width - WIDTH * scale) / 2 + pan.x,
          top: 56 + (viewportHeight - 56 - HEIGHT * scale) / 2 + pan.y,
        }}
      >
        <Svg
          width="100%"
          height="100%"
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          {...decorative}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        >
          {board.links.map((link) => {
            const from = board.nodes.find((node) => node.id === link.from),
              to = board.nodes.find((node) => node.id === link.to);
            if (!from || !to) return null;
            const start = portPoint(from, link.fromPort),
              end = portPoint(to, link.toPort);
            return (
              <Path
                key={link.id}
                testID="mind-map-link"
                d={curve(start, end, link.fromPort, link.toPort)}
                fill="none"
                stroke="#343B47"
                strokeWidth={1.8}
                strokeLinecap="round"
              />
            );
          })}
          {connection && source && (
            <Path
              testID="connection-preview"
              d={curve(
                portPoint(source, connection.port),
                connection,
                connection.port,
              )}
              fill="none"
              stroke="#343B47"
              strokeWidth={1.8}
              strokeDasharray="4 4"
            />
          )}
        </Svg>
        {!board.nodes.length && (
          <View pointerEvents="none" style={s.empty}>
            <Text style={[T.small, s.center]}>
              Add a box or circle to begin.
            </Text>
          </View>
        )}
        {board.nodes.map((node) => {
          const size = nodeSize(node);
          return onSelect && onMove ? (
            <MovableIdea
              key={node.id}
              node={node}
              scale={scale}
              selected={node.id === selectedId}
              targeted={node.id === target?.id}
              connecting={connecting}
              onSelect={() => onSelect(node.id)}
              onMove={(x, y) => onMove(node.id, x, y)}
              onTextChange={
                onTextChange ? (text) => onTextChange(node.id, text) : undefined
              }
              onInteractionChange={onInteractionChange}
            />
          ) : (
            <View
              key={node.id}
              style={[
                s.nodePosition,
                s.node,
                {
                  left: node.x * WIDTH * scale - (size.width * scale) / 2,
                  top: node.y * HEIGHT * scale - (size.height * scale) / 2,
                  width: size.width * scale,
                  height: size.height * scale,
                  borderRadius: node.shape === "circle" ? 100 : 9,
                },
              ]}
            >
              <NodeContent node={node} scale={scale} />
            </View>
          );
        })}
        {onConnect &&
          board.nodes.flatMap((node) =>
            ports.map((port) => (
              <ConnectionDot
                key={`${node.id}-${port}`}
                node={node}
                port={port}
                scale={scale}
                onStart={(value) => {
                  setConnection(value);
                  onInteractionChange?.(true);
                }}
                onDrag={setConnection}
                onCancel={cancelConnection}
                onPick={() => onConnectFrom?.(node.id, port)}
                onDrop={(value) => {
                  const hit = hitTarget(value);
                  if (hit) {
                    const nearest = [...ports].sort((a, b) => {
                      const p = portPoint(hit, a),
                        q = portPoint(hit, b);
                      return (
                        Math.hypot(p.x - value.x, p.y - value.y) -
                        Math.hypot(q.x - value.x, q.y - value.y)
                      );
                    })[0];
                    onConnect(value.from, hit.id, value.port, nearest);
                  }
                  cancelConnection();
                }}
              />
            )),
          )}
      </View>
      {onSelect && (
        <View style={s.zoomBar}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Zoom out"
            accessibilityState={{ disabled: zoom <= 0.75 }}
            disabled={zoom <= 0.75}
            onPress={() => setZoom((value) => Math.max(0.75, value - 0.25))}
            style={s.zoomButton}
          >
            <Icon name="minus" size={17} color="#525C67" />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Reset zoom"
            onPress={() => {
              setZoom(1);
              setPan({ x: 0, y: 0 });
            }}
            style={[s.zoomButton, { minWidth: 48 }]}
          >
            <Text style={[T.small, { color: "#525C67" }]}>
              {Math.round(zoom * 100)}%
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Zoom in"
            accessibilityState={{ disabled: zoom >= 2 }}
            disabled={zoom >= 2}
            onPress={() => setZoom((value) => Math.min(2, value + 0.25))}
            style={s.zoomButton}
          >
            <Icon name="plus" size={17} color="#525C67" />
          </Pressable>
        </View>
      )}
    </View>
  );
}

export function DrawingCanvas({
  strokes,
  onChange,
  onInteractionChange,
}: {
  strokes: PlanStroke[];
  onChange?: (strokes: PlanStroke[]) => void;
  onInteractionChange?: (active: boolean) => void;
}) {
  const [width, setWidth] = useState(280);
  const [redo, setRedo] = useState<PlanStroke[]>([]);
  const [confirmClear, setConfirmClear] = useState(false);
  const gesture = useRef<{
    base: PlanStroke[];
    id: string;
    points: { x: number; y: number }[];
  } | null>(null);
  const used = strokes.reduce((sum, stroke) => sum + stroke.points.length, 0);
  const full =
    used >= MAX_PLAN_POINTS - 2 || strokes.length >= MAX_PLAN_STROKES;
  const drawingHandlers = useCanvasGesture({
    onStartShouldSetPanResponder: () => Boolean(onChange) && !full,
    onPanResponderGrant: (event) => {
      const point = {
        x: Math.round(
          clamp((event.nativeEvent.locationX / width) * WIDTH, 0, WIDTH),
        ),
        y: Math.round(
          clamp((event.nativeEvent.locationY / width) * WIDTH, 0, HEIGHT),
        ),
      };
      const next = { base: strokes, id: planId(), points: [point, point] };
      gesture.current = next;
      setRedo([]);
      onInteractionChange?.(true);
      onChange?.([...next.base, { id: next.id, points: next.points }]);
    },
    onPanResponderMove: (event) => {
      const active = gesture.current;
      if (!active) return;
      const point = {
        x: Math.round(
          clamp((event.nativeEvent.locationX / width) * WIDTH, 0, WIDTH),
        ),
        y: Math.round(
          clamp((event.nativeEvent.locationY / width) * WIDTH, 0, HEIGHT),
        ),
      };
      const last = active.points[active.points.length - 1];
      if (Math.hypot(point.x - last.x, point.y - last.y) < 2) return;
      const budget = Math.min(
        320,
        MAX_PLAN_POINTS -
          active.base.reduce((sum, stroke) => sum + stroke.points.length, 0),
      );
      let points = [...active.points, point];
      if (points.length > budget)
        points = [
          ...points.filter((_, index) => index % 2 === 0).slice(0, -1),
          point,
        ];
      active.points = points;
      onChange?.([...active.base, { id: active.id, points }]);
    },
    onPanResponderRelease: () => {
      gesture.current = null;
      onInteractionChange?.(false);
    },
    onPanResponderTerminate: () => {
      gesture.current = null;
      onInteractionChange?.(false);
    },
    onPanResponderTerminationRequest: () => false,
  });
  return (
    <View style={{ gap: 10 }}>
      <View
        testID="drawing-canvas"
        accessibilityLabel={onChange ? "Drawing area" : "Your drawing"}
        {...(onChange ? drawingHandlers : {})}
        onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
        style={[s.canvas, onChange && touchStyle]}
      >
        <Svg
          width="100%"
          height="100%"
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          {...decorative}
          pointerEvents="none"
          style={StyleSheet.absoluteFill}
        >
          {strokes.map((stroke) => (
            <Polyline
              testID="drawing-stroke"
              key={stroke.id}
              points={stroke.points
                .map((point) => `${point.x},${point.y}`)
                .join(" ")}
              fill="none"
              stroke={C.ink}
              strokeWidth={2.5}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ))}
        </Svg>
        {!strokes.length && (
          <View pointerEvents="none" style={s.empty}>
            <Icon name="edit-2" size={24} />
            <Text style={[T.small, s.center]}>Draw your ideas here.</Text>
          </View>
        )}
      </View>
      {onChange && (
        <>
          <View style={s.tools}>
            <CanvasAction
              label="Undo"
              icon="corner-up-left"
              disabled={!strokes.length}
              onPress={() => {
                setRedo([...redo, strokes[strokes.length - 1]]);
                onChange(strokes.slice(0, -1));
              }}
            />
            <CanvasAction
              label="Redo"
              icon="corner-up-right"
              disabled={!redo.length || full}
              onPress={() => {
                onChange([...strokes, redo[redo.length - 1]]);
                setRedo(redo.slice(0, -1));
              }}
            />
            <CanvasAction
              label="Clear"
              icon="trash-2"
              disabled={!strokes.length}
              onPress={() => setConfirmClear(true)}
            />
          </View>
          {confirmClear && (
            <View style={{ gap: 8 }}>
              <Text style={T.body}>Clear this drawing?</Text>
              <View style={s.tools}>
                <CanvasAction
                  label="Keep drawing"
                  icon="x"
                  onPress={() => setConfirmClear(false)}
                />
                <CanvasAction
                  label="Clear drawing"
                  icon="trash-2"
                  onPress={() => {
                    onChange([]);
                    setRedo([]);
                    setConfirmClear(false);
                  }}
                />
              </View>
            </View>
          )}
          {full && (
            <Text style={T.small}>
              Drawing full. Undo a stroke to make room.
            </Text>
          )}
        </>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  action: {
    flex: 1,
    minHeight: 44,
    padding: 8,
    gap: 5,
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 9,
    backgroundColor: C.paper,
  },
  active: { backgroundColor: C.forest, borderColor: C.forest },
  tools: { flexDirection: "row", gap: 8 },
  mapViewport: {
    width: "100%",
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 12,
    overflow: "hidden",
  },
  zoomBar: {
    position: "absolute",
    right: 8,
    top: 8,
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 8,
    backgroundColor: "rgba(255,255,255,0.96)",
    borderWidth: 1,
    borderColor: "#ECEFF2",
  },
  zoomButton: {
    minWidth: 36,
    minHeight: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  canvas: {
    width: "100%",
    aspectRatio: WIDTH / HEIGHT,
    backgroundColor: C.paper,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 12,
    overflow: "hidden",
  },
  empty: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    padding: 16,
  },
  nodePosition: { position: "absolute" },
  node: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: C.border,
    backgroundColor: "#FFFFFF",
    boxShadow: "0 2px 5px rgba(35, 45, 55, 0.05)",
    padding: 7,
    justifyContent: "center",
    alignItems: "center",
  },
  center: { textAlign: "center" },
});
