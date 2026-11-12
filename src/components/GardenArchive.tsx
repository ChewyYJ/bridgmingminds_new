import React, { useState } from "react";
import { View, Text } from "react-native";
import { ArchivedPlant } from "../types";
import { Button, C, Card, T } from "./ui";
import { MeadowPlant } from "./GardenIsland";

export function GardenArchive({
  plants,
  disabled,
  hasSpace,
  onRestore,
}: {
  plants: ArchivedPlant[];
  disabled: boolean;
  hasSpace: boolean;
  onRestore: (plant: ArchivedPlant) => void;
}) {
  const [visible, setVisible] = useState(6);
  return (
    <View testID="garden-archive" style={{ gap: 14 }}>
      <Text style={T.small}>Care pauses here. Returning is free.</Text>
      {!plants.length ? <Text style={T.body}>No archived plants.</Text> : null}
      {!hasSpace && plants.length > 0 ? (
        <Text style={[T.small, { color: C.forest }]}>
          Clear or archive a plant to make room.
        </Text>
      ) : null}
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
        {plants.slice(0, visible).map((plant) => (
          <Card
            key={plant.id}
            style={{ flexGrow: 1, flexBasis: 230, gap: 12, padding: 16 }}
          >
            <View
              style={{ flexDirection: "row", gap: 12, alignItems: "center" }}
            >
              <MeadowPlant
                type={plant.plantType!}
                growth={plant.growth}
                doodle={plant.doodle}
                size={60}
              />
              <View style={{ flex: 1 }}>
                <Text style={T.h3}>
                  {plant.plantType === "doodle"
                    ? "Your doodle"
                    : `${plant.plantType?.charAt(0).toUpperCase()}${plant.plantType?.slice(1)}`}
                </Text>
                <Text style={T.small}>
                  {["Seed", "Sprout", "Growing", "Fully grown"][plant.growth]} ·
                  Paused
                </Text>
              </View>
            </View>
            <Button
              label="Return to garden"
              variant="secondary"
              icon="corner-up-left"
              disabled={disabled || !hasSpace}
              onPress={() => onRestore(plant)}
            />
          </Card>
        ))}
      </View>
      {plants.length > visible ? (
        <Button
          label="Show more"
          variant="ghost"
          onPress={() => setVisible((count) => count + 6)}
        />
      ) : null}
    </View>
  );
}
