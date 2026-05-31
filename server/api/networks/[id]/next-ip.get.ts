import { networkRepository } from '../../../repositories/networkRepository'
import { ipAllocationRepository } from '../../../repositories/ipAllocationRepository'
import { ipRangeRepository } from '../../../repositories/ipRangeRepository'
import { findNextAvailableIP } from '../../../utils/ipv4'
import { findNextAvailableIPv6 } from '../../../utils/ipv6'

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

  // Skip IPs that fall in non-static ranges (dhcp, reserved, used_prefix)
  const excludedRanges = ranges.filter(r => r.type !== 'static')

  const v6 = network.subnet.includes(':')
  const nextIp = v6
    ? findNextAvailableIPv6(network.subnet, allocatedIps, excludedRanges)
    : findNextAvailableIP(network.subnet, allocatedIps, excludedRanges)

  if (!nextIp) {
    throw createError({ statusCode: 404, statusMessage: `No available IP found in ${network.subnet}` })
  }

  return { ip: nextIp }
})
