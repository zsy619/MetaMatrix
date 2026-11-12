export const LAUNCH_SEEN_KEY = 'metamatrix:launch-seen'

/** 每个会话看一次。地址带 ?intro=1 时再看一次，方便回到开场。 */
export function shouldShowLaunch(search: string, seen: string | null): boolean {
  const query = search.startsWith('?') ? search.slice(1) : search
  if (new URLSearchParams(query).get('intro') === '1') return true
  return seen !== '1'
}
