/**
 * IPv6 utility functions.
 * Uses BigInt for all 128-bit arithmetic — JavaScript bitwise operators
 * are limited to 32 bits and cannot be used for IPv6.
 */

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

/**
 * Expand a possibly-compressed IPv6 address to its full 8-group form.
 * Returns null if the address is invalid.
 */
export function expandIPv6(ip: string): string | null {
  // Remove surrounding brackets if any (e.g. [::1])
  ip = ip.replace(/^\[|\]$/g, '')

  // Handle '::' (double colon) expansion
  const halves = ip.split('::')
  if (halves.length > 2) return null

  let left: string[] = []
  let right: string[] = []

  if (halves.length === 2) {
    left = halves[0] ? halves[0].split(':') : []
    right = halves[1] ? halves[1].split(':') : []
    const missing = 8 - left.length - right.length
    if (missing < 0) return null
    const middle = Array(missing).fill('0')
    const groups = [...left, ...middle, ...right]
    if (groups.length !== 8) return null
    for (const g of groups) {
      if (!/^[0-9a-fA-F]{1,4}$/.test(g)) return null
    }
    return groups.map(g => g.padStart(4, '0')).join(':')
  }

  // No '::'
  const groups = ip.split(':')
  if (groups.length !== 8) return null
  for (const g of groups) {
    if (!/^[0-9a-fA-F]{1,4}$/.test(g)) return null
  }
  return groups.map(g => g.padStart(4, '0')).join(':')
}

/**
 * Returns true if the string is a valid IPv6 address (any notation).
 */
export function isValidIPv6(ip: string): boolean {
  return expandIPv6(ip) !== null
}

/**
 * Returns true if the string is a valid IPv6 CIDR (e.g. "2001:db8::/32").
 */
export function isValidIPv6CIDR(cidr: string): boolean {
  const parts = cidr.split('/')
  if (parts.length !== 2) return false
  if (!isValidIPv6(parts[0]!)) return false
  const prefix = Number(parts[1])
  return Number.isInteger(prefix) && prefix >= 0 && prefix <= 128
}

// ---------------------------------------------------------------------------
// Conversion
// ---------------------------------------------------------------------------

/**
 * Convert an IPv6 address string to a BigInt (128-bit).
 * The address must be valid; pass through expandIPv6() first.
 */
export function ipv6ToBigInt(ip: string): bigint {
  const expanded = expandIPv6(ip)
  if (!expanded) throw new Error(`Invalid IPv6 address: ${ip}`)
  return expanded.split(':').reduce((acc, group) => (acc << 16n) | BigInt(parseInt(group, 16)), 0n)
}

/**
 * Convert a BigInt back to a compressed IPv6 address string.
 */
export function bigIntToIPv6(n: bigint): string {
  const groups: string[] = []
  for (let i = 0; i < 8; i++) {
    groups.unshift((n & 0xffffn).toString(16))
    n >>= 16n
  }
  // Compress longest consecutive run of '0' groups using '::'
  const full = groups.join(':')
  // Find the longest run of :0: groups
  let bestStart = -1
  let bestLen = 0
  let curStart = -1
  let curLen = 0
  for (let i = 0; i < groups.length; i++) {
    if (groups[i] === '0') {
      if (curStart === -1) { curStart = i; curLen = 1 }
      else curLen++
      if (curLen > bestLen) { bestLen = curLen; bestStart = curStart }
    } else {
      curStart = -1; curLen = 0
    }
  }
  if (bestLen >= 2) {
    const before = groups.slice(0, bestStart).join(':')
    const after = groups.slice(bestStart + bestLen).join(':')
    if (!before && !after) return '::'
    if (!before) return `::${after}`
    if (!after) return `${before}::`
    return `${before}::${after}`
  }
  return full
}

/**
 * Return the compressed form of an IPv6 address.
 */
export function compressIPv6(ip: string): string {
  const expanded = expandIPv6(ip)
  if (!expanded) throw new Error(`Invalid IPv6 address: ${ip}`)
  return bigIntToIPv6(ipv6ToBigInt(ip))
}

// ---------------------------------------------------------------------------
// Subnet calculations
// ---------------------------------------------------------------------------

export interface IPv6SubnetInfo {
  network_address: string
  last_address: string
  first_usable: string
  last_usable: string
  total_addresses: string // stringified BigInt — too large for JS Number
  usable_addresses: string
  prefix_length: number
}

