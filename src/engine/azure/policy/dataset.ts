/**
 * The five built-in policies checkpoint 14 evaluates.
 * Copied from Azure/azure-policy on 2026-11-03. See docs/research/policy-model.md.
 */

import file from "../data/built-in-policies.json";

export interface BuiltInPolicyParameter {
  type: string;
  defaultValue?: string;
  allowedValues?: string[];
  metadata?: { description?: string; displayName?: string };
}

export interface BuiltInPolicy {
  id: string;
  name: string;
  properties: {
    displayName: string;
    description: string;
    mode: "Indexed" | "All";
    version: string;
    metadata: { category: string; version: string };
    parameters: Record<string, BuiltInPolicyParameter>;
    policyRule: { then: { effect: string } };
  };
}

const definitions = file.definitions as unknown as BuiltInPolicy[];

export function builtInPolicies(): BuiltInPolicy[] {
  return definitions;
}

export function findBuiltInPolicy(idOrName: string): BuiltInPolicy | null {
  const key = idOrName.trim().toLowerCase();
  return (
    definitions.find(
      (definition) =>
        definition.id.toLowerCase() === key ||
        definition.name.toLowerCase() === key ||
        definition.properties.displayName.toLowerCase() === key,
    ) ?? null
  );
}
