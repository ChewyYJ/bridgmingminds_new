import { useTheme, createThemedStyles } from "../theme/ThemeProvider";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Svg, { Circle, Defs, Path, Pattern, Rect } from "react-native-svg";
import { layoutThoughtMap } from "../../shared/thought-map-layout.mjs";
import type { ThoughtMap as MapData, ThoughtMapNode } from "../types";
import { Button, Card } from "./ui";

const usePalette = createThemedStyles(({ C }) => ({
  developed: {
    label: "Well developed",
    fill: C.successSurface,
    ink: C.success,
    line: C.success,
  },
  needs_elaboration: {
    label: "Needs elaboration",
    fill: C.yellow,
    ink: C.orange,
    line: C.orange,
  },
  missing: {
    label: "Suggested gap",
    fill: C.errorSurface,
    ink: C.red,
    line: C.red,
  },
  brainstorm_only: {
    label: "Planned, left unsaid",
    fill: C.accentSurface,
    ink: C.accent,
    line: C.accent,
  },
  inferred: {
    label: "Possible interpretation",
    fill: C.quiet,
    ink: C.muted,
    line: C.muted,
  },
  explicit: {
    label: "In the response",
    fill: C.quiet,
    ink: C.muted,
    line: C.muted,
  },
}));
const titles = {
  claim: "Main idea",
  reason: "Reason",
  evidence: "Example or evidence",
  warrant: "Reasoning link",
  backing: "Support",
  qualifier: "Scope or condition",
  rebuttal: "Another perspective",
};
const legend = [
  "developed",
  "needs_elaboration",
  "missing",
  "brainstorm_only",
] as const;
const headingFont =
  Platform.OS === "web" ? "Segoe Print, Bradley Hand, cursive" : "DMBold";

function paperOutline(
  {
    x,
    y,
    width,
    height,
  }: { x: number; y: number; width: number; height: number },
  variation: number,
) {
  const right = x + width,
    bottom = y + height;
  return `M ${x + 22} ${y + 5}
    Q ${x + width / 2} ${y + variation} ${right - 22} ${y + 4}
    Q ${right - 4} ${y + 4} ${right - 3} ${y + 22}
    Q ${right + variation - 4} ${y + height / 2} ${right - 5} ${bottom - 19}
    Q ${right - 7} ${bottom - 3} ${right - 25} ${bottom - 3}
    Q ${x + width / 2} ${bottom - variation} ${x + 20} ${bottom - 4}
    Q ${x + 3} ${bottom - 6} ${x + 3} ${bottom - 22}
    Q ${x + variation} ${y + height / 2} ${x + 4} ${y + 23}
    Q ${x + 5} ${y + 6} ${x + 22} ${y + 5} Z`;
}

function topicOutline({
  x,
  y,
  width,
  height,
}: {
  x: number;
  y: number;
  width: number;
  height: number;
}) {
  const right = x + width,
    bottom = y + height;
  return `M ${x + 9} ${y + height / 2}
    C ${x + 9} ${y + 30}, ${x + width * 0.26} ${y + 3}, ${x + width * 0.52} ${y + 4}
    C ${right - 43} ${y + 4}, ${right - 4} ${y + 32}, ${right - 5} ${y + height / 2}
    C ${right - 2} ${bottom - 32}, ${right - 54} ${bottom - 4}, ${x + width / 2} ${bottom - 4}
    C ${x + 47} ${bottom}, ${x + 5} ${bottom - 38}, ${x + 9} ${y + height / 2} Z`;
}

