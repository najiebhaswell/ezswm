export function ipToLong(ip: string): number {
  const parts = ip.split('.').map(Number)
  return ((parts[0]! << 24) | (parts[1]! << 16) | (parts[2]! << 8) | parts[3]!) >>> 0
}

export function longToIp(long: number): string {
  return [
    (long >>> 24) & 255,
    (long >>> 16) & 255,
    (long >>> 8) & 255,
    long & 255
  ].join('.')
}

export function isValidIPv4(ip: string): boolean {
  const parts = ip.split('.')
  if (parts.length !== 4) return false
  return parts.every(part => {
    const num = Number(part)
    return Number.isInteger(num) && num >= 0 && num <= 255 && part === String(num)
  })
}

export function isValidCIDR(cidr: string): boolean {
  const parts = cidr.split('/')
  if (parts.length !== 2) return false
  if (!isValidIPv4(parts[0]!)) return false
  const prefix = Number(parts[1])
  return Number.isInteger(prefix) && prefix >= 0 && prefix <= 32
}

export interface SubnetInfo {
  network_address: string
  broadcast_address: string
  subnet_mask: string
  wildcard_mask: string
  first_usable: string
  last_usable: string
  total_hosts: number
  usable_hosts: number
  prefix_length: number
}

export function parseSubnet(cidr: string): SubnetInfo {
  const [ip, prefixStr] = cidr.split('/') as [string, string]
  const prefix = Number(prefixStr)
  const ipLong = ipToLong(ip)
  const mask = prefix === 0 ? 0 : (~0 << (32 - prefix)) >>> 0
  const wildcard = (~mask) >>> 0
  const network = (ipLong & mask) >>> 0
  const broadcast = (network | wildcard) >>> 0
  const totalHosts = wildcard + 1
  const usableHosts = totalHosts > 2 ? totalHosts - 2 : totalHosts

  return {
    network_address: longToIp(network),
    broadcast_address: longToIp(broadcast),
    subnet_mask: longToIp(mask),
    wildcard_mask: longToIp(wildcard),
    first_usable: totalHosts > 2 ? longToIp(network + 1) : longToIp(network),
    last_usable: totalHosts > 2 ? longToIp(broadcast - 1) : longToIp(broadcast),
    total_hosts: totalHosts,
    usable_hosts: usableHosts,
    prefix_length: prefix
  }
}

export function isIPInSubnet(ip: string, cidr: string): boolean {
  const [subnetIp, prefixStr] = cidr.split('/') as [string, string]
  const prefix = Number(prefixStr)
  const mask = prefix === 0 ? 0 : (~0 << (32 - prefix)) >>> 0
  const network = (ipToLong(subnetIp) & mask) >>> 0
  const ipLong = ipToLong(ip)
  return (ipLong & mask) >>> 0 === network
}

/**
 * Check if an IP is a usable host address in a subnet (not network/broadcast).
 * For /31 and /32, all addresses are considered usable (RFC 3021).
 */
export function isUsableHostIP(ip: string, cidr: string): boolean {
  if (!isIPInSubnet(ip, cidr)) return false
  const [subnetIp, prefixStr] = cidr.split('/') as [string, string]
  const prefix = Number(prefixStr)
  // /31 and /32 subnets: all addresses are usable (RFC 3021)
  if (prefix >= 31) return true
  const mask = (~0 << (32 - prefix)) >>> 0
  const network = (ipToLong(subnetIp) & mask) >>> 0
  const wildcard = (~mask) >>> 0
  const broadcast = (network | wildcard) >>> 0
  const ipLong = ipToLong(ip)
  // Reject network address and broadcast address
  return ipLong !== network && ipLong !== broadcast
}

/**
 * Build a detailed error message for an IP not in subnet, showing valid range.
 */
export function subnetRangeError(ip: string, cidr: string): string {
  const info = parseSubnet(cidr)
  return `IP ${ip} is not in network ${cidr}. Valid range: ${info.first_usable} - ${info.last_usable}`
}

/**
 * Find the first network whose CIDR contains the given IP.
 */
export function findNetworkForIP(ip: string, networks: { id: string; subnet: string }[]): { id: string; subnet: string } | null {
  for (const net of networks) {
    if (isIPInSubnet(ip, net.subnet)) {
      return net
    }
  }
  return null
}

export function doRangesOverlap(
  start1: string, end1: string,
  start2: string, end2: string
): boolean {
  const s1 = ipToLong(start1)
  const e1 = ipToLong(end1)
  const s2 = ipToLong(start2)
  const e2 = ipToLong(end2)
  return s1 <= e2 && s2 <= e1
}

export function isValidMacAddress(mac: string): boolean {
  return /^([0-9A-Fa-f]{2}:){5}[0-9A-Fa-f]{2}$/.test(mac)
}

/**
 * Type guard: returns true if the string looks like an IPv4 address.
 * Quick heuristic based on the presence of dots and absence of colons.
 */
export function isIPv4(ip: string): boolean {
  return ip.includes('.') && !ip.includes(':')
}

