import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Platform, useColorScheme } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { darkColors, lightColors, tokens, typography } from "./tokens";

export type AppearancePreference = "system" | "light" | "dark";
const storageKey = "bridgingminds:appearance";
const themes = {
  light: { C: lightColors, T: typography(lightColors), tokens, dark: false },
  dark: { C: darkColors, T: typography(darkColors), tokens, dark: true },
};
type Theme = typeof themes.light;
type ThemeContextValue = Theme & {
  preference: AppearancePreference;
  setPreference: (preference: AppearancePreference) => Promise<void>;
};
const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const system = useColorScheme();
  const [preference, updatePreference] =
    useState<AppearancePreference>("system");
  const revision = useRef(0);
  const writes = useRef(Promise.resolve());
  useEffect(() => {
    const version = revision.current;
    let live = true;
    void AsyncStorage.getItem(storageKey)
      .then((value) => {
        if (
          live &&
          revision.current === version &&
          (value === "light" || value === "dark")
        )
          updatePreference(value);
      })
      .catch(() => {
        /* A blocked device store still supports the system theme. */
      });
    return () => {
      live = false;
    };
  }, []);
  const setPreference = useCallback((value: AppearancePreference) => {
    revision.current++;
    updatePreference(value);
    // Serial writes keep the latest preference after rapid changes.
    const write = writes.current
      .catch(() => undefined)
      .then(() => AsyncStorage.setItem(storageKey, value));
    writes.current = write;
    return write;
  }, []);
  const resolved =
    preference === "system"
      ? system === "dark"
        ? "dark"
        : "light"
      : preference;
  const theme = themes[resolved];
  useEffect(() => {
    if (Platform.OS !== "web" || typeof document === "undefined") return;
    document.documentElement.dataset.theme = resolved;
    document.documentElement.style.colorScheme = resolved;
    document.documentElement.style.backgroundColor = theme.C.cream;
    const style = document.createElement("style");
    style.id = "bridgingminds-accessibility";
    style.textContent = `
      :root { --bm-focus: ${theme.C.accent}; }
      body { background: ${theme.C.cream}; }
      [role="button"], [role="tab"], input, textarea, a { -webkit-tap-highlight-color: transparent; }
      :focus-visible { outline: 3px solid var(--bm-focus) !important; outline-offset: 3px; }
      ::selection { background: ${theme.C.accentSurface}; color: ${theme.C.ink}; }
      @media (prefers-reduced-motion: reduce) { html { scroll-behavior: auto; } }
    `;
    document.head.appendChild(style);
    return () => style.remove();
  }, [resolved, theme]);
  const value = useMemo(
    () => ({ ...theme, preference, setPreference }),
    [theme, preference, setPreference],
  );
  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

export function useTheme() {
  const theme = useContext(ThemeContext);
  if (!theme) throw new Error("useTheme must be used within ThemeProvider");
  return theme;
}

/** Cache immutable styles per palette; theme changes never remount a screen or discard a draft. */
export function createThemedStyles<T>(factory: (theme: Theme) => T) {
  const cache = { light: factory(themes.light), dark: factory(themes.dark) };
  return function useThemedStyles() {
    return cache[useTheme().dark ? "dark" : "light"];
  };
}
