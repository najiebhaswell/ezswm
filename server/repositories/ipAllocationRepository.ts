import { nanoid } from 'nanoid'
import { readJson, writeJson } from '../storage/jsonStorage'
import type { IPAllocation } from '../../types/ipAllocation'
import type { IPRange } from '../../types/ipRange'
import { isValidIPv4, isIPInSubnet, isUsableHostIP, isValidMacAddress, subnetRangeError, parseSubnet, ipToLong } from '../utils/ipv4'
import {
  isValidIPv6, isIPv6InSubnet, isUsableHostIPv6,
  ipv6SubnetRangeError, parseIPv6Subnet, ipv6ToBigInt
} from '../utils/ipv6'
import { networkRepository } from './networkRepository'

const FILE_NAME = 'ip-allocations.json'

/** Detect address family of the network subnet. */
function isV6Subnet(subnet: string): boolean {
  return subnet.includes(':')
}

export const ipAllocationRepository = {
  list(networkId?: string): IPAllocation[] {
    const allocations = readJson<IPAllocation[]>(FILE_NAME)
    if (networkId) {
      return allocations.filter(a => a.network_id === networkId)
    }
    return allocations
  },

  getById(id: string): IPAllocation | null {
    const allocations = readJson<IPAllocation[]>(FILE_NAME)
    return allocations.find(a => a.id === id) || null
  },

  create(networkId: string, data: Omit<IPAllocation, 'id' | 'network_id' | 'created_at' | 'updated_at'>): IPAllocation {
    const network = networkRepository.getById(networkId)
    if (!network) {
      throw createError({ statusCode: 404, message: 'Network not found' })
    }

    const v6 = isV6Subnet(network.subnet)

    // Validate IP address format
    if (v6) {
      if (!isValidIPv6(data.ip_address)) {
        throw createError({ statusCode: 400, message: 'Invalid IPv6 address' })
      }
    } else {
      if (!isValidIPv4(data.ip_address)) {
        throw createError({ statusCode: 400, message: 'Invalid IP address' })
      }
    }

    // Validate IP family matches network
    const ipIsV6 = data.ip_address.includes(':')
    if (ipIsV6 !== v6) {
      throw createError({ statusCode: 400, message: `IP address family (${ipIsV6 ? 'IPv6' : 'IPv4'}) does not match network family (${v6 ? 'IPv6' : 'IPv4'})` })
    }

    // Validate IP is a usable host address in the subnet
    if (v6) {
      if (!isUsableHostIPv6(data.ip_address, network.subnet)) {
        const info = parseIPv6Subnet(network.subnet)
        if (!isIPv6InSubnet(data.ip_address, network.subnet)) {
          throw createError({ statusCode: 400, message: ipv6SubnetRangeError(data.ip_address, network.subnet) })
        }
        throw createError({ statusCode: 400, message: `IP ${data.ip_address} is the ${data.ip_address === info.network_address ? 'network' : 'last'} address of ${network.subnet}. Valid range: ${info.first_usable} – ${info.last_usable}` })
      }
    } else {
      if (!isUsableHostIP(data.ip_address, network.subnet)) {
        const info = parseSubnet(network.subnet)
        if (!isIPInSubnet(data.ip_address, network.subnet)) {
          throw createError({ statusCode: 400, message: subnetRangeError(data.ip_address, network.subnet) })
        }
        throw createError({ statusCode: 400, message: `IP ${data.ip_address} is the ${data.ip_address === info.network_address ? 'network' : 'broadcast'} address of ${network.subnet}. Valid range: ${info.first_usable} - ${info.last_usable}` })
      }
    }

    if (data.mac_address && !isValidMacAddress(data.mac_address)) {
      throw createError({ statusCode: 400, message: 'Invalid MAC address format (expected XX:XX:XX:XX:XX:XX)' })
    }

    // Check if IP falls inside a DHCP dynamic range
    const ipRanges = readJson<IPRange[]>('ip-ranges.json')
    const networkRanges = ipRanges.filter(r => r.network_id === networkId)

    if (v6) {
      const ipInt = ipv6ToBigInt(data.ip_address)
      for (const range of networkRanges) {
        if (range.type === 'dhcp') {
          const s = ipv6ToBigInt(range.start_ip)
          const e = ipv6ToBigInt(range.end_ip)
          if (ipInt >= s && ipInt <= e) {
            throw createError({ statusCode: 400, message: `IP ${data.ip_address} is inside a DHCP dynamic range (${range.start_ip} - ${range.end_ip}). Static IPs cannot be assigned within dynamic DHCP ranges.` })
          }
        }
      }
    } else {
      const ipLong = ipToLong(data.ip_address)
      for (const range of networkRanges) {
        if (range.type === 'dhcp' && ipLong >= ipToLong(range.start_ip) && ipLong <= ipToLong(range.end_ip)) {
          throw createError({ statusCode: 400, message: `IP ${data.ip_address} is inside a DHCP dynamic range (${range.start_ip} - ${range.end_ip}). Static IPs cannot be assigned within dynamic DHCP ranges.` })
        }
      }
    }

    // Check if IP falls inside a child subnet
    const childNetworks = networkRepository.listChildren(networkId)
    for (const child of childNetworks) {
      const inChild = child.subnet.includes(':')
        ? isIPv6InSubnet(data.ip_address, child.subnet)
        : isIPInSubnet(data.ip_address, child.subnet)
      if (inChild) {
        throw createError({ statusCode: 409, message: `IP ${data.ip_address} belongs to child subnet ${child.subnet} (${child.name}). Manage it from the child network instead.` })
      }
    }

    // Global IP uniqueness
    const allAllocations = readJson<IPAllocation[]>(FILE_NAME)
    if (allAllocations.some(a => a.ip_address === data.ip_address)) {
      throw createError({ statusCode: 409, message: `IP address ${data.ip_address} is already allocated` })
    }

    const now = new Date().toISOString()
    const allocation: IPAllocation = {
      id: nanoid(),
      network_id: networkId,
      ...data,
      created_at: now,
      updated_at: now
    }

    allAllocations.push(allocation)
    writeJson(FILE_NAME, allAllocations)
    return allocation
  },

  update(id: string, data: Partial<Omit<IPAllocation, 'id' | 'network_id' | 'created_at'>>): IPAllocation {
    const allocations = readJson<IPAllocation[]>(FILE_NAME)
    const index = allocations.findIndex(a => a.id === id)
    if (index === -1) {
      throw createError({ statusCode: 404, message: 'IP allocation not found' })
    }

    if (data.ip_address && data.ip_address !== allocations[index]!.ip_address) {
      const network = networkRepository.getById(allocations[index]!.network_id)
      const v6 = network ? isV6Subnet(network.subnet) : data.ip_address.includes(':')

      if (v6) {
        if (!isValidIPv6(data.ip_address)) {
          throw createError({ statusCode: 400, message: 'Invalid IPv6 address' })
        }
        if (network && !isUsableHostIPv6(data.ip_address, network.subnet)) {
          const info = parseIPv6Subnet(network.subnet)
          if (!isIPv6InSubnet(data.ip_address, network.subnet)) {
            throw createError({ statusCode: 400, message: ipv6SubnetRangeError(data.ip_address, network.subnet) })
          }
          throw createError({ statusCode: 400, message: `IP ${data.ip_address} is the ${data.ip_address === info.network_address ? 'network' : 'last'} address of ${network.subnet}. Valid range: ${info.first_usable} – ${info.last_usable}` })
        }
      } else {
        if (!isValidIPv4(data.ip_address)) {
          throw createError({ statusCode: 400, message: 'Invalid IP address' })
        }
        if (network && !isUsableHostIP(data.ip_address, network.subnet)) {
          const info = parseSubnet(network.subnet)
          if (!isIPInSubnet(data.ip_address, network.subnet)) {
            throw createError({ statusCode: 400, message: subnetRangeError(data.ip_address, network.subnet) })
          }
          throw createError({ statusCode: 400, message: `IP ${data.ip_address} is the ${data.ip_address === info.network_address ? 'network' : 'broadcast'} address of ${network.subnet}. Valid range: ${info.first_usable} - ${info.last_usable}` })
        }
      }

      if (allocations.some(a => a.ip_address === data.ip_address && a.id !== id)) {
        throw createError({ statusCode: 409, message: `IP address ${data.ip_address} is already allocated` })
      }
    }

    if (data.mac_address && !isValidMacAddress(data.mac_address)) {
      throw createError({ statusCode: 400, message: 'Invalid MAC address format' })
    }

    allocations[index] = {
      ...allocations[index],
      ...data,
      updated_at: new Date().toISOString()
    } as IPAllocation

    writeJson(FILE_NAME, allocations)
    return allocations[index]!
  },

  delete(id: string): boolean {
    const allocations = readJson<IPAllocation[]>(FILE_NAME)
    const index = allocations.findIndex(a => a.id === id)
    if (index === -1) return false

    allocations.splice(index, 1)
    writeJson(FILE_NAME, allocations)
    return true
  },

  deleteByNetworkId(networkId: string): number {
    const allocations = readJson<IPAllocation[]>(FILE_NAME)
    const filtered = allocations.filter(a => a.network_id !== networkId)
    const deleted = allocations.length - filtered.length
    writeJson(FILE_NAME, filtered)
    return deleted
  }
}
