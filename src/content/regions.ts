/**
 * The two regions the simulator offers. Two regions are enough to try
 * regional vs global VNet peering, cross-region DNS and failover.
 */
export const regions = [
  { id: "southeastasia", name: "Southeast Asia", city: "Singapore" },
  { id: "eastasia", name: "East Asia", city: "Hong Kong" },
] as const;

export type RegionId = (typeof regions)[number]["id"];

export const regionIds: string[] = regions.map((r) => r.id);

export const defaultRegion: RegionId = "southeastasia";
