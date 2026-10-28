/**
 * IPv4 CIDR checks for virtual networks and subnets.
 * A subnet reserves five addresses, so a prefix more specific than /29 cannot exist.
 * Learn: virtual-network-manage-subnet. IPv6 is not simulated (docs/SIMULATOR.md section 6).
 */

import { LEARN } from "./learn";

export interface Cidr {
  prefix: number;
  /** Network address as a uint32. */
  network: number;
  size: number;
}

export const SUBNET_RESERVED = 5;
export const CIDR_LEARN = LEARN.subnet;

export function parseCidr(value: string): Cidr | { error: string } {
  const match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})\/(\d{1,2})$/.exec(value.trim());
  if (!match) return { error: `"${value}" is not an IPv4 CIDR. IPv6 is not simulated.` };
  const octets = [match[1], match[2], match[3], match[4]].map(Number);
  const prefix = Number(match[5]);
  if (octets.some((n) => n > 255) || prefix > 32) {
    return { error: `"${value}" is not an IPv4 CIDR.` };
  }
  const ip = ((octets[0] << 24) | (octets[1] << 16) | (octets[2] << 8) | octets[3]) >>> 0;
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  const network = (ip & mask) >>> 0;
  const size = 2 ** (32 - prefix);
  return { prefix, network, size };
}

export function containsCidr(outer: Cidr, inner: Cidr): boolean {
  if (inner.prefix < outer.prefix) return false;
  const mask = outer.prefix === 0 ? 0 : (0xffffffff << (32 - outer.prefix)) >>> 0;
  return (inner.network & mask) >>> 0 === outer.network;
}

export function overlapsCidr(a: Cidr, b: Cidr): boolean {
  return containsCidr(a, b) || containsCidr(b, a);
}

export function formatCidr(cidr: Cidr): string {
  const n = cidr.network;
  const ip = [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join(".");
  return `${ip}/${cidr.prefix}`;
}

/** A subnet must be large enough for the five reserved addresses. */
export function subnetTooSmall(cidr: Cidr): boolean {
  return cidr.size < SUBNET_RESERVED;
}
