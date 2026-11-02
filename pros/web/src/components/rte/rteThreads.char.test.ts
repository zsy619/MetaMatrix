// @vitest-environment happy-dom
/** 评论线程写入画布 JSON，旧批注标记仍留在正文里。 */
import { nextTick } from 'vue'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { describe, expect, it } from 'vitest'
import RichTextEditor from '../RichTextEditor.vue'
import { useDocumentStore } from '../../stores/document'
import type { CanvasDocumentJSON } from '../../types/canvas'
import { itemsToHtml, syncItemsFromHtml } from '../../utils/itemsHtml'
import type { QuadrantItem } from '../../types/canvas'

async function waitEditor(wrapper: ReturnType<typeof mount>) {
  const started = Date.now()
  while (!wrapper.find('.ProseMirror').exists()) {
    await flushPromises()
    await nextTick()
    if (Date.now() - started > 20000) break
  }
}

describe('评论与斜杠回写', () => {
  it('选区评论可以回复、解决，并按面板写入画布 JSON', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    const store = useDocumentStore()
    store.current_data = {
      schemaVersion: 1,
      templateId: 'y-model',
      title: 'fixture',
    } as unknown as CanvasDocumentJSON
    const wrapper = mount(RichTextEditor, {
      props: { modelValue: '<p>需要讨论的句子</p>', panelId: 'panel-a', expanded: true },
      global: { plugins: [pinia] },
      attachTo: document.body,
    })
    await waitEditor(wrapper)
    const editor = (wrapper.vm as unknown as {
      editor: { commands: { setTextSelection: (range: { from: number; to: number }) => boolean } }
    }).editor
    editor.commands.setTextSelection({ from: 1, to: 5 })
    await wrapper.get('button[aria-label="对选区添加评论"]').trigger('click')
    const box = wrapper.get('textarea[aria-label="评论内容"]')
    await box.setValue('请补充依据')
    await wrapper.get('button.rte-comment-btn.is-primary').trigger('click')
    await flushPromises()
    const threads = store.current_data?.commentThreadsByPanelId?.['panel-a']
    expect(threads).toHaveLength(1)
    expect(threads?.[0]?.quote).toContain('需要')
    expect(threads?.[0]?.resolved).toBe(false)
    expect(wrapper.html()).toContain('data-comment-thread')
    expect(wrapper.html()).not.toContain('data-annotation')
    const reply = wrapper.get('textarea[aria-label^="回复"]')
    await reply.setValue('补上了')
    const replyButtons = wrapper.findAll('button.rte-comment-btn.is-primary')
    await replyButtons[replyButtons.length - 1]!.trigger('click')
    expect(store.current_data?.commentThreadsByPanelId?.['panel-a']?.[0]?.messages).toHaveLength(2)
    await wrapper.get('button.rte-comment-btn').trigger('click')
    expect(store.current_data?.commentThreadsByPanelId?.['panel-a']?.[0]?.resolved).toBe(true)
    wrapper.unmount()
  })

  it('占位行段首的斜杠不会被画布回写吞成整段查询', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    const store = useDocumentStore()
    store.current_data = {
      schemaVersion: 1,
      templateId: 'y-model',
      title: 'fixture',
    } as unknown as CanvasDocumentJSON
    const items: QuadrantItem[] = [{ id: 'a', text: '在此填写定性定量方法…' }]
    const wrapper = mount(RichTextEditor, {
      props: {
        modelValue: itemsToHtml(items),
        panelId: 'block:facts_analysis',
        expanded: true,
        'onUpdate:modelValue': (next: string) => {
          syncItemsFromHtml(items, next, {
            update: (id, text) => {
              const item = items.find((row) => row.id === id)
              if (item) item.text = text
            },
            add: (text) => {
              const item = { id: `n${items.length}`, text }
              items.push(item)
              return item
            },
            remove: (id) => {
              const index = items.findIndex((row) => row.id === id)
              if (index >= 0) items.splice(index, 1)
            },
          })
          void wrapper.setProps({ modelValue: itemsToHtml(items) })
        },
      },
      global: { plugins: [pinia] },
      attachTo: document.body,
    })
    await waitEditor(wrapper)
    const editor = (wrapper.vm as unknown as {
      editor: {
        getHTML: () => string
        chain: () => {
          focus: () => {
            setTextSelection: (pos: number) => {
              splitBlock: () => { insertContent: (text: string) => { run: () => boolean } }
            }
          }
        }
      }
    }).editor
    editor.chain().focus().setTextSelection(1).splitBlock().insertContent('/').run()
    await new Promise((resolve) => setTimeout(resolve, 400))
    await flushPromises()
    expect(editor.getHTML().startsWith('<p></p><p>/')).toBe(true)
    expect(document.querySelector('.rte-slash-list')).toBeTruthy()
    wrapper.unmount()
  })
})
