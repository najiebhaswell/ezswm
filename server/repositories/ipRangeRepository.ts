import { nanoid } from 'nanoid'
import { readJson, writeJson } from '../storage/jsonStorage'
import type { IPRange } from '../../types/ipRange'
import { isValidIPv4, isIPInSubnet, ipToLong, doRangesOverlap, subnetRangeError, parseSubnet } from '../utils/ipv4'
import {
  isValidIPv6, isIPv6InSubnet, ipv6ToBigInt,
  doIPv6RangesOverlap, ipv6SubnetRangeError, parseIPv6Subnet
} from '../utils/ipv6'
import { networkRepository } from './networkRepository'

const FILE_NAME = 'ip-ranges.json'

/** Detect address family from subnet. */
function isV6Subnet(subnet: string): boolean {
  return subnet.includes(':')
}

export const ipRangeRepository = {
  list(networkId?: string): IPRange[] {
    const ranges = readJson<IPRange[]>(FILE_NAME)
    if (networkId) {
      return ranges.filter(r => r.network_id === networkId)
    }
    return ranges
  },

  getById(id: string): IPRange | null {
    const ranges = readJson<IPRange[]>(FILE_NAME)
    return ranges.find(r => r.id === id) || null
  },

  create(networkId: string, data: Omit<IPRange, 'id' | 'network_id' | 'created_at' | 'updated_at'>): IPRange {
    const network = networkRepository.getById(networkId)
    if (!network) {
      throw createError({ statusCode: 404, message: 'Network not found' })
    }

    const v6 = isV6Subnet(network.subnet)
    const prefix = parseInt(network.subnet.split('/')[1] || '0', 10)

    // Block DHCP ranges for /31, /32 (IPv4) and /127, /128 (IPv6)
    const isPointToPoint = v6 ? prefix >= 127 : prefix >= 31
    if (isPointToPoint && data.type === 'dhcp') {
      const msg = (v6 ? prefix === 128 : prefix === 32)
        ? 'DHCP is not applicable for host-route networks.'
        : 'DHCP is not applicable for point-to-point networks.'
      throw createError({ statusCode: 400, message: msg })
    }

    // Validate start/end IP format
    if (v6) {
      if (!isValidIPv6(data.start_ip) || !isValidIPv6(data.end_ip)) {
        throw createError({ statusCode: 400, message: 'Invalid IPv6 address in range' })
      }
    } else {
      if (!isValidIPv4(data.start_ip) || !isValidIPv4(data.end_ip)) {
        throw createError({ statusCode: 400, message: 'Invalid IP address in range' })
      }
    }

    // Validate start <= end
    if (v6) {
      if (ipv6ToBigInt(data.start_ip) > ipv6ToBigInt(data.end_ip)) {
        throw createError({ statusCode: 400, message: 'Start IP must be less than or equal to end IP' })
      }
    } else {
      if (ipToLong(data.start_ip) > ipToLong(data.end_ip)) {
        throw createError({ statusCode: 400, message: 'Start IP must be less than or equal to end IP' })
      }
    }

    // Validate start and end are within subnet
    if (v6) {
      if (!isIPv6InSubnet(data.start_ip, network.subnet)) {
        throw createError({ statusCode: 400, message: ipv6SubnetRangeError(data.start_ip, network.subnet) })
      }
      if (!isIPv6InSubnet(data.end_ip, network.subnet)) {
        throw createError({ statusCode: 400, message: ipv6SubnetRangeError(data.end_ip, network.subnet) })
      }
    } else {
      if (!isIPInSubnet(data.start_ip, network.subnet)) {
        throw createError({ statusCode: 400, message: subnetRangeError(data.start_ip, network.subnet) })
      }
      if (!isIPInSubnet(data.end_ip, network.subnet)) {
        throw createError({ statusCode: 400, message: subnetRangeError(data.end_ip, network.subnet) })
      }
    }

    // Check overlap with existing ranges in the same network
    const existingRanges = this.list(networkId)
    for (const existing of existingRanges) {
      const overlaps = v6
        ? doIPv6RangesOverlap(data.start_ip, data.end_ip, existing.start_ip, existing.end_ip)
        : doRangesOverlap(data.start_ip, data.end_ip, existing.start_ip, existing.end_ip)
      if (overlaps) {
        throw createError({ statusCode: 409, message: `Range ${data.start_ip}-${data.end_ip} overlaps with existing range ${existing.start_ip}-${existing.end_ip} (${existing.type})` })
      }
    }

    // Check overlap with child subnets (used_prefix is always allowed)
    if (data.type !== 'used_prefix') {
      const childNetworks = networkRepository.listChildren(networkId)
      if (v6) {
        const startLong = ipv6ToBigInt(data.start_ip)
        const endLong = ipv6ToBigInt(data.end_ip)
        for (const child of childNetworks) {
          const childInfo = parseIPv6Subnet(child.subnet)
          const childStart = ipv6ToBigInt(childInfo.network_address)
          const childEnd = ipv6ToBigInt(childInfo.last_address)
          if (startLong <= childEnd && childStart <= endLong) {
            throw createError({ statusCode: 409, message: `Range ${data.start_ip}-${data.end_ip} overlaps with child subnet ${child.subnet} (${child.name}). Use type 'used_prefix' to mark delegated ranges.` })
          }
        }
      } else {
        const startLong = ipToLong(data.start_ip)
        const endLong = ipToLong(data.end_ip)
        for (const child of childNetworks) {
          const childInfo = parseSubnet(child.subnet)
          const childStart = ipToLong(childInfo.network_address)
          const childEnd = ipToLong(childInfo.broadcast_address)
          if (startLong <= childEnd && childStart <= endLong) {
            throw createError({ statusCode: 409, message: `Range ${data.start_ip}-${data.end_ip} overlaps with child subnet ${child.subnet} (${child.name}). Use type 'used_prefix' to mark delegated ranges.` })
          }
        }
      }
    }

    const ranges = readJson<IPRange[]>(FILE_NAME)
    const now = new Date().toISOString()
    const range: IPRange = {
      id: nanoid(),
      network_id: networkId,
      ...data,
      created_at: now,
      updated_at: now
    }

    ranges.push(range)
    writeJson(FILE_NAME, ranges)
    return range
  },

  update(id: string, data: Partial<Omit<IPRange, 'id' | 'network_id' | 'created_at'>>): IPRange {
    const ranges = readJson<IPRange[]>(FILE_NAME)
    const index = ranges.findIndex(r => r.id === id)
    if (index === -1) {
      throw createError({ statusCode: 404, message: 'IP range not found' })
    }

    const current = ranges[index]!
    const startIp = data.start_ip || current.start_ip
    const endIp = data.end_ip || current.end_ip

    const network = networkRepository.getById(current.network_id)
    const v6 = network ? isV6Subnet(network.subnet) : startIp.includes(':')

    // Validate format
    if (v6) {
      if (data.start_ip && !isValidIPv6(data.start_ip)) {
        throw createError({ statusCode: 400, message: 'Invalid IPv6 start address' })
      }
      if (data.end_ip && !isValidIPv6(data.end_ip)) {
        throw createError({ statusCode: 400, message: 'Invalid IPv6 end address' })
      }
    } else {
      if (data.start_ip && !isValidIPv4(data.start_ip)) {
        throw createError({ statusCode: 400, message: 'Invalid start IP' })
      }
      if (data.end_ip && !isValidIPv4(data.end_ip)) {
        throw createError({ statusCode: 400, message: 'Invalid end IP' })
      }
    }

    // Validate start <= end
    if (v6) {
      if (ipv6ToBigInt(startIp) > ipv6ToBigInt(endIp)) {
        throw createError({ statusCode: 400, message: 'Start IP must be less than or equal to end IP' })
      }
    } else {
      if (ipToLong(startIp) > ipToLong(endIp)) {
        throw createError({ statusCode: 400, message: 'Start IP must be less than or equal to end IP' })
      }
    }

    // Validate against subnet
    if (network) {
      if (v6) {
        if (!isIPv6InSubnet(startIp, network.subnet)) {
          throw createError({ statusCode: 400, message: ipv6SubnetRangeError(startIp, network.subnet) })
        }
        if (!isIPv6InSubnet(endIp, network.subnet)) {
          throw createError({ statusCode: 400, message: ipv6SubnetRangeError(endIp, network.subnet) })
        }
      } else {
        if (!isIPInSubnet(startIp, network.subnet)) {
          throw createError({ statusCode: 400, message: subnetRangeError(startIp, network.subnet) })
        }
        if (!isIPInSubnet(endIp, network.subnet)) {
          throw createError({ statusCode: 400, message: subnetRangeError(endIp, network.subnet) })
        }
      }
    }

    // Check overlap excluding self
    const networkRanges = ranges.filter(r => r.network_id === current.network_id && r.id !== id)
    for (const existing of networkRanges) {
      const overlaps = v6
        ? doIPv6RangesOverlap(startIp, endIp, existing.start_ip, existing.end_ip)
        : doRangesOverlap(startIp, endIp, existing.start_ip, existing.end_ip)
      if (overlaps) {
        throw createError({ statusCode: 409, message: `Range ${startIp}-${endIp} overlaps with existing range ${existing.start_ip}-${existing.end_ip} (${existing.type})` })
      }
    }

    ranges[index] = {
      ...current,
      ...data,
      updated_at: new Date().toISOString()
    } as IPRange

    writeJson(FILE_NAME, ranges)
    return ranges[index]!
  },

  delete(id: string): boolean {
    const ranges = readJson<IPRange[]>(FILE_NAME)
    const index = ranges.findIndex(r => r.id === id)
    if (index === -1) return false

    ranges.splice(index, 1)
    writeJson(FILE_NAME, ranges)
    return true
  },

  deleteByNetworkId(networkId: string): number {
    const ranges = readJson<IPRange[]>(FILE_NAME)
    const filtered = ranges.filter(r => r.network_id !== networkId)
    const deleted = ranges.length - filtered.length
    writeJson(FILE_NAME, filtered)
    return deleted
  }
}
