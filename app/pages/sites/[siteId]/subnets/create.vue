<template>
  <div class="mx-auto w-full max-w-5xl px-6 py-6">
    <div class="mb-6 flex items-center gap-3">
      <UButton icon="i-heroicons-arrow-left" variant="ghost" :to="backTo" :aria-label="$t('common.back')" />
      <h1 class="text-2xl font-bold">{{ $t('networks.create') }}</h1>
    </div>

    <UForm :state="form" :validate="validate" :validate-on="['blur', 'change']" novalidate @submit.prevent="onSubmit">
      <div class="space-y-6">
        <!-- Network Info -->
        <div class="list-container rounded-lg bg-default p-5">
          <h2 class="mb-4 text-sm font-semibold uppercase tracking-wider text-gray-400">{{ $t('networks.sections.networkInfo') }}</h2>
          <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
            <UFormField :label="$t('networks.fields.name')" name="name" required>
              <UInput v-model="form.name" :placeholder="$t('networks.fields.name')" class="w-full" />
            </UFormField>
            <UFormField :label="$t('networks.fields.subnet')" name="subnet" required>
              <div class="flex gap-2">
                <UInput v-model="form.subnet" placeholder="10.0.1.0/24" class="flex-1" />
                <UPopover v-if="selectedParent">
                  <UButton color="primary" variant="soft" icon="i-heroicons-sparkles" :title="$t('networks.suggestSubnet')" />
                  <template #content>
                    <div class="flex items-center gap-2 p-3">
                      <span class="text-sm">Prefix: /</span>
                      <UInput v-model="suggestPrefix" type="number" min="1" max="32" class="w-20" size="sm" />
                      <UButton size="sm" :loading="suggestingSubnet" @click="doSuggestSubnet">{{ $t('common.suggest') }}</UButton>
                    </div>
                  </template>
                </UPopover>
              </div>
              <template v-if="selectedParent" #hint>
                <span class="text-xs text-blue-400">
                  {{ $t('networks.fields.parentNetworkHint') }}: {{ selectedParent.subnet }}
                </span>
              </template>
            </UFormField>
            <UFormField :label="$t('networks.fields.gateway')">
              <UInput v-model="form.gateway" placeholder="10.0.1.1" class="w-full" />
            </UFormField>
            <UFormField :label="$t('networks.fields.dnsServers')">
              <UInput v-model="dnsInput" placeholder="8.8.8.8, 8.8.4.4" class="w-full" />
              <template #hint>
                <span class="text-xs text-gray-500">{{ $t('networks.validation.commaSeparated') }}</span>
              </template>
            </UFormField>
          </div>
        </div>

        <!-- Parent Network -->
        <div class="list-container rounded-lg bg-default p-5">
          <h2 class="mb-4 text-sm font-semibold uppercase tracking-wider text-gray-400">{{ $t('networks.sections.hierarchy') }}</h2>
          <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
            <UFormField :label="$t('networks.fields.parentNetwork')" class="md:col-span-2">
              <USelect
                v-model="form.parent_network_id"
                :items="parentNetworkOptions"
                :placeholder="$t('networks.fields.parentNetworkPlaceholder')"
                value-key="value"
                class="w-full"
              />
              <template v-if="selectedParent" #hint>
                <span class="inline-flex items-center gap-1 text-xs text-blue-400">
                  <UIcon name="i-heroicons-information-circle" class="h-3.5 w-3.5" />
                  {{ $t('networks.fields.parentNetworkHint') }}: {{ selectedParent.subnet }}
                </span>
              </template>
            </UFormField>
            <!-- Auto-create used_prefix option -->
            <div v-if="selectedParent" class="md:col-span-2">
              <label class="flex cursor-pointer items-start gap-3">
                <input v-model="autoCreateUsedPrefix" type="checkbox" class="mt-0.5 h-4 w-4 rounded border-gray-600 bg-gray-800 text-primary-500 focus:ring-primary-500" />
                <div>
                  <span class="text-sm font-medium text-gray-200">{{ $t('networks.autoCreateUsedPrefix') }}</span>
                  <p class="mt-0.5 text-xs text-gray-400">{{ $t('networks.autoCreateUsedPrefixHint') }}</p>
                </div>
              </label>
            </div>
            
            <!-- Auto-create used_prefix option for itself -->
            <div class="md:col-span-2" :class="{ 'mt-4': !selectedParent }">
              <label class="flex cursor-pointer items-start gap-3">
                <input v-model="autoCreateUsedPrefixInSelf" type="checkbox" class="mt-0.5 h-4 w-4 rounded border-gray-600 bg-gray-800 text-primary-500 focus:ring-primary-500" />
                <div>
                  <span class="text-sm font-medium text-gray-200">{{ $t('networks.autoCreateUsedPrefixInSelf') }}</span>
                  <p class="mt-0.5 text-xs text-gray-400">{{ $t('networks.autoCreateUsedPrefixInSelfHint') }}</p>
                </div>
              </label>
            </div>
          </div>
        </div>

        <!-- Association -->
        <div class="list-container rounded-lg bg-default p-5">
          <h2 class="mb-4 text-sm font-semibold uppercase tracking-wider text-gray-400">{{ $t('networks.sections.vlanDescription') }}</h2>
          <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
            <UFormField :label="$t('networks.fields.vlan')">
              <USelect v-model="form.vlan_id" :items="vlanOptions" :placeholder="$t('networks.fields.vlan')" value-key="value" class="w-full" />
            </UFormField>
            <UFormField :label="$t('common.description')" class="md:col-span-2">
              <UTextarea v-model="form.description" :placeholder="$t('common.description')" :rows="3" class="w-full" />
            </UFormField>
          </div>
        </div>

      </div>

      <!-- Actions -->
      <div class="mt-4 flex justify-end gap-3">
        <UButton variant="ghost" color="neutral" :to="backTo">
          {{ $t('common.cancel') }}
        </UButton>
        <UButton type="submit" :loading="submitting" icon="i-heroicons-check">
          {{ $t('common.save') }}
        </UButton>
      </div>
    </UForm>
  </div>
