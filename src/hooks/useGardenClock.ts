import { useEffect, useState } from "react";
import { AppState } from "react-native";

// A single clock per visible screen keeps every plant in sync, including after
// returning to the app. Plant death is always enforced by the server too.
export function useGardenClock() {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const update = () => setNow(Date.now());
    const timer = setInterval(update, 30_000);
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") update();
    });
    return () => {
      clearInterval(timer);
      subscription.remove();
    };
  }, []);
  return now;
}
