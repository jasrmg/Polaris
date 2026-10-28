import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { SCHEMA_VERSION } from "./types";
import { importWorld, resetWorld, saveWorld, starterWorld, worldStore } from "./index";

// The envelope is a sandbox choice, not an Azure document. See docs/SIMULATOR.md section 10.
describe("world store", () => {
  it("round-trips and refuses a newer schema", () => {
    const store = worldStore();
    const savedAt = "2026-10-28T00:00:00.000Z";
    const world = resetWorld(store, savedAt);
    saveWorld(store, world, savedAt);
    const raw = JSON.stringify(store.load());
    const other = worldStore();
    const imported = importWorld(other, raw);
    assert.equal(imported.ok, true);
    if (imported.ok) assert.equal(imported.world.tenant.id, world.tenant.id);

    const newer = JSON.parse(raw) as { schemaVersion: number };
    newer.schemaVersion = SCHEMA_VERSION + 1;
    const refused = importWorld(worldStore(), JSON.stringify(newer));
    assert.equal(refused.ok, false);

    const memory = worldStore();
    resetWorld(memory, savedAt);
    assert.equal(memory.load()?.world.schemaVersion, SCHEMA_VERSION);
    assert.equal(starterWorld().format, "polaris-world");
  });

  it("writes through a storage-like object", () => {
    const bag = new Map<string, string>();
    const storage = {
      getItem: (key: string) => bag.get(key) ?? null,
      setItem: (key: string, value: string) => bag.set(key, value),
      removeItem: (key: string) => bag.delete(key),
    };
    const store = worldStore(storage);
    resetWorld(store, "2026-10-28T00:00:00.000Z");
    assert.equal(bag.size, 1);
    const loaded = worldStore(storage).load();
    assert.equal(loaded?.world.directory.users[loaded.world.session.actingPrincipalId].displayName, "You");
  });
});
