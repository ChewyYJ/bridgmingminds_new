import React, { memo, useId } from "react";
import Svg, {
  Circle,
  ClipPath,
  Defs,
  Ellipse,
  FeColorMatrix,
  Filter,
  G,
  LinearGradient,
  Path,
  Stop,
} from "react-native-svg";
import {
  GARDEN_BOUNDARY,
  GARDEN_VIEWBOX,
  isPlantablePosition,
} from "../../shared/garden-layout.mjs";
import type { Doodle } from "../types";
import { MotionPulse } from "./Motion";

// This is also the server's planting boundary. Keep the visible edge exact.
const landPath = `${GARDEN_BOUNDARY.map(
  ([x, y], index) =>
    `${index === 0 ? "M" : "L"}${x * GARDEN_VIEWBOX.width} ${y * GARDEN_VIEWBOX.height}`,
).join(" ")}Z`;

function noise(index: number) {
  const value = Math.sin(index * 127.1 + 311.7) * 43758.5453;
  return value - Math.floor(value);
}

const rounded = (value: number) => Math.round(value * 10) / 10;

// Stable, batched SVG paths give the meadow its inked texture without hundreds
// of separate React elements or a different grass pattern on every render.
function makeMeadowTexture() {
  const grass = ["", "", ""];
  const clover = ["", ""];
  const flecks = ["", ""];
  for (let row = 0; row < 31; row += 1) {
    for (let column = 0; column < 46; column += 1) {
      const index = row * 46 + column;
      const x = 96 + column * 17 + noise(index) * 13;
      const y = 119 + row * 17 + noise(index + 1700) * 12;
      if (!isPlantablePosition({ x: x / 1000, y: y / 760 })) continue;
      const kind = noise(index + 3500);
      const h = 4.3 + noise(index + 5200) * 5.5;
      const px = rounded(x);
      const py = rounded(y);
      if (kind < 0.68) {
        const ink = index % 3;
        grass[ink] +=
          `M${rounded(x - 4)} ${py}q1 -4 -2 -${rounded(h)}M${px} ${rounded(y + 1)}q-1 -${rounded(h)} 1 -${rounded(h + 3)}M${rounded(x + 3)} ${py}q2 -4 5 -${rounded(h - 1)} `;
        if (kind < 0.17) {
          grass[ink] +=
            `M${rounded(x - 1)} ${py}q-4 -3 -7 -3M${rounded(x + 1)} ${py}q6 -4 9 -3 `;
        }
      } else if (kind < 0.9) {
        const s = 2 + noise(index + 100) * 1.8;
        clover[index % 2] +=
          `M${px} ${py}c-${rounded(s * 3)} 0 -${rounded(s * 3)} -${rounded(s * 2.5)} -${rounded(s)} -${rounded(s * 2.1)}c-${rounded(s)} -${rounded(s * 2.4)} ${rounded(s * 2)} -${rounded(s * 3.2)} ${rounded(s * 2)} -${rounded(s)}c${rounded(s * 2.5)} -${rounded(s)} ${rounded(s * 3)} ${rounded(s * 1.8)} ${rounded(s)} ${rounded(s * 2)}Z `;
      } else {
        flecks[index % 2] +=
          `M${px} ${py}l${rounded(2 + noise(index + 55) * 2)} -1 `;
      }
    }
  }
  return { grass, clover, flecks };
}

const texture = makeMeadowTexture();
const stones = [
  [572, 507, -13],
  [621, 494, 5],
  [665, 474, -17],
  [699, 447, 15],
];

function SteppingStones() {
  return (
    <G>
      {stones.map(([x, y, angle], index) => (
        <G key={index} transform={`translate(${x} ${y}) rotate(${angle})`}>
          <Ellipse cx="2" cy="4" rx="22" ry="11" fill="#426C28" opacity=".24" />
          <Path
            d="M-20 0Q-18-10-4-11Q13-13 20-5Q25 5 13 10Q-4 13-18 7Z"
            fill={index % 2 ? "#DDDBAB" : "#E7DFC0"}
            stroke="#73844D"
            strokeWidth="1.3"
          />
          <Path
            d="M-13-5Q-5-9 8-7M-15 4L-10 6"
            fill="none"
            stroke="#F6ECCE"
            strokeWidth="2"
            strokeLinecap="round"
          />
          <Path
            d="M7 4l4-1M-2 6l2 1"
            stroke="#B4B88B"
            strokeWidth="1.3"
            strokeLinecap="round"
          />
        </G>
      ))}
    </G>
  );
}

