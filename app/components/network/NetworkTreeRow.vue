<template>
  <div>
    <!-- Row -->
    <NuxtLink
      :to="`/sites/${siteId}/subnets/${node.id}`"
      class="row-hover group flex items-stretch pr-5"
      :class="isFirst ? '' : 'border-t border-default'"
    >
      <!-- Left accent: VLAN color -->
      <div
        class="w-1 flex-shrink-0"
        :style="vlan ? { backgroundColor: vlan.color } : {}"
        :class="!vlan ? 'bg-transparent' : ''"
      />

      <!-- Depth indentation + expand toggle -->
      <div class="flex items-center" :style="{ paddingLeft: `${depth * 20 + 8}px` }">
        <!-- Tree connector -->
        <div v-if="depth > 0" class="mr-1 flex h-full flex-col items-center">
          <div class="h-1/2 w-px bg-gray-700" />
          <div class="h-px w-3 bg-gray-700" />
          <div class="h-1/2 w-px" :class="isLast ? 'bg-transparent' : 'bg-gray-700'" />
        </div>

        <!-- Expand toggle (only for nodes with children) -->
        <button
          v-if="node.children.length > 0"
          class="mr-1 flex h-5 w-5 items-center justify-center rounded text-gray-400 transition-colors hover:bg-gray-700 hover:text-gray-200"
          @click.prevent="toggleExpand"
        >
          <UIcon
            :name="node.expanded ? 'i-heroicons-chevron-down' : 'i-heroicons-chevron-right'"
            class="h-3.5 w-3.5"
          />
        </button>
        <div v-else class="mr-1 h-5 w-5" />
      </div>

      <!-- Main info -->
      <div class="min-w-0 flex-1 py-3 pl-1">
        <div class="flex items-center gap-2">
          <span class="text-base font-semibold text-gray-900 dark:text-white">{{ node.name }}</span>
          <code class="rounded bg-primary-50 px-2 py-0.5 text-sm font-medium text-primary-600 dark:bg-primary-500/10 dark:text-primary-400">{{ node.subnet }}</code>
          <!-- Children badge -->
          <span
            v-if="node.children.length > 0"
            class="rounded-full bg-gray-700 px-2 py-0.5 text-[10px] font-medium text-gray-300"
          >
            {{ node.children.length }}
          </span>
        </div>
        <div class="mt-0.5 flex items-center gap-4 text-xs text-gray-500 dark:text-gray-400">
          <span v-if="node.gateway" class="flex items-center gap-1 font-mono">
            <UIcon name="i-heroicons-arrow-right-circle" class="h-3 w-3 text-gray-400" />
            {{ node.gateway }}
          </span>
          <span v-if="vlan" class="flex items-center gap-1">
            <UIcon name="i-heroicons-tag" class="h-3 w-3 text-gray-400" />
            VLAN {{ vlan.vlan_id }} · {{ vlan.name }}
          </span>
          <span v-if="node.description" class="flex items-center gap-1 truncate">
            <UIcon name="i-heroicons-document-text" class="h-3 w-3 flex-shrink-0 text-gray-400" />
            {{ node.description }}
          </span>
        </div>
      </div>

      <!-- Actions -->
      <div class="flex items-center gap-1 py-3 opacity-0 transition-opacity group-hover:opacity-100">
        <!-- Add child subnet shortcut -->
        <UButton
          icon="i-heroicons-plus"
          variant="ghost"
          color="primary"
          size="xs"
          :title="$t('networks.children.add')"
          :to="`/sites/${siteId}/subnets/create?parent=${node.id}`"
          @click.stop
        />
        <UButton
          icon="i-heroicons-trash"
          variant="ghost"
          color="error"
          size="xs"
          @click.prevent="emit('delete', node)"
        />
      </div>
    </NuxtLink>

    <!-- Children (recursive) -->
    <template v-if="node.expanded && node.children.length > 0">
      <NetworkTreeRow
        v-for="(child, ci) in node.children"
        :key="child.id"
        :node="child"
        :depth="depth + 1"
        :is-last="ci === node.children.length - 1"
        :is-first="false"
        :site-id="siteId"
        :get-vlan="getVlan"
        @delete="(n) => emit('delete', n)"
        @toggle="(id) => emit('toggle', id)"
      />
    </template>
  </div>
</template>

<script setup lang="ts">
import type { NetworkTreeNode } from '~~/app/pages/sites/[siteId]/subnets/index.vue'
import type { Network } from '~~/types/network'
import type { Vlan } from '~~/types/vlan'

const props = defineProps<{
  node: NetworkTreeNode
  depth: number
  isLast: boolean
  isFirst?: boolean
  siteId: string
  getVlan: (vlanId: string | undefined) => Vlan | null
}>()

const emit = defineEmits<{
  delete: [network: Network]
  toggle: [id: string]
}>()

const vlan = computed(() => props.getVlan(props.node.vlan_id))

function toggleExpand() {
  // Flip local state immediately for instant UI feedback
  props.node.expanded = !props.node.expanded
  // Notify parent so it can persist the collapsed state
  emit('toggle', props.node.id)
}
</script>

