export type BridgeKey = "B" | "R" | "I" | "D" | "G" | "E";
export const BRIDGE_VERSION: "bridge-v1";
export const BRIDGE_KEYS: readonly BridgeKey[];
export function getBridgeRubric(): {
  id: string;
  title: string;
  criteria: {
    key: BridgeKey;
    label: string;
    description: string;
    levels: [string, string, string, string];
  }[];
  foundations: { title: string; url: string }[];
  limitations: string[];
};
export function bridgeApplicability(prompt?: {
  bridgeDimensions?: BridgeKey[];
}): BridgeKey[];
