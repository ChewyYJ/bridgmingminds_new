import React from "react";
import { Image, View } from "react-native";

/** Decorative town art; movement, labels and interactions are native controls. */
export function PixelStreetBackdrop({ width, height }: { width: number; height: number }) {
  return (
    <View pointerEvents="none" accessible={false} style={{ position: "absolute", inset: 0, width, height }}>
      <Image source={require("../../assets/role3/debate-street.png")} resizeMode="cover"
        accessible={false} style={{ width, height }} />
    </View>
  );
}
