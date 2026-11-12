import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useRef,
} from "react";
import { AppState as AppLifecycle, Platform } from "react-native";
import { AppState, Article } from "../types";
import { api, ApiError, restoreToken, setDraftOwner } from "./api";
type Context = {
  state: AppState | null;
  articles: Article[];
  loading: boolean;
  error: string;
  provider: string;
  refresh: () => Promise<void>;
  logout: () => void;
  bootstrap: () => Promise<void>;
};
const AppContext = createContext<Context>(null!);
export function AppProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AppState | null>(null);
  const [articles, setArticles] = useState<Article[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [provider, setProvider] = useState("local");
  const currentState = useRef<AppState | null>(null);
  const sessionGeneration = useRef(0);
  const refreshSequence = useRef(0);
  const pendingRefreshes = useRef(new Set<number>());
  const bootstrapping = useRef(false);
  const lastRefreshedAt = useRef(0);
  const lastAutomaticAt = useRef(0);
  const invalidatePending = useCallback(() => {
    sessionGeneration.current++;
    refreshSequence.current++;
    pendingRefreshes.current.clear();
  }, []);
  const logout = useCallback(() => {
    // In-flight responses from the previous account must never restore it.
    invalidatePending();
    bootstrapping.current = false;
    currentState.current = null;
    setDraftOwner("guest");
    setState(null);
    setArticles([]);
    setError("");
    setLoading(false);
  }, [invalidatePending]);
  const refresh = useCallback(async () => {
    const generation = sessionGeneration.current;
    const sequence = ++refreshSequence.current;
    const isCurrent = () =>
      generation === sessionGeneration.current &&
      sequence === refreshSequence.current;
    pendingRefreshes.current.add(sequence);
    try {
      const next = await api<AppState>("/state");
      if (!isCurrent()) return;
      currentState.current = next;
      lastRefreshedAt.current = Date.now();
      setDraftOwner(next.profile.id);
      setState(next);
      const feed = await api<Article[] | { articles: Article[] }>("/articles");
      if (isCurrent()) setArticles(Array.isArray(feed) ? feed : feed.articles);
    } catch (e) {
      if (isCurrent()) throw e;
    } finally {
      pendingRefreshes.current.delete(sequence);
    }
  }, []);
  const bootstrap = useCallback(async () => {
    invalidatePending();
    const generation = sessionGeneration.current;
    bootstrapping.current = true;
    setLoading(true);
    setError("");
    try {
      await restoreToken();
      if (generation !== sessionGeneration.current) return;
      const health = await api("/health");
      if (generation !== sessionGeneration.current) return;
      setProvider(health.provider);
      try {
        await refresh();
      } catch (e) {
        if (generation !== sessionGeneration.current) return;
        if (!(e instanceof ApiError) || e.status !== 401) throw e;
        currentState.current = null;
        setState(null);
        setArticles([]);
      }
    } catch (e: any) {
      if (generation === sessionGeneration.current)
        setError(e.message || "The garden server is not available yet.");
    } finally {
      if (generation === sessionGeneration.current) {
        bootstrapping.current = false;
        setLoading(false);
      }
    }
  }, [refresh, invalidatePending]);
  useEffect(() => {
    // Begin external session hydration after the initial loading frame has painted.
    const timer = setTimeout(() => {
      void bootstrap();
    }, 0);
    return () => {
      clearTimeout(timer);
      invalidatePending();
    };
  }, [bootstrap, invalidatePending]);
  useEffect(() => {
    const checkFreshness = (returned = false) => {
      const saved = currentState.current;
      if (!saved || bootstrapping.current || pendingRefreshes.current.size)
        return;
      if (AppLifecycle.currentState && AppLifecycle.currentState !== "active")
        return;
      const now = Date.now();
      const day = new Intl.DateTimeFormat("en-CA", {
        timeZone: saved.profile.timezone || "UTC",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date(now));
      const changedDay = saved.practiceWeek?.day !== day;
      if (!changedDay && !returned) return;
      // Focus and visibility events may arrive together. Normal foreground
      // refreshes have a minute cooldown; day rollover bypasses that cooldown.
      const sinceAutomatic = now - lastAutomaticAt.current;
      if (sinceAutomatic >= 0 && sinceAutomatic < 10000) return;
      const sinceRefresh = now - lastRefreshedAt.current;
      if (!changedDay && sinceRefresh >= 0 && sinceRefresh < 60000) return;
      lastAutomaticAt.current = now;
      void refresh().catch((e) => {
        if (e instanceof ApiError && e.status === 401) logout();
      });
    };
    const subscription = AppLifecycle.addEventListener("change", (next) => {
      if (next === "active") checkFreshness(true);
    });
    const returned = () => checkFreshness(true);
    if (Platform.OS === "web") {
      window.addEventListener("focus", returned);
      window.addEventListener("online", returned);
    }
    // This is a local calendar check, not a minute-by-minute network poll.
    const timer = setInterval(() => checkFreshness(), 60000);
    return () => {
      subscription?.remove();
      clearInterval(timer);
      if (Platform.OS === "web") {
        window.removeEventListener("focus", returned);
        window.removeEventListener("online", returned);
      }
    };
  }, [refresh, logout]);
  useEffect(() => {
    if (
      !state?.attempts.some((a) => ["queued", "processing"].includes(a.status))
    )
      return;
    const timer = setInterval(() => {
      if (
        !bootstrapping.current &&
        currentState.current &&
        !pendingRefreshes.current.size
      )
        refresh().catch(() => {});
    }, 2000);
    return () => clearInterval(timer);
  }, [state?.attempts, refresh]);
  return (
    <AppContext.Provider
      value={{
        state,
        articles,
        loading,
        error,
        provider,
        refresh,
        bootstrap,
        logout,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}
export function useApp() {
  return useContext(AppContext);
}
