import React, { useMemo, useState } from "react";
import {
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import Svg, { Line } from "react-native-svg";
import { layoutThoughtMap } from "../../shared/thought-map-layout.mjs";
import type { ThoughtMap as MapData, ThoughtMapNode } from "../types";
import { Button, C, Card, T, Tag } from "./ui";

const statusLabel = {
  explicit: "Explicit · your words",
  inferred: "Inferred · proposed interpretation",
  missing: "Missing · proposed gap",
};
const nodeColor = { explicit: C.sage, inferred: C.lilac, missing: C.peach };
const readable = (word: string) => word.replaceAll("_", " ");
const nodeHeading = (node: ThoughtMapNode, central: boolean) =>
  central
    ? "Your main idea"
    : node.status === "missing"
      ? "Strengthen this"
      : node.status === "explicit"
        ? "Your idea"
        : readable(node.type);

export function ThoughtMapView({
  map,
  answer,
  sample = false,
}: {
  map: MapData;
  answer: string;
  sample?: boolean;
}) {
  const [view, setView] = useState<"map" | "outline">("map");
  const [selected, setSelected] = useState<ThoughtMapNode | null>(null);
  const [zoom, setZoom] = useState(1);
  const layout = useMemo(() => layoutThoughtMap(map), [map]);
  const span = selected?.source_span;
  const validSpan =
    span &&
    selected.status === "explicit" &&
    answer.slice(span.start, span.end) === selected.quote;
  return (
    <Card style={{ gap: 16 }}>
      <Text accessibilityRole="header" style={T.h2}>
        {sample ? "Sample Thought Map" : "Your Thought Map"}
      </Text>
      <Text style={T.small}>
        {sample
          ? "Demonstration only. This map is not an assessment of your response and earns no progress."
          : "Your ideas form the branches. Peach dashed branches show a proposed gap you can strengthen. Tap a node to inspect its evidence or question."}
      </Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        <Tag color={C.sage}>Your ideas · exact quotation</Tag>
        <Tag color={C.lilac}>Inferred · interpretation</Tag>
        <Tag color={C.peach}>Strengthen · proposed gap</Tag>
      </View>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
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
        <>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
            <Button
              label="Zoom out"
              variant="ghost"
              disabled={zoom <= 0.75}
              onPress={() => setZoom((value) => Math.max(0.75, value - 0.25))}
            />
            <Button
              label="Reset map zoom"
              variant="ghost"
              onPress={() => setZoom(1)}
            />
            <Button
              label="Zoom in"
              variant="ghost"
              disabled={zoom >= 1.5}
              onPress={() => setZoom((value) => Math.min(1.5, value + 0.25))}
            />
          </View>
          <Text style={T.small}>
            Scroll to explore · {Math.round(zoom * 100)}% · your main idea is
            at the centre
          </Text>
          <ScrollView
            horizontal
            nestedScrollEnabled
            testID="thought-map-canvas"
            style={{
              borderWidth: 1,
              borderColor: C.border,
              borderRadius: 16,
              backgroundColor: C.cream,
            }}
          >
            <ScrollView nestedScrollEnabled style={{ maxHeight: 500 }}>
              <View
                style={{
                  width: layout.width * zoom,
                  height: layout.height * zoom,
                }}
              >
                <Svg
                  width={layout.width * zoom}
                  height={layout.height * zoom}
                  accessible={false}
                  pointerEvents="none"
                >
                  {map.edges.map((edge) => {
                    const from = layout.positions.find(
                      (position) => position.id === edge.source,
                    )!;
                    const to = layout.positions.find(
                      (position) => position.id === edge.target,
                    )!;
                    const x1 = (from.x + from.width / 2) * zoom,
                      y1 = (from.y + from.height / 2) * zoom;
                    const x2 = (to.x + to.width / 2) * zoom,
                      y2 = (to.y + to.height / 2) * zoom;
                    const gap =
                      map.nodes.find((node) => node.id === edge.source)
                        ?.status === "missing" ||
                      map.nodes.find((node) => node.id === edge.target)
                        ?.status === "missing";
                    return (
                      <Line
                        key={edge.id}
                        x1={x1}
                        y1={y1}
                        x2={x2}
                        y2={y2}
                        stroke={gap ? C.orange : C.forest}
                        strokeWidth={gap ? 2.5 : 2}
                        strokeDasharray={gap ? "7,6" : undefined}
                      />
                    );
                  })}
                </Svg>
                {layout.positions.map((position) => {
                  const node = map.nodes.find(
                    (item) => item.id === position.id,
                  )!;
                  return (
                    <Pressable
                      key={node.id}
                      accessibilityRole="button"
                      accessibilityLabel={`${nodeHeading(node, position.central)}: ${node.status === "explicit" && sample ? "Explicit sample words" : statusLabel[node.status]}`}
                      accessibilityState={{
                        selected: selected?.id === node.id,
                      }}
                      testID={`thought-map-node-${node.id}`}
                      onPress={() => setSelected(node)}
                      style={({ pressed }) => ({
                        position: "absolute",
                        left: position.x * zoom,
                        top: position.y * zoom,
                        width: position.width * zoom,
                        height: position.height * zoom,
                        padding: 12 * zoom,
                        borderRadius: position.central ? 999 : 18,
                        gap: 5 * zoom,
                        borderWidth:
                          selected?.id === node.id ? 3 : position.central ? 2 : 1,
                        borderColor:
                          position.central || node.status !== "missing"
                            ? C.forest
                            : C.orange,
                        backgroundColor: pressed
                          ? C.yellow
                          : position.central
                            ? C.forest
                            : nodeColor[node.status],
                      })}
                    >
                      <Text
                        style={[
                          T.h3,
                          {
                            fontSize: position.central ? 16 * zoom : 15 * zoom,
                            lineHeight: position.central ? 21 * zoom : 20 * zoom,
                            color: position.central ? C.paper : C.ink,
                          },
                        ]}
                      >
                        {nodeHeading(node, position.central)}
                      </Text>
                      <Text
                        style={[
                          T.small,
                          {
                            fontSize: 12 * zoom,
                            lineHeight: 16 * zoom,
                            color: position.central ? C.sage : C.muted,
                          },
                        ]}
                      >
                        {position.central
                          ? "The point your other ideas connect to"
                          : node.status === "explicit" && sample
                            ? "Explicit · sample words"
                            : statusLabel[node.status]}
                      </Text>
                      <Text
                        numberOfLines={3}
                        style={[
                          T.body,
                          {
                            fontSize: 13 * zoom,
                            lineHeight: 18 * zoom,
                            color: position.central ? C.paper : C.ink,
                          },
                        ]}
                      >
                        {node.text || node.feedback}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </ScrollView>
          </ScrollView>
        </>
      ) : (
        <View testID="thought-map-outline" style={{ gap: 10 }}>
          {!layout ? (
            <Text style={T.small}>
              Graph layout unavailable. The text outline preserves the saved
              nodes and connections.
            </Text>
          ) : null}
          {map.nodes.map((node) => (
            <View
              key={node.id}
              style={{
                padding: 14,
                borderRadius: 12,
                gap: 8,
                backgroundColor: nodeColor[node.status],
              }}
            >
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Inspect ${node.type} ${node.id}`}
                onPress={() => setSelected(node)}
                style={{ minHeight: 44, justifyContent: "center" }}
                testID={`thought-map-outline-${node.id}`}
              >
                <Text style={T.h3}>
                  {readable(node.type)} ·{" "}
                  {sample && node.status === "explicit"
                    ? "sample words"
                    : statusLabel[node.status]}
                </Text>
              </Pressable>
              <Text selectable style={T.body}>
                {node.status === "explicit"
                  ? `“${node.text}”`
                  : node.text || "No quotation · a proposed gap to consider"}
              </Text>
              <Text style={T.small}>{node.feedback}</Text>
            </View>
          ))}
          {map.edges.map((edge) => (
            <Text key={edge.id} style={T.small}>
              {edge.source} → {edge.target}: {readable(edge.relation)}
            </Text>
          ))}
        </View>
      )}
      {selected ? (
        <View
          testID="thought-map-selected"
          style={{
            gap: 10,
            borderTopWidth: 1,
            borderColor: C.border,
            paddingTop: 14,
          }}
        >
          <Text style={T.h3}>
            {selected.id === layout?.rootId
              ? "Your main idea"
              : sample && selected.status === "explicit"
              ? "Explicit sample words"
              : selected.status === "missing"
                ? "Strengthen this idea"
                : statusLabel[selected.status]}
          </Text>
          <Text selectable style={T.body}>
            {selected.text ||
              "No learner quotation is attached to this proposed gap."}
          </Text>
          <Text style={T.body}>{selected.feedback}</Text>
          {validSpan ? (
            <>
              <Text style={T.label}>
                {sample
                  ? "Sample source text"
                  : "Your saved response · selected excerpt"}
              </Text>
              <Text selectable testID="thought-map-source" style={T.body}>
                {answer.slice(0, span.start)}
                <Text
                  style={{ backgroundColor: C.yellow, fontFamily: "DMBold" }}
                >
                  {answer.slice(span.start, span.end)}
                </Text>
                {answer.slice(span.end)}
              </Text>
            </>
          ) : (
            <Text style={T.small}>
              This is a proposed interpretation or question, not something you
              said.
            </Text>
          )}
        </View>
      ) : null}
    </Card>
  );
}
