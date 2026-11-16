import { api } from "../lib/api";
import type { PlanningBoard } from "../../shared/planning-board.mjs";
import type { DebateOpponent, DebateProficiency, DebateSession, DebateStage, DebateTopic, DebateTournament, DEBATE_RULES } from "../../shared/debate.mjs";

export interface DebateCatalog {
  version: string; providerMode: "openai" | "local"; tournamentAvailable: boolean;
  topics: DebateTopic[]; opponents: DebateOpponent[];
  tournamentTopics: DebateTopic[]; tournamentOpponents: DebateOpponent[]; boss: DebateOpponent;
  stages: { id: DebateStage; label: string; seconds: number; instruction: string }[];
  rules: typeof DEBATE_RULES;
  rewardPreview?: { coins: number; xp: number; dailyCap?: number; unlockNote?: string | null } | null;
}
export interface DebateHistory { sessions: DebateSession[]; tournaments: DebateTournament[]; hasMore?: boolean; nextOffset?: number | null }
export interface DebateBriefing { requestId: string; topicId: string; position: "for" | "against"; proficiency: DebateProficiency }
export const debateApi = {
  catalog: (signal?: AbortSignal) => api<DebateCatalog>("/debate/catalog", { signal }),
  history: (offset = 0, signal?: AbortSignal) => api<DebateHistory>(`/debate/history?limit=30&offset=${offset}`, { signal }),
  create: (briefing: Omit<DebateBriefing, "position"> & { position: "for" | "against" | "random"; opponentId: string }) => api<DebateSession>("/debate/sessions", { method: "POST", body: { ...briefing, mode: "practice" } }),
  preparation: (id: string, action: "reveal" | "save" | "begin", planningBoard?: PlanningBoard) => api<DebateSession>(`/debate/sessions/${encodeURIComponent(id)}/preparation`, { method: "POST", body: { action, ...(planningBoard ? { planningBoard } : {}) } }),
  session: (id: string, signal?: AbortSignal) => api<DebateSession>(`/debate/sessions/${encodeURIComponent(id)}`, { signal }),
  turn: (id: string, body: { requestId: string; stage: DebateStage; text: string; audioId?: string }) => api<DebateSession>(`/debate/sessions/${encodeURIComponent(id)}/turns`, { method: "POST", body }),
  recover: (id: string) => api<DebateSession>(`/debate/sessions/${encodeURIComponent(id)}/recover`, { method: "POST", body: {} }),
  finish: (id: string) => api<DebateSession>(`/debate/sessions/${encodeURIComponent(id)}/finish`, { method: "POST", body: {} }),
  tournament: (briefing: DebateBriefing) => api<{ run: DebateTournament; session: DebateSession }>("/debate/tournaments", { method: "POST", body: briefing }),
  run: (id: string) => api<{ run: DebateTournament; session: DebateSession }>(`/debate/tournaments/${encodeURIComponent(id)}`),
  advance: (id: string, requestId: string) => api<{ run: DebateTournament; session: DebateSession }>(`/debate/tournaments/${encodeURIComponent(id)}/advance`, { method: "POST", body: { requestId } }),
  remove: (id: string, tournament = false) => api<{ deleted: boolean; audioNotice: string }>(`/debate/${tournament ? "tournaments" : "sessions"}/${encodeURIComponent(id)}`, { method: "DELETE" }),
};
