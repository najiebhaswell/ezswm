<template>
  <div class="space-y-1.5">
    <div class="flex h-2 overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-700">
      <!-- Allocated IPs (individual) -->
      <div class="h-full bg-green-500 transition-all" :style="{ width: `${allocOnlyPercent}%` }" />
      <!-- Used Prefix ranges (violet) -->
      <div v-if="(usedPrefixRangePercent ?? 0) > 0" class="h-full bg-violet-500/70 transition-all" :style="{ width: `${usedPrefixRangePercent ?? 0}%` }" />
      <!-- DHCP ranges -->
      <div v-if="dhcpRangePercent > 0" class="h-full bg-blue-500/60 transition-all" :style="{ width: `${dhcpRangePercent}%` }" />
      <!-- Reserved ranges -->
      <div v-if="reservedRangePercent > 0" class="h-full bg-yellow-500/50 transition-all" :style="{ width: `${reservedRangePercent}%` }" />
    </div>
    <div class="flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] text-gray-400">
      <span class="flex items-center gap-1"><span class="inline-block h-2 w-2 rounded-full bg-green-500" /> {{ allocationsCount }} {{ $t('networks.infoBar.allocated') }}</span>
      <span v-if="(usedPrefixRangePercent ?? 0) > 0" class="flex items-center gap-1"><span class="inline-block h-2 w-2 rounded-full bg-violet-500/70" /> {{ $t('networks.ranges.types.used_prefix') }} ({{ usedPrefixIpCount }} IPs)</span>
      <span v-if="dhcpRangePercent > 0" class="flex items-center gap-1"><span class="inline-block h-2 w-2 rounded-full bg-blue-500/60" /> {{ $t('networks.ranges.types.dhcp') }}</span>
      <span v-if="reservedRangePercent > 0" class="flex items-center gap-1"><span class="inline-block h-2 w-2 rounded-full bg-yellow-500/50" /> {{ $t('networks.ranges.types.reserved') }}</span>
      <span class="flex items-center gap-1"><span class="inline-block h-2 w-2 rounded-full bg-gray-500/30" /> {{ $t('common.free') }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
const props = defineProps<{
  utilizationPercent: number
  dhcpRangePercent: number
  reservedRangePercent: number
  usedPrefixRangePercent?: number
  usedPrefixIpCount?: number
  allocationsCount: number
}>()

// Portion of bar for individual IP allocations only (exclude used_prefix which is counted in utilizationPercent)
const allocOnlyPercent = computed(() => {
  const up = props.usedPrefixRangePercent ?? 0
  return Math.max(0, props.utilizationPercent - up)
})
</script>