</template>

<script setup lang="ts">
import type { Network } from '~~/types/network'

const route = useRoute()
const siteId = computed(() => route.params.siteId as string)
const { t } = useI18n()
useHead({ title: t('networks.create') })
const toast = useToast()
const router = useRouter()
const { create } = useNetworks()
const { items: vlans, fetch: fetchVlans } = useVlans()
const { items: allNetworks, fetch: fetchNetworks } = useNetworks()

const submitting = ref(false)
const dnsInput = ref('')
const autoCreateUsedPrefix = ref(false)
const autoCreateUsedPrefixInSelf = ref(false)

const suggestPrefix = ref(24)
const suggestingSubnet = ref(false)

// Pre-select parent from query param (e.g. ?parent=<networkId>)
const preselectedParentId = route.query.parent as string | undefined

const form = ref({
  name: '',
  subnet: '',
  gateway: '',
  vlan_id: '',
  description: '',
  parent_network_id: preselectedParentId || ''
})

const backTo = computed(() => {
  if (preselectedParentId) return `/sites/${siteId.value}/subnets/${preselectedParentId}`
  return `/sites/${siteId.value}/subnets`
})

const dirtyTracker = computed(() => ({ ...form.value, dnsInput: dnsInput.value }))
const { clearDirty } = useUnsavedChanges(dirtyTracker)

const vlanOptions = computed(() => {
  const options: { label: string; value: string }[] = []
  vlans.value.forEach((v) => {
    options.push({ label: `VLAN ${v.vlan_id} - ${v.name}`, value: v.id })
  })
  return options
})

const parentNetworkOptions = computed(() => {
  const options: { label: string; value: string }[] = [
    { label: `— ${t('networks.fields.parentNetworkPlaceholder')} —`, value: '_none' }
  ]
  allNetworks.value.forEach((n) => {
    options.push({ label: `${n.subnet}  ${n.name}`, value: n.id })
  })
  return options
})

const selectedParent = computed((): Network | null => {
  if (!form.value.parent_network_id || form.value.parent_network_id === '_none') return null
  return allNetworks.value.find(n => n.id === form.value.parent_network_id) ?? null
})

async function doSuggestSubnet() {
  if (!selectedParent.value) return
  suggestingSubnet.value = true
  try {
    const { subnet } = await $fetch<{ subnet: string }>(`/api/networks/${selectedParent.value.id}/next-subnet`, {
      query: { prefix: suggestPrefix.value }
    })
    form.value.subnet = subnet
  } catch (err: any) {
    toast.add({
      title: t('networks.suggestFailed'),
      description: err?.data?.statusMessage || err?.message || 'Error',
      color: 'error'
    })
  } finally {
    suggestingSubnet.value = false
  }
}

function validate(state: typeof form.value) {
  const errors: { name: string; message: string }[] = []
  if (!state.name?.trim()) {
    errors.push({ name: 'name', message: t('networks.validation.nameRequired') })
  }
  if (!state.subnet?.trim()) {
    errors.push({ name: 'subnet', message: t('networks.validation.subnetRequired') })
  } else if (!state.subnet.match(/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\/\d{1,2}$/)) {
    errors.push({ name: 'subnet', message: t('networks.validation.subnetFormat') })
  }
  return errors
}