export function ThoughtMapView({
  map,
  topic,
  answer,
  notes = "",
  sample = false,
  written = false,
}: {
  map: MapData;
  topic: string;
  answer: string;
  notes?: string;
  sample?: boolean;
  written?: boolean;
}) {
  const s = useStyles();

  const { C, T } = useTheme();
  const palette = usePalette();
  const pencil = C.ink;
  const appearance = (node: ThoughtMapNode) =>
    palette[node.development ?? node.status];

  const [view, setView] = useState<"map" | "outline">("map");
  const [selectedId, setSelectedId] = useState<string>();
  const [width, setWidth] = useState(0);
  const [zoom, setZoom] = useState(1);
  const paperId = `thought-paper-${React.useId().replace(/[^\w-]/g, "")}`;
  const canvas = useRef<ScrollView>(null);
  const layout = useMemo(
    () => layoutThoughtMap(map, Math.max(0, width - 2)),
    [map, width],
  );
  const byId = new Map(map.nodes.map((node) => [node.id, node]));
  const selected = selectedId ? byId.get(selectedId) : undefined;
  const topicText = map.topic || topic;
  const topicFontSize = topicText.length > 65 ? 15 : 17;
  const fit =
    layout && width
      ? Math.max(0.72, Math.min(1, (width - 2) / layout.width))
      : 1;
  const scale = fit * zoom;
  const canvasWidth = (layout?.width ?? 0) * scale;
  const selection = selected ? appearance(selected) : undefined;
  const quoteSpan = selected?.source_span;
  const responseQuote =
    quoteSpan &&
    answer.slice(quoteSpan.start, quoteSpan.end) === selected?.quote;
  const noteSpan = selected?.note_span;
  const noteQuote = noteSpan && notes.slice(noteSpan.start, noteSpan.end);

  useEffect(() => {
    if (view !== "map" || !width) return;
    const frame = requestAnimationFrame(() => {
      canvas.current?.scrollTo({
        x: Math.max(0, (canvasWidth - width) / 2),
        animated: false,
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [canvasWidth, view, width]);

  function detail(node: ThoughtMapNode) {
    return node.text || node.feedback;
  }

  return (
    <Card style={s.card}>
      <Text accessibilityRole="header" style={T.h2}>
        {sample ? "Sample Thought Map" : "Your Thought Map"}
      </Text>
      <Text style={T.small}>
        {sample
          ? "Demonstration only. This map is not an assessment of your response and earns no progress."
          : map.comparedNotes
            ? "Based on your planning notes and response. Select a branch to see its source and feedback."
            : "Based on your response. Select a branch to see its source and feedback."}
      </Text>
      {map.validationIncomplete ? (
        <Text style={T.small}>
          Some AI-generated branches or connections could not be verified.
        </Text>
      ) : null}
      <View style={s.legend}>
        {legend.map((status) => (
          <View key={status} style={s.legendItem}>
            <View style={[s.dot, { backgroundColor: palette[status].line }]} />
            <Text style={[T.small, { color: palette[status].ink }]}>
              {status === "brainstorm_only" && written
                ? "Planned, left out"
                : palette[status].label}
            </Text>
          </View>
        ))}
      </View>
      <View style={s.toolbar}>
        <View style={s.controls}>
          <Button
            label="Map view"
            selected={view === "map"}
            variant="secondary"
            onPress={() => setView("map")}
          />
          <Button
            label="Text outline"
            selected={view === "outline"}
            variant="secondary"
            onPress={() => setView("outline")}
          />
        </View>
        {view === "map" && layout ? (
          <View style={s.controls}>
            <Button
              label="Zoom out"
              icon="minus"
              variant="ghost"
              disabled={zoom <= 0.75}
              onPress={() => setZoom((value) => Math.max(0.75, value - 0.25))}
            />
            <Button
              label="Reset zoom"
              variant="ghost"
              onPress={() => setZoom(1)}
            />
            <Button
              label="Zoom in"
              icon="plus"
              variant="ghost"
              disabled={zoom >= 1.5}
              onPress={() => setZoom((value) => Math.min(1.5, value + 0.25))}
            />
          </View>
        ) : null}
      </View>
      {view === "map" && layout ? (
        <View
          onLayout={(event) =>
            setWidth(Math.floor(event.nativeEvent.layout.width))
          }
          style={s.canvas}
        >
          <ScrollView
            ref={canvas}
            horizontal
            testID="thought-map-canvas"
            contentContainerStyle={s.canvasContent}
            showsHorizontalScrollIndicator={canvasWidth > width}
          >
            <View style={{ width: canvasWidth, height: layout.height * scale }}>
              <View pointerEvents="none" style={StyleSheet.absoluteFill}>
                <Svg
                  width={canvasWidth}
                  height={layout.height * scale}
                  viewBox={`0 0 ${layout.width} ${layout.height}`}
                  aria-hidden
                >
                  <Defs>
                    <Pattern
                      id={paperId}
                      width={19}
                      height={19}
                      patternUnits="userSpaceOnUse"
                    >
                      <Circle
                        cx={2}
                        cy={2}
                        r={0.8}
                        fill={C.border}
                        opacity={0.55}
                      />
                    </Pattern>
                  </Defs>
                  <Rect
                    width={layout.width}
                    height={layout.height}
                    fill={`url(#${paperId})`}
                  />
                  {layout.positions.map((position, index) => {
                    const parent =
                      layout.positions.find(
                        ({ id }) => id === position.parent,
                      ) ?? layout.centre;
                    const goingRight = position.x > parent.x;
                    const inset = position.parent ? 6 : 10;
                    const x1 = goingRight
                      ? parent.x + parent.width - inset
                      : parent.x + inset;
                    const x2 = goingRight
                      ? position.x + 6
                      : position.x + position.width - 6;
                    const y1 = parent.y + parent.height / 2;
                    const y2 = position.y + position.height / 2;
                    const delta = x2 - x1;
                    const bow = (index % 2 === 0 ? -1 : 1) * 9;
                    const node = byId.get(position.id)!;
                    return (
                      <Path
                        key={position.id}
                        d={`M ${x1} ${y1} C ${x1 + delta * 0.65} ${y1 + bow}, ${x2 - delta * 0.3} ${y2 + bow}, ${x2} ${y2}`}
                        fill="none"
                        stroke={appearance(node).line}
                        strokeWidth={2.2}
                        strokeLinecap="round"
                        strokeDasharray={
                          node.status === "missing" ? "5 5" : undefined
                        }
                      />
                    );
                  })}
                  <Path
                    d={topicOutline(layout.centre)}
                    fill={C.yellow}
                    stroke={pencil}
                    strokeWidth={2.6}
                  />
                  <Path
                    d={`M ${layout.centre.x + 28} ${layout.centre.y + 20} l -8 -9 m 18 2 l -2 -11 m 13 7 l 3 -9`}
                    stroke={pencil}
                    strokeWidth={2.2}
                    strokeLinecap="round"
                    fill="none"
                  />
                  {layout.positions.map((position, index) => {
                    const status = appearance(byId.get(position.id)!);
                    const outline = paperOutline(position, 2 + (index % 3));
                    return (
                      <React.Fragment key={position.id}>
                        <Path
                          d={outline}
                          transform="translate(1 3)"
                          fill={C.ink}
                          opacity={0.08}
                        />
                        <Path
                          d={outline}
                          fill={status.fill}
                          stroke={status.line}
                          strokeWidth={selectedId === position.id ? 3 : 1.9}
                        />
                      </React.Fragment>
                    );
                  })}
                </Svg>
              </View>
              <View
                style={[
                  s.topic,
                  {
                    left: layout.centre.x * scale,
                    top: layout.centre.y * scale,
                    width: layout.centre.width * scale,
                    height: layout.centre.height * scale,
                  },
                ]}
              >
                <Text
                  accessibilityRole="header"
                  accessibilityLabel={topicText}
                  numberOfLines={5}
                  style={[
                    T.h3,
                    {
                      textAlign: "center",
                      color: pencil,
                      fontFamily: headingFont,
                      fontSize: topicFontSize * scale,
                      lineHeight: (topicFontSize + 4) * scale,
                    },
                  ]}
                >
                  {topicText}
                </Text>
              </View>
              {layout.positions.map((position) => {
                const node = byId.get(position.id)!;
                const status = appearance(node);
                const label =
                  node.status === "brainstorm_only" && written
                    ? "Planned, left out"
                    : status.label;
                return (
                  <Pressable
                    key={node.id}
                    accessible
                    accessibilityRole="button"
                    accessibilityLabel={`${titles[node.type]}, ${label}. ${detail(node)}`}
                    accessibilityState={{ selected: selectedId === node.id }}
                    testID={`thought-map-node-${node.id}`}
                    onPress={() => setSelectedId(node.id)}
                    style={({ pressed }) => [
                      s.node,
                      {
                        left: position.x * scale,
                        top: position.y * scale,
                        width: position.width * scale,
                        height: position.height * scale,
                        paddingHorizontal: 15 * scale,
                        gap: 3 * scale,
                        opacity: pressed ? 0.7 : 1,
                      },
                    ]}
                  >
                    <Text
                      numberOfLines={1}
                      style={[
                        T.h3,
                        {
                          color: pencil,
                          fontFamily: headingFont,
                          fontSize: 15 * scale,
                          lineHeight: 20 * scale,
                        },
                      ]}
                    >
                      {titles[node.type]}
                    </Text>
                    <Text
                      numberOfLines={1}
                      style={[
                        T.small,
                        {
                          color: status.ink,
                          fontSize: 11 * scale,
                          lineHeight: 14 * scale,
                        },
                      ]}
                    >
                      {label}
                    </Text>
                    <Text
                      numberOfLines={2}
                      style={[
                        T.body,
                        { fontSize: 13 * scale, lineHeight: 17 * scale },
                      ]}
                    >
                      {detail(node)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </ScrollView>
          {canvasWidth > width && width > 0 ? (
            <Text style={[T.small, s.scrollHint]}>
              Scroll sideways to explore
            </Text>
          ) : null}
        </View>
      ) : (
        <View testID="thought-map-outline" style={{ gap: 8 }}>
          <Text style={T.h3}>{topicText}</Text>
          {map.nodes.map((node) => {
            const status = appearance(node);
            const related = map.edges.filter(
              ({ source, target }) => source === node.id || target === node.id,
            );
            return (
              <View
                key={node.id}
                style={[
                  s.outline,
                  { backgroundColor: status.fill, borderColor: status.line },
                ]}
              >
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ selected: selectedId === node.id }}
                  onPress={() => setSelectedId(node.id)}
                  style={{ minHeight: 44, justifyContent: "center" }}
                  testID={`thought-map-outline-${node.id}`}
                >
                  <Text style={T.h3}>
                    {titles[node.type]} ·{" "}
                    {written && node.status === "brainstorm_only"
                      ? "Planned, left out"
                      : status.label}
                  </Text>
                  <Text style={T.body}>{detail(node)}</Text>
                </Pressable>
                {related.map((edge) => {
                  const other = byId.get(
                    edge.source === node.id ? edge.target : edge.source,
                  );
                  return (
                    other && (
                      <Text key={edge.id} style={T.small}>
                        {edge.source === node.id ? "Links to" : "Linked from"}{" "}
                        {titles[other.type].toLowerCase()} ·{" "}
                        {edge.relation.replaceAll("_", " ")} · {detail(other)}
                      </Text>
                    )
                  );
                })}
              </View>
            );
          })}
        </View>
      )}
      {selected && selection ? (
        <View
          testID="thought-map-selected"
          accessibilityLiveRegion="polite"
          style={[
            s.inspector,
            { backgroundColor: selection.fill, borderColor: selection.line },
          ]}
        >
          <Text style={T.h3}>
            {titles[selected.type]} ·{" "}
            {written && selected.status === "brainstorm_only"
              ? "Planned, left out"
              : selection.label}
          </Text>
          {selected.status === "missing" ? (
            <Text style={T.small}>
              No learner quotation is attached to this proposed gap.
            </Text>
          ) : null}
          {selected.status === "inferred" ? (
            <Text style={T.small}>
              {selected.text} This is a possible interpretation, not something
              you said.
            </Text>
          ) : null}
          {noteQuote ? (
            <>
              <Text style={T.label}>
                {sample ? "Sample planning notes" : "Your planning notes"}
              </Text>
              <Text selectable testID="thought-map-note-source" style={T.body}>
                “{noteQuote}”
              </Text>
            </>
          ) : null}
          {responseQuote && quoteSpan ? (
            <>
              <Text style={T.label}>
                {sample
                  ? "Sample source text"
                  : "Your saved response · selected excerpt"}
              </Text>
              <Text selectable testID="thought-map-source" style={T.body}>
                {answer.slice(0, quoteSpan.start)}
                <Text
                  style={{ backgroundColor: C.yellow, fontFamily: "DMBold" }}
                >
                  {answer.slice(quoteSpan.start, quoteSpan.end)}
                </Text>
                {answer.slice(quoteSpan.end)}
              </Text>
            </>
          ) : null}
          <Text style={T.label}>
            {selected.status === "explicit" &&
            selected.development === "developed"
              ? "What works"
              : "Next step"}
          </Text>
          <Text selectable style={T.body}>
            {selected.feedback}
          </Text>
        </View>
      ) : null}
    </Card>
  );
}

const useStyles = createThemedStyles(({ C }) =>
  StyleSheet.create({
    card: { gap: 14, backgroundColor: C.paper },
    toolbar: {
      flexDirection: "row",
      justifyContent: "space-between",
      flexWrap: "wrap",
      gap: 8,
    },
    controls: { flexDirection: "row", flexWrap: "wrap", gap: 5 },
    legend: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
    legendItem: { flexDirection: "row", alignItems: "center", gap: 5 },
    dot: { width: 8, height: 8, borderRadius: 4 },
    canvas: {
      borderWidth: 1,
      borderColor: C.border,
      borderRadius: 20,
      backgroundColor: C.paper,
      overflow: "hidden",
    },
    canvasContent: { flexGrow: 1, justifyContent: "center" },
    topic: {
      position: "absolute",
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 25,
    },
    node: { position: "absolute", borderRadius: 14, justifyContent: "center" },
    scrollHint: { padding: 8, textAlign: "center" },
    outline: {
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 10,
      borderLeftWidth: 2,
    },
    inspector: { padding: 16, borderLeftWidth: 3, borderRadius: 12, gap: 8 },
  }),
);
