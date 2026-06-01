import { userRepository } from '../../repositories/userRepository'

export default defineEventHandler(async (event) => {
  const id = event.context.params?.id

  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'User ID is required' })
  }

  const currentUserId = event.context.auth?.userId
  if (currentUserId === id) {
    throw createError({ statusCode: 400, statusMessage: 'Cannot delete your own account' })
  }

  const existing = userRepository.getById(id)

  if (!existing) {
    throw createError({ statusCode: 404, statusMessage: 'User not found' })
  }

  userRepository.delete(id)

  setResponseStatus(event, 204)
  return null
})
