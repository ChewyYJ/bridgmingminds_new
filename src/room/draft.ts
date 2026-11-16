import AsyncStorage from '@react-native-async-storage/async-storage';
import type { RoomPlacement } from '../../shared/room.mjs';

export type RoomDraft = { version: number; placements: RoomPlacement[] };
const writes = new Map<string, Promise<void>>();
const key = (owner: string) => `bridgingminds:room-draft:v1:${owner}`;
export async function readRoomDraft(owner: string): Promise<RoomDraft | null> {
  await writes.get(owner)?.catch(() => undefined);
  const value = await AsyncStorage.getItem(key(owner));
  if (!value) return null;
  try {
    const parsed = JSON.parse(value);
    return Number.isSafeInteger(parsed?.version) && parsed.version > 0 && Array.isArray(parsed?.placements) ? parsed : null;
  } catch { return null; }
}
export function writeRoomDraft(owner: string, draft: RoomDraft | null) {
  const value = draft ? JSON.stringify(draft) : null;
  const pending = (writes.get(owner) ?? Promise.resolve()).catch(() => undefined).then(() =>
    value === null ? AsyncStorage.removeItem(key(owner)) : AsyncStorage.setItem(key(owner), value));
  writes.set(owner, pending);
  return pending;
}

/** Queue removal after pending saves so sign-out/deletion cannot leave a revived draft. */
export function clearRoomDraft(owner: string) {
  return writeRoomDraft(owner, null);
}
