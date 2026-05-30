<template>
  <div class="p-6">
    <div class="mb-4 flex items-center justify-between">
      <h1 class="text-xl font-bold">{{ $t('networks.title') }}</h1>
      <UButton :to="`/sites/${siteId}/subnets/create`" icon="i-heroicons-plus" size="sm">
        {{ $t('networks.create') }}
      </UButton>
    </div>

    <!-- Loading -->
    <div v-if="pageLoading" class="flex justify-center py-12">
      <UIcon name="i-heroicons-arrow-path" class="h-6 w-6 animate-spin text-gray-400" />
    </div>

    <template v-else>
    <!-- Filters -->
    <div class="mb-4 flex flex-wrap items-center gap-3">
      <UInput
        v-model="search"
        icon="i-heroicons-magnifying-glass"
        :placeholder="$t('common.search')"
        size="sm"
        class="w-64"
      />
      <USelect
        v-model="vlanFilter"
        :items="vlanFilterOptions"
        :placeholder="$t('networks.fields.vlan')"
        size="sm"
        class="w-48"
      />
    </div>

    <!-- Network Tree -->
    <div v-if="treeItems.length > 0">
      <div v-for="group in groupedTree" :key="group.siteId" class="mb-4">
        <div v-if="groupedTree.length > 1" class="mb-2 flex items-center gap-3">
          <UIcon name="i-heroicons-building-office-2" class="h-4 w-4 text-gray-500" />
          <span class="text-sm font-semibold text-gray-400">{{ group.siteName }}</span>
          <div class="h-px flex-1 bg-default" />
        </div>
        <div class="list-container rounded-lg bg-default">
          <!-- Sort header -->
          <div class="flex items-center gap-4 border-b border-default px-5 py-1.5 text-[10px] uppercase tracking-wider text-gray-500">
            <button class="flex items-center gap-1 transition-colors hover:text-gray-600 dark:hover:text-gray-200" @click="toggleSort('name')">
              {{ $t('common.name') }}
              <UIcon v-if="sortField === 'name'" :name="sortAsc ? 'i-heroicons-chevron-up' : 'i-heroicons-chevron-down'" class="h-3 w-3" />
            </button>
            <button class="flex items-center gap-1 transition-colors hover:text-gray-600 dark:hover:text-gray-200" @click="toggleSort('subnet')">
              {{ $t('networks.infoBar.subnet') }}
              <UIcon v-if="sortField === 'subnet'" :name="sortAsc ? 'i-heroicons-chevron-up' : 'i-heroicons-chevron-down'" class="h-3 w-3" />
            </button>
            <button class="flex items-center gap-1 transition-colors hover:text-gray-600 dark:hover:text-gray-200" @click="toggleSort('gateway')">
              {{ $t('networks.infoBar.gateway') }}
              <UIcon v-if="sortField === 'gateway'" :name="sortAsc ? 'i-heroicons-chevron-up' : 'i-heroicons-chevron-down'" class="h-3 w-3" />
            </button>
          </div>
          <!-- Tree rows -->
          <NetworkTreeRow
            v-for="(node, i) in group.nodes"
            :key="node.id"
            :node="node"
            :depth="0"
            :is-last="i === group.nodes.length - 1"
            :site-id="siteId"
            :get-vlan="getVlan"
            @delete="openDeleteDialog"
            @toggle="toggleNode"
          />
        </div>
      </div>
    </div>

    <SharedEmptyState
      v-else-if="!loading"
      icon="i-heroicons-globe-alt"
      :title="$t('networks.emptyTitle')"
      :description="$t('networks.emptyDescription')"
    >
      <template #action>
        <UButton :to="`/sites/${siteId}/subnets/create`" icon="i-heroicons-plus">{{ $t('networks.create') }}</UButton>
      </template>
    </SharedEmptyState>
    </template>

    <SharedConfirmDialog
      v-model="showDeleteDialog"
      :title="$t('networks.delete')"
      :message="deleteMessage"
      :loading="deleting"
      @confirm="confirmDelete"
    />
  </div>
</template>

<script setup lang="ts">
import type { Network } from '~~/types/network'

