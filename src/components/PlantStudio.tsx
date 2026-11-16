import { useTheme, createThemedStyles } from "../theme/ThemeProvider";
import React, {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  GestureResponderEvent,
  PanResponder,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  ViewStyle,
} from "react-native";
import Svg, { Path } from "react-native-svg";
import { Doodle, GardenPosition } from "../types";
import { Icon } from "./ui";

export type { Doodle } from "../types";
export interface PlantStudioProps {
  value: Doodle;
  onChange: (doodle: Doodle) => void;
  onDrawingChange?: (drawing: boolean) => void;
  disabled?: boolean;
}

const PALETTE = [
  { name: "Pink", color: "#D95D87" },
  { name: "Gold", color: "#E7A547" },
  { name: "Blue", color: "#79AEC8" },
  { name: "Green", color: "#6B9350" },
  { name: "Purple", color: "#9B83BA" },
];
const MAX_STROKES = 24;
const MAX_POINTS_PER_STROKE = 120;
const MAX_POINTS = 1200;
type Stroke = Doodle["strokes"][number];
const pathFor = (points: GardenPosition[]) =>
  points
    .map(({ x, y }, index) => `${index ? "L" : "M"}${x * 100} ${y * 100}`)
    .join(" ");

export function PlantStudio({
  value,
  onChange,
  onDrawingChange,
  disabled = false,
}: PlantStudioProps) {
  const { T } = useTheme();
  const styles = useStyles();

  const [color, setColor] = useState(PALETTE[0].color);
  const [preview, setPreview] = useState<Stroke | null>(null);
  const [notice, setNotice] = useState("");
  const dimensions = useRef({ width: 1, height: 1 });
  const active = useRef<Stroke | null>(null);
  const controls = useRef({
    value,
    color,
    disabled,
    onChange,
    onDrawingChange,
  });
  useLayoutEffect(() => {
    controls.current = { value, color, disabled, onChange, onDrawingChange };
  }, [value, color, disabled, onChange, onDrawingChange]);
  useEffect(
    () => () => {
      if (active.current) controls.current.onDrawingChange?.(false);
    },
    [],
  );

  const responder = useMemo(() => {
    const point = (event: GestureResponderEvent): GardenPosition => ({
      x:
        Math.round(
          Math.max(
            0,
            Math.min(1, event.nativeEvent.locationX / dimensions.current.width),
          ) * 10000,
        ) / 10000,
      y:
        Math.round(
          Math.max(
            0,
            Math.min(
              1,
              event.nativeEvent.locationY / dimensions.current.height,
            ),
          ) * 10000,
        ) / 10000,
    });
    const finish = (commit: boolean) => {
      const stroke = active.current;
      active.current = null;
      setPreview(null);
      if (stroke) {
        if (commit && stroke.points.length >= 2 && !controls.current.disabled) {
          controls.current.onChange({
            strokes: [...controls.current.value.strokes, stroke],
          });
        }
        controls.current.onDrawingChange?.(false);
      }
    };
    // PanResponder registers these callbacks; it reads the refs only on gestures.
    // eslint-disable-next-line react-hooks/refs
    return PanResponder.create({
      onStartShouldSetPanResponder: () => !controls.current.disabled,
      onMoveShouldSetPanResponder: () => !controls.current.disabled,
      onPanResponderGrant: (event) => {
        const {
          value: current,
          color: ink,
          disabled: locked,
        } = controls.current;
        if (locked) return;
        const count = current.strokes.reduce(
          (sum, stroke) => sum + stroke.points.length,
          0,
        );
        if (current.strokes.length >= MAX_STROKES || count > MAX_POINTS - 2) {
          setNotice("Canvas full. Undo or clear to keep drawing.");
          return;
        }
        setNotice("");
        const stroke = { color: ink, points: [point(event)] };
        active.current = stroke;
        setPreview(stroke);
        controls.current.onDrawingChange?.(true);
      },
      onPanResponderMove: (event, gesture) => {
        const stroke = active.current;
        if (
          !stroke ||
          gesture.numberActiveTouches > 1 ||
          controls.current.disabled
        )
          return;
        const next = point(event);
        const previous = stroke.points[stroke.points.length - 1];
        if (Math.hypot(next.x - previous.x, next.y - previous.y) < 0.004)
          return;
        const savedPoints = controls.current.value.strokes.reduce(
          (sum, saved) => sum + saved.points.length,
          0,
        );
        if (
          stroke.points.length >= MAX_POINTS_PER_STROKE ||
          savedPoints + stroke.points.length >= MAX_POINTS
        ) {
          setNotice("That stroke is full. Lift your finger to start another.");
          return;
        }
        const updated = { ...stroke, points: [...stroke.points, next] };
        active.current = updated;
        setPreview(updated);
      },
      onPanResponderRelease: () => finish(true),
      onPanResponderTerminate: () => finish(false),
      onPanResponderTerminationRequest: () => false,
      onShouldBlockNativeResponder: () => true,
    });
  }, []);

  const drawing = preview !== null;
  const empty = value.strokes.length === 0 && !drawing;
  const reset = (undo: boolean) => {
    if (disabled || drawing) return;
    setNotice("");
    onChange({ strokes: undo ? value.strokes.slice(0, -1) : [] });
  };
  return (
    <View style={styles.studio} testID="plant-studio">
      <View style={styles.drawingRow}>
        <View style={styles.palette} accessibilityLabel="Drawing colors">
          {PALETTE.map((ink) => {
            const selected = color === ink.color;
            return (
              <Pressable
                key={ink.color}
                accessibilityRole="button"
                accessibilityLabel={`${ink.name} ink`}
                accessibilityState={{ selected, disabled: disabled || drawing }}
                disabled={disabled || drawing}
                onPress={() => setColor(ink.color)}
                style={[
                  styles.colorButton,
                  selected && styles.selectedColor,
                  disabled && styles.disabled,
                ]}
              >
                <View style={[styles.swatch, { backgroundColor: ink.color }]}>
                  {selected ? (
                    <Icon name="check" size={17} color="#203D2E" />
                  ) : null}
                </View>
              </Pressable>
            );
          })}
        </View>
        <View
          testID="plant-drawing-canvas"
          accessibilityLabel="Draw your own plant"
          accessibilityHint="Draw with a finger or mouse. Choose a color on the left."
          accessibilityState={{ disabled }}
          onLayout={({ nativeEvent }) => {
            dimensions.current = {
              width: nativeEvent.layout.width,
              height: nativeEvent.layout.height,
            };
          }}
          {...responder.panHandlers}
          style={[
            styles.canvas,
            disabled && styles.disabled,
            Platform.OS === "web" && webCanvasStyle,
          ]}
        >
          <View pointerEvents="none" style={StyleSheet.absoluteFill}>
            <Svg width="100%" height="100%" viewBox="0 0 100 100">
              {value.strokes.map((stroke, index) => (
                <Path
                  key={index}
                  d={pathFor(stroke.points)}
                  fill="none"
                  stroke={stroke.color}
                  strokeWidth={3}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              ))}
              {preview ? (
                <Path
                  d={pathFor(preview.points)}
                  fill="none"
                  stroke={preview.color}
                  strokeWidth={3}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              ) : null}
            </Svg>
          </View>
          {empty ? (
            <View pointerEvents="none" style={styles.blankHint}>
              <Icon name="edit-3" size={24} color="#899580" />
              <Text style={[T.small, styles.hintText]}>Draw here</Text>
            </View>
          ) : null}
        </View>
      </View>
      <View style={styles.toolbar}>
        <Text style={[T.small, styles.counter]}>
          {value.strokes.length} / {MAX_STROKES} strokes
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Undo stroke"
          disabled={disabled || drawing || !value.strokes.length}
          onPress={() => reset(true)}
          style={[
            styles.tool,
            (disabled || drawing || !value.strokes.length) && styles.disabled,
          ]}
        >
          <Icon name="corner-up-left" size={16} />
          <Text style={styles.toolText}>Undo</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Clear drawing"
          disabled={disabled || drawing || !value.strokes.length}
          onPress={() => reset(false)}
          style={[
            styles.tool,
            (disabled || drawing || !value.strokes.length) && styles.disabled,
          ]}
        >
          <Icon name="rotate-ccw" size={16} />
          <Text style={styles.toolText}>Clear</Text>
        </Pressable>
      </View>
      {notice ? (
        <Text accessibilityLiveRegion="polite" style={[T.small, styles.notice]}>
          {notice}
        </Text>
      ) : null}
    </View>
  );
}

