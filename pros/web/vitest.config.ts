import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'

const PROSEMIRROR_DEDUPE = [
  'prosemirror-view',
  'prosemirror-state',
  'prosemirror-model',
  'prosemirror-transform',
  'prosemirror-keymap',
  'prosemirror-commands',
  'prosemirror-schema-list',
  'prosemirror-history',
  'prosemirror-dropcursor',
  'prosemirror-gapcursor',
  'prosemirror-tables',
]

export default defineConfig({
  plugins: [vue()],
  resolve: {
    dedupe: [...PROSEMIRROR_DEDUPE, '@tiptap/pm', '@tiptap/core'],
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    passWithNoTests: true,
    testTimeout: 30000,
    hookTimeout: 30000,
  },
})
