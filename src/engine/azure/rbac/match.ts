/**
 * Action-string matching. One wildcard, case-insensitive, and `*` matches
 * any characters including `/`. See docs/RBAC.md section 5.1.
 */

export function wildcardCount(pattern: string): number {
  return [...pattern].filter((character) => character === "*").length;
}

/** Learn examples include a leading star, a trailing star, and a star before /read. */
export function actionMatches(action: string, pattern: string): boolean {
  const actual = action.toLowerCase();
  const expected = pattern.toLowerCase();
  const stars = wildcardCount(expected);
  if (stars > 1) return false;
  if (stars === 0) return actual === expected;
  const star = expected.indexOf("*");
  const prefix = expected.slice(0, star);
  const suffix = expected.slice(star + 1);
  return actual.startsWith(prefix) && actual.endsWith(suffix) && actual.length >= prefix.length + suffix.length;
}

export function firstMatch(action: string, patterns: string[]): string | null {
  return patterns.find((pattern) => actionMatches(action, pattern)) ?? null;
}