function Birdbath() {
  return (
    <G transform="translate(741 324)">
      <Ellipse cx="5" cy="8" rx="31" ry="11" fill="#365C22" opacity=".2" />
      <Path
        d="M-22 4Q-19-4-9-5L-5-39H7L11-5Q24-2 23 5Q2 15-22 4Z"
        fill="#B9C4A4"
        stroke="#677C52"
        strokeWidth="1.6"
      />
      <Path d="M-3-36L-4-4Q2 0 6-4L4-36" fill="#D7DDC6" />
      <Ellipse
        cy="-43"
        rx="33"
        ry="12"
        fill="#B4C3A0"
        stroke="#677C52"
        strokeWidth="1.6"
      />
      <Path
        d="M-33-44Q-27-21 0-21Q27-21 33-44Q11-31-33-44Z"
        fill="#CDD5BA"
        stroke="#677C52"
        strokeWidth="1.6"
      />
      <Ellipse
        cy="-44"
        rx="28"
        ry="8"
        fill="#8CCFD0"
        stroke="#759DA2"
        strokeWidth="1.2"
      />
      <Path
        d="M-18-45Q-8-49 4-46M9-42l9-1"
        fill="none"
        stroke="#D9F2DE"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
      <G transform="translate(23 -49)">
        <Path
          d="M-9 0Q-13-10-5-13Q4-14 6-7L15-4L6-1Q0 6-9 0Z"
          fill="#F0C673"
          stroke="#6D7545"
          strokeWidth="1.3"
        />
        <Path
          d="M-8-1L-20-10L-13 2M-3 1L-4 7M1 1L2 6"
          fill="none"
          stroke="#6D7545"
          strokeWidth="1.3"
          strokeLinecap="round"
        />
        <Circle cx="2" cy="-8" r="1.1" fill="#344C35" />
      </G>
    </G>
  );
}

