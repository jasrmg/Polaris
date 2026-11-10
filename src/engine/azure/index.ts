/**
 * Azure engine. UI and the future CLI import this. It does not import them.
 * See docs/SIMULATOR.md section 8.
 */

import { acceptCurrentSchema, createLocalStorageStore, createMemoryStore, importEnvelope, POLARIS_WORLD_KEY, type StorageLike, type WorldStore } from "../core/store";
import { SCHEMA_VERSION, type World } from "./types";
import { starterWorld } from "./starter";

export { LEARN } from "./learn";
export { starterWorld } from "./starter";
export { SCHEMA_VERSION } from "./types";
export { parseCidr, containsCidr, overlapsCidr } from "./cidr";
export { parseId, canonicalId, resourceId } from "./ids";
export { validateName, NAME_ARM_TYPES } from "./names";
export { powerIsBilled, powerLabel } from "./ops";
export { checkInboundInternet, checkOutboundInternet, checkSameVirtualNetwork, checkStorage, type InboundCheck } from "./reach";
export {
  advance,
  createManagementGroup,
  createResource,
  createResourceGroup,
  createSubscription,
  deleteManagementGroup,
  deleteResource,
  deleteResourceGroup,
  getResource,
  putLock,
  registerProvider,
  assignPolicy,
  assignRole,
  createCustomRole,
  deleteCustomRole,
  deletePolicyAssignment,
  deleteRoleAssignment,
  addInboundRule,
  addPrivateDnsRecord,
  setPrivateDnsRegistration,
  addInternetRoute,
  addSecurityRule,
  associateNicSecurityGroup,
  attachNetworkInterface,
  attachPublicIp,
  peerVirtualNetworks,
  setForwardedTraffic,
  setPeeringOptions,
  setIpForwarding,
  setServiceEndpoint,
  setStorageFirewall,
  addStoragePrivateEndpoint,
  addBlobPrivateDns,
  setPower,
  setSubscriptionState,
  unregisterProvider,
  updateResource,
  updateResourceGroup,
} from "./ops";
export {
  addGroupMember,
  clearElevatedAccess,
  createGroup,
  createManagedIdentity,
  createServicePrincipal,
  createUser,
  elevateAccess,
  setActingPrincipal,
} from "./rbac/directory";
export { evaluateAccess, findRole } from "./rbac/evaluate";
export { findBuiltInPolicy } from "./policy/dataset";
export { evaluatePolicy } from "./policy/evaluate";
export { builtInRoleFile, findBuiltInRole } from "./rbac/dataset";
export { acceptCurrentSchema, createLocalStorageStore, createMemoryStore, importEnvelope, POLARIS_WORLD_KEY };
export type { World, Resource, PowerState, SubscriptionState } from "./types";
export type { EngineOptions, CreateResourceInput } from "./ops";
export type { Result, EngineError } from "../core/result";

export function worldStore(storage?: StorageLike): WorldStore<World> {
  if (storage) return createLocalStorageStore<World>(storage);
  return createMemoryStore<World>();
}

export function saveWorld(store: WorldStore<World>, world: World, savedAt: string): void {
  store.save({ format: "polaris-world", schemaVersion: SCHEMA_VERSION, savedAt, world });
}

export function loadWorld(store: WorldStore<World>): { ok: true; world: World } | { ok: false; error: string } {
  const saved = store.load();
  if (!saved) return { ok: false, error: "No saved world." };
  const migrated = acceptCurrentSchema<World>(SCHEMA_VERSION)(saved);
  if ("error" in migrated) return { ok: false, error: migrated.error };
  return { ok: true, world: migrated.world };
}

export function resetWorld(store: WorldStore<World>, savedAt: string): World {
  const world = starterWorld();
  saveWorld(store, world, savedAt);
  return world;
}

export function importWorld(
  store: WorldStore<World>,
  raw: string,
): { ok: true; world: World } | { ok: false; error: string } {
  const imported = importEnvelope(raw, acceptCurrentSchema<World>(SCHEMA_VERSION));
  if (!imported.ok) return imported;
  store.save(imported.envelope);
  return { ok: true, world: imported.envelope.world };
}
