/** 本地小词表：敏感词 / 常见错别字 → 建议 */
export const RTE_SENSITIVE_WORDS: Array<{ word: string; hint: string }> = [
  { word: '傻逼', hint: '不当用语' },
  { word: '操你', hint: '不当用语' },
  { word: '法轮', hint: '敏感词' },
  { word: '色情', hint: '敏感词' },
  { word: '赌博', hint: '敏感词' },
  { word: '在在', hint: '疑似笔误' },
  { word: '的的', hint: '疑似笔误' },
  { word: '了了', hint: '疑似笔误' },
  { word: '必须须', hint: '疑似笔误' },
  { word: '因该', hint: '应为「应该」' },
  { word: '既使', hint: '应为「即使」' },
  { word: '其它', hint: '可规范为「其他」' },
  { word: '帐号', hint: '可规范为「账号」' },
  { word: '登陆系统', hint: '应为「登录」' },
  { word: '急急', hint: '疑似笔误' },
]

export type SensitiveHit = { from: number; to: number; word: string; hint: string }

export function collectSensitiveHits(
  doc: { descendants: (f: (node: { isText?: boolean; text?: string }, pos: number) => void) => void },
  dict: Array<{ word: string; hint: string }> = RTE_SENSITIVE_WORDS,
): SensitiveHit[] {
  const hits: SensitiveHit[] = []
  const sorted = [...dict].sort((a, b) => b.word.length - a.word.length)
  doc.descendants((node, pos) => {
    if (!node.isText || !node.text) return
    const text = node.text
    for (const { word, hint } of sorted) {
      if (!word) continue
      let idx = 0
      while (idx < text.length) {
        const found = text.indexOf(word, idx)
        if (found < 0) break
        hits.push({ from: pos + found, to: pos + found + word.length, word, hint })
        idx = found + word.length
      }
    }
  })
  return hits
}