const webCanvasStyle = {
  touchAction: "none",
  userSelect: "none",
  cursor: "crosshair",
} as unknown as ViewStyle;
const useStyles = createThemedStyles(({ C }) =>
  StyleSheet.create({
    studio: { gap: 9, width: "100%" },
    drawingRow: { flexDirection: "row", gap: 8, alignItems: "center" },
    palette: { gap: 2, width: 44, alignItems: "center" },
    colorButton: {
      width: 44,
      height: 44,
      borderRadius: 24,
      borderWidth: 2,
      borderColor: "transparent",
      alignItems: "center",
      justifyContent: "center",
    },
    selectedColor: { borderColor: C.ink, backgroundColor: "#FFFDF8" },
    swatch: {
      width: 29,
      height: 29,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: "#5C6E50",
      alignItems: "center",
      justifyContent: "center",
    },
    canvas: {
      flex: 1,
      aspectRatio: 1,
      borderRadius: 14,
      borderWidth: 2,
      borderStyle: "dashed",
      borderColor: "#AAB79B",
      backgroundColor: "#FFFEF9",
      overflow: "hidden",
    },
    blankHint: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      gap: 10,
      padding: 12,
    },
    hintText: { color: C.muted, textAlign: "center" },
    toolbar: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "flex-end",
      gap: 2,
    },
    counter: { flex: 1, fontSize: 10 },
    tool: {
      minHeight: 44,
      paddingHorizontal: 7,
      flexDirection: "row",
      alignItems: "center",
      gap: 5,
      borderRadius: 10,
    },
    toolText: { fontFamily: "DMMedium", fontSize: 12, color: C.forest },
    disabled: { opacity: 0.4 },
    notice: { color: C.forest, fontSize: 11 },
  }),
);
