/**
 * pinyin-pro 按需加载。
 *
 * pinyin-pro 自带整套汉字词典，开发态预打包后约 1.5MB。
 * 之前它在 utils 里被静态 import，等于每个页面（哪怕只是项目列表）都要下载它。
 * 现在改成：用到拼音检索/注音时再加载，进程内只加载一次。
 */
import type { pinyin as PinyinFn } from 'pinyin-pro'

type PinyinImpl = typeof PinyinFn

let impl: PinyinImpl | null = null
let loader: Promise<PinyinImpl> | null = null

/** 加载 pinyin-pro（幂等）。调用方可以 await，也可以 fire-and-forget 预热。 */
export function loadPinyin(): Promise<PinyinImpl> {
  loader ??= import('pinyin-pro').then((mod) => {
    impl = mod.pinyin
    return mod.pinyin
  })
  return loader
}

/** 已加载好的实现；未加载时返回 null（调用方按“没有拼音能力”降级）。 */
export function pinyinImpl(): PinyinImpl | null {
  return impl
}