/**
 * Parse an IPv6 CIDR and return subnet info.
 * For /127 and /128 all addresses are usable (RFC 6164).
 */
export function parseIPv6Subnet(cidr: string): IPv6SubnetInfo {
  const [ip, prefixStr] = cidr.split('/') as [string, string]
  const prefix = Number(prefixStr)

  const ipInt = ipv6ToBigInt(ip)
  const hostBits = 128 - prefix
  const mask = prefix === 0 ? 0n : ((1n << 128n) - 1n) ^ ((1n << BigInt(hostBits)) - 1n)
  const network = ipInt & mask
  const last = network | ((1n << BigInt(hostBits)) - 1n)
  const total = 1n << BigInt(hostBits)

  // For /127 and /128 all addresses usable (RFC 6164 / RFC 4291)
  let firstUsable: bigint
  let lastUsable: bigint
  let usable: bigint

  if (prefix >= 127) {
    firstUsable = network
    lastUsable = last
    usable = total
  } else {
    firstUsable = network + 1n
    lastUsable = last - 1n
    usable = total > 2n ? total - 2n : total
  }

  return {
    network_address: bigIntToIPv6(network),
    last_address: bigIntToIPv6(last),
    first_usable: bigIntToIPv6(firstUsable),
    last_usable: bigIntToIPv6(lastUsable),
    total_addresses: total.toString(),
    usable_addresses: usable.toString(),
    prefix_length: prefix
  }
}

// ---------------------------------------------------------------------------
// Membership and containment
// ---------------------------------------------------------------------------

/**
 * Returns true if `ip` is within the IPv6 CIDR block.
 */
export function isIPv6InSubnet(ip: string, cidr: string): boolean {
  const [subnetIp, prefixStr] = cidr.split('/') as [string, string]
  const prefix = Number(prefixStr)
  const hostBits = 128 - prefix
  const mask = prefix === 0 ? 0n : ((1n << 128n) - 1n) ^ ((1n << BigInt(hostBits)) - 1n)
  const network = ipv6ToBigInt(subnetIp) & mask
  const ipInt = ipv6ToBigInt(ip)
  return (ipInt & mask) === network
}

/**
 * Returns true if ip is a usable host address in the subnet.
 * For /127 and /128 all addresses are usable (RFC 6164).
 */
export function isUsableHostIPv6(ip: string, cidr: string): boolean {
  if (!isIPv6InSubnet(ip, cidr)) return false
  const [, prefixStr] = cidr.split('/') as [string, string]
  const prefix = Number(prefixStr)
  if (prefix >= 127) return true
  const info = parseIPv6Subnet(cidr)
  const ipInt = ipv6ToBigInt(ip)
  return ipInt !== ipv6ToBigInt(info.network_address) && ipInt !== ipv6ToBigInt(info.last_address)
}

/**
 * Detailed error message for an IP not in subnet.
 */
export function ipv6SubnetRangeError(ip: string, cidr: string): string {
  const info = parseIPv6Subnet(cidr)
  return `IP ${ip} is not in network ${cidr}. Valid range: ${info.first_usable} – ${info.last_usable}`
}

/**
 * Check if two IPv6 ranges overlap.
 */
export function doIPv6RangesOverlap(
  start1: string, end1: string,
  start2: string, end2: string
): boolean {
  const s1 = ipv6ToBigInt(start1)
  const e1 = ipv6ToBigInt(end1)
  const s2 = ipv6ToBigInt(start2)
  const e2 = ipv6ToBigInt(end2)
  return s1 <= e2 && s2 <= e1
}

/**
 * Check if two IPv6 CIDR blocks overlap (either contains the other or partially overlap).
 */
export function doIPv6CidrsOverlap(cidr1: string, cidr2: string): boolean {
  const [ip1, p1str] = cidr1.split('/') as [string, string]
  const [ip2, p2str] = cidr2.split('/') as [string, string]
  const p1 = Number(p1str)
  const p2 = Number(p2str)

  const h1 = 128 - p1
  const h2 = 128 - p2
  const mask1 = p1 === 0 ? 0n : ((1n << 128n) - 1n) ^ ((1n << BigInt(h1)) - 1n)
  const mask2 = p2 === 0 ? 0n : ((1n << 128n) - 1n) ^ ((1n << BigInt(h2)) - 1n)

  const net1 = ipv6ToBigInt(ip1) & mask1
  const net2 = ipv6ToBigInt(ip2) & mask2

  return (net1 & mask2) === net2 || (net2 & mask1) === net1
}

