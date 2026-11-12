import { useSyncExternalStore } from "react";
import { AccessibilityInfo, Platform } from "react-native";
import { useApp } from "../lib/state";

const listeners = new Set<() => void>();
const mediaQuery =
  Platform.OS === "web" && typeof window !== "undefined"
    ? window.matchMedia("(prefers-reduced-motion: reduce)")
    : null;
let systemReduced = true; // Remain still until the native preference is known.
let stopListening: (() => void) | undefined;
let revision = 0;

function publish(value: boolean) {
  systemReduced = value;
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (listeners.size === 1) {
    if (mediaQuery) {
      const change = () => publish(mediaQuery.matches);
      mediaQuery.addEventListener("change", change);
      stopListening = () => mediaQuery.removeEventListener("change", change);
    } else {
      const queryRevision = ++revision;
      const subscription = AccessibilityInfo.addEventListener(
        "reduceMotionChanged",
        (value) => {
          revision++;
          publish(value);
        },
      );
      void AccessibilityInfo.isReduceMotionEnabled()
        .then((value) => {
          // An old async read must not overwrite a newer live preference.
          if (revision === queryRevision && listeners.size) publish(value);
        })
        .catch(() => undefined);
      stopListening = () => {
        revision++;
        subscription.remove();
      };
    }
  }
  return () => {
    listeners.delete(listener);
    if (!listeners.size) {
      stopListening?.();
      stopListening = undefined;
    }
  };
}

const getSnapshot = () => mediaQuery?.matches ?? systemReduced;
const getServerSnapshot = () => true;

/** Live system OR saved app preference, with one shared system listener. */
export function useReducedMotion() {
  const systemPreference = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  );
  const app = useApp();
  return systemPreference || Boolean(app?.state?.profile.reducedMotion);
}
