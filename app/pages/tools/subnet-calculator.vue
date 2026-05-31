<template>
  <div class="p-6">
    <h1 class="mb-6 text-2xl font-bold">{{ $t('tools.subnetCalculator.title') }}</h1>

    <div class="max-w-xl">
      <UFormField :label="$t('tools.subnetCalculator.inputLabel')">
        <UInput
          v-model="cidr"
          :placeholder="$t('tools.subnetCalculator.inputPlaceholder')"
          size="lg"
        />
      </UFormField>

      <UCard v-if="result" class="mt-6">
        <template #header>
          <div class="flex items-center gap-2">
            <h2 class="font-semibold">{{ $t('tools.subnetCalculator.results') }}</h2>
            <!-- IPv4 badges -->
            <template v-if="result.ip_version === 4">
              <UBadge v-if="result.prefix_length === 31" variant="subtle" color="info" size="xs">Point-to-Point</UBadge>
              <UBadge v-else-if="result.prefix_length === 32" variant="subtle" color="warning" size="xs">Host Route</UBadge>
            </template>
            <!-- IPv6 badges -->
            <template v-else>
              <UBadge variant="subtle" color="primary" size="xs">IPv6</UBadge>
              <UBadge v-if="result.prefix_length === 127" variant="subtle" color="info" size="xs">Point-to-Point</UBadge>
              <UBadge v-else-if="result.prefix_length === 128" variant="subtle" color="warning" size="xs">Host Route</UBadge>
            </template>
          </div>
        </template>

        <!-- IPv4 results (unchanged layout) -->
        <div v-if="result.ip_version === 4" class="grid grid-cols-2 gap-3 text-sm">
          <!-- /32: Host Address only -->
          <template v-if="result.prefix_length === 32">
            <div><span class="text-gray-400">{{ $t('networks.subnetInfo.hostAddress') }}:</span></div>
            <div><SharedCopyButton :value="result.network_address!">{{ result.network_address }}</SharedCopyButton></div>
          </template>
          <!-- /31: Endpoint A + B -->
          <template v-else-if="result.prefix_length === 31">
            <div><span class="text-gray-400">{{ $t('networks.subnetInfo.endpointA') }}:</span></div>
            <div><SharedCopyButton :value="result.network_address!">{{ result.network_address }}</SharedCopyButton></div>
            <div><span class="text-gray-400">{{ $t('networks.subnetInfo.endpointB') }}:</span></div>
            <div><SharedCopyButton :value="result.broadcast_address!">{{ result.broadcast_address }}</SharedCopyButton></div>
          </template>
          <!-- Normal subnets -->
          <template v-else>
            <div><span class="text-gray-400">{{ $t('networks.subnetInfo.networkAddress') }}:</span></div>
            <div><SharedCopyButton :value="result.network_address!">{{ result.network_address }}</SharedCopyButton></div>
            <div><span class="text-gray-400">{{ $t('networks.subnetInfo.broadcastAddress') }}:</span></div>
            <div><SharedCopyButton :value="result.broadcast_address!">{{ result.broadcast_address }}</SharedCopyButton></div>
          </template>
          <div><span class="text-gray-400">{{ $t('networks.subnetInfo.subnetMask') }}:</span></div>
          <div><SharedCopyButton :value="result.subnet_mask!">{{ result.subnet_mask }}</SharedCopyButton></div>
          <div><span class="text-gray-400">{{ $t('networks.subnetInfo.wildcardMask') }}:</span></div>
          <div><SharedCopyButton :value="result.wildcard_mask!">{{ result.wildcard_mask }}</SharedCopyButton></div>
          <template v-if="result.prefix_length < 31">
            <div><span class="text-gray-400">{{ $t('networks.subnetInfo.firstUsable') }}:</span></div>
            <div><SharedCopyButton :value="result.first_usable!">{{ result.first_usable }}</SharedCopyButton></div>
            <div><span class="text-gray-400">{{ $t('networks.subnetInfo.lastUsable') }}:</span></div>
            <div><SharedCopyButton :value="result.last_usable!">{{ result.last_usable }}</SharedCopyButton></div>
          </template>
          <div><span class="text-gray-400">{{ $t('networks.subnetInfo.totalHosts') }}:</span></div>
          <div>{{ result.total_hosts?.toLocaleString() }}</div>
          <div><span class="text-gray-400">{{ $t('networks.subnetInfo.usableHosts') }}:</span></div>
          <div>{{ result.usable_hosts?.toLocaleString() }}</div>
        </div>

        <!-- IPv6 results -->
        <div v-else class="grid grid-cols-2 gap-3 text-sm">
          <!-- /128 host -->
          <template v-if="result.prefix_length === 128">
            <div><span class="text-gray-400">{{ $t('networks.subnetInfo.hostAddress') }}:</span></div>
            <div><SharedCopyButton :value="result.network_address!">{{ result.network_address }}</SharedCopyButton></div>
          </template>
          <!-- /127 point-to-point -->
          <template v-else-if="result.prefix_length === 127">
            <div><span class="text-gray-400">{{ $t('networks.subnetInfo.endpointA') }}:</span></div>
            <div><SharedCopyButton :value="result.network_address!">{{ result.network_address }}</SharedCopyButton></div>
            <div><span class="text-gray-400">{{ $t('networks.subnetInfo.endpointB') }}:</span></div>
            <div><SharedCopyButton :value="result.last_address!">{{ result.last_address }}</SharedCopyButton></div>
          </template>
          <!-- Normal IPv6 -->
          <template v-else>
            <div><span class="text-gray-400">{{ $t('networks.subnetInfo.networkAddress') }}:</span></div>
            <div><SharedCopyButton :value="result.network_address!">{{ result.network_address }}</SharedCopyButton></div>
            <div><span class="text-gray-400">{{ $t('tools.subnetCalculator.lastAddress') }}:</span></div>
            <div><SharedCopyButton :value="result.last_address!">{{ result.last_address }}</SharedCopyButton></div>
            <div><span class="text-gray-400">{{ $t('networks.subnetInfo.firstUsable') }}:</span></div>
            <div><SharedCopyButton :value="result.first_usable!">{{ result.first_usable }}</SharedCopyButton></div>
            <div><span class="text-gray-400">{{ $t('networks.subnetInfo.lastUsable') }}:</span></div>
            <div><SharedCopyButton :value="result.last_usable!">{{ result.last_usable }}</SharedCopyButton></div>
          </template>
          <div><span class="text-gray-400">{{ $t('networks.subnetInfo.prefixLength') }}:</span></div>
          <div>/{{ result.prefix_length }}</div>
          <div><span class="text-gray-400">{{ $t('tools.subnetCalculator.totalAddresses') }}:</span></div>
          <div class="font-mono text-xs">{{ formatBigNumber(result.total_addresses) }}</div>
        </div>
      </UCard>
    </div>
  </div>
