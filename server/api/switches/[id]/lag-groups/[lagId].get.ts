import { lagGroupRepository } from '../../../../repositories/lagGroupRepository'

export default defineEventHandler((event) => {
  const lagId = event.context.params?.lagId
  if (!lagId) throw createError({ statusCode: 400, statusMessage: 'LAG group ID required' })

  const group = lagGroupRepository.getById(lagId)
  if (!group) throw createError({ statusCode: 404, statusMessage: 'LAG group not found' })
  return group
})
