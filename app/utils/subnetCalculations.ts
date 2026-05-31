/**
 * Frontend-only subnet calculation utilities.
 * These mirror server/utils/ipv4.ts and server/utils/ipv6.ts for use in Vue
 * components (auto-imported by Nuxt).
 */

// ---------------------------------------------------------------------------
// IPv4 helpers (unchanged)
// ---------------------------------------------------------------------------

/**
 * Converts a dotted-decimal IPv4 address to a 32-bit unsigned integer.
 */
export function ipToLong(ip: string): number {
  const parts = ip.split('.').map(Number)
  return ((parts[0]! << 24) | (parts[1]! << 16) | (parts[2]! << 8) | parts[3]!) >>> 0
}

/**
 * Result type returned by parseSubnetInfo.
 */
export interface SubnetInfo {
  network: string
  broadcast: string
  mask: string
  totalHosts: number
  usableHosts: number
  prefix: number
  /** true when the subnet is IPv6 */
  isIPv6?: boolean
}

const ZEROED_SUBNET_INFO: SubnetInfo = {
  network: '-',
  broadcast: '-',
  mask: '-',
  totalHosts: 0,
  usableHosts: 0,
  prefix: 0,
}

/**
 * Returns true when the string looks like an IPv6 address / CIDR.
 */
export function isIPv6String(s: string): boolean {
  return s.includes(':')
}

/**
 * Computes subnet details from a CIDR notation string.
 * Supports both IPv4 (e.g. "192.168.1.0/24") and IPv6 (e.g. "2001:db8::/48").
 * Returns a zeroed result for invalid input.
 */
export function parseSubnetInfo(subnet: string): SubnetInfo {
  if (!subnet) return { ...ZEROED_SUBNET_INFO }

  const parts = subnet.split('/')
  if (parts.length !== 2) return { ...ZEROED_SUBNET_INFO }

  const prefix = parseInt(parts[1]!, 10)
  if (isNaN(prefix)) return { ...ZEROED_SUBNET_INFO }

  // IPv6 branch — BigInt is available in all modern browsers
  if (isIPv6String(subnet)) {
    if (prefix < 0 || prefix > 128) return { ...ZEROED_SUBNET_INFO }
    const expanded = expandIPv6(parts[0]!)
    if (!expanded) return { ...ZEROED_SUBNET_INFO }
    const ipInt = ipv6ToBigInt(expanded)
    const hostBits = 128 - prefix
    const mask = prefix === 0 ? 0n : ((1n << 128n) - 1n) ^ ((1n << BigInt(hostBits)) - 1n)
    const networkInt = ipInt & mask
    const lastInt = networkInt | ((1n << BigInt(hostBits)) - 1n)
    const total = 1n << BigInt(hostBits)
    const usable = prefix >= 127 ? total : (total > 2n ? total - 2n : total)
    // Cap usableHosts at Number.MAX_SAFE_INTEGER for the number field (display uses BigInt string separately)
    const usableNum = usable > BigInt(Number.MAX_SAFE_INTEGER) ? Number.MAX_SAFE_INTEGER : Number(usable)
    return {
      network: bigIntToIPv6(networkInt),
      broadcast: bigIntToIPv6(lastInt), // "last address" for IPv6
      mask: `/${prefix}`,
      totalHosts: Number(total > BigInt(Number.MAX_SAFE_INTEGER) ? Number.MAX_SAFE_INTEGER : total),
      usableHosts: usableNum,
      prefix,
      isIPv6: true,
    }
  }

  // IPv4 branch (unchanged)
  if (prefix < 0 || prefix > 32) return { ...ZEROED_SUBNET_INFO }

  const ipParts = parts[0]!.split('.').map(Number)
  if (ipParts.length !== 4 || ipParts.some(p => isNaN(p) || p < 0 || p > 255)) {
    return { ...ZEROED_SUBNET_INFO }
  }

  const numToIp = (n: number) =>
    `${(n >>> 24) & 255}.${(n >>> 16) & 255}.${(n >>> 8) & 255}.${n & 255}`

  const ipNum = ((ipParts[0]! << 24) | (ipParts[1]! << 16) | (ipParts[2]! << 8) | ipParts[3]!) >>> 0
  const maskNum = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0
  const networkNum = (ipNum & maskNum) >>> 0
  const broadcastNum = (networkNum | (~maskNum >>> 0)) >>> 0
  const totalHosts = Math.pow(2, 32 - prefix)
  const usableHosts = prefix <= 30 ? totalHosts - 2 : totalHosts

  return {
    network: numToIp(networkNum),
    broadcast: numToIp(broadcastNum),
    mask: numToIp(maskNum),
    totalHosts,
    usableHosts: Math.max(0, usableHosts),
    prefix,
  }
}

// ---------------------------------------------------------------------------
// IPv6 helpers (BigInt-based, frontend-safe)
// ---------------------------------------------------------------------------

