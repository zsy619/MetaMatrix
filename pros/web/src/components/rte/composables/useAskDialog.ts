import { nextTick, ref, type Ref } from 'vue'

export type RteAskKind = 'prompt' | 'confirm'

/** 统一自定义询问弹层，替代 window.prompt / confirm。 */
export function useAskDialog(deps: { closeMore: () => void }) {
  const askOpen = ref(false)
  const askKind = ref<RteAskKind>('prompt')
  const askTitle = ref('')
  const askMessage = ref('')
  const askPlaceholder = ref('')
  const askValue = ref('')
  const askConfirmLabel = ref('确认')
  const askCancelLabel = ref('取消')
  const askMaxlength = ref(500)
  const askInputRef = ref<HTMLInputElement | null>(null)
  let askResolvePrompt: ((v: string | null) => void) | null = null
  let askResolveConfirm: ((v: boolean) => void) | null = null

  function closeAskDialog(result: 'cancel' | 'ok' = 'cancel') {
    if (askKind.value === 'prompt') {
      const r = askResolvePrompt
      askResolvePrompt = null
      askOpen.value = false
      if (r) r(result === 'ok' ? askValue.value : null)
    } else {
      const r = askResolveConfirm
      askResolveConfirm = null
      askOpen.value = false
      if (r) r(result === 'ok')
    }
  }

  function settleAskPendingAsCancel() {
    if (askResolvePrompt) {
      const r = askResolvePrompt
      askResolvePrompt = null
      r(null)
    }
    if (askResolveConfirm) {
      const r = askResolveConfirm
      askResolveConfirm = null
      r(false)
    }
  }

  function openRtePrompt(opts: {
    title: string
    message?: string
    placeholder?: string
    defaultValue?: string
    confirmLabel?: string
    cancelLabel?: string
    maxlength?: number
  }): Promise<string | null> {
    settleAskPendingAsCancel()
    askKind.value = 'prompt'
    askTitle.value = opts.title
    askMessage.value = opts.message || ''
    askPlaceholder.value = opts.placeholder || ''
    askValue.value = opts.defaultValue ?? ''
    askConfirmLabel.value = opts.confirmLabel || '确认'
    askCancelLabel.value = opts.cancelLabel || '取消'
    askMaxlength.value = opts.maxlength ?? 500
    askOpen.value = true
    deps.closeMore()
    nextTick(() => {
      askInputRef.value?.focus()
      askInputRef.value?.select()
    })
    return new Promise((resolve) => {
      askResolvePrompt = resolve
    })
  }

  function openRteConfirm(opts: {
    title: string
    message: string
    confirmLabel?: string
    cancelLabel?: string
  }): Promise<boolean> {
    settleAskPendingAsCancel()
    askKind.value = 'confirm'
    askTitle.value = opts.title
    askMessage.value = opts.message
    askPlaceholder.value = ''
    askValue.value = ''
    askConfirmLabel.value = opts.confirmLabel || '确定'
    askCancelLabel.value = opts.cancelLabel || '取消'
    askOpen.value = true
    deps.closeMore()
    return new Promise((resolve) => {
      askResolveConfirm = resolve
    })
  }

  return {
    askOpen,
    askKind,
    askTitle,
    askMessage,
    askPlaceholder,
    askValue,
    askConfirmLabel,
    askCancelLabel,
    askMaxlength,
    askInputRef,
    closeAskDialog,
    openRtePrompt,
    openRteConfirm,
  }
}

export type AskMoreCloser = { close: () => void }

export function bindAskMore(closer: AskMoreCloser, moreOpen: Ref<boolean>) {
  closer.close = () => {
    moreOpen.value = false
  }
}
