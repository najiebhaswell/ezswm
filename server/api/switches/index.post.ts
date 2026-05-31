import { switchRepository } from '../../repositories/switchRepository'
import { createSwitchSchema } from '../../validators/switchSchemas'
import { activityRepository } from '../../repositories/activityRepository'
import { syncSwitchManagementIp } from '../../utils/ipSync'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const parsed = createSwitchSchema.parse(body)

  const created = await switchRepository.create(parsed)

  // Auto-reserve management IP if applicable
  if (created.management_ip) {
    syncSwitchManagementIp(created.management_ip, undefined, created.name, undefined)
  }

  await activityRepository.log({
    user_id: event.context.auth?.userId,
    action: 'create',
    entity_type: 'switch',
    entity_id: created.id,
    entity_name: created.name,
  })

  setResponseStatus(event, 201)
  return created
})
