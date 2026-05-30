import { networkRepository } from '../../../repositories/networkRepository'
import { ipAllocationRepository } from '../../../repositories/ipAllocationRepository'
import { ipRangeRepository } from '../../../repositories/ipRangeRepository'
import { findNextAvailableIP } from '../../../utils/ipv4'

export default defineEventHandler((event) => {
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

  const allocatedIps = allocations.map(a => a.ip_address)
  
  // We want to skip IPs that are in ranges other than "static". 
  // Wait, actually, static ranges define where we *can* allocate IPs, or they are just informational.
  // Actually, usually you shouldn't allocate an IP in a 'dhcp', 'reserved', or 'used_prefix' range.
  const excludedRanges = ranges.filter(r => r.type !== 'static')

  const nextIp = findNextAvailableIP(network.subnet, allocatedIps, excludedRanges)

  if (!nextIp) {
    throw createError({ statusCode: 404, statusMessage: `No available IP found in ${network.subnet}` })
  }

  return { ip: nextIp }
})
