import { z } from 'zod'
import { isValidCIDR, isValidIPv4 } from '../utils/ipv4'
import { isValidIPv6CIDR, isValidIPv6 } from '../utils/ipv6'

/** Accept any IPv4 or IPv6 address. */
const ipAddress = z.string().refine(
  v => isValidIPv4(v) || isValidIPv6(v),
  { message: 'Invalid IP address (IPv4 or IPv6 required)' }
)

/** Accept any IPv4 CIDR or IPv6 CIDR. */
const ipCidr = z.string().refine(
  v => isValidCIDR(v) || isValidIPv6CIDR(v),
  { message: 'Invalid CIDR notation (e.g. 10.0.1.0/24 or 2001:db8::/48)' }
)

export const createNetworkSchema = z.object({
  site_id: z.string().min(1),
  parent_network_id: z.string().optional().nullable(),
  name: z.string().min(1).max(100),
  vlan_id: z.string().optional(),
  subnet: ipCidr,
  gateway: ipAddress.optional(),
  dns_servers: z.array(ipAddress).default([]),
  description: z.string().max(500).optional()
})

export const updateNetworkSchema = z.object({
  site_id: z.string().min(1).optional(),
  parent_network_id: z.string().optional().nullable(),
  name: z.string().min(1).max(100).optional(),
  vlan_id: z.string().optional().nullable(),
  subnet: ipCidr.optional(),
  gateway: ipAddress.optional().nullable(),
  dns_servers: z.array(ipAddress).optional(),
  description: z.string().max(500).optional().nullable(),
  is_favorite: z.boolean().optional()
})
