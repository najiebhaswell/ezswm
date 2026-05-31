import { z } from 'zod'
import { isValidIPv4 } from '../utils/ipv4'
import { isValidIPv6 } from '../utils/ipv6'

/** Accept any IPv4 or IPv6 address. */
const ipAddress = z.string().refine(
  v => isValidIPv4(v) || isValidIPv6(v),
  { message: 'Invalid IP address (IPv4 or IPv6 required)' }
)

export const createIpAllocationSchema = z.object({
  ip_address: ipAddress,
  hostname: z.string().max(200).optional(),
  mac_address: z.string().optional(),
  device_type: z.enum(['server', 'switch', 'router', 'firewall', 'printer', 'phone', 'ap', 'camera', 'other']).optional(),
  description: z.string().max(500).optional(),
  status: z.enum(['active', 'reserved', 'inactive']).default('active')
})

export const updateIpAllocationSchema = z.object({
  ip_address: ipAddress.optional(),
  hostname: z.string().max(200).optional().nullable(),
  mac_address: z.string().optional().nullable(),
  device_type: z.enum(['server', 'switch', 'router', 'firewall', 'printer', 'phone', 'ap', 'camera', 'other']).optional().nullable(),
  description: z.string().max(500).optional().nullable(),
  status: z.enum(['active', 'reserved', 'inactive']).optional()
})
