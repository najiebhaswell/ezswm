import { nanoid } from 'nanoid'
import { readJson, writeJson } from '../storage/jsonStorage'
import type { Network } from '../../types/network'
import { isValidCIDR, isValidIPv4, isIPInSubnet, isSubnetContainedIn, doCidrsOverlap, isCIDRv4, isIPv4 } from '../utils/ipv4'
import {
  isValidIPv6CIDR, isValidIPv6, isIPv6InSubnet,
  isIPv6SubnetContainedIn, doIPv6CidrsOverlap
} from '../utils/ipv6'

const FILE_NAME = 'networks.json'

/** Detect address family from a CIDR string. */
function isV6Subnet(subnet: string): boolean {
  return subnet.includes(':')
}

/** Validate a single IP address as either IPv4 or IPv6. */
function isValidIp(ip: string): boolean {
  return isIPv4(ip) ? isValidIPv4(ip) : isValidIPv6(ip)
}

/** Check that gateway belongs to the same family as the subnet. */
function validateGateway(gateway: string, subnet: string): void {
  const gwIsV6 = gateway.includes(':')
  const subnetIsV6 = isV6Subnet(subnet)
  if (gwIsV6 !== subnetIsV6) {
    throw createError({ statusCode: 400, message: `Gateway address family (${gwIsV6 ? 'IPv6' : 'IPv4'}) does not match subnet family (${subnetIsV6 ? 'IPv6' : 'IPv4'})` })
  }
  if (gwIsV6 && !isValidIPv6(gateway)) {
    throw createError({ statusCode: 400, message: 'Invalid IPv6 gateway address' })
  }
  if (!gwIsV6 && !isValidIPv4(gateway)) {
    throw createError({ statusCode: 400, message: 'Invalid IPv4 gateway address' })
  }
}

/** Check that gateway is within the subnet (family-agnostic). */
function validateGatewayInSubnet(gateway: string, subnet: string): void {
  if (isV6Subnet(subnet)) {
    if (!isIPv6InSubnet(gateway, subnet)) {
      throw createError({ statusCode: 400, message: 'Gateway is not within the subnet' })
    }
  } else {
    if (!isIPInSubnet(gateway, subnet)) {
      throw createError({ statusCode: 400, message: 'Gateway is not within the subnet' })
    }
  }
}

