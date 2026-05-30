import { networkRepository } from '../../repositories/networkRepository'
import { ipAllocationRepository } from '../../repositories/ipAllocationRepository'
import { ipRangeRepository } from '../../repositories/ipRangeRepository'
import { activityRepository } from '../../repositories/activityRepository'

export default defineEventHandler(async (event) => {
  const id = event.context.params?.id

  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Missing network ID' })
  }

  const existing = networkRepository.getById(id)

  if (!existing) {
    throw createError({ statusCode: 404, statusMessage: 'Network not found' })
  }

  // Block deletion if this network has children (networkRepository.delete also checks,
  // but checking here gives a cleaner error before any cascade deletions run)
  const children = networkRepository.listChildren(id)
  if (children.length > 0) {
    throw createError({
      statusCode: 409,
      statusMessage: `Cannot delete: this network has ${children.length} child subnet(s). Delete them first.`
    })
  }

  // Cascade delete related allocations and ranges
  ipAllocationRepository.deleteByNetworkId(id)
  ipRangeRepository.deleteByNetworkId(id)

  // Clean up used_prefix range in parent if this was a child subnet
  if (existing.parent_network_id) {
    const parentRanges = ipRangeRepository.list(existing.parent_network_id)
    const { parseSubnet } = await import('../../utils/ipv4')
    const childInfo = parseSubnet(existing.subnet)
    for (const range of parentRanges) {
      if (range.type === 'used_prefix' &&
          range.start_ip === childInfo.network_address &&
          range.end_ip === childInfo.broadcast_address) {
        ipRangeRepository.delete(range.id)
      }
    }
  }

  networkRepository.delete(id)

  activityRepository.log({
    user_id: event.context.auth?.userId,
    action: 'delete',
    entity_type: 'network',
    entity_id: id,
    entity_name: existing.name,
  })

  setResponseStatus(event, 204)
  return null
})