export const GardenIsland = memo(function GardenIsland({
  width = "100%",
  height = "100%",
  decorations,
}: {
  width?: number | string;
  height?: number | string;
  decorations: string[];
}) {
  const uid = useId().replace(/:/g, "");
  const topId = `meadow-top-${uid}`;
  const sideId = `meadow-side-${uid}`;
  const clipId = `meadow-clip-${uid}`;
  const sideClipId = `meadow-side-clip-${uid}`;
  return (
    <Svg
      width={width}
      height={height}
      viewBox="0 0 1000 760"
      pointerEvents="none"
      accessible={false}
      accessibilityElementsHidden
    >
      <Defs>
        <LinearGradient id={topId} x1="0" y1="0" x2=".55" y2="1">
          <Stop offset="0" stopColor="#A6CF3B" />
          <Stop offset=".55" stopColor="#94C32D" />
          <Stop offset="1" stopColor="#85B427" />
        </LinearGradient>
        <LinearGradient id={sideId} x1="0" y1="0" x2=".15" y2="1">
          <Stop offset="0" stopColor="#547D24" />
          <Stop offset="1" stopColor="#385823" />
        </LinearGradient>
        <ClipPath id={clipId}>
          <Path d={landPath} />
        </ClipPath>
        <ClipPath id={sideClipId}>
          <Path d={landPath} transform="translate(0 40)" />
        </ClipPath>
      </Defs>

      <Path
        d={landPath}
        transform="translate(12 69)"
        fill="#435332"
        opacity=".07"
      />
      <Path
        d={landPath}
        transform="translate(7 58)"
        fill="#3D4F2D"
        opacity=".14"
      />
      <Path
        d={landPath}
        transform="translate(2 46)"
        fill="#344E23"
        opacity=".24"
      />
      <Path
        d={landPath}
        transform="translate(0 40)"
        fill={`url(#${sideId})`}
        stroke="#426522"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <G clipPath={`url(#${sideClipId})`}>
        <Path
          d="M105 287Q243 382 374 329M188 523Q373 688 646 611Q840 553 866 409"
          fill="none"
          stroke="#638437"
          strokeWidth="4"
          opacity=".65"
        />
        <Path
          d="M194 536Q360 684 628 630Q813 580 863 461"
          fill="none"
          stroke="#304D23"
          strokeWidth="2"
          opacity=".45"
        />
        {[223, 264, 316, 379, 438, 502, 577, 644, 706, 763, 806, 835].map(
          (x, index) => (
            <Path
              key={x}
              d={`M${x} ${575 + Math.sin(index / 3) * 50}l-2 ${8 + (index % 4) * 2}`}
              fill="none"
              stroke="#78924A"
              strokeWidth="1.4"
              opacity=".35"
              strokeLinecap="round"
            />
          ),
        )}
      </G>

      <Path
        d={landPath}
        fill={`url(#${topId})`}
        stroke="#709A27"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <G clipPath={`url(#${clipId})`}>
        <Path
          d="M94 184Q252 98 477 168Q377 204 312 247Q192 285 94 236Z"
          fill="#B5D84A"
          opacity=".18"
        />
        <Path
          d="M377 476Q559 438 748 370Q851 431 783 543Q674 638 432 612Q360 548 377 476Z"
          fill="#7BAB29"
          opacity=".15"
        />
        <Path
          d="M464 307Q538 203 737 291Q802 347 743 374Q615 335 464 368Z"
          fill="#A9CD37"
          opacity=".18"
        />
        <Path d={texture.clover[0]} fill="#6F9F28" opacity=".54" />
        <Path d={texture.clover[1]} fill="#5D902B" opacity=".35" />
        <Path
          d={texture.grass[0]}
          fill="none"
          stroke="#567F25"
          opacity=".57"
          strokeWidth="1.3"
          strokeLinecap="round"
        />
        <Path
          d={texture.grass[1]}
          fill="none"
          stroke="#6A952A"
          opacity=".64"
          strokeWidth="1.35"
          strokeLinecap="round"
        />
        <Path
          d={texture.grass[2]}
          fill="none"
          stroke="#C1DD59"
          opacity=".7"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
        <Path
          d={texture.flecks[0]}
          stroke="#598127"
          opacity=".5"
          strokeWidth="1.7"
          strokeLinecap="round"
        />
        <Path
          d={texture.flecks[1]}
          stroke="#D0DF79"
          opacity=".7"
          strokeWidth="1.7"
          strokeLinecap="round"
        />
        {[
          [284, 206],
          [590, 231],
          [794, 387],
          [456, 558],
          [315, 526],
          [654, 575],
        ].map(([x, y], index) => (
          <G
            key={index}
            transform={`translate(${x} ${y}) rotate(${index * 23})`}
          >
            <Ellipse
              cx="1"
              cy="2"
              rx="5.5"
              ry="2.6"
              fill="#618632"
              opacity=".3"
            />
            <Path
              d="M-5 1Q-5-4 0-4Q5-4 5 0Q1 3-5 1Z"
              fill={index % 2 ? "#D1D99B" : "#CBD094"}
              stroke="#879B58"
              strokeWidth=".75"
            />
          </G>
        ))}
      </G>
      <Path
        d="M130 220.4L155 178.6L220 144.4L310 129.2L405 129.2L520 144.4L620 167.2L715 205.2"
        fill="none"
        stroke="#BEDC58"
        strokeWidth="2.8"
        opacity=".6"
        strokeLinejoin="round"
      />
      {decorations.includes("stepping_stones") && <SteppingStones />}
      {decorations.includes("birdbath") && <Birdbath />}
    </Svg>
  );
});

const stemInk = "#416D35";
const leafFill = "#89C756";

function GroundMark() {
  return (
    <>
      <Ellipse cx="50" cy="94" rx="13" ry="3" fill="#375D28" opacity=".13" />
      <Path
        d="M41 94l-3-4m8 4-1-6m10 6 2-5m3 5 4-3"
        fill="none"
        stroke="#618C35"
        opacity=".65"
        strokeWidth="1.15"
        strokeLinecap="round"
      />
    </>
  );
}

function Leaves({ wide = false }: { wide?: boolean }) {
  return (
    <G
      fill={leafFill}
      stroke={stemInk}
      strokeWidth="1.45"
      strokeLinejoin="round"
      strokeLinecap="round"
    >
      <Path
        d={
          wide
            ? "M49 78Q23 74 24 52Q47 54 49 78Z"
            : "M49 77Q27 78 27 62Q45 59 49 77Z"
        }
      />
      <Path d="M50 67Q70 68 75 49Q52 48 50 67Z" fill="#A6D764" />
      <Path
        d="M48 75L34 66M53 64L68 54"
        fill="none"
        stroke="#658F3E"
        strokeWidth="1"
      />
    </G>
  );
}

