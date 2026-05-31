import { z } from 'zod'
import { isValidIPv4 } from '../utils/ipv4'
import { isValidIPv6 } from '../utils/ipv6'

/** Accept any IPv4 or IPv6 address. */
const ipAddress = z.string().refine(
  v => isValidIPv4(v) || isValidIPv6(v),
  { message: 'Invalid IP address (IPv4 or IPv6 required)' }
)

export const createIpRangeSchema = z.object({
  start_ip: ipAddress,
  end_ip: ipAddress,
  type: z.enum(['static', 'dhcp', 'reserved', 'used_prefix']),
  description: z.string().max(500).optional()
})

export const updateIpRangeSchema = z.object({
  start_ip: ipAddress.optional(),
  end_ip: ipAddress.optional(),
  type: z.enum(['static', 'dhcp', 'reserved', 'used_prefix']).optional(),
  description: z.string().max(500).optional().nullable()
})
