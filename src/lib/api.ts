import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import { File } from "expo-file-system";
import { fetch as expoFetch } from "expo/fetch";

const configured = process.env.EXPO_PUBLIC_API_URL;
export const API_BASE =
  configured ||
  (Platform.OS === "web"
    ? window.location.port === "8081"
      ? `${window.location.protocol}//${window.location.hostname}:3001`
      : window.location.origin
    : "http://localhost:3001");
let token: string | null = null;
let owner = "guest";
let ownerVersion = 0;
let recordingStorage: "local" | "supabase" = "local";
export function setDraftOwner(id: string) {
  if (owner !== id) ownerVersion++;
  owner = id;
}
export function isDraftOwner(id: string) {
  return owner === id;
}
export async function restoreToken() {
  if (Platform.OS !== "web")
    token = await SecureStore.getItemAsync("mind-garden-token");
}
export async function storeToken(value: string | null) {
  token = value;
  if (Platform.OS !== "web") {
    if (value) await SecureStore.setItemAsync("mind-garden-token", value);
    else await SecureStore.deleteItemAsync("mind-garden-token");
  }
}
export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}
export async function api<T = any>(
  path: string,
  options: { method?: string; body?: unknown; signal?: AbortSignal } = {},
): Promise<T> {
  const response = await fetch(
    `${API_BASE}${path.startsWith("/api") ? path : "/api" + path}`,
    {
      method: options.method || "GET",
      credentials: "include",
      headers: {
        ...(options.body !== undefined
          ? { "Content-Type": "application/json" }
          : {}),
        ...(token && Platform.OS !== "web"
          ? { Authorization: `Bearer ${token}` }
          : {}),
      },
      body:
        options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: options.signal,
    },
  );
  const data = await response.json().catch(() => ({
    error: "The server returned an unreadable response. Please try again.",
  }));
  if (!response.ok)
    throw new ApiError(
      typeof data.error === "string"
        ? data.error
        : data.error?.message ||
            "Something went wrong. Your saved work is safe.",
      response.status,
    );
  if (path === "/health" || path === "/api/health")
    recordingStorage = data.storage === "supabase" ? "supabase" : "local";
  return data;
}
export async function uploadAudio(
  uri: string,
  mime = "audio/webm",
  options: { signal?: AbortSignal } = {},
): Promise<{ id: string }> {
  const uploadOwner = owner;
  const uploadVersion = ownerVersion;
  const assertCurrent = () => {
    if (owner !== uploadOwner || ownerVersion !== uploadVersion)
      throw new Error(
        "Your account changed. Please record again in this account.",
      );
    if (options.signal?.aborted) {
      const error = new Error("Recording upload cancelled.");
      error.name = "AbortError";
      throw error;
    }
  };
  assertCurrent();
  const blob =
    Platform.OS === "web"
      ? await (await fetch(uri, { signal: options.signal })).blob()
      : new File(uri);
  assertCurrent();
  if (recordingStorage === "supabase") {
    const admission = await api<
      | { transport: "local" }
      | { transport: "direct"; id: string; signedUrl: string }
    >("/audio/uploads", {
      method: "POST",
      body: { mime, size: blob.size },
      signal: options.signal,
    });
    assertCurrent();
    if (admission.transport === "direct") {
      const signed = new URL(admission.signedUrl);
      if (
        signed.protocol !== "https:" ||
        signed.username ||
        signed.password ||
        !signed.pathname.startsWith(
          "/storage/v1/object/upload/sign/recordings/",
        ) ||
        !signed.searchParams.get("token") ||
        typeof admission.id !== "string" ||
        !admission.id
      )
        throw new Error(
          "Recording upload could not be prepared. Please try again.",
        );
      // The URL authorizes only this object. Never send app cookies or bearer
      // credentials to the storage provider. Raw File bodies work on Expo native.
      const uploaded = await expoFetch(signed.toString(), {
        method: "PUT",
        credentials: "omit",
        headers: {
          "Content-Type": mime,
          "cache-control": "max-age=0",
          "x-upsert": "false",
        },
        body: blob,
        signal: options.signal,
      });
      assertCurrent();
      if (!uploaded.ok)
        throw new Error(
          "Audio upload failed. Your recording is still on this device.",
        );
      const result = await api<{ id: string }>(
        `/audio/uploads/${encodeURIComponent(admission.id)}/complete`,
        { method: "POST", signal: options.signal },
      );
      assertCurrent();
      return result;
    }
    if (admission.transport !== "local")
      throw new Error(
        "Recording upload could not be prepared. Please try again.",
      );
  }
  const response = await expoFetch(`${API_BASE}/api/audio`, {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": mime,
      ...(token && Platform.OS !== "web"
        ? { Authorization: `Bearer ${token}` }
        : {}),
    },
    body: blob,
    signal: options.signal,
  });
  const data = await response.json();
  assertCurrent();
  if (!response.ok)
    throw new Error(data.error || "Audio upload failed. Please try again.");
  return data;
}
export const loadDraft = async (key: string) =>
  (await AsyncStorage.getItem(`mind-garden-draft:${owner}:${key}`)) || "";
export const saveDraft = async (key: string, value: string) =>
  AsyncStorage.setItem(`mind-garden-draft:${owner}:${key}`, value);
export const deleteDraft = async (key: string) =>
  AsyncStorage.removeItem(`mind-garden-draft:${owner}:${key}`);
export async function clearDrafts() {
  const keys = (await AsyncStorage.getAllKeys()).filter((k) =>
    k.startsWith(`mind-garden-draft:${owner}:`),
  );
  await AsyncStorage.multiRemove(keys);
}
