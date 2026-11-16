import React from "react";
import { View } from "react-native";
import Svg, { Circle, Path, Rect, Text as SvgText } from "react-native-svg";
import { useTheme } from "../theme/ThemeProvider";

/** Lightweight vector artwork; avatar collections load when a learner opens their space. */
export function WelcomeArt() {
  const { C } = useTheme();
  return (
    <View
      pointerEvents="none"
      aria-hidden
      style={{ width: "100%", maxWidth: 500, alignSelf: "center" }}
    >
      <Svg width="100%" height={240} viewBox="0 0 480 280">
        <Circle cx="240" cy="140" r="128" fill={C.paper} opacity={0.5} />
        <Path
          d="M240 154V183Q240 198 220 198H110M240 183Q240 198 260 198H370"
          fill="none"
          stroke={C.accent}
          strokeWidth={2}
        />
        <Rect
          x="102"
          y="36"
          width="276"
          height="120"
          rx="24"
          fill={C.paper}
          stroke={C.border}
        />
        <Path
          d="M142 156V174L165 156"
          fill={C.paper}
          stroke={C.border}
          strokeWidth={1.5}
        />
        <Circle cx="146" cy="81" r="20" fill={C.accentSurface} />
        <Path
          d="M137 83V79M143 88V74M149 91V71M155 86V76"
          fill="none"
          stroke={C.accent}
          strokeWidth={3}
          strokeLinecap="round"
        />
        <SvgText x="181" y="87" fontFamily="DMBold" fontSize="24" fill={C.ink}>
          Your voice.
        </SvgText>
        <SvgText x="133" y="126" fontFamily="DM" fontSize="16" fill={C.muted}>
          A little clearer, every day.
        </SvgText>
        <Rect
          x="32"
          y="190"
          width="142"
          height="54"
          rx="14"
          fill={C.paper}
          stroke={C.border}
        />
        <Circle cx="57" cy="217" r="6" fill={C.accent} />
        <SvgText
          x="73"
          y="222"
          fontFamily="DMMedium"
          fontSize="15"
          fill={C.ink}
        >
          One idea
        </SvgText>
        <Rect x="194" y="212" width="142" height="54" rx="14" fill={C.accent} />
        <SvgText
          x="219"
          y="245"
          fontFamily="DMMedium"
          fontSize="15"
          fill={C.onPrimary}
        >
          Make it yours
        </SvgText>
        <Rect
          x="325"
          y="170"
          width="123"
          height="54"
          rx="14"
          fill={C.yellow}
          stroke={C.border}
        />
        <Path
          d="M343 198L349 204L360 190"
          stroke={C.orange}
          strokeWidth={2}
          strokeLinecap="round"
          fill="none"
        />
        <SvgText
          x="371"
          y="202"
          fontFamily="DMMedium"
          fontSize="15"
          fill={C.ink}
        >
          Try it
        </SvgText>
        <Circle cx="72" cy="82" r="5" fill={C.orange} />
        <Path
          d="M405 67V83M397 75H413"
          stroke={C.accent}
          strokeWidth={2}
          strokeLinecap="round"
        />
      </Svg>
    </View>
  );
}
