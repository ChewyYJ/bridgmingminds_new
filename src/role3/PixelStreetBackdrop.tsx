import React from "react";
import { PixelScene } from "./PixelScene";
export { PixelScene } from "./PixelScene";

/** Decorative town art; movement, labels and interactions are native controls. */
export function PixelStreetBackdrop({ width, height }: { width: number; height: number }) {
  return <PixelScene scene="street" width={width} height={height} absolute />;
}