function expandIPv6(ip: string): string | null {
  ip = ip.replace(/^\[|\]$/g, '')
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
    for (const g of groups) { if (!/^[0-9a-fA-F]{1,4}$/.test(g)) return null }
    return groups.map(g => g.padStart(4, '0')).join(':')
  }
  const groups = ip.split(':')
  if (groups.length !== 8) return null
  for (const g of groups) { if (!/^[0-9a-fA-F]{1,4}$/.test(g)) return null }
  return groups.map(g => g.padStart(4, '0')).join(':')
}

function ipv6ToBigInt(ip: string): bigint {
  const expanded = expandIPv6(ip)
  if (!expanded) throw new Error(`Invalid IPv6: ${ip}`)
  return expanded.split(':').reduce((acc, g) => (acc << 16n) | BigInt(parseInt(g, 16)), 0n)
}

function bigIntToIPv6(n: bigint): string {
  const groups: string[] = []
  for (let i = 0; i < 8; i++) {
    groups.unshift((n & 0xffffn).toString(16))
    n >>= 16n
  }
  const full = groups.join(':')
  let bestStart = -1; let bestLen = 0; let curStart = -1; let curLen = 0
  for (let i = 0; i < groups.length; i++) {
    if (groups[i] === '0') {
      if (curStart === -1) { curStart = i; curLen = 1 } else curLen++
      if (curLen > bestLen) { bestLen = curLen; bestStart = curStart }
    } else { curStart = -1; curLen = 0 }
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

// ---------------------------------------------------------------------------
// Range / display helpers (family-aware)
// ---------------------------------------------------------------------------

/**
 * Abbreviates an end IP when it shares leading segments with the start IP.
 * For IPv6, returns the full end address (compression is already done).
 * Example (IPv4): abbreviateEndIp('10.0.1.1', '10.0.1.50') → '.50'
 */
export function abbreviateEndIp(startIp: string, endIp: string): string {
  // For IPv6 addresses, do not abbreviate (they are already compressed)
  if (isIPv6String(startIp) || isIPv6String(endIp)) return endIp
  const startParts = startIp.split('.')
  const endParts = endIp.split('.')
  let common = 0
  for (let i = 0; i < 4; i++) {
    if (startParts[i] === endParts[i]) common++
    else break
  }
  if (common >= 3) return '.' + endParts.slice(3).join('.')
  if (common >= 2) return '.' + endParts.slice(2).join('.')
  return endIp
}

/**
 * Returns the number of IP addresses in a range (inclusive).
 * For IPv6 ranges, returns a capped number (may be imprecise for large ranges).
 */
export function rangeIpCount(startIp: string, endIp: string): number {
  if (isIPv6String(startIp) || isIPv6String(endIp)) {
    try {
      const diff = ipv6ToBigInt(endIp) - ipv6ToBigInt(startIp) + 1n
      return diff > BigInt(Number.MAX_SAFE_INTEGER) ? Number.MAX_SAFE_INTEGER : Number(diff)
    } catch { return 0 }
  }
  return ipToLong(endIp) - ipToLong(startIp) + 1
}

/**
 * Validates a dotted-decimal IPv4 address.
 */
export function isValidIPv4(ip: string): boolean {
  const parts = ip.split('.')
  if (parts.length !== 4) return false
  return parts.every((part) => {
    const num = Number(part)
    return Number.isInteger(num) && num >= 0 && num <= 255 && part === String(num)
  })
}

/**
 * Validates an IPv6 address (any notation).
 */
export function isValidIPv6(ip: string): boolean {
  return expandIPv6(ip) !== null
}

/**
 * Returns true when the IP falls within the given CIDR subnet.
 */
export function isIPInSubnet(ip: string, cidr: string): boolean {
  const [subnetIp, prefixStr] = cidr.split('/')
  if (!subnetIp || prefixStr === undefined) return false
  const prefix = Number(prefixStr)
  const mask = prefix === 0 ? 0 : (~0 << (32 - prefix)) >>> 0
  const network = (ipToLong(subnetIp) & mask) >>> 0
  return ((ipToLong(ip) & mask) >>> 0) === network
}

/**
 * Finds the first network whose subnet contains the given IP, or null.
 * Supports both IPv4 and IPv6.
 */
export function findNetworkForIP<T extends { id: string; subnet: string }>(
  ip: string,
  networks: T[]
): T | null {
  if (!isValidIPv4(ip) && !isValidIPv6(ip)) return null
  for (const net of networks) {
    if (!net.subnet) continue
    try {
      if (isIPv6String(ip) && isIPv6String(net.subnet)) {
        // Basic IPv6 membership check — full implementation in server; this is best-effort UI
        const [subnetAddr, prefixStr] = net.subnet.split('/')
        if (!subnetAddr || !prefixStr) continue
        const pfx = Number(prefixStr)
        const hostBits = 128 - pfx
        const maskBig = pfx === 0 ? 0n : ((1n << 128n) - 1n) ^ ((1n << BigInt(hostBits)) - 1n)
        const netInt = ipv6ToBigInt(subnetAddr) & maskBig
        if ((ipv6ToBigInt(ip) & maskBig) === netInt) return net
      } else if (!isIPv6String(ip) && !isIPv6String(net.subnet)) {
        if (isIPInSubnet(ip, net.subnet)) return net
      }
    } catch { /* ignore parse errors on partial input */ }
  }
  return null
}
