import { networkRepository } from '../../repositories/networkRepository'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)

  const siteId = query.site_id as string | undefined
  const vlanId = query.vlan_id as string | undefined
  const search = query.search as string | undefined
  const parentNetworkId = query.parent_network_id as string | undefined
  const rootOnly = query.root === 'true'

  let items = networkRepository.list()

  if (siteId) {
    items = items.filter((n) => n.site_id === siteId)
  }

  if (vlanId) {
    items = items.filter((n) => n.vlan_id === vlanId)
  }

  if (search) {
    const term = search.toLowerCase()
    items = items.filter(
      (n) =>
        n.name.toLowerCase().includes(term) ||
        n.subnet.toLowerCase().includes(term)
    )
  }

  if (parentNetworkId) {
    items = items.filter((n) => n.parent_network_id === parentNetworkId)
  } else if (rootOnly) {
    items = items.filter((n) => !n.parent_network_id)
  }

  return {
    data: items,
    meta: { total: items.length },
  }
})

