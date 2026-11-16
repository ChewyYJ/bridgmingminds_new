import type { Page } from "../types";
export const pageTitles: Record<string, string> = {
  home: "Home",
  play: "Play",
  discover: "Discover",
  debate: "Debate",
  profile: "My profile",
  progress: "Your progress",
  settings: "Settings",
  food: "Food shop",
  achievements: "Achievements",
  tournament: "Tournament",
  friends: "Debate with friends",
  practice: "Speaking practice",
  attempt: "Your feedback",
  "read-aloud": "Read aloud",
  "vocabulary-review": "Word review",
};
export const pageAliases: Record<string, Page> = {
  avatar: "profile",
  garden: "debate",
  homeland: "debate",
  "debate-street": "debate",
  "daily-practice": "home",
};
export function resolvePage(pathname: string) {
  const route = pathname.split("/")[1] || "home";
  return pageAliases[route] || route;
}
export function isKnownPage(pathname: string) {
  return (
    pathname.split("/").filter(Boolean).length <= 1 &&
    Boolean(pageTitles[resolvePage(pathname)])
  );
}
