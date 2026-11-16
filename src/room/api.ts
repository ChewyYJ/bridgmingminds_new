import { api } from '../lib/api';
import type { RoomPlacement, RoomPurchaseReceipt, RoomSummary } from '../../shared/room.mjs';

export const roomApi = {
  summary: (signal?: AbortSignal) => api<RoomSummary>('/room', { signal }),
  save: (version: number, placements: RoomPlacement[]) => api<RoomSummary>('/room/layout', { method: 'PUT', body: { version, placements } }),
  purchase: (itemId: string, requestId: string) => api<RoomPurchaseReceipt>('/room/purchase', { method: 'POST', body: { itemId, requestId } }),
};