/**
 * Type guard: returns true if the string looks like an IPv4 CIDR block.
 */
export function isCIDRv4(cidr: string): boolean {
  const slash = cidr.indexOf('/')
  if (slash === -1) return false
  return isIPv4(cidr.slice(0, slash))
}

/**
 * Check if cidrChild is fully contained within cidrParent.
 * e.g. isSubnetContainedIn('10.0.1.0/24', '10.0.0.0/16') → true
 */
export function isSubnetContainedIn(cidrChild: string, cidrParent: string): boolean {
  const [childIp, childPrefixStr] = cidrChild.split('/') as [string, string]
  const [parentIp, parentPrefixStr] = cidrParent.split('/') as [string, string]
  const childPrefix = Number(childPrefixStr)
  const parentPrefix = Number(parentPrefixStr)

  // Child must have a longer (more specific) prefix than the parent
  if (childPrefix <= parentPrefix) return false

  const parentMask = parentPrefix === 0 ? 0 : (~0 << (32 - parentPrefix)) >>> 0
  const parentNetwork = (ipToLong(parentIp) & parentMask) >>> 0
  const childNetwork = (ipToLong(childIp) & parentMask) >>> 0

  return childNetwork === parentNetwork
}

/**
 * Check if two CIDR blocks overlap (one contains the other, or they partially overlap).
 */
export function doCidrsOverlap(cidr1: string, cidr2: string): boolean {
  const [ip1, p1str] = cidr1.split('/') as [string, string]
  const [ip2, p2str] = cidr2.split('/') as [string, string]
  const p1 = Number(p1str)
  const p2 = Number(p2str)

  const mask1 = p1 === 0 ? 0 : (~0 << (32 - p1)) >>> 0
  const mask2 = p2 === 0 ? 0 : (~0 << (32 - p2)) >>> 0

  const net1 = (ipToLong(ip1) & mask1) >>> 0
  const net2 = (ipToLong(ip2) & mask2) >>> 0

  // Check if net1 start falls inside net2, or net2 start falls inside net1
  return (net1 & mask2) >>> 0 === net2 || (net2 & mask1) >>> 0 === net1
}

/**
 * Find the next available child subnet of a specific prefix length within a parent subnet.
 * Skips blocks that overlap with any of the existing subnets.
 */
export function findNextAvailableSubnet(
  parentCidr: string,
  existingCidrs: string[],
  requestedPrefix: number
): string | null {
  const [parentIp, parentPrefixStr] = parentCidr.split('/') as [string, string]
  const parentPrefix = Number(parentPrefixStr)
  
  if (requestedPrefix <= parentPrefix || requestedPrefix > 32) return null

  const stepSize = requestedPrefix === 32 ? 1 : (~0 << (32 - requestedPrefix)) >>> 0 ? ((~(~0 << (32 - requestedPrefix))) >>> 0) + 1 : 1
  
  const parentMask = parentPrefix === 0 ? 0 : (~0 << (32 - parentPrefix)) >>> 0
  const parentNetwork = (ipToLong(parentIp) & parentMask) >>> 0
  const parentWildcard = (~parentMask) >>> 0
  const parentBroadcast = (parentNetwork | parentWildcard) >>> 0

  let current = parentNetwork
  while (current <= parentBroadcast) {
    const candidateCidr = `${longToIp(current)}/${requestedPrefix}`
    
    // Check if it's fully contained in parent (should be by design, but double check bounds)
    const candidateMask = (~0 << (32 - requestedPrefix)) >>> 0
    const candidateBroadcast = (current | (~candidateMask) >>> 0) >>> 0
    
    if (candidateBroadcast > parentBroadcast) break

    // Check overlap with existing
    const hasOverlap = existingCidrs.some(existing => doCidrsOverlap(candidateCidr, existing))
    
    if (!hasOverlap) {
      return candidateCidr
    }
    
    current += stepSize
  }
  
  return null
}

/**
 * Find the next available IP address in a subnet, skipping allocated IPs and specified ranges.
 */
export function findNextAvailableIP(
  cidr: string,
  allocatedIps: string[],
  ranges: { start_ip: string; end_ip: string }[]
): string | null {
  const info = parseSubnet(cidr)
  const firstUsableLong = ipToLong(info.first_usable)
  const lastUsableLong = ipToLong(info.last_usable)
  
  const allocatedSet = new Set(allocatedIps.map(ipToLong))
  const sortedRanges = ranges
    .map(r => ({ s: ipToLong(r.start_ip), e: ipToLong(r.end_ip) }))
    .sort((a, b) => a.s - b.s)

  let current = firstUsableLong
  while (current <= lastUsableLong) {
    let advanced = false
    
    // Fast-forward past any ranges
    for (const r of sortedRanges) {
      if (current >= r.s && current <= r.e) {
        current = r.e + 1
        advanced = true
        break
      }
    }
    if (advanced) continue

    // Check allocation
    if (allocatedSet.has(current)) {
      current++
      continue
    }

    return longToIp(current)
  }

  return null
}

