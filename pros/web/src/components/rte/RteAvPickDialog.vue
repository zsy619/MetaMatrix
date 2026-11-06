<script setup lang="ts">
import type { AvPicker } from './avMediaPicker'
import { useParentScopeStamp } from './inheritScope'

defineProps<{
  picker: AvPicker
}>()

useParentScopeStamp()
</script>

<template>
  <Teleport to="body">
    <div
      data-rte-own
      v-if="picker.open"
      class="rte-modal-overlay"
      :data-av-kind="picker.kind"
      @mousedown.self="picker.close()"
    >
      <div
        data-rte-own
        class="rte-image-dialog"
        role="dialog"
        aria-modal="true"
        :aria-label="picker.copy.ariaLabel"
        @mousedown.stop
      >
        <div data-rte-own class="rte-image-tabs">
          <button
            data-rte-own
            type="button"
            class="rte-image-tab"
            :class="{ active: picker.tab === 'personal' }"
            @click="picker.tab = 'personal'"
          >
            个人素材
          </button>
          <button
            data-rte-own
            type="button"
            class="rte-image-tab"
            :class="{ active: picker.tab === 'external' }"
            @click="picker.tab = 'external'"
          >
            外部链接
          </button>
        </div>

        <div data-rte-own v-if="picker.tab === 'personal'" class="rte-image-personal">
          <aside data-rte-own class="rte-image-sidebar">
            <button
              data-rte-own
              type="button"
              class="rte-image-side-item"
              :class="{ active: picker.sidebarKey === 'all' }"
              @click="picker.sidebarKey = 'all'"
            >
              <span data-rte-own class="rte-image-side-ico" aria-hidden="true">{{ picker.copy.sideIcon }}</span>
              <span data-rte-own class="rte-image-side-label">{{ picker.copy.libraryLabel }}</span>
            </button>
            <button
              data-rte-own
              type="button"
              class="rte-image-side-item"
              :class="{ active: picker.sidebarKey === 'uncategorized' }"
              @click="picker.sidebarKey = 'uncategorized'"
            >
              <span data-rte-own class="rte-image-side-ico" aria-hidden="true">📁</span>
              <span data-rte-own class="rte-image-side-label">未分类</span>
            </button>
            <button
              data-rte-own
              v-for="cat in picker.categories"
              :key="cat.id"
              type="button"
              class="rte-image-side-item"
              :class="{ active: picker.sidebarKey === cat.id }"
              @click="picker.sidebarKey = cat.id"
            >
              <span data-rte-own class="rte-image-side-ico" aria-hidden="true">📁</span>
              <span data-rte-own class="rte-image-side-label">{{ cat.name }}</span>
            </button>
            <div data-rte-own class="rte-image-side-spacer" />
            <div data-rte-own v-if="picker.addingCategory" class="rte-image-add-cat-form">
              <input
                data-rte-own
                v-model="picker.newCategoryName"
                type="text"
                class="rte-image-add-cat-input"
                placeholder="分类名称"
                maxlength="40"
                @keydown.enter.prevent="picker.confirmAddCategory()"
                @keydown.esc.prevent="picker.addingCategory = false"
              />
              <button data-rte-own type="button" class="rte-image-add-cat-ok" @click="picker.confirmAddCategory()">
                确定
              </button>
            </div>
            <button
              data-rte-own
              v-else
              type="button"
              class="rte-image-side-item rte-image-add-cat"
              @click="picker.startAddCategory()"
            >
              <span data-rte-own class="rte-image-side-ico" aria-hidden="true">📁+</span>
              <span data-rte-own class="rte-image-side-label">添加分类</span>
            </button>
          </aside>

          <div data-rte-own class="rte-image-main">
            <div data-rte-own class="rte-image-main-top">
              <label data-rte-own class="rte-image-select-all">
                <input
                  data-rte-own
                  type="checkbox"
                  :checked="picker.selectAll"
                  @change="picker.onSelectAllChange()"
                />
                <span data-rte-own>本页全选</span>
              </label>
            </div>
            <div
              data-rte-own
              class="rte-image-grid"
              :class="{ empty: picker.filteredAssets.length === 0 }"
            >
              <button
                data-rte-own
                type="button"
                class="rte-image-upload-card"
                :title="picker.copy.uploadLabel"
                @click="picker.triggerLocalPick()"
              >
                <span data-rte-own class="rte-image-upload-ico" aria-hidden="true">
                  <svg data-rte-own width="48" height="48" viewBox="0 0 48 48" fill="none">
                    <rect data-rte-own x="6" y="10" width="36" height="28" rx="4" stroke="#5b8cff" stroke-width="2" />
                    <path data-rte-own d="M20 18l12 6-12 6V18z" fill="#5b8cff" />
                    <circle data-rte-own cx="36" cy="12" r="8" fill="#5b8cff" />
                    <path data-rte-own d="M36 8v8M32 12h8" stroke="#fff" stroke-width="2" stroke-linecap="round" />
                  </svg>
                </span>
                <span data-rte-own class="rte-image-upload-label">{{ picker.copy.uploadLabel }}</span>
              </button>
              <button
                data-rte-own
                v-for="asset in picker.filteredAssets"
                :key="asset.id"
                type="button"
                class="rte-image-thumb rte-video-thumb"
                :class="{ selected: picker.selectedIds.has(asset.id), 'rte-audio-thumb': picker.copy.preview === 'audio' }"
                :title="asset.name"
                @click="picker.toggleSelect(asset.id)"
              >
                <video
                  data-rte-own
                  v-if="picker.copy.preview === 'video'"
                  :src="asset.src"
                  muted
                  preload="metadata"
                />
                <audio data-rte-own v-else :src="asset.src" preload="none" />
                <span data-rte-own class="rte-video-thumb-name">{{ asset.name }}</span>
                <span
                  data-rte-own
                  class="rte-image-thumb-check"
                  :class="{ on: picker.selectedIds.has(asset.id) }"
                />
              </button>
            </div>
          </div>
        </div>

        <div data-rte-own v-else class="rte-image-external">
          <p data-rte-own class="rte-link-import-hint">{{ picker.copy.urlHint }}</p>
          <textarea
            data-rte-own
            v-model="picker.externalUrls"
            class="rte-image-url-textarea"
            :placeholder="picker.copy.urlPlaceholder"
            spellcheck="false"
          />
        </div>

        <div data-rte-own class="rte-modal-actions rte-image-actions">
          <button data-rte-own type="button" class="rte-modal-cancel" @click="picker.close()">
            取消
          </button>
          <button data-rte-own type="button" class="rte-modal-confirm" @click="picker.confirm()">
            确认
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