export interface NetworkTreeNode extends Network {
  children: NetworkTreeNode[]
  expanded: boolean
}

const route = useRoute()
const router = useRouter()
const siteId = computed(() => route.params.siteId as string)
const { t } = useI18n()
useHead({ title: t('networks.title') })
const toast = useToast()
const { items, loading, fetch: fetchNetworks, remove } = useNetworks()
const { items: vlans, fetch: fetchVlans } = useVlans()
const { items: allSites, fetch: fetchAllSites } = useSites()
const siteMap = computed(() => {
  const map: Record<string, string> = {}
  for (const s of allSites.value) map[s.id] = s.name
  return map
})

const pageLoading = ref(true)
const showDeleteDialog = ref(false)
const deleteTarget = ref<Network | null>(null)
const deleteMessage = ref('')
const deleting = ref(false)

// Collapse state — track explicitly collapsed nodes; everything else is expanded by default
const collapsedIds = ref<Set<string>>(new Set())

// Saved state
const LS_KEY = 'ezswm-networks-list'
const validSortFields = ['name', 'subnet', 'gateway'] as const
type SortField = typeof validSortFields[number]

function loadState() {
  const hasQuery = route.query.q || route.query.vlan || route.query.sort || route.query.dir
  if (hasQuery) {
    return {
      q: (route.query.q as string) || '',
      vlan: (route.query.vlan as string) || 'all',
      sort: validSortFields.includes(route.query.sort as SortField) ? route.query.sort as SortField : 'name',
      dir: route.query.dir === 'desc' ? false : true
    }
  }
  try {
    const saved = localStorage.getItem(LS_KEY)
    if (saved) {
      const s = JSON.parse(saved)
      return {
        q: s.q || '',
        vlan: s.vlan || 'all',
        sort: validSortFields.includes(s.sort) ? s.sort as SortField : 'name',
        dir: s.dir !== false
      }
    }
  } catch { /* ignore */ }
  return { q: '', vlan: 'all', sort: 'name' as SortField, dir: true }
}

const initial = loadState()
const search = ref(initial.q)
const vlanFilter = ref(initial.vlan)
const sortField = ref<SortField>(initial.sort)
const sortAsc = ref(initial.dir)

function syncState() {
  const query: Record<string, string> = {}
  if (search.value) query.q = search.value
  if (vlanFilter.value !== 'all') query.vlan = vlanFilter.value
  if (sortField.value !== 'name') query.sort = sortField.value
  if (!sortAsc.value) query.dir = 'desc'
  router.replace({ query })
  try {
    localStorage.setItem(LS_KEY, JSON.stringify({
      q: search.value, vlan: vlanFilter.value, sort: sortField.value, dir: sortAsc.value
    }))
  } catch { /* ignore */ }
}

watch([search, vlanFilter, sortField, sortAsc], syncState)

function toggleSort(field: SortField) {
  if (sortField.value === field) sortAsc.value = !sortAsc.value
  else { sortField.value = field; sortAsc.value = true }
}

const vlanFilterOptions = computed(() => {
  const options: { label: string; value: string }[] = [
    { label: t('common.all'), value: 'all' },
    { label: '-', value: 'none' }
  ]
  vlans.value.forEach((v) => {
    options.push({ label: `VLAN ${v.vlan_id} - ${v.name}`, value: v.id })
  })
  return options
})

function getVlan(vlanId: string | undefined) {
  if (!vlanId) return null
  return vlans.value.find((v) => v.id === vlanId) ?? null
}

function ipToNum(ip: string): number {
  const parts = ip.split('.').map(Number)
  return ((parts[0]! << 24) | (parts[1]! << 16) | (parts[2]! << 8) | parts[3]!) >>> 0
}

function subnetToNum(subnet: string): [number, number] {
  const [ip, prefix] = subnet.split('/')
  return [ipToNum(ip!), parseInt(prefix || '0', 10)]
}

// Filter by search + VLAN
const filteredItems = computed(() => {
  let result = items.value
  if (vlanFilter.value === 'none') result = result.filter((n) => !n.vlan_id)
  else if (vlanFilter.value !== 'all') result = result.filter((n) => n.vlan_id === vlanFilter.value)
  if (search.value) {
    const q = search.value.toLowerCase()
    result = result.filter((n) => n.name?.toLowerCase().includes(q) || n.subnet?.toLowerCase().includes(q))
  }
  return result
})

