import { networkRepository } from '../../../repositories/networkRepository'
import { ipAllocationRepository } from '../../../repositories/ipAllocationRepository'
import { ipRangeRepository } from '../../../repositories/ipRangeRepository'
import { parseSubnet, ipToLong } from '../../../utils/ipv4'
import { parseIPv6Subnet, ipv6ToBigInt } from '../../../utils/ipv6'

/**
 * Compute the total IP count for a CIDR block.
 * For IPv6 returns a BigInt string, for IPv4 returns a number.
 */
function subnetSizeBigInt(cidr: string): bigint {
  if (cidr.includes(':')) {
    const [, prefixStr] = cidr.split('/') as [string, string]
    const hostBits = 128 - Number(prefixStr)
    return 1n << BigInt(hostBits)
  }
  const [, prefixStr] = cidr.split('/') as [string, string]
  return BigInt(2 ** (32 - Number(prefixStr)))
}

export default defineEventHandler(async (event) => {
  const id = event.context.params?.id

  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Missing network ID' })
  }

  const network = networkRepository.getById(id)

  if (!network) {
    throw createError({ statusCode: 404, statusMessage: 'Network not found' })
  }

  const allocations = ipAllocationRepository.list(id)
  const ranges = ipRangeRepository.list(id)
  const allocatedCount = allocations.length
  const rangesCount = ranges.length

  // Collect child networks (direct children whose parent_network_id === id)
  const childNetworks = networkRepository.list().filter(n => n.parent_network_id === id)

  if (network.subnet.includes(':')) {
    // ── IPv6 branch ──────────────────────────────────────────────────────────
    const info = parseIPv6Subnet(network.subnet)
    const usableBig = BigInt(info.usable_addresses)

    // Sum used_prefix range sizes
    let usedPrefixBig = 0n
    for (const r of ranges) {
      if (r.type === 'used_prefix') {
        try {
          usedPrefixBig += ipv6ToBigInt(r.end_ip) - ipv6ToBigInt(r.start_ip) + 1n
        } catch { /* skip malformed */ }
      }
    }

    // Sum child network sizes (each child occupies its full prefix space in the parent)
    let childUsedBig = 0n
    for (const child of childNetworks) {
      try {
        childUsedBig += subnetSizeBigInt(child.subnet)
      } catch { /* skip malformed */ }
    }

    // Total used = allocations + used_prefix ranges + child network space
    const totalUsedBig = BigInt(allocatedCount) + usedPrefixBig + childUsedBig

    let utilizationPercent = 0
    if (usableBig > 0n) {
      const pct = (totalUsedBig * 10000n) / usableBig
      utilizationPercent = Number(pct > 10000n ? 10000n : pct) / 100
    }

    return {
      total_ips: info.total_addresses,
      usable_ips: info.usable_addresses,
      allocated_count: allocatedCount,
      ranges_count: rangesCount,
      child_networks_count: childNetworks.length,
      free_count: null,
      utilization_percent: utilizationPercent,
      is_ipv6: true,
    }
  }

  // ── IPv4 branch ─────────────────────────────────────────────────────────────
  const subnetInfo = parseSubnet(network.subnet)
  const usableIps = subnetInfo.usable_hosts

  // Sum used_prefix ranges
  let usedPrefixIps = 0
  for (const r of ranges) {
    if (r.type === 'used_prefix') {
      usedPrefixIps += ipToLong(r.end_ip) - ipToLong(r.start_ip) + 1
    }
  }

  // Sum child network sizes
  let childUsedIps = 0
  for (const child of childNetworks) {
    if (!child.subnet.includes(':')) {
      try {
        const [, prefixStr] = child.subnet.split('/') as [string, string]
        childUsedIps += 2 ** (32 - Number(prefixStr))
      } catch { /* skip */ }
    }
  }

  const totalUsed = allocatedCount + usedPrefixIps + childUsedIps
  const freeCount = Math.max(0, usableIps - totalUsed)

  return {
    total_ips: subnetInfo.total_hosts,
    usable_ips: usableIps,
    allocated_count: allocatedCount,
    ranges_count: rangesCount,
    child_networks_count: childNetworks.length,
    free_count: freeCount,
    utilization_percent: usableIps > 0 ? Math.min(100, Math.round((totalUsed / usableIps) * 10000) / 100) : 0,
    is_ipv6: false,
  }
})
