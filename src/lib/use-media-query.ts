import { useSyncExternalStore } from "react";

/**
 * Subscribe to a CSS media query. Returns `false` on the server and during
 * hydration, then the real value on the client.
 */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const mql = window.matchMedia(query);
      mql.addEventListener("change", onChange);
      return () => mql.removeEventListener("change", onChange);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}
