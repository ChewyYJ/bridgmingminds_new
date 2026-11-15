import type { AvatarAnimation } from "./pack";

/** Food previews map to rig actions; `eat` remains the original ramen animation. */
export const AVATAR_FOOD_ASSETS = [
  { id: "ramen", name: "Ramen", animation: "eat", source: require("../../assets/avatar/food-v1/ramen.png") as number },
  { id: "onigiri", name: "Onigiri", animation: "eatOnigiri", source: require("../../assets/avatar/food-v1/onigiri.png") as number },
  { id: "bento", name: "Bento", animation: "eatBento", source: require("../../assets/avatar/food-v1/bento.png") as number },
] as const satisfies readonly { id: string; name: string; animation: AvatarAnimation; source: number }[];

export type AvatarFoodId = (typeof AVATAR_FOOD_ASSETS)[number]["id"];