function YoungPlant({ stage, type }: { stage: number; type: string }) {
  const budColor =
    type === "tulip" ? "#F48FBC" : type === "lavender" ? "#B999F2" : "#FFD865";
  if (stage === 0) {
    return (
      <G strokeLinecap="round" strokeLinejoin="round">
        <Path
          d="M44 93Q40 87 46 83Q54 80 57 86Q57 94 44 93Z"
          fill="#BD9257"
          stroke="#735C3B"
          strokeWidth="1.4"
        />
        <Path
          d="M49 90Q48 78 54 76"
          fill="none"
          stroke={stemInk}
          strokeWidth="1.8"
        />
        <Path
          d="M53 78Q52 70 62 70Q60 79 53 78Z"
          fill="#A6D65B"
          stroke={stemInk}
          strokeWidth="1.2"
        />
        <Path d="M47 86l-2 3" stroke="#DAB780" strokeWidth="1.4" />
      </G>
    );
  }
  return (
    <G strokeLinecap="round" strokeLinejoin="round">
      <Path
        d={stage === 1 ? "M50 94Q45 77 50 64" : "M50 94Q45 69 52 47"}
        fill="none"
        stroke={stemInk}
        strokeWidth="2"
      />
      <Path
        d="M48 80Q28 81 29 65Q46 64 48 80Z"
        fill="#8FCB56"
        stroke={stemInk}
        strokeWidth="1.4"
      />
      <Path
        d={
          stage === 1
            ? "M49 70Q62 72 69 58Q54 55 49 70Z"
            : "M49 64Q69 65 73 48Q53 48 49 64Z"
        }
        fill="#ACD96F"
        stroke={stemInk}
        strokeWidth="1.4"
      />
      <Path d="M45 77L34 69" stroke="#658F3E" strokeWidth="1" />
      {stage === 2 && (
        <G>
          <Path
            d="M52 49Q40 40 45 30Q52 22 59 31Q65 43 52 49Z"
            fill={budColor}
            stroke={type === "lavender" ? "#8766BB" : "#BA7E50"}
            strokeWidth="1.5"
          />
          <Path
            d="M50 48Q43 47 42 40L52 44L60 39Q61 48 50 48Z"
            fill="#86BD50"
            stroke={stemInk}
            strokeWidth="1.3"
          />
          <Path
            d="M52 29Q48 36 52 43"
            fill="none"
            stroke={type === "tulip" ? "#D867A0" : "#C59D58"}
            strokeWidth="1.1"
          />
        </G>
      )}
    </G>
  );
}

function Daisy() {
  return (
    <G strokeLinecap="round" strokeLinejoin="round">
      <Path
        d="M50 94Q44 66 52 33"
        fill="none"
        stroke={stemInk}
        strokeWidth="2"
      />
      <Leaves />
      <G transform="translate(52 29) rotate(-8)">
        {[0, 39, 78, 118, 158, 201, 242, 282, 321].map((angle, index) => (
          <Path
            key={angle}
            d="M-3-5Q-11-14-5-22Q0-26 4-20Q9-12 3-5Z"
            transform={`rotate(${angle})`}
            fill={index % 3 ? "#FFF7DA" : "#FFE7F0"}
            stroke="#D588AD"
            strokeWidth="1.2"
          />
        ))}
        <Path
          d="M-8-1Q-8-9 1-8Q10-7 8 2Q5 10-3 8Q-9 6-8-1Z"
          fill="#FFD269"
          stroke="#BE9349"
          strokeWidth="1.3"
        />
        <Path
          d="M-3-3l.1.1M2-4l.1.1M4 1l.1.1M-2 3l.1.1"
          stroke="#D2A046"
          strokeWidth="2"
        />
      </G>
    </G>
  );
}

function Sunflower() {
  return (
    <G strokeLinecap="round" strokeLinejoin="round">
      <Path
        d="M50 94Q54 65 49 38"
        fill="none"
        stroke={stemInk}
        strokeWidth="2.5"
      />
      <Leaves wide />
      <G transform="translate(49 30) rotate(6)">
        {[0, 32, 65, 98, 130, 162, 195, 226, 259, 291, 325].map(
          (angle, index) => (
            <Path
              key={angle}
              d="M-4-8Q-10-18 0-26Q10-18 4-8Z"
              transform={`rotate(${angle})`}
              fill={index % 2 ? "#FFE04F" : "#FFD05B"}
              stroke="#CD9B37"
              strokeWidth="1.25"
            />
          ),
        )}
        <Circle r="11.5" fill="#BD874A" stroke="#8C703E" strokeWidth="1.4" />
        <Circle r="8.5" fill="#DFAB5C" />
        <Path
          d="M-4-4l.1.1M1-6l.1.1M5-3l.1.1M-6 1l.1.1M-1 0l.1.1M4 2l.1.1M-2 5l.1.1M3 6l.1.1"
          stroke="#9D783C"
          strokeWidth="1.7"
        />
      </G>
    </G>
  );
}

