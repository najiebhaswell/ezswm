import { networkRepository } from '../../../repositories/networkRepository'

export default defineEventHandler(async (event) => {
  const id = event.context.params?.id

  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Missing network ID' })
  }

  const existing = networkRepository.getById(id)

  if (!existing) {
    throw createError({ statusCode: 404, statusMessage: 'Network not found' })
  }

  const children = networkRepository.listChildren(id)

  return {
    data: children,
    meta: { total: children.length }
  }
})
