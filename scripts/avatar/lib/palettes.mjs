// Palettes referenced by sprites as "skin.N", "hair.N", "eye.N" and resolved at
// export time (bodies per skin tone, hairstyles in their own hair colour).
// Tone order: 0 outline, 1 deep shadow, 2 shadow, 3 base, 4 light, 5 highlight.
// Skin has a 7th entry (index 6): cheek blush tuned to that skin tone.

export const SKIN = {
  porcelain: ["#6e4136", "#d68d76", "#eeb19a", "#fbd3bf", "#fee6d9", "#fff4ec", "#f5a49c"],
  peach: ["#6a3d2e", "#cc8462", "#e5a47f", "#f4c49f", "#f9dbbd", "#fdeedb", "#ef9c8a"],
  honey: ["#5c3423", "#b06c45", "#c98a5d", "#dea677", "#ecc097", "#f6dabd", "#e08b72"],
  tan: ["#4a2a1b", "#8f5333", "#a96a43", "#c28457", "#d6a073", "#e7bf98", "#cd7a60"],
  deep: ["#24110b", "#4c2617", "#5e301e", "#743f28", "#8c5336", "#a76d50", "#93503d"],
};

export const HAIR = {
  espresso: ["#2a1b18", "#3b2924", "#4f3830", "#664b3e", "#836553", "#a3846f"],
  black: ["#141219", "#1e1b25", "#2a2633", "#3a3545", "#524c60", "#746e84"],
  chestnut: ["#2c160e", "#55291a", "#723a23", "#904d2f", "#ad6a44", "#c98b62"],
  ginger: ["#3a150d", "#7d2c16", "#a3401f", "#c45a2b", "#dc7c45", "#eea36c"],
  honey: ["#4a3016", "#94672f", "#b88540", "#d6a656", "#e9c47b", "#f6e0a8"],
  ash: ["#33333d", "#5d5d6b", "#7e7e8c", "#a2a2af", "#c4c4cf", "#e2e2ea"],
  cocoa: ["#21140f", "#33211a", "#45302a", "#5a4136", "#76594a", "#957765"],
};

// Eyes: 0 lash/line, 1 pupil, 2 iris dark, 3 iris, 4 iris light, 5 sparkle
export const EYES = {
  cocoa: ["#2b1b18", "#2b1b18", "#4e2e24", "#7a4a33", "#b07a52", "#ffffff"],
  hazel: ["#302b24", "#302b24", "#56533b", "#7d7a50", "#a6a071", "#ffffff"],
  slate: ["#282a30", "#282a30", "#444c5a", "#697687", "#99a7b7", "#ffffff"],
};

export const DEFAULTS = { skin: "peach", hair: "espresso", eyes: "cocoa" };
export const SKIN_TONES = ["porcelain", "peach", "honey", "tan", "deep"];

const ROLES = { skin: SKIN, hair: HAIR, eye: EYES };

/** Resolve a sprite colour key to hex (or #rrggbbaa) for the chosen palettes. */
export function resolveKey(key, choice = DEFAULTS) {
  if (key === null) return null;
  if (key.startsWith("#")) return key;
  const [role, tone] = key.split(".");
  const name = role === "eye" ? choice.eyes : choice[role];
  const table = ROLES[role];
  if (!table || !table[name]) throw new Error(`Unknown palette ${key} (${name})`);
  return table[name][Number(tone)];
}

export const R = {
  skin: [0, 1, 2, 3, 4, 5].map((t) => `skin.${t}`),
  hair: [0, 1, 2, 3, 4, 5].map((t) => `hair.${t}`),
  eye: [0, 1, 2, 3, 4, 5].map((t) => `eye.${t}`),
};

export const WHITE = "#fffdf8";
export const MOUTH = "#9b4743";
