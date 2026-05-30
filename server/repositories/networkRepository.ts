import { nanoid } from 'nanoid'
import { readJson, writeJson } from '../storage/jsonStorage'
import type { Network } from '../../types/network'
import { isValidCIDR, isValidIPv4, isIPInSubnet, isSubnetContainedIn, doCidrsOverlap } from '../utils/ipv4'

const FILE_NAME = 'networks.json'

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
    if (!isValidCIDR(data.subnet)) {
      throw createError({ statusCode: 400, message: 'Invalid CIDR notation' })
    }

    if (data.gateway && !isValidIPv4(data.gateway)) {
      throw createError({ statusCode: 400, message: 'Invalid gateway IP address' })
    }

    if (data.gateway && !isIPInSubnet(data.gateway, data.subnet)) {
      throw createError({ statusCode: 400, message: 'Gateway is not within the subnet' })
    }

    for (const dns of data.dns_servers) {
      if (!isValidIPv4(dns)) {
        throw createError({ statusCode: 400, message: `Invalid DNS server IP: ${dns}` })
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
      if (!isSubnetContainedIn(data.subnet, parent.subnet)) {
        throw createError({ statusCode: 400, message: `Subnet ${data.subnet} is not contained within parent ${parent.subnet}` })
      }
      // Check overlap with existing siblings
      const siblings = networks.filter(n => n.parent_network_id === data.parent_network_id)
      for (const sibling of siblings) {
        if (doCidrsOverlap(data.subnet, sibling.subnet)) {
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

    if (data.subnet && !isValidCIDR(data.subnet)) {
      throw createError({ statusCode: 400, message: 'Invalid CIDR notation' })
    }

    const subnet = data.subnet || current.subnet
    const siteId = data.site_id || current.site_id

    if (data.gateway && !isValidIPv4(data.gateway)) {
      throw createError({ statusCode: 400, message: 'Invalid gateway IP address' })
    }

    if (data.gateway && !isIPInSubnet(data.gateway, subnet)) {
      throw createError({ statusCode: 400, message: 'Gateway is not within the subnet' })
    }

    if (data.dns_servers) {
      for (const dns of data.dns_servers) {
        if (!isValidIPv4(dns)) {
          throw createError({ statusCode: 400, message: `Invalid DNS server IP: ${dns}` })
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
      if (!isSubnetContainedIn(subnet, parent.subnet)) {
        throw createError({ statusCode: 400, message: `Subnet ${subnet} is not contained within parent ${parent.subnet}` })
      }
      // Prevent circular reference: new parent cannot be a descendant of this network
      const descendants = this._getDescendantIds(id, networks)
      if (descendants.has(newParentId)) {
        throw createError({ statusCode: 400, message: 'Cannot set a descendant network as parent (circular reference)' })
      }
      // Check overlap with siblings (excluding self)
      const siblings = networks.filter(n => n.parent_network_id === newParentId && n.id !== id)
      for (const sibling of siblings) {
        if (doCidrsOverlap(subnet, sibling.subnet)) {
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
