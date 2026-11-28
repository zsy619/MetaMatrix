/** 把地址里的模板 id 收成登记过的 id。分支名后缀如 -4734 会剥掉。 */
export function resolveCanvasTemplateId(
  raw: string | null | undefined,
  isKnown: (id: string) => boolean,
): string | null {
  const id = String(raw ?? '').trim()
  if (!id) return null
  if (isKnown(id)) return id
  const stripped = id.replace(/-\d+$/, '')
  if (stripped !== id && isKnown(stripped)) return stripped
  return null
}
