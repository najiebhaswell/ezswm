import { networkRepository } from '../repositories/networkRepository'
import { ipAllocationRepository } from '../repositories/ipAllocationRepository'
import { isIPInSubnet } from './ipv4'
import { isIPv6InSubnet, isValidIPv6 } from './ipv6'
import type { Network } from '../../types/network'

/**
 * Finds the narrowest network that contains the given IP.
 */
export function findNetworkForIp(ip: string): Network | null {
  const allNetworks = networkRepository.list()
  const isV6 = ip.includes(':')

  const matchingNetworks = allNetworks.filter((n) => {
    const subnetIsV6 = n.subnet.includes(':')
    if (isV6 !== subnetIsV6) return false
    
    return isV6
      ? isIPv6InSubnet(ip, n.subnet)
      : isIPInSubnet(ip, n.subnet)
  })

  if (matchingNetworks.length === 0) return null

  // If multiple networks match, pick the narrowest one (longest prefix)
  matchingNetworks.sort((a, b) => {
    const prefixA = parseInt(a.subnet.split('/')[1] || '0', 10)
    const prefixB = parseInt(b.subnet.split('/')[1] || '0', 10)
    return prefixB - prefixA // descending order (e.g. /24 before /16)
  })

  return matchingNetworks[0]!
}

/**
 * Synchronizes a Switch's management_ip with IPAllocations.
 * Should be called after switch creation, update, or deletion.
 * 
 * @param newIp - The new management IP of the switch
 * @param oldIp - The old management IP of the switch (if it was changed or deleted)
 * @param switchName - The current name of the switch
 * @param oldSwitchName - The old name of the switch (for cleanup matching)
 */
export function syncSwitchManagementIp(
  newIp?: string | null,
  oldIp?: string | null,
  switchName?: string,
  oldSwitchName?: string
) {
  // 1. Cleanup Phase
  if (oldIp && oldIp !== newIp) {
    const allocations = ipAllocationRepository.list()
    const existing = allocations.find(a => a.ip_address === oldIp)
    
    // Only clean up if the allocation was actually representing this switch
    if (existing && existing.device_type === 'switch' && (existing.hostname === oldSwitchName || existing.hostname === switchName)) {
      ipAllocationRepository.delete(existing.id)
    }
  }

  // 2. Reservation Phase
  if (newIp && newIp !== oldIp && switchName) {
    const network = findNetworkForIp(newIp)
    
    if (network) {
      const allocations = ipAllocationRepository.list()
      const existing = allocations.find(a => a.ip_address === newIp)

      if (existing) {
        // Force update existing to represent the switch
        ipAllocationRepository.update(existing.id, {
          hostname: switchName,
          device_type: 'switch',
          description: existing.description || 'Auto-managed switch IP'
        })
      } else {
        // Create new allocation
        ipAllocationRepository.create(network.id, {
          ip_address: newIp,
          hostname: switchName,
          device_type: 'switch',
          description: 'Auto-managed switch IP',
          status: 'active'
        })
      }
    }
  }
}