export const networkRepository = {
  list(): Network[] {
    return readJson<Network[]>(FILE_NAME)
  },

  getById(id: string): Network | null {
    const networks = this.list()
    return networks.find(n => n.id === id) || null
  },

  /** Return all direct children of a network. */
  listChildren(parentId: string): Network[] {
    return this.list().filter(n => n.parent_network_id === parentId)
  },

  /** Return ancestor chain from immediate parent up to root. */
  listAncestors(id: string): Network[] {
    const all = this.list()
    const ancestors: Network[] = []
    let current = all.find(n => n.id === id)
    while (current?.parent_network_id) {
      const parent = all.find(n => n.id === current!.parent_network_id)
      if (!parent) break
      ancestors.unshift(parent)
      current = parent
    }
    return ancestors
  },

  create(data: Omit<Network, 'id' | 'created_at' | 'updated_at' | 'is_favorite'>): Network {
    const v6 = isV6Subnet(data.subnet)

    // Validate subnet CIDR
    if (v6 ? !isValidIPv6CIDR(data.subnet) : !isValidCIDR(data.subnet)) {
      throw createError({ statusCode: 400, message: 'Invalid CIDR notation' })
    }

    // Validate gateway
    if (data.gateway) {
      validateGateway(data.gateway, data.subnet)
      validateGatewayInSubnet(data.gateway, data.subnet)
    }

    // Validate DNS servers — each must be valid IPv4 or IPv6
    for (const dns of data.dns_servers) {
      if (!isValidIp(dns)) {
        throw createError({ statusCode: 400, message: `Invalid DNS server address: ${dns}` })
      }
    }

    const networks = this.list()

    // Validate parent relationship if provided
    if (data.parent_network_id) {
      const parent = networks.find(n => n.id === data.parent_network_id)
      if (!parent) {
        throw createError({ statusCode: 404, message: 'Parent network not found' })
      }
      if (parent.site_id !== data.site_id) {
        throw createError({ statusCode: 400, message: 'Child network must belong to the same site as the parent' })
      }
      // Families must match
      if (isV6Subnet(parent.subnet) !== v6) {
        throw createError({ statusCode: 400, message: 'Child subnet address family must match the parent network' })
      }
      const contained = v6
        ? isIPv6SubnetContainedIn(data.subnet, parent.subnet)
        : isSubnetContainedIn(data.subnet, parent.subnet)
      if (!contained) {
        throw createError({ statusCode: 400, message: `Subnet ${data.subnet} is not contained within parent ${parent.subnet}` })
      }
      // Check overlap with existing siblings
      const siblings = networks.filter(n => n.parent_network_id === data.parent_network_id)
      for (const sibling of siblings) {
        const overlaps = v6
          ? doIPv6CidrsOverlap(data.subnet, sibling.subnet)
          : doCidrsOverlap(data.subnet, sibling.subnet)
        if (overlaps) {
          throw createError({ statusCode: 409, message: `Subnet ${data.subnet} overlaps with existing sibling subnet ${sibling.subnet} (${sibling.name})` })
        }
      }
    }

    const now = new Date().toISOString()
    const network: Network = {
      id: nanoid(),
      ...data,
      is_favorite: false,
      created_at: now,
      updated_at: now
    }

    networks.push(network)
    writeJson(FILE_NAME, networks)
    return network
  },

  update(id: string, data: Partial<Omit<Network, 'id' | 'created_at'>>): Network {
    const networks = this.list()
    const index = networks.findIndex(n => n.id === id)
    if (index === -1) {
      throw createError({ statusCode: 404, message: 'Network not found' })
    }

    const current = networks[index]!
    const subnet = data.subnet || current.subnet
    const siteId = data.site_id || current.site_id
    const v6 = isV6Subnet(subnet)

    // Validate subnet CIDR if changed
    if (data.subnet) {
      if (v6 ? !isValidIPv6CIDR(data.subnet) : !isValidCIDR(data.subnet)) {
        throw createError({ statusCode: 400, message: 'Invalid CIDR notation' })
      }
    }

    // Validate gateway if provided
    if (data.gateway) {
      validateGateway(data.gateway, subnet)
      validateGatewayInSubnet(data.gateway, subnet)
    }

    // Validate DNS servers
    if (data.dns_servers) {
      for (const dns of data.dns_servers) {
        if (!isValidIp(dns)) {
          throw createError({ statusCode: 400, message: `Invalid DNS server address: ${dns}` })
        }
      }
    }

    // Validate parent relationship change
    const newParentId = Object.prototype.hasOwnProperty.call(data, 'parent_network_id')
      ? data.parent_network_id
      : current.parent_network_id

    if (newParentId) {
      // Cannot make a network its own parent
      if (newParentId === id) {
        throw createError({ statusCode: 400, message: 'A network cannot be its own parent' })
      }
      const parent = networks.find(n => n.id === newParentId)
      if (!parent) {
        throw createError({ statusCode: 404, message: 'Parent network not found' })
      }
      if (parent.site_id !== siteId) {
        throw createError({ statusCode: 400, message: 'Child network must belong to the same site as the parent' })
      }
      if (isV6Subnet(parent.subnet) !== v6) {
        throw createError({ statusCode: 400, message: 'Child subnet address family must match the parent network' })
      }
      const contained = v6
        ? isIPv6SubnetContainedIn(subnet, parent.subnet)
        : isSubnetContainedIn(subnet, parent.subnet)
      if (!contained) {
        throw createError({ statusCode: 400, message: `Subnet ${subnet} is not contained within parent ${parent.subnet}` })
      }
      // Prevent circular reference
      const descendants = this._getDescendantIds(id, networks)
      if (descendants.has(newParentId)) {
        throw createError({ statusCode: 400, message: 'Cannot set a descendant network as parent (circular reference)' })
      }
      // Check overlap with siblings (excluding self)
      const siblings = networks.filter(n => n.parent_network_id === newParentId && n.id !== id)
      for (const sibling of siblings) {
        const overlaps = v6
          ? doIPv6CidrsOverlap(subnet, sibling.subnet)
          : doCidrsOverlap(subnet, sibling.subnet)
        if (overlaps) {
          throw createError({ statusCode: 409, message: `Subnet ${subnet} overlaps with existing sibling subnet ${sibling.subnet} (${sibling.name})` })
        }
      }
    }

    networks[index] = {
      ...current,
      ...data,
      updated_at: new Date().toISOString()
    } as Network

    writeJson(FILE_NAME, networks)
    return networks[index]!
  },

  delete(id: string): boolean {
    const networks = this.list()
    const index = networks.findIndex(n => n.id === id)
    if (index === -1) return false

    // Block deletion if this network has children
    const children = networks.filter(n => n.parent_network_id === id)
    if (children.length > 0) {
      throw createError({
        statusCode: 409,
        message: `Cannot delete: this network has ${children.length} child subnet(s). Delete them first.`
      })
    }

    networks.splice(index, 1)
    writeJson(FILE_NAME, networks)
    return true
  },

  /** Helper: collect all descendant IDs recursively (for circular-ref protection). */
  _getDescendantIds(id: string, allNetworks: Network[]): Set<string> {
    const result = new Set<string>()
    const queue = [id]
    while (queue.length > 0) {
      const current = queue.shift()!
      for (const n of allNetworks) {
        if (n.parent_network_id === current && !result.has(n.id)) {
          result.add(n.id)
          queue.push(n.id)
        }
      }
    }
    return result
  }
}
