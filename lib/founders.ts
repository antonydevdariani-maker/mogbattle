export const FOUNDER_USERNAMES = new Set(["antonydevd", "blazibuzz", "vibecodedthis"]);

export function isFounder(username: string | null | undefined): boolean {
  if (!username) return false;
  return FOUNDER_USERNAMES.has(username.toLowerCase());
}