function parseDns(): string[] {
  if (!dnsInput.value.trim()) return []
  return dnsInput.value.split(',').map(s => s.trim()).filter(Boolean)
}

async function onSubmit() {
  submitting.value = true
  let result: unknown
  try {
    const parentId = form.value.parent_network_id && form.value.parent_network_id !== '_none'
      ? form.value.parent_network_id
      : undefined

    const body: Record<string, unknown> = {
      name: form.value.name.trim(),
      subnet: form.value.subnet.trim(),
      gateway: form.value.gateway.trim() || undefined,
      dns_servers: parseDns(),
      vlan_id: form.value.vlan_id || undefined,
      description: form.value.description.trim() || undefined,
      parent_network_id: parentId ?? null
    }
    if (siteId.value && siteId.value !== 'all') {
      body.site_id = siteId.value
    }
    result = await create(body)

    // Auto-create used_prefix range in parent if requested
    if (autoCreateUsedPrefix.value && parentId && result) {
      const newNet = result as Network
      const startIp = newNet.subnet.split('/')[0]
      const endIp = computeBroadcast(newNet.subnet)
      try {
        // Check if a used_prefix range already exists for this exact block in parent
        const existingRanges = await $fetch<any[]>(`/api/networks/${parentId}/ranges`)
        const rangeList = Array.isArray(existingRanges) ? existingRanges : (existingRanges as any)?.data || []
        const existing = rangeList.find((r: any) =>
          r.type === 'used_prefix' && r.start_ip === startIp && r.end_ip === endIp
        )
        if (!existing) {
          await $fetch(`/api/networks/${parentId}/ranges`, {
            method: 'POST',
            body: {
              start_ip: startIp,
              end_ip: endIp,
              type: 'used_prefix',
              description: `Delegated to: ${newNet.name} (${newNet.subnet})`
            }
          })
        }
        // If it already exists, silently skip — range is already marked
      } catch (pfxErr: unknown) {
        console.error('[used_prefix] Failed to auto-create range:', pfxErr)
        const pfxError = pfxErr as { data?: { message?: string; statusMessage?: string }; message?: string }
        const detail = pfxError?.data?.message || pfxError?.data?.statusMessage || pfxError?.message || 'Unknown error'
        toast.add({
          title: t('networks.autoCreateUsedPrefixFailed'),
          description: detail,
          color: 'warning'
        })
      }
    }

    // Auto-create used_prefix range in itself if requested
    if (autoCreateUsedPrefixInSelf.value && result) {
      const newNet = result as Network
      const startIp = newNet.subnet.split('/')[0]
      const endIp = computeBroadcast(newNet.subnet)
      try {
        await $fetch(`/api/networks/${newNet.id}/ranges`, {
          method: 'POST',
          body: {
            start_ip: startIp,
            end_ip: endIp,
            type: 'used_prefix',
            description: `Allocated / fully utilized`
          }
        })
      } catch (pfxErr: unknown) {
        console.error('[used_prefix_self] Failed to auto-create range:', pfxErr)
        const pfxError = pfxErr as { data?: { message?: string; statusMessage?: string }; message?: string }
        const detail = pfxError?.data?.message || pfxError?.data?.statusMessage || pfxError?.message || 'Unknown error'
        toast.add({
          title: t('networks.autoCreateUsedPrefixInSelfFailed'),
          description: detail,
          color: 'warning'
        })
      }
    }

    clearDirty()
    toast.add({ title: t('networks.messages.created'), color: 'success' })
  } catch (err: unknown) {
    const error = err as { data?: { message?: string } }
    toast.add({ title: error?.data?.message || t('errors.serverError'), color: 'error' })
    return
  } finally {
    submitting.value = false
  }
  await router.push(`/sites/${siteId.value}/subnets/${(result as Network).id}`)
}

/** Compute broadcast address from CIDR string. */
function computeBroadcast(cidr: string): string {
  const [ip, prefixStr] = cidr.split('/') as [string, string]
  const prefix = Number(prefixStr)
  const parts = ip.split('.').map(Number)
  const ipLong = ((parts[0]! << 24) | (parts[1]! << 16) | (parts[2]! << 8) | parts[3]!) >>> 0
  const mask = prefix === 0 ? 0 : (~0 << (32 - prefix)) >>> 0
  const wildcard = (~mask) >>> 0
  const broadcast = (ipLong | wildcard) >>> 0
  return [
    (broadcast >>> 24) & 255,
    (broadcast >>> 16) & 255,
    (broadcast >>> 8) & 255,
    broadcast & 255
  ].join('.')
}

const siteParams = computed(() => siteId.value && siteId.value !== 'all' ? { site_id: siteId.value } : {})

onMounted(() => {
  fetchVlans(siteParams.value)
  fetchNetworks(siteParams.value)
})
</script>
