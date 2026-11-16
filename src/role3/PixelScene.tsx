import React, { useId } from "react";
import { Platform, View } from "react-native";
import Svg, { Defs, FeColorMatrix, Filter, G, Image, Path, Rect, Text as SvgText } from "react-native-svg";

export type PixelSceneKind = "street" | "skyline" | "library" | "hall" | "room";
const town = require("../../assets/role3/licensed/retropixelcity.png");
const distant = require("../../assets/role3/licensed/distant-city.png");
const middle = require("../../assets/role3/licensed/middle-city.png");
const near = require("../../assets/role3/licensed/near-city.png");
// A display-only palette: preserve the licensed originals and their alpha.
const warmMatrix = ".15 .50 .05 0 .22 .14 .47 .05 0 .20 .13 .43 .04 0 .18 0 0 0 1 0";

/** Bundled CC0 art with native architectural details. See licensed/CREDITS.md. */
export function PixelScene({ scene = "street", width, height, absolute = false }: {
  scene?: PixelSceneKind; width: number; height: number; absolute?: boolean;
}) {
  const id = `town-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  return <View pointerEvents="none" accessible={false} testID={`pixel-scene-${scene}`}
    style={{ width, height, overflow: "hidden", ...(absolute ? { position: "absolute", inset: 0 } : {}) }}>
    <Svg width={width} height={height} viewBox={scene === "street" ? "0 0 960 280" : "0 0 480 200"} preserveAspectRatio="xMidYMid slice"
      {...(Platform.OS === "web" ? { style: { imageRendering: "pixelated" } as any, shapeRendering: "crispEdges" } : {})}>
      <Defs><Filter id={id}><FeColorMatrix type="matrix" values={warmMatrix} /></Filter></Defs>
      <Rect width={960} height={280} fill="#F1EDE7" />
      {scene === "street" ? <Street filterId={id} /> : scene === "room" ? <Room /> : <>
        <G filter={`url(#${id})`} opacity={scene === "skyline" ? 0.65 : 0.32}>
          <Image href={distant} x={0} y={-57} width={480} height={270} />
          <Image href={middle} x={0} y={-57} width={480} height={270} />
          <Image href={near} x={0} y={-57} width={480} height={270} />
        </G>
        {scene !== "skyline" && <>
          <G filter={`url(#${id})`} opacity={0.85}><Image href={town} x={0} y={24} width={480} height={131} preserveAspectRatio="none" /></G>
          <Rect y={154} width={480} height={46} fill="#D8CEC2" /><Rect y={155} width={480} height={3} fill="#B8AB9B" />
          {[168, 183, 198].map((y, row) => <G key={y}><Rect y={y} width={480} height={1} fill="#C1B6A8" />{Array.from({ length: 13 }, (_, i) => <Rect key={i} x={i * 40 + (row % 2 ? 20 : 0)} y={y - 14} width={1} height={14} fill="#C1B6A8" />)}</G>)}
          {scene === "library" && <Library />}{scene === "hall" && <Hall />}
          <Tree x={15} y={78} /><Tree x={425} y={78} />
        </>}
      </>}
    </Svg>
  </View>;
}

function Street({ filterId }: { filterId: string }) {
  return <G>
    <G filter={`url(#${filterId})`} opacity={0.23}>
      <Image href={distant} x={0} y={-160} width={960} height={540} />
      <Image href={middle} x={0} y={-160} width={960} height={540} />
    </G>
    {/* Keep original pixels at 2x, independent of the walkable street width. */}
    <G filter={`url(#${filterId})`} opacity={0.88}>
      {[0, 448, 896].map(x => <Image key={x} href={town} x={x} y={86} width={448} height={122} />)}
    </G>
    <Rect y={207} width={960} height={73} fill="#D8CEC2" />
    <Rect y={207} width={960} height={3} fill="#B8AB9B" />
    {[224, 242, 260, 278].map((y, row) => <G key={y}>
      <Rect y={y} width={960} height={1} fill="#C1B6A8" />
      {Array.from({ length: 25 }, (_, i) => <Rect key={i} x={i * 40 + (row % 2 ? 20 : 0)} y={y - 17} width={1} height={17} fill="#C1B6A8" />)}
    </G>)}
    <Tree x={320} y={120} /><Tree x={760} y={120} />
    <Rect x={58} y={100} width={94} height={19} fill="#EAE1D4" />
    <SvgText x={105} y={113} textAnchor="middle" fontSize={10} fontWeight="bold" fill="#6D6151" letterSpacing={2}>BOOKS</SvgText>
    <Rect x={508} y={100} width={94} height={19} fill="#EAE1D4" />
    <SvgText x={555} y={113} textAnchor="middle" fontSize={10} fontWeight="bold" fill="#6D6151" letterSpacing={2}>CAFÉ</SvgText>
  </G>;
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
function Library() {
  return <G>
    <Rect x={110} y={55} width={250} height={100} fill="#D4C7B6" /><Rect x={106} y={51} width={258} height={7} fill="#A99A88" />
    <Rect x={126} y={66} width={218} height={23} fill="#F1E9DC" /><SvgText x={235} y={82} textAnchor="middle" fontSize={11} fontWeight="bold" fill="#6D6151" letterSpacing={2}>LIBRARY</SvgText>
    <Rect x={126} y={95} width={218} height={60} fill="#766E60" />
    {[134, 165, 196, 254, 285, 316].map((x, index) => <G key={x}>
      <Rect x={x} y={102} width={22} height={46} fill="#BCB29E" />
      {[108, 126].map(y => <G key={y}>{[0, 5, 10, 15].map((offset, j) => <Rect key={offset} x={x + 2 + offset} y={y - ((index + j) % 3)} width={3} height={12} fill={["#8A7F69", "#E0D5BC", "#B49E85"][(index + j) % 3]} />)}<Rect x={x} y={y + 13} width={22} height={2} fill="#6F6557" /></G>)}
    </G>)}
    <Rect x={225} y={99} width={20} height={56} fill="#D8CDBB" /><Rect x={228} y={105} width={14} height={32} fill="#AAA48E" />
  </G>;
}
function Hall() {
  return <G>
    <Path d="M100 65H112V59H124V53H136V47H148V41H160V35H172V29H184V23H196V17H280V23H292V29H304V35H316V41H328V47H340V53H352V59H364V65Z" fill="#A99B89" />
    <Path d="M123 60L237 24L343 60Z" fill="#E7DDD0" />
    <Rect x={114} y={65} width={246} height={89} fill="#D0C4B3" /><Rect x={126} y={75} width={222} height={77} fill="#8E8475" />
    {[134, 175, 279, 320].map(x => <G key={x}><Rect x={x} y={77} width={15} height={75} fill="#EBE3D6" /><Rect x={x + 3} y={77} width={2} height={75} fill="#CBC0AE" /><Rect x={x - 4} y={75} width={23} height={5} fill="#F1EBDD" /></G>)}
    <Rect x={218} y={94} width={39} height={58} fill="#C9BCA7" /><Rect x={235} y={99} width={3} height={53} fill="#817562" />
    {[153, 159, 165].map((y, i) => <Rect key={y} x={106 - i * 5} y={y} width={262 + i * 10} height={5} fill={i % 2 ? "#BBAF9D" : "#DFD4C3"} />)}
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
