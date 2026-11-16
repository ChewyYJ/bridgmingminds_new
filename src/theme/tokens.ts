import { StyleSheet } from "react-native";

export const lightColors = {
  cream: "#F6F3EE",
  paper: "#FFFDFC",
  forest: "#34312E",
  onPrimary: "#FFFDFC",
  ink: "#292623",
  muted: "#655D54",
  sage: "#EAE4DC",
  peach: "#F3E7DD",
  lilac: "#EEE8F7",
  border: "#D9D1C7",
  yellow: "#F3E8CF",
  orange: "#795D2D",
  red: "#A13732",
  errorSurface: "#FBEAE6",
  success: "#32634E",
  successSurface: "#E8F1EA",
  accent: "#625093",
  accentSurface: "#EEE8F7",
  input: "#FFFDFC",
  quiet: "#F0EBE4",
  overlay: "rgba(32, 29, 26, 0.48)",
};

export type Colors = typeof lightColors;

export const darkColors: Colors = {
  cream: "#191918",
  paper: "#242321",
  forest: "#F0E8DE",
  onPrimary: "#25221F",
  ink: "#F2ECE5",
  muted: "#C1B8AE",
  sage: "#37332F",
  peach: "#45342C",
  lilac: "#373046",
  border: "#514A43",
  yellow: "#413724",
  orange: "#E7C68C",
  red: "#FFB3A9",
  errorSurface: "#482B29",
  success: "#A3D4B9",
  successSurface: "#263B31",
  accent: "#CEBEF2",
  accentSurface: "#373046",
  input: "#201F1D",
  quiet: "#2C2926",
  overlay: "rgba(0, 0, 0, 0.64)",
};

export const tokens = {
  space: { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, section: 40 },
  radius: { sm: 8, control: 12, card: 20, large: 24, round: 999 },
  size: { touch: 44, control: 48, content: 1080, reading: 720 },
  motion: { fast: 150, enter: 220, slow: 280 },
  font: { body: "DM", medium: "DMMedium", bold: "DMBold", editorial: "Lora" },
} as const;

export function typography(C: Colors) {
  return StyleSheet.create({
    body: {
      fontFamily: tokens.font.body,
      fontSize: 15,
      color: C.ink,
      lineHeight: 23,
    },
    small: {
      fontFamily: tokens.font.body,
      fontSize: 13,
      color: C.muted,
      lineHeight: 20,
    },
    label: {
      fontFamily: tokens.font.bold,
      fontSize: 11,
      letterSpacing: 1.5,
      color: C.muted,
      textTransform: "uppercase",
    },
    display: {
      fontFamily: tokens.font.editorial,
      fontSize: 36,
      color: C.ink,
      lineHeight: 44,
    },
    title: {
      fontFamily: tokens.font.bold,
      fontSize: 30,
      color: C.ink,
      lineHeight: 38,
    },
    h2: {
      fontFamily: tokens.font.bold,
      fontSize: 22,
      color: C.ink,
      lineHeight: 30,
    },
    h3: {
      fontFamily: tokens.font.bold,
      fontSize: 17,
      color: C.ink,
      lineHeight: 24,
    },
  });
}