// Sort flat list
const sortedItems = computed(() => {
  const list = [...filteredItems.value]
  list.sort((a, b) => {
    const field = sortField.value
    if (field === 'subnet' || field === 'gateway') {
      const va = (a[field] as string) || ''
      const vb = (b[field] as string) || ''
      if (!va && !vb) return 0
      if (!va) return 1
      if (!vb) return -1
      if (field === 'subnet') {
        const [ipA, prefA] = subnetToNum(va)
        const [ipB, prefB] = subnetToNum(vb)
        const diff = ipA - ipB || prefA - prefB
        return sortAsc.value ? diff : -diff
      }
      const diff = ipToNum(va) - ipToNum(vb)
      return sortAsc.value ? diff : -diff
    }
    const va = (a[field] as string || '').toLowerCase()
    const vb = (b[field] as string || '').toLowerCase()
    if (va < vb) return sortAsc.value ? -1 : 1
    if (va > vb) return sortAsc.value ? 1 : -1
    return 0
  })
  return list
})

// Build tree structure from flat list
function buildTree(flat: Network[]): NetworkTreeNode[] {
  const idSet = new Set(flat.map(n => n.id))
  const roots: NetworkTreeNode[] = []
  const nodeMap = new Map<string, NetworkTreeNode>()

  // Create node objects — expanded by default, collapsed only if user explicitly closed them
  for (const n of flat) {
    nodeMap.set(n.id, { ...n, children: [], expanded: !collapsedIds.value.has(n.id) })
  }

  // Wire children (only if parent is in current filtered set)
  for (const node of nodeMap.values()) {
    if (node.parent_network_id && idSet.has(node.parent_network_id)) {
      const parent = nodeMap.get(node.parent_network_id)
      if (parent) {
        parent.children.push(node)
        continue
      }
    }
    roots.push(node)
  }

  return roots
}

const treeItems = computed(() => buildTree(sortedItems.value))

// Group by site for "All Sites" view
const groupedTree = computed(() => {
  if (siteId.value !== 'all') return [{ siteId: '', siteName: '', nodes: treeItems.value }]
  const groups: { siteId: string; siteName: string; nodes: NetworkTreeNode[] }[] = []
  const groupMap = new Map<string, NetworkTreeNode[]>()
  for (const node of treeItems.value) {
    const sid = node.site_id || ''
    if (!groupMap.has(sid)) groupMap.set(sid, [])
    groupMap.get(sid)!.push(node)
  }
  for (const [sid, nodes] of groupMap) {
    groups.push({ siteId: sid, siteName: siteMap.value[sid] || sid, nodes })
  }
  return groups
})

function openDeleteDialog(network: Network) {
  deleteTarget.value = network
  deleteMessage.value = `${t('networks.delete')}: ${network.name} (${network.subnet})?`
  showDeleteDialog.value = true
}

function toggleNode(id: string) {
  if (collapsedIds.value.has(id)) collapsedIds.value.delete(id)
  else collapsedIds.value.add(id)
}

async function confirmDelete() {
  if (!deleteTarget.value) return
  deleting.value = true
  try {
    await remove(deleteTarget.value.id)
    toast.add({ title: t('networks.messages.deleted'), color: 'success' })
    showDeleteDialog.value = false
    await fetchNetworks(siteParams.value)
  } catch (err: unknown) {
    const error = err as { data?: { message?: string } }
    toast.add({ title: error?.data?.message || t('errors.serverError'), color: 'error' })
  } finally { deleting.value = false }
}

const siteParams = computed(() => siteId.value && siteId.value !== 'all' ? { site_id: siteId.value } : {})
onMounted(async () => {
  const fetches: Promise<void>[] = [fetchNetworks(siteParams.value), fetchVlans(siteParams.value)]
  if (siteId.value === 'all') fetches.push(fetchAllSites())
  await Promise.all(fetches)
  pageLoading.value = false
})
</script>
