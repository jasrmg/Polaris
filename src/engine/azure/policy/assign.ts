/**
 * Create and delete policy assignments for the shipped built-in definitions.
 * Custom definitions, initiatives, exemptions, append, and modify are not simulated.
 */

import type { EngineError } from "../../core/result";
import { canonicalId } from "../ids";
import { LEARN } from "../learn";
import type { PolicyAssignment, PolicyParameter, World } from "../types";
import { findBuiltInPolicy, type BuiltInPolicy, type BuiltInPolicyParameter } from "./dataset";

export interface PolicyAssignmentInput {
  name: string;
  scope: string;
  policyDefinitionId: string;
  parameters?: Record<string, PolicyParameter>;
  displayName?: string;
  description?: string;
  enforcementMode?: "Default" | "DoNotEnforce";
  notScopes?: string[];
}

export function policyAssignmentId(scope: string, name: string): string {
  const base = canonicalId(scope) === "/" ? "" : scope.replace(/\/$/, "");
  return `${base}/providers/Microsoft.Authorization/policyAssignments/${name}`;
}

function scopeExists(world: World, scope: string): boolean {
  const id = canonicalId(scope);
  if (id === "/") return true;
  return Boolean(world.managementGroups[id] || world.subscriptions[id] || world.resourceGroups[id] || world.resources[id]);
}

function parameterError(definition: BuiltInPolicy, parameters: Record<string, PolicyParameter>): EngineError | null {
  for (const key of Object.keys(parameters)) {
    if (!definition.properties.parameters[key]) {
      return {
        code: "InvalidPolicyParameter",
        message: `${definition.properties.displayName} has no parameter ${key}.`,
        step: "validate",
        learnUrl: LEARN.policyAssignment,
        target: key,
      };
    }
  }
  for (const [key, spec] of Object.entries(definition.properties.parameters) as [string, BuiltInPolicyParameter][]) {
    const value = parameters[key];
    if (value === undefined) {
      if (spec.defaultValue !== undefined) continue;
      return {
        code: "InvalidPolicyParameter",
        message: `${definition.properties.displayName} needs parameter ${key}.`,
        step: "validate",
        learnUrl: LEARN.policyAssignment,
        target: key,
      };
    }
    const expectsArray = spec.type.toLowerCase() === "array";
    if (expectsArray !== Array.isArray(value)) {
      return {
        code: "InvalidPolicyParameter",
        message: expectsArray ? `${key} must be an array.` : `${key} must be a string.`,
        step: "validate",
        learnUrl: LEARN.policyAssignment,
        target: key,
      };
    }
    if (typeof value === "string" && spec.allowedValues && !spec.allowedValues.some((allowed) => allowed.toLowerCase() === value.toLowerCase())) {
      return {
        code: "InvalidPolicyParameter",
        message: `${key} must be one of ${spec.allowedValues.join(", ")}.`,
        step: "validate",
        learnUrl: LEARN.policyAssignment,
        target: key,
      };
    }
  }
  return null;
}

export function normalizeParameters(definition: BuiltInPolicy, parameters: Record<string, PolicyParameter>): Record<string, PolicyParameter> {
  const next: Record<string, PolicyParameter> = { ...parameters };
  for (const [key, spec] of Object.entries(definition.properties.parameters)) {
    if (next[key] === undefined && spec.defaultValue !== undefined) next[key] = spec.defaultValue;
    if (typeof next[key] === "string" && spec.allowedValues) {
      const match = spec.allowedValues.find((allowed) => allowed.toLowerCase() === (next[key] as string).toLowerCase());
      if (match) next[key] = match;
    }
  }
  return next;
}

export function preparePolicyAssignment(world: World, input: PolicyAssignmentInput): { error: EngineError } | { assignment: PolicyAssignment } {
  if (!input.name.trim() || input.name.includes("/")) {
    return {
      error: {
        code: "InvalidPolicyAssignment",
        message: "A policy assignment name cannot be empty or contain a slash. (sandbox wording)",
        step: "validate",
        learnUrl: LEARN.policyAssignment,
        target: input.name,
      },
    };
  }
  if (!scopeExists(world, input.scope)) {
    return {
      error: {
        code: "ScopeNotFound",
        message: `Scope ${input.scope} was not found. (sandbox wording)`,
        step: "validate",
        learnUrl: LEARN.policyAssignment,
        target: input.scope,
      },
    };
  }
  const definition = findBuiltInPolicy(input.policyDefinitionId);
  if (!definition) {
    return {
      error: {
        code: "PolicyDefinitionNotFound",
        message: "This sandbox evaluates five built-in policies. Custom definitions and initiatives are not simulated.",
        step: "validate",
        learnUrl: LEARN.policyOverview,
        target: input.policyDefinitionId,
      },
    };
  }
  const displayName = input.displayName ?? definition.properties.displayName;
  if (displayName.length > 128 || (input.description && input.description.length > 512)) {
    return {
      error: {
        code: "InvalidPolicyAssignment",
        message: "A policy assignment display name can be 128 characters and a description 512.",
        step: "validate",
        learnUrl: LEARN.policyAssignment,
      },
    };
  }
  const enforcementMode = input.enforcementMode ?? "Default";
  if (enforcementMode !== "Default" && enforcementMode !== "DoNotEnforce") {
    return {
      error: {
        code: "InvalidPolicyAssignment",
        message: "Enforcement mode is Default or DoNotEnforce. Enroll is not simulated.",
        step: "validate",
        learnUrl: LEARN.policyAssignment,
      },
    };
  }
  const parameters = normalizeParameters(definition, input.parameters ?? {});
  const invalid = parameterError(definition, parameters);
  if (invalid) return { error: invalid };
  const id = policyAssignmentId(input.scope, input.name);
  return {
    assignment: {
      id,
      name: input.name,
      displayName,
      description: input.description,
      scope: input.scope,
      policyDefinitionId: definition.id,
      parameters,
      enforcementMode,
      notScopes: input.notScopes ?? [],
    },
  };
}
