/**
 * Deny and audit for the shipped built-in policies.
 * Rules are matched by definition id. This is not a general policy-language interpreter.
 * Sources: docs/research/policy-model.md.
 */

import type { EngineError } from "../../core/result";
import { canonicalId } from "../ids";
import { LEARN } from "../learn";
import { ancestorScopes, cloneWorld } from "../rules";
import type { PolicyAssignment, PolicyParameter, PolicyState, Resource, ResourceGroup, World } from "../types";
import { findBuiltInPolicy, type BuiltInPolicy } from "./dataset";

export interface PolicySubject {
  id: string;
  name: string;
  type: string;
  location?: string;
  tags?: Record<string, string>;
  kind: "resource" | "resourceGroup";
}

export interface PolicyEvaluation {
  error: EngineError | null;
  states: PolicyState[];
  detail: string;
}

const ALLOWED_LOCATIONS = "e56962a6-4747-49cd-b67b-bf8b01975c4c";
const ALLOWED_TYPES = "a08ec900-254a-4555-9bf5-e42af04b5c5c";
const NOT_ALLOWED_TYPES = "6c112d4e-5bc7-47ae-a041-ea2d9dccd749";
const REQUIRE_TAG_VALUE = "1e30110a-5ceb-460c-a204-c1c3969c6d62";
const REQUIRE_TAG = "871b6d14-10aa-478d-b590-94f262ecfa99";

export function policyStateKey(resourceId: string, assignmentId: string): string {
  return `${canonicalId(resourceId)}|${canonicalId(assignmentId)}`;
}

export function subjectFromResource(resource: Resource): PolicySubject {
  return {
    id: resource.id,
    name: resource.name,
    type: resource.type,
    location: resource.location,
    tags: resource.tags,
    kind: "resource",
  };
}

export function subjectFromGroup(group: ResourceGroup): PolicySubject {
  return {
    id: group.id,
    name: group.name,
    type: "Microsoft.Resources/subscriptions/resourceGroups",
    location: group.location,
    tags: group.tags,
    kind: "resourceGroup",
  };
}

function strings(value: PolicyParameter | undefined): string[] {
  if (Array.isArray(value)) return value;
  if (typeof value === "string") return [value];
  return [];
}

function text(value: PolicyParameter | undefined): string {
  return typeof value === "string" ? value : "";
}

function same(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}

function tagValue(tags: Record<string, string> | undefined, name: string): string | undefined {
  if (!tags) return undefined;
  const found = Object.keys(tags).find((key) => same(key, name));
  return found === undefined ? undefined : tags[found];
}

/** Indexed mode evaluates resource types that support tags and location, not resource groups or child resources. */
function appliesToSubject(definition: BuiltInPolicy, subject: PolicySubject): boolean {
  if (definition.properties.mode === "All") return true;
  if (subject.kind === "resourceGroup") return false;
  return subject.type.split("/").length <= 2;
}

function effectOf(definition: BuiltInPolicy, parameters: Record<string, PolicyParameter>): "audit" | "deny" | "disabled" | null {
  const declared = definition.properties.policyRule.then.effect;
  const raw = declared === "[parameters('effect')]" ? text(parameters.effect) || "Deny" : declared;
  const effect = raw.toLowerCase();
  if (effect === "audit" || effect === "deny" || effect === "disabled") return effect;
  return null;
}

function ruleMatches(definition: BuiltInPolicy, subject: PolicySubject, parameters: Record<string, PolicyParameter>): boolean {
  const type = subject.type;
  const location = (subject.location ?? "").toLowerCase();
  switch (definition.name) {
    case ALLOWED_LOCATIONS: {
      if (location === "global") return false;
      if (same(type, "Microsoft.AzureActiveDirectory/b2cDirectories")) return false;
      const allowed = strings(parameters.listOfAllowedLocations).map((item) => item.toLowerCase());
      return !allowed.includes(location);
    }
    case ALLOWED_TYPES:
      return !strings(parameters.listOfResourceTypesAllowed).some((item) => same(item, type));
    case NOT_ALLOWED_TYPES:
      return strings(parameters.listOfResourceTypesNotAllowed).some((item) => same(item, type));
    case REQUIRE_TAG_VALUE:
      return tagValue(subject.tags, text(parameters.tagName)) !== text(parameters.tagValue);
    case REQUIRE_TAG:
      return tagValue(subject.tags, text(parameters.tagName)) === undefined;
    default:
      return false;
  }
}