function Lavender() {
  const buds = [
    [48, 16, -14],
    [45, 24, -26],
    [52, 25, 19],
    [43, 32, -32],
    [52, 34, 25],
    [42, 41, -33],
    [52, 43, 26],
    [44, 50, -22],
    [53, 51, 35],
    [29, 38, -28],
    [26, 46, -42],
    [34, 45, 8],
    [29, 55, -29],
    [37, 54, 14],
    [69, 30, 27],
    [64, 38, -6],
    [72, 39, 40],
    [62, 47, -11],
    [71, 47, 28],
  ];
  return (
    <G strokeLinecap="round" strokeLinejoin="round">
      <Path
        d="M50 94Q47 54 48 19M49 89Q36 67 30 40M51 87Q65 61 68 34"
        fill="none"
        stroke="#557D43"
        strokeWidth="1.7"
      />
      <Path
        d="M49 82Q29 78 22 63Q41 66 49 82ZM52 76Q61 63 78 60Q72 75 52 76Z"
        fill="#96C769"
        stroke="#557D43"
        strokeWidth="1.2"
      />
      {buds.map(([x, y, angle], index) => (
        <Ellipse
          key={index}
          cx={x}
          cy={y}
          rx="3.6"
          ry="5.9"
          fill={index % 3 ? "#C2A1F3" : "#A990E8"}
          stroke="#8565BA"
          strokeWidth="1.1"
          transform={`rotate(${angle} ${x} ${y})`}
        />
      ))}
      <Path
        d="M49 14l-1 4M68 29l-1 3M30 36l1 3"
        fill="none"
        stroke="#E3D4F8"
        strokeWidth="1.5"
      />
    </G>
  );
}

function Tulip() {
  return (
    <G strokeLinecap="round" strokeLinejoin="round">
      <Path
        d="M50 94Q52 65 49 39"
        fill="none"
        stroke={stemInk}
        strokeWidth="2.1"
      />
      <Path
        d="M49 91Q24 75 28 44Q48 59 49 91Z"
        fill="#89C75A"
        stroke={stemInk}
        strokeWidth="1.5"
      />
      <Path
        d="M51 90Q51 63 77 53Q72 79 51 90Z"
        fill="#ACD76F"
        stroke={stemInk}
        strokeWidth="1.5"
      />
      <Path
        d="M49 87Q39 70 32 53M53 85L69 62"
        fill="none"
        stroke="#699747"
        strokeWidth="1"
      />
      <Path
        d="M30 23Q42 20 49 10Q58 23 69 21Q68 48 50 50Q31 49 30 23Z"
        fill="#FB8FB9"
        stroke="#B95E91"
        strokeWidth="1.5"
      />
      <Path
        d="M30 23Q45 27 52 46Q64 35 69 21Q72 44 54 50Q33 51 30 23Z"
        fill="#FFAACA"
        stroke="#B95E91"
        strokeWidth="1.4"
      />
      <Path
        d="M49 13Q45 24 48 32M35 29Q39 31 42 36"
        fill="none"
        stroke="#FFD4E3"
        strokeWidth="1.8"
      />
    </G>
  );
}

function FernFrond({
  angle,
  height,
  color,
}: {
  angle: number;
  height: number;
  color: string;
}) {
  return (
    <G
      transform={`rotate(${angle})`}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <Path
        d={`M0 0Q-5 ${-height * 0.64} 5 ${-height}`}
        fill="none"
        stroke={stemInk}
        strokeWidth="1.35"
      />
      {[0.23, 0.36, 0.49, 0.62, 0.75, 0.87].map((t) => {
        const x = -10 * (1 - t) * t + 5 * t * t;
        const y = -height * (1.28 * (1 - t) * t + t * t);
        const span = 3 + Math.sin(t * Math.PI) * 8;
        return (
          <G key={t} fill={color} stroke="#497D3B" strokeWidth="1.05">
            <Path
              d={`M${x} ${y}Q${x - span * 0.65} ${y + 1} ${x - span} ${y - 7}Q${x - span * 0.28} ${y - 6} ${x} ${y}Z`}
            />
            <Path
              d={`M${x} ${y - 1}Q${x + span * 0.72} ${y} ${x + span} ${y - 8}Q${x + span * 0.25} ${y - 7} ${x} ${y - 1}Z`}
            />
          </G>
        );
      })}
      <Path
        d={`M4 ${-height + 7}Q-1 ${-height + 3} 5 ${-height - 4}Q9 ${-height + 1} 4 ${-height + 7}Z`}
        fill={color}
        stroke="#497D3B"
        strokeWidth="1"
      />
    </G>
  );
}

