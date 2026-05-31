import { switchRepository } from '../../repositories/switchRepository'
import { vlanRepository } from '../../repositories/vlanRepository'
import { networkRepository } from '../../repositories/networkRepository'
import { ipAllocationRepository } from '../../repositories/ipAllocationRepository'
import { ipRangeRepository } from '../../repositories/ipRangeRepository'
import { activityRepository } from '../../repositories/activityRepository'
import { parseSubnet, ipToLong } from '../../utils/ipv4'
import { parseIPv6Subnet, ipv6ToBigInt } from '../../utils/ipv6'

export default defineEventHandler((event) => {
  const query = getQuery(event)
  const siteId = query.site_id as string | undefined

  let switches = switchRepository.list()
  let vlans = vlanRepository.list()
  let networks = networkRepository.list()
  const allocations = ipAllocationRepository.list()
  const ranges = ipRangeRepository.list()
  const { entries: recentActivity } = activityRepository.list(10)

  if (siteId) {
    switches = switches.filter(s => s.site_id === siteId)
    vlans = vlans.filter(v => v.site_id === siteId)
    networks = networks.filter(n => n.site_id === siteId)
  }

  // Port status counts
  let portsUp = 0, portsDown = 0, portsDisabled = 0
  for (const sw of switches) {
    for (const port of sw.ports) {
      if (port.status === 'up') portsUp++
      else if (port.status === 'down') portsDown++
      else portsDisabled++
    }
  }

  // Network utilization
  const vlanMap = new Map(vlans.map(v => [v.id, v]))
  const networkUtilization = networks.map(n => {
    const v6 = n.subnet.includes(':')
    const allocated = allocations.filter(a => a.network_id === n.id).length
    const networkRanges = ranges.filter(r => r.network_id === n.id)
    const vlan = n.vlan_id ? vlanMap.get(n.vlan_id) : null

    if (v6) {
      // IPv6: compute range counts using BigInt, cap to JS number for display
      const info = parseIPv6Subnet(n.subnet)
      const usableBig = BigInt(info.usable_addresses)

      let dhcpIps = 0n
      let reservedIps = 0n
      let usedPrefixIps = 0n
      for (const r of networkRanges) {
        try {
          const count = ipv6ToBigInt(r.end_ip) - ipv6ToBigInt(r.start_ip) + 1n
          if (r.type === 'dhcp') dhcpIps += count
          else if (r.type === 'reserved') reservedIps += count
          else if (r.type === 'used_prefix') usedPrefixIps += count
        } catch { /* skip malformed ranges */ }
      }

      const pctOf = (part: bigint) =>
        usableBig > 0n ? Number((part * 100n) / usableBig > 100n ? 100n : (part * 100n) / usableBig) : 0

      // Child network space (only IPv6 children in IPv6 parent)
      let childUsedBig = 0n
      for (const child of networks.filter(c => c.parent_network_id === n.id && c.subnet.includes(':'))) {
        try {
          const [, p] = child.subnet.split('/') as [string, string]
          childUsedBig += 1n << BigInt(128 - Number(p))
        } catch { /* skip */ }
      }

      const totalUsedBig = BigInt(allocated) + usedPrefixIps + childUsedBig
      const percentage = usableBig > 0n
        ? Math.min(100, Number((totalUsedBig * 100n) / usableBig))
        : 0

      return {
        id: n.id,
        name: n.name,
        subnet: n.subnet,
        total_hosts: info.usable_addresses, // string for IPv6
        allocated,
        ranges: networkRanges.length,
        percentage,
        dhcp_percent: pctOf(dhcpIps),
        reserved_percent: pctOf(reservedIps),
        used_prefix_percent: pctOf(usedPrefixIps),
        vlan_color: vlan?.color || null,
        vlan_name: vlan?.name || null,
        vlan_id: vlan?.vlan_id || null,
        is_ipv6: true,
      }
    }

    // IPv4 branch
    const info = parseSubnet(n.subnet)

    let dhcpIps = 0
    let reservedIps = 0
    let usedPrefixIps = 0
    for (const r of networkRanges) {
      const count = ipToLong(r.end_ip) - ipToLong(r.start_ip) + 1
      if (r.type === 'dhcp') dhcpIps += count
      else if (r.type === 'reserved') reservedIps += count
      else if (r.type === 'used_prefix') usedPrefixIps += count
    }

    // Child network space
    let childUsedIps = 0
    for (const child of networks.filter(c => c.parent_network_id === n.id && !c.subnet.includes(':'))) {
      try {
        const [, p] = child.subnet.split('/') as [string, string]
        childUsedIps += 1 << (32 - Number(p))
      } catch { /* skip */ }
    }

    const dhcpPercent = info.usable_hosts > 0 ? Math.round((dhcpIps / info.usable_hosts) * 100) : 0
    const reservedPercent = info.usable_hosts > 0 ? Math.round((reservedIps / info.usable_hosts) * 100) : 0
    const usedPrefixPercent = info.usable_hosts > 0 ? Math.round((usedPrefixIps / info.usable_hosts) * 100) : 0
    const totalUsed = allocated + usedPrefixIps + childUsedIps
    const percentage = info.usable_hosts > 0 ? Math.min(100, Math.round((totalUsed / info.usable_hosts) * 100)) : 0

    return {
      id: n.id,
      name: n.name,
      subnet: n.subnet,
      total_hosts: info.usable_hosts,
      allocated,
      ranges: networkRanges.length,
      percentage,
      dhcp_percent: dhcpPercent,
      reserved_percent: reservedPercent,
      used_prefix_percent: usedPrefixPercent,
      vlan_color: vlan?.color || null,
      vlan_name: vlan?.name || null,
      vlan_id: vlan?.vlan_id || null,
      is_ipv6: false,
    }
  })

  // Orphan VLANs (no networks)
  const vlansWithNetworks = new Set(networks.filter(n => n.vlan_id).map(n => n.vlan_id))
  const orphanVlans = vlans.filter(v => !vlansWithNetworks.has(v.id))

  // High usage networks (>80%)
  const highUsageNetworks = networkUtilization.filter(n => n.percentage > 80)

  // Duplicate IPs
  const ipCounts = new Map<string, number>()
  for (const a of allocations) {
    ipCounts.set(a.ip_address, (ipCounts.get(a.ip_address) || 0) + 1)
  }
  const duplicateIps = [...ipCounts.entries()]
    .filter(([_, count]) => count > 1)
    .map(([ip]) => ip)

  // Favorites
  const favoriteSwitches = switches.filter(s => s.is_favorite).map(({ ports: _, ...s }) => s)
  const favoriteNetworks = networks.filter(n => n.is_favorite)

  return {
    counts: {
      switches: switches.length,
      vlans: vlans.length,
      networks: networks.length,
      allocations: allocations.length
    },
    portStatus: { up: portsUp, down: portsDown, disabled: portsDisabled },
    networkUtilization,
    orphanVlans: orphanVlans.map(v => ({ id: v.id, vlan_id: v.vlan_id, name: v.name })),
    highUsageNetworks,
    duplicateIps,
    favorites: { switches: favoriteSwitches, networks: favoriteNetworks },
    recentActivity
  }
})
