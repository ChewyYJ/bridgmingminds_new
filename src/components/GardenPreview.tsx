import { useTheme } from "../theme/ThemeProvider";
import React, { memo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { plantCareStatus } from "../../shared/garden-care.mjs";
import {
  DEFAULT_POSITIONS,
  GARDEN_VIEWBOX,
} from "../../shared/garden-layout.mjs";
import type { Plot } from "../types";
import { GardenIsland, MeadowPlant } from "./GardenIsland";

import { MotionView } from "./Motion";

export const GardenPreview = memo(function GardenPreview({
  plots,
  decorations,
  now,
}: {
  plots: Plot[];
  decorations: string[];
  now: number;
}) {
  const { T } = useTheme();

  const [width, setWidth] = useState(0);
  const height = width * (GARDEN_VIEWBOX.height / GARDEN_VIEWBOX.width);
  const size = Math.max(46, Math.min(64, width * 0.16));
  const plants = plots
    .map((plot, index) => ({
      plot,
      position:
        plot.position || DEFAULT_POSITIONS[index % DEFAULT_POSITIONS.length],
      status: plantCareStatus(plot, now),
    }))
    .filter(({ plot }) => plot.plantType)
    .sort((a, b) => a.position.y - b.position.y);
  const healthy = plants.filter(({ status }) => status === "healthy").length;
  const thirsty = plants.filter(({ status }) => status === "thirsty").length;
  const dead = plants.filter(({ status }) => status === "dead").length;
  const care = [
    healthy ? `${healthy} healthy` : "",
    thirsty ? `${thirsty} ${thirsty === 1 ? "needs" : "need"} water` : "",
    dead ? `${dead} dead` : "",
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <View testID="garden-preview" style={styles.preview}>
      <MotionView
        testID="garden-preview-board"
        onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
        style={styles.board}
      >
        <GardenIsland decorations={decorations} />
        {width > 0 &&
          plants.map(({ plot, position, status }) => {
            const type = plot.plantType!;
            const stage = Math.max(0, Math.min(3, Math.floor(plot.growth)));
            const species = type[0].toUpperCase() + type.slice(1);
            return (
              <View
                key={plot.id}
                testID={`garden-preview-plant-${plot.id}`}
                pointerEvents="none"
                accessible
                accessibilityRole="image"
                accessibilityLabel={`${species}, growth ${stage} of 3, ${status === "thirsty" ? "needs water" : status}`}
                style={{
                  position: "absolute",
                  width: size,
                  height: size,
                  left: position.x * width - size / 2,
                  top: position.y * height - size * 0.94,
                  zIndex: 2 + Math.round(position.y * 100),
                }}
              >
                <MeadowPlant
                  type={type}
                  growth={plot.growth}
                  doodle={plot.doodle}
                  size={size}
                  dead={status === "dead"}
                  animate
                  motionKey={`${plot.plantId || plot.id}:${plot.growth}:${plot.lastWateredAt || ""}`}
                />
              </View>
            );
          })}
      </MotionView>
      <Text testID="garden-preview-care" style={T.small}>
        {care || "No plants yet"}
      </Text>
    </View>
  );
});

const styles = StyleSheet.create({
  preview: { gap: 8 },
  board: {
    width: "100%",
    maxWidth: 360,
    alignSelf: "center",
    aspectRatio: GARDEN_VIEWBOX.width / GARDEN_VIEWBOX.height,
  },
});