function Fern({ stage }: { stage: number }) {
  if (stage === 1)
    return (
      <G
        fill="none"
        stroke={stemInk}
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <Path d="M50 94Q43 82 46 71C48 62 59 63 59 71C59 77 50 80 50 74Q50 70 54 71" />
        <Path
          d="M48 85Q35 84 35 75Q45 77 48 85ZM46 80Q53 77 60 81Q58 88 46 80Z"
          fill="#A7D76D"
          strokeWidth="1.2"
        />
      </G>
    );
  return (
    <G transform={`translate(50 94) scale(${stage === 2 ? 0.73 : 1})`}>
      {stage === 3 && (
        <>
          <FernFrond angle={-53} height={50} color="#77B857" />
          <FernFrond angle={52} height={53} color="#83C05B" />
        </>
      )}
      <FernFrond angle={-29} height={62} color="#8BC965" />
      <FernFrond angle={27} height={66} color="#A0D571" />
      <FernFrond angle={-4} height={74} color="#B0DA77" />
    </G>
  );
}

function Cactus({ stage }: { stage: number }) {
  if (stage === 1)
    return (
      <G strokeLinecap="round" strokeLinejoin="round">
        <Path
          d="M43 94L42 77Q42 65 50 65Q59 65 58 77L57 94Z"
          fill="#A5D388"
          stroke="#507B44"
          strokeWidth="1.5"
        />
        <Path d="M50 69V92" fill="none" stroke="#7BB260" strokeWidth="1.3" />
        <Path
          d="M44 77l-3-1M55 75l3-2M45 87l-3 1M55 85l3 1"
          stroke="#F6EDC8"
          strokeWidth="1.4"
        />
      </G>
    );
  return (
    <G
      transform={`translate(50 94) scale(${stage === 2 ? 0.75 : 1}) translate(-50 -94)`}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <Path
        d={
          stage === 2
            ? "M43 94L42 67H35Q20 66 20 52L20 43Q20 37 26 37Q32 37 32 43L32 52Q32 57 42 57L42 26Q42 14 51 14Q60 14 60 26L59 94Z"
            : "M43 94L42 67H35Q20 66 20 52L20 43Q20 37 26 37Q32 37 32 43L32 52Q32 57 42 57L42 26Q42 14 51 14Q60 14 60 26L60 44Q70 44 70 37L70 31Q70 24 76 25Q82 26 82 32L82 38Q82 54 60 55L59 94Z"
        }
        fill="#9FCB7D"
        stroke="#4C7740"
        strokeWidth="1.7"
      />
      <Path
        d="M51 20Q48 53 50 92M46 24L46 89M56 25L55 91M26 43V52Q26 61 40 61"
        fill="none"
        stroke="#79AD5E"
        strokeWidth="1.2"
      />
      {stage === 3 && (
        <Path
          d="M76 31V38Q76 48 62 49"
          fill="none"
          stroke="#79AD5E"
          strokeWidth="1.2"
        />
      )}
      <Path
        d="M46 31l-4-2M55 39l4-1M46 46l-4 1M55 56l4 1M46 65l-4-1M55 76l4-1M46 85l-4 1M24 46l-4-1M28 56l-2 3"
        fill="none"
        stroke="#F8EFCA"
        strokeWidth="1.6"
      />
      {stage === 3 && (
        <Path
          d="M75 35l-4-2M78 43l3 2M69 50l1 3"
          stroke="#F8EFCA"
          strokeWidth="1.6"
        />
      )}
      <Path
        d="M50 30l.1.1M51 45l.1.1M50 60l.1.1M51 78l.1.1"
        stroke="#658D4E"
        strokeWidth="1.5"
      />
    </G>
  );
}

function MonsteraLeaf({
  young = false,
  color = "#80C583",
}: {
  young?: boolean;
  color?: string;
}) {
  return (
    <G strokeLinecap="round" strokeLinejoin="round">
      <Path
        d={
          young
            ? "M0 25Q-28 9-24-11Q-20-28-7-22L0-15Q8-29 21-19Q36-2 18 16Z"
            : "M0 25Q-11 20-18 13L-5 11L-21 7Q-25 2-25-4L-8 3L-25-10Q-24-21-14-24Q-5-25 0-15Q7-26 16-24Q24-22 26-12L9-1L28-6Q29 0 25 7L8 11L21 13Q13 23 0 25ZM-10-14a2.2 4.2 0 1 0 .01 0ZM9-15a2 4 0 1 0 .01 0Z"
        }
        fill={color}
        fillRule="evenodd"
        stroke="#41784F"
        strokeWidth="1.45"
      />
      <Path
        d="M0 23Q-2 4 0-14M-1 10L-12 4M0 4L12-4"
        fill="none"
        stroke="#5D9E68"
        strokeWidth="1"
      />
      <Path
        d="M-5-19Q-14-24-19-16"
        fill="none"
        stroke="#B5DEA0"
        strokeWidth="1.3"
      />
    </G>
  );
}

