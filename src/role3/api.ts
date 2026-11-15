import { api } from "../lib/api";
import type { AvatarSelection } from "../avatar/pack";
import type { AvatarPurchaseReceipt, FoodPurchaseReceipt, GamificationSummary } from "../../shared/gamification.mjs";

export const role3Api = {
  summary: (signal?: AbortSignal) => api<GamificationSummary>("/gamification", { signal }),
  equip: (selection: AvatarSelection) => api<GamificationSummary>("/avatar/equipment", { method: "PUT", body: { selection } }),
  purchase: (itemId: string, requestId: string) => api<AvatarPurchaseReceipt>("/avatar/purchase", { method: "POST", body: { itemId, requestId } }),
  care: (settings: { careEnabled?: boolean; remindersEnabled?: boolean }) => api<GamificationSummary>("/avatar/care", { method: "PATCH", body: settings }),
  feed: (foodId: string, requestId: string) => api<FoodPurchaseReceipt>("/food/purchase", { method: "POST", body: { foodId, requestId } }),
};
