/**
 * Versioned world envelope. The store does not know what a subscription is.
 * See docs/SIMULATOR.md section 10.
 */

export const WORLD_FORMAT = "polaris-world" as const;

export interface WorldEnvelope<T> {
  format: typeof WORLD_FORMAT;
  schemaVersion: number;
  savedAt: string;
  world: T;
}

export interface WorldStore<T> {
  load(): WorldEnvelope<T> | null;
  save(envelope: WorldEnvelope<T>): void;
  clear(): void;
}

export type Migrate<T> = (envelope: WorldEnvelope<T>) => WorldEnvelope<T> | { error: string };

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export const POLARIS_WORLD_KEY = "polaris-world";

/**
 * Accept the current schema. Newer envelopes are refused whole.
 * Older versions will grow a migrate function when the schema bumps.
 */
export function acceptCurrentSchema<T>(current: number): Migrate<T> {
  return (envelope) => {
    if (envelope.format !== WORLD_FORMAT) {
      return { error: "This file is not a Polaris world." };
    }
    if (envelope.schemaVersion > current) {
      return {
        error: `This world uses schema ${envelope.schemaVersion}. This build understands schema ${current}.`,
      };
    }
    if (envelope.schemaVersion < current) {
      return { error: `Schema ${envelope.schemaVersion} has no migration to ${current}.` };
    }
    return envelope;
  };
}

export function createMemoryStore<T>(): WorldStore<T> {
  let saved: WorldEnvelope<T> | null = null;
  return {
    load: () => (saved ? structuredClone(saved) : null),
    save: (envelope) => {
      saved = structuredClone(envelope);
    },
    clear: () => {
      saved = null;
    },
  };
}

export function createLocalStorageStore<T>(
  storage: StorageLike,
  key: string = POLARIS_WORLD_KEY,
): WorldStore<T> {
  return {
    load: () => {
      const raw = storage.getItem(key);
      if (!raw) return null;
      return JSON.parse(raw) as WorldEnvelope<T>;
    },
    save: (envelope) => {
      storage.setItem(key, JSON.stringify(envelope));
    },
    clear: () => {
      storage.removeItem(key);
    },
  };
}

export function importEnvelope<T>(
  raw: string,
  migrate: Migrate<T>,
): { ok: true; envelope: WorldEnvelope<T> } | { ok: false; error: string } {
  let parsed: WorldEnvelope<T>;
  try {
    parsed = JSON.parse(raw) as WorldEnvelope<T>;
  } catch {
    return { ok: false, error: "The file is not valid JSON." };
  }
  const migrated = migrate(parsed);
  if ("error" in migrated) return { ok: false, error: migrated.error };
  return { ok: true, envelope: migrated };
}
