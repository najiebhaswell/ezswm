import { networkRepository } from '../../../repositories/networkRepository'
import { findNextAvailableSubnet } from '../../../utils/ipv4'

export default defineEventHandler((event) => {
  const id = event.context.params?.id
  const query = getQuery(event)
  const prefixStr = query.prefix as string

  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Missing network ID' })
  }

  if (!prefixStr || isNaN(Number(prefixStr))) {
    throw createError({ statusCode: 400, statusMessage: 'Missing or invalid prefix query parameter' })
  }

  const requestedPrefix = Number(prefixStr)
  const network = networkRepository.getById(id)

  if (!network) {
    throw createError({ statusCode: 404, statusMessage: 'Network not found' })
  }

  const children = networkRepository.listChildren(id)
  const existingCidrs = children.map(c => c.subnet)

  const nextSubnet = findNextAvailableSubnet(network.subnet, existingCidrs, requestedPrefix)

  if (!nextSubnet) {
    throw createError({ statusCode: 404, statusMessage: `No available /${requestedPrefix} space found in ${network.subnet}` })
  }

  return { subnet: nextSubnet }
})