</template>

<script setup lang="ts">
useHead({ title: 'Subnet Calculator' })
const { t } = useI18n()

const cidr = ref('')

interface SubnetResult {
  cidr: string
  ip_version: number
  network_address: string | null
  // IPv4-specific
  broadcast_address: string | null
  subnet_mask: string | null
  wildcard_mask: string | null
  first_usable: string | null
  last_usable: string | null
  total_hosts: number | null
  usable_hosts: number | null
  // IPv6-specific
  last_address: string | null
  total_addresses: string | null
  usable_addresses: string | null
  prefix_length: number
}

const result = ref<SubnetResult | null>(null)

/** Format a potentially huge decimal string with locale separators (caps at 10^15). */
function formatBigNumber(s: string | null | undefined): string {
  if (!s) return '—'
  try {
    const n = BigInt(s)
    if (n > 10n ** 15n) return `2^${Math.round(Math.log2(Number(n)))} addresses`
    return n.toLocaleString()
  } catch {
    return s
  }
}

let debounceTimer: ReturnType<typeof setTimeout> | null = null
let requestId = 0

watch(cidr, (val) => {
  if (debounceTimer) clearTimeout(debounceTimer)

  if (!val || !val.includes('/')) {
    requestId++
    result.value = null
    return
  }

  debounceTimer = setTimeout(async () => {
    const currentId = ++requestId
    try {
      const data = await $fetch('/api/subnet-calculator', { params: { cidr: val } })
      if (currentId === requestId) {
        result.value = data as SubnetResult
      }
    } catch {
      if (currentId === requestId) {
        result.value = null
      }
    }
  }, 150)
})
</script>
