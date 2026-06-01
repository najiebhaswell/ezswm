import { defineEventHandler, getQuery, createError } from 'h3'
import { parse as parseYaml } from 'yaml'
import { convertNetboxToTemplate } from '../../utils/deviceLibrary'
import type { NetboxDevice } from '../../utils/deviceLibrary'

export default defineEventHandler(async (event) => {
  const { manufacturer, slug } = getQuery(event) as { manufacturer?: string; slug?: string }

  if (!manufacturer || !slug) {
    throw createError({ statusCode: 400, statusMessage: 'manufacturer and slug are required' })
  }

  const url = `https://raw.githubusercontent.com/netbox-community/devicetype-library/master/device-types/${encodeURIComponent(manufacturer)}/${encodeURIComponent(slug)}.yaml`

  let response: Response
  try {
    response = await fetch(url, {
      headers: { 'User-Agent': 'ezSWM' }
    })
  } catch {
    throw createError({ statusCode: 503, statusMessage: 'Device library unavailable — no internet connection' })
  }

  if (!response.ok) {
    if (response.status === 404) {
      throw createError({ statusCode: 404, statusMessage: `Device ${manufacturer}/${slug} not found` })
    }
    throw createError({ statusCode: 503, statusMessage: 'Device library unavailable' })
  }

  const yamlText = await response.text()
  let device: NetboxDevice
  try {
    device = parseYaml(yamlText) as NetboxDevice
  } catch {
    throw createError({ statusCode: 422, statusMessage: 'Could not parse device definition' })
  }

  const { template, skippedInterfaces } = convertNetboxToTemplate(device)
  return { template, skippedInterfaces }
})