function Monstera({ stage }: { stage: number }) {
  if (stage === 1)
    return (
      <G>
        <Path
          d="M50 94Q47 86 50 78"
          fill="none"
          stroke={stemInk}
          strokeWidth="1.8"
          strokeLinecap="round"
        />
        <G transform="translate(50 68) scale(.48)">
          <MonsteraLeaf young color="#9FD58B" />
        </G>
      </G>
    );
  return (
    <G
      transform={`translate(50 94) scale(${stage === 2 ? 0.75 : 1}) translate(-50 -94)`}
    >
      <Path
        d={
          stage === 3
            ? "M50 94Q44 77 46 57M50 93Q47 81 39 72M50 94Q55 80 66 72"
            : "M50 94Q44 77 46 57M50 93Q47 81 39 72"
        }
        fill="none"
        stroke="#467B4B"
        strokeWidth="1.9"
        strokeLinecap="round"
      />
      <G transform="translate(24 57) rotate(-42) scale(.64)">
        <MonsteraLeaf young={stage === 2} color="#72B57D" />
      </G>
      {stage === 3 && (
        <G transform="translate(75 58) rotate(30) scale(.66)">
          <MonsteraLeaf color="#9AD08A" />
        </G>
      )}
      <G transform="translate(48 34) rotate(-8) scale(.85)">
        <MonsteraLeaf color="#89C986" />
      </G>
    </G>
  );
}

function Bamboo({ stage }: { stage: number }) {
  if (stage === 1)
    return (
      <G strokeLinecap="round" strokeLinejoin="round">
        <Path
          d="M47 94L46 62Q49 58 52 61L53 94Z"
          fill="#B3D46D"
          stroke="#658743"
          strokeWidth="1.4"
        />
        <Path d="M46 72L52 72M47 84L52 84" stroke="#638741" strokeWidth="1.4" />
        <Path
          d="M48 73Q34 69 33 59Q45 61 48 73ZM52 82Q59 69 69 71Q65 81 52 82Z"
          fill="#93C866"
          stroke="#54823F"
          strokeWidth="1.2"
        />
      </G>
    );
  return (
    <G
      transform={`translate(50 94) scale(${stage === 2 ? 0.74 : 1}) translate(-50 -94)`}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {stage === 3 && (
        <Path
          d="M38 94L31 39Q34 35 37 38L44 94Z"
          fill="#97BA67"
          stroke="#547D3E"
          strokeWidth="1.3"
        />
      )}
      <Path
        d="M55 94L62 33Q65 30 68 33L62 94Z"
        fill="#93BE61"
        stroke="#547D3E"
        strokeWidth="1.4"
      />
      <Path
        d="M47 94L46 18Q49 15 52 18L53 94Z"
        fill="#B4D577"
        stroke="#5E8241"
        strokeWidth="1.4"
      />
      <Path
        d="M49 20L50 92M64 35L58 92"
        fill="none"
        stroke="#D4E79A"
        strokeWidth="1.2"
      />
      <Path
        d="M46 31L52 31M46 49L53 49M47 68L53 68M47 85L53 85M61 49L66 50M60 66L64 66M58 81L62 82"
        stroke="#567D3E"
        strokeWidth="1.7"
      />
      {stage === 3 && (
        <Path
          d="M33 53L39 52M35 68L41 67M37 84L43 83"
          stroke="#567D3E"
          strokeWidth="1.6"
        />
      )}
      <G fill="#8DC96B" stroke="#4F8042" strokeWidth="1.2">
        <Path d="M48 32Q33 30 24 15Q39 17 48 32Z" />
        <Path d="M48 32Q31 38 19 30Q34 26 48 32Z" fill="#A7D77D" />
        <Path d="M51 49Q63 34 78 35Q70 47 51 49Z" fill="#A7D77D" />
        <Path d="M62 45Q75 50 83 62Q65 59 62 45Z" />
        <Path d="M50 68Q36 68 22 57Q37 56 50 68Z" fill="#AAD97C" />
        {stage === 3 && (
          <>
            <Path d="M34 46Q17 48 10 37Q25 35 34 46Z" />
            <Path d="M65 50Q71 32 87 26Q82 44 65 50Z" fill="#B0DA84" />
            <Path d="M59 81Q68 67 85 68Q73 81 59 81Z" fill="#A6D376" />
          </>
        )}
      </G>
    </G>
  );
}

