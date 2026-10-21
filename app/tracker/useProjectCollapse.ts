"use client";
import { useMemo, useState, useSyncExternalStore } from "react";
const eventName = "discoveryos-project-collapse";
function subscribe(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener(eventName, callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(eventName, callback);
  };
}
export default function useProjectCollapse(userId: string, projectId: string) {
  const key = `discoveryos:collapse:${userId}:${projectId}`;
  const saved = useSyncExternalStore(
    subscribe,
    () => {
      try {
        return localStorage.getItem(key) || "{}";
      } catch {
        return "{}";
      }
    },
    () => "{}",
  );
  const stored = useMemo<Record<string, boolean>>(() => {
    try {
      const parsed = JSON.parse(saved);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? Object.fromEntries(
            Object.entries(parsed).filter(
              (entry): entry is [string, boolean] =>
                typeof entry[1] === "boolean",
            ),
          )
        : {};
    } catch {
      return {};
    }
  }, [saved]);
  const [override, setOverride] = useState<Record<string, boolean> | null>(
    null,
  );
  const values = override ?? stored;
  function set(ids: string[], collapsed: boolean) {
    const next = { ...values };
    for (const id of ids) next[id] = collapsed;
    setOverride(next);
    try {
      localStorage.setItem(key, JSON.stringify(next));
      window.dispatchEvent(new Event(eventName));
    } catch {
      /* Still works for this visit when storage is unavailable. */
    }
  }
  return {
    isCollapsed: (id: string) => values[id] === true,
    set,
    toggle: (id: string) => set([id], !values[id]),
  };
}
