import React from "react";
import { Image, Platform, View, type ImageStyle } from "react-native";
import Svg, { G, Path, Rect } from "react-native-svg";

export type PixelSceneKind = "street" | "skyline" | "library" | "hall" | "room";
const artwork = {
  street: require("../../assets/role3/scenes/street-west.png"),
  east: require("../../assets/role3/scenes/street-east.png"),
  skyline: require("../../assets/role3/scenes/home-terrace.png"),
  library: require("../../assets/role3/scenes/library.png"),
  hall: require("../../assets/role3/scenes/civic-hall.png"),
};
const pixelStyle: ImageStyle & { imageRendering?: string } = Platform.OS === "web" ? { imageRendering: "pixelated" } : {};

/** Full-bleed bundled art. The walkable world uses two distinct 3:1 neighbourhood panels. */
export function PixelScene({ scene = "street", width, height, absolute = false }: {
  scene?: PixelSceneKind; width: number; height: number; absolute?: boolean;
}) {
  const panorama = scene === "street" && width > height * 3.5;
  return <View pointerEvents="none" accessible={false} testID={`pixel-scene-${scene}`}
    style={{ width, height, overflow: "hidden", backgroundColor: "#EAE3DA", ...(absolute ? { position: "absolute", inset: 0 } : {}) }}>
    {scene === "room" ? <Svg width={width} height={height} viewBox="0 0 480 200" preserveAspectRatio="xMidYMid slice"><Room /></Svg>
      : panorama ? <View style={{ width, height, flexDirection: "row" }}>
        {[artwork.street, artwork.east].map((source, index) => <Image key={index} accessible={false} source={source} resizeMode="cover" style={[{ width: width / 2, height }, pixelStyle]} />)}
      </View>
      : <Image accessible={false} source={artwork[scene]} resizeMode="cover" style={[{ width, height }, pixelStyle]} />}
  </View>;
}
function Tree({ x, y }: { x: number; y: number }) {
  return <G x={x} y={y}>
    <Rect x={20} y={25} width={5} height={58} fill="#8A7C68" /><Rect x={24} y={32} width={2} height={51} fill="#B0A18B" />
    <Path d="M8 9H15V2H29V7H36V15H44V31H38V39H29V43H13V37H5V30H0V18H8Z" fill="#A3A18C" />
    <Path d="M13 9H26V13H33V23H27V29H14V24H7V16H13Z" fill="#BEBBA4" />
    <Path d="M11 12H16V16H11ZM25 21H31V25H25ZM18 30H22V34H18ZM7 26H11V30H7Z" fill="#D6D0B7" />
    <Rect x={12} y={80} width={22} height={10} fill="#C1B6A6" /><Rect x={10} y={79} width={26} height={3} fill="#A29785" />
  </G>;
}
function Room() {
  return <G>
    <Rect width={480} height={164} fill="#EEE7DF" />
    {[42, 110, 178, 246, 314, 382, 450].map(x => <Rect key={x} x={x} width={2} height={164} fill="#E4DBD0" />)}
    <Rect x={28} y={28} width={106} height={101} fill="#C9BDAE" /><Rect x={34} y={34} width={94} height={88} fill="#F8F5ED" />
    <Rect x={79} y={34} width={4} height={89} fill="#C5B9A7" /><Rect x={34} y={76} width={94} height={4} fill="#C5B9A7" />
    <Rect x={23} y={129} width={116} height={6} fill="#BEB19F" /><Rect y={163} width={480} height={37} fill="#DACFC2" />
    {[174, 188].map(y => <Rect key={y} y={y} width={480} height={1} fill="#C5B8A8" />)}
    <Tree x={386} y={77} />
    <Rect x={344} y={64} width={40} height={96} fill="#C5B6A3" /><Rect x={350} y={71} width={28} height={81} fill="#E6DDCD" />
    {[86, 111, 137].map(y => <G key={y}><Rect x={350} y={y} width={28} height={3} fill="#A79B88" />{[354, 361, 369].map((x, i) => <Rect key={x} x={x} y={y - 16 + i * 2} width={5} height={16 - i * 2} fill={["#A49780", "#BDA992", "#948F7C"][i]} />)}</G>)}
  </G>;
}
