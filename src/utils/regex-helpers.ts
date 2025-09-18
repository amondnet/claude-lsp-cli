/**
 * Type-safe regex match helper for noUncheckedIndexedAccess
 * Returns the match groups or null if any expected group is missing
 */
export function safeMatch(
  text: string,
  regex: RegExp,
  expectedGroups: number
): RegExpMatchArray | null {
  const match = text.match(regex);
  if (!match) return null;

  // Check all expected groups exist
  for (let i = 1; i <= expectedGroups; i++) {
    if (!match[i]) return null;
  }

  return match;
}

/**
 * Parse integer from possibly undefined string
 */
export function parseIntSafe(value: string | undefined, defaultValue = 0): number {
  return value ? parseInt(value) : defaultValue;
}
