/** 和十格自检同一套列色：身份、要填的事实、判断、风险、结论。相邻列用不同色。 */
export type FdeColumnTone = 'id' | 'fill' | 'measure' | 'judge' | 'fail' | 'verdict'

const tones: Record<string, FdeColumnTone> = {
  'candidates:name': 'id',
  'candidates:frequency': 'fill',
  'candidates:time': 'measure',
  'candidates:rules': 'judge',
  'candidates:cost': 'fail',
  'candidates:data': 'measure',
  'candidates:will': 'verdict',

  'metrics:metric': 'id',
  'metrics:base': 'fill',
  'metrics:goal': 'judge',

  'risks:risk': 'fail',
  'risks:response': 'verdict',

  'milestones:when': 'id',
  'milestones:what': 'fill',

  'samples:no': 'id',
  'samples:desc': 'fill',
  'samples:source': 'measure',
  'samples:kind': 'judge',
  'samples:gold': 'verdict',

  'results:no': 'id',
  'results:output': 'fill',
  'results:result': 'judge',
  'results:fix': 'fail',
  'results:note': 'measure',

  'errors:type': 'fail',
  'errors:count': 'measure',
  'errors:example': 'fill',
  'errors:fix': 'verdict',

  'summary:metric': 'id',
  'summary:result': 'fill',
  'summary:bar': 'judge',
  'summary:ok': 'verdict',

  'tools:name': 'id',
  'tools:good': 'verdict',
  'tools:bad': 'fail',
  'tools:fit': 'fill',
  'tools:check': 'judge',
}

export function fdeColumnTone(blockId: string, columnId: string): FdeColumnTone {
  return tones[`${blockId}:${columnId}`] ?? 'id'
}

export function fdeColumnToneKnown(blockId: string, columnId: string): boolean {
  return Object.prototype.hasOwnProperty.call(tones, `${blockId}:${columnId}`)
}