function assignmentApplies(world: World, assignment: PolicyAssignment, subject: PolicySubject): boolean {
  const ancestors = new Set(ancestorScopes(world, subject.id).map(canonicalId));
  if (!ancestors.has(canonicalId(assignment.scope))) return false;
  return !assignment.notScopes.some((scope) => ancestors.has(canonicalId(scope)));
}

export function evaluatePolicy(world: World, subject: PolicySubject): PolicyEvaluation {
  const applicable = Object.values(world.policyAssignments)
    .filter((assignment) => assignmentApplies(world, assignment, subject))
    .sort((a, b) => canonicalId(a.id).localeCompare(canonicalId(b.id)));

  const states: PolicyState[] = [];
  let denial: { assignment: PolicyAssignment; definition: BuiltInPolicy } | null = null;

  for (const assignment of applicable) {
    const definition = findBuiltInPolicy(assignment.policyDefinitionId);
    if (!definition || !appliesToSubject(definition, subject)) continue;
    const effect = effectOf(definition, assignment.parameters);
    if (!effect || effect === "disabled") continue;
    if (!ruleMatches(definition, subject, assignment.parameters)) continue;
    states.push({
      resourceId: subject.id,
      assignmentId: assignment.id,
      policyDefinitionId: definition.id,
      complianceState: "NonCompliant",
      effect,
    });
    if (effect === "deny" && assignment.enforcementMode === "Default" && !denial) {
      denial = { assignment, definition };
    }
  }

  if (denial) {
    const { assignment, definition } = denial;
    return {
      error: {
        code: "RequestDisallowedByPolicy",
        message: `Resource '${subject.name}' was disallowed by policy. Policy identifiers: policyAssignment '${assignment.displayName}' (${assignment.id}); policyDefinition '${definition.properties.displayName}' (${definition.id}). The request is returned as a 403 (Forbidden).`,
        step: "policy",
        learnUrl: LEARN.policyDisallowed,
        target: subject.name,
      },
      states,
      detail: definition.properties.displayName,
    };
  }

  if (states.length === 0) return { error: null, states, detail: "Compliant." };
  return { error: null, states, detail: "Non-compliant. The request is not stopped." };
}

export function replaceResourcePolicyStates(world: World, resourceId: string, states: PolicyState[]): World {
  const next = cloneWorld(world);
  const id = canonicalId(resourceId);
  for (const [key, state] of Object.entries(next.policyStates)) {
    if (canonicalId(state.resourceId) === id) delete next.policyStates[key];
  }
  for (const state of states) next.policyStates[policyStateKey(state.resourceId, state.assignmentId)] = state;
  return next;
}

export function forgetPolicyStates(world: World, resourceIds: string[]): World {
  const ids = resourceIds.map(canonicalId);
  const next = cloneWorld(world);
  for (const [key, state] of Object.entries(next.policyStates)) {
    const resource = canonicalId(state.resourceId);
    if (ids.some((id) => resource === id || resource.startsWith(`${id}/`))) delete next.policyStates[key];
  }
  return next;
}

/** Existing resources are marked, not deleted, when an assignment is created. There is no background compliance cycle. */
export function rebuildCompliance(world: World): World {
  const next = cloneWorld(world);
  next.policyStates = {};
  const subjects = [
    ...Object.values(next.resourceGroups).map(subjectFromGroup),
    ...Object.values(next.resources).map(subjectFromResource),
  ];
  for (const subject of subjects) {
    const result = evaluatePolicy(next, subject);
    for (const state of result.states) {
      next.policyStates[policyStateKey(state.resourceId, state.assignmentId)] = state;
    }
  }
  return next;
}
