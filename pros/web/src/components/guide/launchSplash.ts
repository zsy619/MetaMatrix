/** 勾选「下次不再展示」之后写入这里。没勾选就每次进入引导页都播开场。 */
export const LAUNCH_SKIP_KEY = 'metamatrix:launch-skip'

export function shouldShowLaunch(search: string, skipped: string | null): boolean {
  const query = search.startsWith('?') ? search.slice(1) : search
  if (new URLSearchParams(query).get('intro') === '1') return true
  return skipped !== '1'
}
