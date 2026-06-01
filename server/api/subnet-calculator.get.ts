import { isValidCIDR, parseSubnet } from '../utils/ipv4'
import { isValidIPv6CIDR, parseIPv6Subnet } from '../utils/ipv6'

export default defineEventHandler((event) => {
  const query = getQuery(event)
  const cidr = String(query.cidr || '')

  if (!cidr) {
    throw createError({ statusCode: 400, statusMessage: 'CIDR is required. Example: 10.0.1.0/24 or 2001:db8::/48' })
  }

  // IPv6 branch
  if (cidr.includes(':')) {
    if (!isValidIPv6CIDR(cidr)) {
      throw createError({ statusCode: 400, statusMessage: 'Invalid IPv6 CIDR notation. Example: 2001:db8::/48' })
    }
    const info = parseIPv6Subnet(cidr)
    return {
      cidr,
      ip_version: 6,
      network_address: info.network_address,
      last_address: info.last_address,
      first_usable: info.first_usable,
      last_usable: info.last_usable,
      total_addresses: info.total_addresses,
      usable_addresses: info.usable_addresses,
      prefix_length: info.prefix_length,
      // IPv4-only fields set to null so callers can detect family
      broadcast_address: null,
      subnet_mask: null,
      wildcard_mask: null,
      total_hosts: null,
      usable_hosts: null
    }
  }

  // IPv4 branch (unchanged behaviour)
  if (!isValidCIDR(cidr)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid CIDR notation. Example: 10.0.1.0/24 or 2001:db8::/48' })
  }

  const info = parseSubnet(cidr)
  return {
    cidr,
    ip_version: 4,
    ...info,
    // IPv6-only fields set to null
    last_address: null,
    total_addresses: null,
    usable_addresses: null
  }
})