/**
 * Returns true if cidrChild is fully contained within cidrParent.
 */
export function isIPv6SubnetContainedIn(cidrChild: string, cidrParent: string): boolean {
  const [childIp, childPrefixStr] = cidrChild.split('/') as [string, string]
  const [parentIp, parentPrefixStr] = cidrParent.split('/') as [string, string]
  const childPrefix = Number(childPrefixStr)
  const parentPrefix = Number(parentPrefixStr)

  // Child must have a longer prefix (more specific)
  if (childPrefix <= parentPrefix) return false

  const parentHostBits = 128 - parentPrefix
  const parentMask = parentPrefix === 0 ? 0n : ((1n << 128n) - 1n) ^ ((1n << BigInt(parentHostBits)) - 1n)
  const parentNetwork = ipv6ToBigInt(parentIp) & parentMask
  const childNetwork = ipv6ToBigInt(childIp) & parentMask

  return childNetwork === parentNetwork
}

// ---------------------------------------------------------------------------
// Next-available helpers (mirrors ipv4.ts)
// ---------------------------------------------------------------------------

/**
 * Find the next available child subnet of a specific prefix length within a parent IPv6 subnet.
 */
export function findNextAvailableIPv6Subnet(
  parentCidr: string,
  existingCidrs: string[],
  requestedPrefix: number
): string | null {
  const [parentIp, parentPrefixStr] = parentCidr.split('/') as [string, string]
  const parentPrefix = Number(parentPrefixStr)

  if (requestedPrefix <= parentPrefix || requestedPrefix > 128) return null

  const parentHostBits = 128 - parentPrefix
  const parentMask = parentPrefix === 0 ? 0n : ((1n << 128n) - 1n) ^ ((1n << BigInt(parentHostBits)) - 1n)
  const parentNetwork = ipv6ToBigInt(parentIp) & parentMask
  const parentLast = parentNetwork | ((1n << BigInt(parentHostBits)) - 1n)

  const childHostBits = 128 - requestedPrefix
  const stepSize = 1n << BigInt(childHostBits)
  const childMask = requestedPrefix === 0 ? 0n : ((1n << 128n) - 1n) ^ ((1n << BigInt(childHostBits)) - 1n)

  let current = parentNetwork
  while (current <= parentLast) {
    const candidateCidr = `${bigIntToIPv6(current)}/${requestedPrefix}`
    const candidateLast = current | ((1n << BigInt(childHostBits)) - 1n)

    if (candidateLast > parentLast) break

    // Verify candidate is correctly aligned
    if ((current & childMask) !== current) {
      current += stepSize
      continue
    }

    const hasOverlap = existingCidrs.some(existing => doIPv6CidrsOverlap(candidateCidr, existing))
    if (!hasOverlap) return candidateCidr

    current += stepSize
  }

  return null
}

/**
 * Find the next available IPv6 address in a subnet, skipping allocated IPs and ranges.
 */
export function findNextAvailableIPv6(
  cidr: string,
  allocatedIps: string[],
  ranges: { start_ip: string; end_ip: string }[]
): string | null {
  const info = parseIPv6Subnet(cidr)
  const firstUsable = ipv6ToBigInt(info.first_usable)
  const lastUsable = ipv6ToBigInt(info.last_usable)

  const allocatedSet = new Set(allocatedIps.map(ip => ipv6ToBigInt(ip)))
  const sortedRanges = ranges
    .map(r => ({ s: ipv6ToBigInt(r.start_ip), e: ipv6ToBigInt(r.end_ip) }))
    .sort((a, b) => (a.s < b.s ? -1 : a.s > b.s ? 1 : 0))

  let current = firstUsable
  while (current <= lastUsable) {
    let advanced = false

    for (const r of sortedRanges) {
      if (current >= r.s && current <= r.e) {
        current = r.e + 1n
        advanced = true
        break
      }
    }
    if (advanced) continue

    if (allocatedSet.has(current)) {
      current++
      continue
    }

    return bigIntToIPv6(current)
  }

  return null
}
