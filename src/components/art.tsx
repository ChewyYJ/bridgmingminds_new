import React from "react";
import { BRAND } from "../../shared/brand.mjs";
import { View } from "react-native";
import Svg, {
  Path,
  Circle,
  Ellipse,
  G,
  Line,
  Defs,
  LinearGradient,
  Stop,
} from "react-native-svg";
export function Flower({
  x = 0,
  y = 0,
  scale = 1,
  color = "#F5C673",
  type = "daisy",
}: {
  x?: number;
  y?: number;
  scale?: number;
  color?: string;
  type?: string;
}) {
  return (
    <G transform={`translate(${x} ${y}) scale(${scale})`}>
      <Path
        d="M0 0 Q-8 -40 0 -85"
        stroke="#51745A"
        strokeWidth="5"
        fill="none"
      />
      <Path
        d="M-2 -25 C-32 -29 -37 -54 -30 -52 Q-3 -52 -2 -25"
        fill="#8BA876"
      />
      <Path d="M-2 -47 C24 -47 33 -68 24 -66 Q1 -66 -2 -47" fill="#6F9463" />
      {type === "tulip" ? (
        <Path
          d="M-22 -103 L-11 -89 L0 -106 L11 -89 L22 -103 Q22 -63 0 -65 Q-22 -64 -22 -103"
          fill={color}
        />
      ) : (
        <G transform="translate(0 -90)">
          {[0, 60, 120, 180, 240, 300].map((a) => (
            <Ellipse
              key={a}
              cx="0"
              cy="-16"
              rx="10"
              ry="17"
              fill={color}
              transform={`rotate(${a})`}
            />
          ))}
          <Circle r="10" fill="#B7884C" />
          <Circle cx="-2" cy="-2" r="5" fill="#E0B451" />
        </G>
      )}
    </G>
  );
}
export function SproutArt({
  stage = 1,
  type = "daisy",
  size = 120,
}: {
  stage?: number;
  type?: string;
  size?: number;
}) {
  const color =
    type === "lavender"
      ? "#B5A2D5"
      : type === "tulip"
        ? "#DEA08D"
        : type === "sunflower"
          ? "#EAC461"
          : "#F1E8CA";
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 140 140"
      accessibilityLabel={`${type} ${stage === 0 ? "seed" : stage === 1 ? "sprout" : stage === 2 ? "growing plant" : "bloom"}`}
    >
      <Ellipse cx="70" cy="121" rx="44" ry="10" fill="#D4DCC1" />
      {stage === 0 ? (
        <>
          <Ellipse cx="70" cy="113" rx="9" ry="6" fill="#A48866" />
          <Path
            d="M68 113 Q73 102 78 105"
            stroke="#77965C"
            strokeWidth="3"
            fill="none"
          />
        </>
      ) : stage < 3 ? (
        <>
          <Path
            d={`M70 119 Q66 89 72 ${stage === 1 ? 82 : 62}`}
            stroke="#557651"
            strokeWidth="4"
            fill="none"
          />
          <Path d="M70 100 Q33 97 39 76 Q67 77 70 100" fill="#8CA779" />
          <Path
            d={`M70 90 Q${stage === 1 ? "98 87 98 67 Q74 68" : "111 74 101 54 Q73 57"} 70 90`}
            fill="#668D62"
          />
          {stage === 2 && (
            <Ellipse cx="72" cy="55" rx="10" ry="15" fill={color} />
          )}
        </>
      ) : (
        <Flower x={70} y={120} scale={0.85} color={color} type={type} />
      )}
    </Svg>
  );
}
export function GardenScene({
  variant = "hero",
  width = "100%",
  height = 310,
}: {
  variant?: "hero" | "garden" | "welcome";
  width?: any;
  height?: number;
}) {
  return (
    <View style={{ width, height }}>
      <Svg
        width="100%"
        height="100%"
        viewBox="0 0 600 390"
        accessibilityLabel="An illustrated garden with blooming flowers, raised beds, a watering can, and a sunny sky"
      >
        <Defs>
          <LinearGradient id="ground" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#DAE2BE" />
            <Stop offset="1" stopColor="#C6D6AA" />
          </LinearGradient>
        </Defs>
        <G>
          <Circle cx="454" cy="65" r="31" fill="#EEDAA1" opacity=".8" />
          {[0, 60, 120, 180, 240, 300].map((a) => (
            <Line
              key={a}
              x1="454"
              y1="20"
              x2="454"
              y2="12"
              stroke="#DECE93"
              strokeWidth="2"
              transform={`rotate(${a} 454 65)`}
            />
          ))}
          <Path
            d="M88 88 Q80 70 100 68 Q105 41 124 58 Q151 54 152 76 Q170 82 155 92 Z"
            fill="#FFFDF4"
            opacity=".85"
          />
          <Path
            d="M343 47 Q338 31 354 29 Q365 12 379 30 Q402 27 400 43 Q416 53 397 56 L350 56Z"
            fill="#FFFDF4"
            opacity=".8"
          />
          <Path
            d="M30 269 C13 232 59 207 123 212 C125 167 216 159 266 184 C312 153 378 157 416 194 C464 174 529 202 531 229 C589 230 604 269 577 295 C606 343 549 366 478 354 C425 384 375 373 340 359 C291 388 225 378 196 360 C118 378 59 357 62 338 C13 333 8 299 30 269Z"
            fill="url(#ground)"
          />
          <Ellipse
            cx="309"
            cy="286"
            rx="229"
            ry="61"
            fill="#B5C49F"
            opacity=".3"
          />
          <G transform="translate(340 103)">
            <Path
              d="M0 121 L0 51 Q0 0 44 0 Q89 0 89 51 L89 140"
              stroke="#B1AD80"
              strokeWidth="7"
              fill="none"
            />
            <Path
              d="M7 35 L86 93 M1 66 L87 124 M18 12 L88 61 M0 98 L68 12 M23 133 L89 67 M0 68 L58 6"
              stroke="#B7B485"
              strokeWidth="3"
              fill="none"
            />
            <Path
              d="M4 124 Q-20 95 7 79 Q22 56 6 39 Q5 18 33 3 M87 136 Q68 111 88 86 Q111 66 82 41"
              stroke="#6D8D58"
              strokeWidth="4"
              fill="none"
            />
            {[
              [5, 106],
              [-3, 82],
              [13, 53],
              [12, 24],
              [33, 7],
              [85, 117],
              [86, 84],
              [89, 61],
            ].map(([x, y], i) => (
              <G key={i}>
                <Ellipse
                  cx={x}
                  cy={y}
                  rx="12"
                  ry="6"
                  fill={i % 2 ? "#829D60" : "#9AAE72"}
                  transform={`rotate(${i % 2 ? 45 : -35} ${x} ${y})`}
                />
                {i % 3 === 0 && (
                  <Circle cx={x + 9} cy={y - 7} r="6" fill="#DDAB9D" />
                )}
              </G>
            ))}
          </G>
          <G transform="translate(92 222)">
            <Path d="M0 0 L131 -30 L230 13 L98 53Z" fill="#BD9D73" />
            <Path d="M8 1 L131 -23 L218 14 L98 43Z" fill="#8D775A" />
            <Path d="M0 0 L98 44 L98 70 L0 26Z" fill="#D3B991" />
            <Path d="M98 44 L230 13 L230 39 L98 70Z" fill="#B49973" />
            <Path
              d="M4 16 L94 57 M107 57 L225 29"
              stroke="#A98F6B"
              strokeWidth="2"
              opacity=".45"
            />
            <Flower x={51} y={9} scale={0.78} color="#E8BD66" />
            <Flower x={95} y={-1} scale={0.95} color="#EFD8B9" />
            <Flower x={139} y={-6} scale={0.82} color="#DDA092" type="tulip" />
            <Flower x={175} y={13} scale={0.74} color="#B5A0CF" />
            <Path
              d="M65 26 Q65 6 55 7 M66 16 Q85 2 86 13 M119 25 Q115 9 104 6 M122 22 Q131 7 137 9"
              stroke="#698C58"
              strokeWidth="5"
              fill="none"
            />
          </G>
          <G transform="translate(359 265)">
            <Path d="M0 0 L70 -19 L129 10 L58 35Z" fill="#BA9B73" />
            <Path d="M9 0 L69 -11 L115 10 L59 28Z" fill="#937D5B" />
            <Path d="M0 0 L58 35 L58 56 L0 23Z" fill="#D3B991" />
            <Path d="M58 35 L129 10 L129 30 L58 56Z" fill="#AB9069" />
            <Flower x={39} y={6} scale={0.75} color="#F1D26F" />
            <Flower x={77} y={11} scale={0.56} color="#E3AF9B" type="tulip" />
            <Path
              d="M55 22 Q46 5 37 14 M58 20 Q65 -4 75 4"
              stroke="#739263"
              strokeWidth="5"
              fill="none"
            />
          </G>
          {[
            [294, 306, 21, 10],
            [323, 325, 24, 11],
            [358, 345, 26, 12],
          ].map(([x, y, rx, ry], i) => (
            <Ellipse
              key={i}
              cx={x}
              cy={y}
              rx={rx}
              ry={ry}
              fill="#EDE4CC"
              stroke="#D2C8A9"
              strokeWidth="2"
              transform={`rotate(-10 ${x} ${y})`}
            />
          ))}
          <G transform="translate(73 293) rotate(-10)">
            <Ellipse cx="22" cy="27" rx="24" ry="7" fill="#AAB998" />
            <Path d="M0 0 L42 0 L37 27 Q19 34 4 27Z" fill="#87A9A1" />
            <Ellipse cx="21" cy="0" rx="21" ry="6" fill="#AAC3B1" />
            <Path
              d="M39 5 Q69 -6 58 20 Q52 28 38 19"
              fill="none"
              stroke="#6C9487"
              strokeWidth="5"
            />
            <Path d="M4 13 L-16 0 L-24 2 L-7 24Z" fill="#769B91" />
            <Path d="M-22 -4 L-29 8" stroke="#B3C7B2" strokeWidth="5" />
          </G>
          <G transform="translate(474 292)">
            <Path d="M0 0 L29 -8 L32 17 L3 26Z" fill="#E7C69E" />
            <Path d="M3 3 L26 -3 L27 15 L6 21Z" fill="#FAF1D8" />
            <Path d="M17 13 Q7 3 14 0 Q22 -2 17 13" fill="#97A57A" />
          </G>
          {[
            [64, 237],
            [527, 282],
            [209, 348],
            [462, 337],
            [282, 203],
          ].map(([x, y], i) => (
            <G key={i}>
              <Path
                d={`M${x} ${y} l-3 -9 m3 9 l5 -12 m-5 12 l9 -5`}
                stroke="#8DA170"
                strokeWidth="2"
                fill="none"
              />
            </G>
          ))}
          <G transform="translate(256 128) rotate(-20)">
            <Ellipse cx="-6" cy="0" rx="7" ry="10" fill="#E1B5A0" />
            <Ellipse cx="6" cy="0" rx="7" ry="10" fill="#ECD1AA" />
            <Path d="M0 -6 L0 9" stroke="#8D8B68" strokeWidth="2" />
          </G>
          <G transform="translate(480 157) rotate(20)">
            <Ellipse cx="-4" cy="0" rx="5" ry="7" fill="#B8A6CC" />
            <Ellipse cx="4" cy="0" rx="5" ry="7" fill="#CFBFD9" />
          </G>
        </G>
      </Svg>
    </View>
  );
}
export function BridgingMindsMark({ size = 40 }: { size?: number }) {
  return (
    <Svg
      style={{ flexShrink: 0 }}
      width={size}
      height={size}
      viewBox="0 0 64 64"
      accessibilityLabel="BridgingMinds"
    >
      <Path d={BRAND.stem} fill={BRAND.forest} />
      <Path d={BRAND.leaf} fill={BRAND.sage} />
      <Circle cx="24" cy="12" r="4" fill={BRAND.gold} />
    </Svg>
  );
}