function LeafyPlant({ type, stage }: { type: string; stage: number }) {
  if (stage === 0) return <YoungPlant stage={0} type={type} />;
  if (type === "fern") return <Fern stage={stage} />;
  if (type === "cactus") return <Cactus stage={stage} />;
  if (type === "monstera") return <Monstera stage={stage} />;
  return <Bamboo stage={stage} />;
}

function DrawnFlower({ doodle, stage }: { doodle?: Doodle; stage: number }) {
  const scale = [0.38, 0.58, 0.79, 1][stage];
  return (
    <G transform={`translate(50 92) scale(${scale}) translate(-50 -92)`}>
      {(doodle?.strokes || []).slice(0, 64).map((stroke, index) => {
        const points = stroke.points
          .filter(
            (point) => Number.isFinite(point.x) && Number.isFinite(point.y),
          )
          .slice(0, 1000);
        if (!points.length) return null;
        const color = /^#[0-9a-f]{3}(?:[0-9a-f]{3})?$/i.test(stroke.color)
          ? stroke.color
          : "#8969CF";
        const d = points
          .map(
            (point, pointIndex) =>
              `${pointIndex ? "L" : "M"}${rounded(18 + Math.max(0, Math.min(1, point.x)) * 64)} ${rounded(10 + Math.max(0, Math.min(1, point.y)) * 76)}`,
          )
          .join(" ");
        return (
          <Path
            key={index}
            d={points.length === 1 ? `${d}l.01 .01` : d}
            fill="none"
            stroke={color}
            strokeWidth="2.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        );
      })}
    </G>
  );
}

/** Every plant meets the soil at (50, 94), independent of its growth stage. */
export const MeadowPlant = memo(function MeadowPlant({
  type,
  growth,
  doodle,
  size,
  dead = false,
  animate = false,
  motionKey,
}: {
  type: string;
  growth: number;
  doodle?: Doodle;
  size: number;
  dead?: boolean;
  animate?: boolean;
  motionKey?: string | number;
}) {
  const uid = useId().replace(/:/g, "");
  const wiltId = `plant-wilt-${uid}`;
  const stage = Math.max(
    0,
    Math.min(3, Number.isFinite(growth) ? Math.floor(growth) : 0),
  );
  const artwork = (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      pointerEvents="none"
      accessible={false}
      accessibilityElementsHidden
    >
      {dead && (
        <Defs>
          <Filter
            id={wiltId}
            x="0"
            y="0"
            width="100"
            height="100"
            filterUnits="userSpaceOnUse"
          >
            <FeColorMatrix
              type="matrix"
              values=".22 .38 .10 0 .14 .18 .30 .08 0 .09 .12 .20 .06 0 .06 0 0 0 1 0"
            />
          </Filter>
        </Defs>
      )}
      <GroundMark />
      <G
        filter={dead ? `url(#${wiltId})` : undefined}
        transform={
          dead
            ? "translate(50 94) rotate(16) scale(.83 .8) translate(-50 -94)"
            : undefined
        }
      >
        {type === "doodle" ? (
          <DrawnFlower doodle={doodle} stage={stage} />
        ) : ["fern", "cactus", "monstera", "bamboo"].includes(type) ? (
          <LeafyPlant type={type} stage={stage} />
        ) : stage < 3 ? (
          <YoungPlant stage={stage} type={type} />
        ) : type === "sunflower" ? (
          <Sunflower />
        ) : type === "lavender" ? (
          <Lavender />
        ) : type === "tulip" ? (
          <Tulip />
        ) : (
          <Daisy />
        )}
      </G>
      {dead && (
        <Path
          d="M29 92Q34 85 41 91Q36 96 29 92ZM65 94Q69 87 76 91Q71 97 65 94Z"
          fill="#A98052"
          stroke="#795C3F"
          strokeWidth="1"
        />
      )}
    </Svg>
  );
  return animate ? (
    <MotionPulse
      triggerKey={motionKey ?? `${type}:${stage}`}
      animateOnMount={stage === 0}
      enabled={!dead}
      anchorY={size * 0.44}
      pointerEvents="none"
      accessible={false}
      style={{ width: size, height: size }}
    >
      {artwork}
    </MotionPulse>
  ) : (
    artwork
  );
});
