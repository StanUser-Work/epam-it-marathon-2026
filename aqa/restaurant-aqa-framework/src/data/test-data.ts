const LETTERS = 'abcdefghijklmnopqrstuvwxyz';

/** Latin-only suffix: names accept only letters, hyphen and apostrophe. */
export function randomLetters(length = 8): string {
  let out = '';
  for (let i = 0; i < length; i++) out += LETTERS[Math.floor(Math.random() * LETTERS.length)];
  return out;
}

export function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

/** Unique customer per test: the run never reuses accounts, so tests stay independent and parallel-safe. */
export function uniqueCustomer() {
  const suffix = randomLetters(10);
  return {
    firstName: capitalize(`aqa${randomLetters(4)}`),
    lastName: capitalize(`owner${suffix}`),
    email: `aqa.${suffix}.${Date.now()}@example.com`,
  };
}

/**
 * Dynamic time slot `now + N days` at a random whole hour (UTC), 90 minutes long.
 * Random day/hour spreads parallel tests over different slots so they never compete for a table.
 */
export function randomFutureSlot(): { start: Date; end: Date } {
  const start = new Date();
  start.setUTCDate(start.getUTCDate() + 2 + Math.floor(Math.random() * 80));
  start.setUTCHours(8 + Math.floor(Math.random() * 10), 0, 0, 0);
  const end = new Date(start.getTime() + 90 * 60 * 1000);
  return { start, end };
}

export const isoNoMillis = (date: Date) => date.toISOString().replace(/\.\d{3}Z$/, 'Z');

export const GUEST_NAMES = ['Andrii', 'Olena', 'Maksym', 'Iryna', 'Taras'];
