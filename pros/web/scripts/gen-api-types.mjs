#!/usr/bin/env node
/**
 * 从 OpenAPI 文档生成前端 TypeScript 类型。
 *
 * 对应共享技术方案 §10.9「OpenAPI：自动生成接口文档和前端 TypeScript 类型」。
 *
 * 用法：
 *   node scripts/gen-api-types.mjs [--api http://localhost:3000/openapi.json] [--out src/modules/base/types.gen.ts]
 *
 * 数据来源优先级：
 *   1. `--api` 指定的在线文档（默认 http://localhost:3000/openapi.json）；
 *   2. 仓库内快照 docs/openapi/base-openapi.json（离线可用）。
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const webRoot = path.resolve(__dirname, '..')
const repoRoot = path.resolve(webRoot, '..')

function arg(name, fallback) {
  const idx = process.argv.indexOf(`--${name}`)
  if (idx >= 0 && process.argv[idx + 1]) return process.argv[idx + 1]
  return fallback
}

const apiUrl = arg('api', 'http://localhost:3000/openapi.json')
const outFile = path.resolve(webRoot, arg('out', 'src/modules/base/types.gen.ts'))
const snapshot = path.resolve(repoRoot, 'docs/openapi/base-openapi.json')

async function loadDoc() {
  try {
    const res = await fetch(apiUrl)
    if (res.ok) return { doc: await res.json(), from: apiUrl }
  } catch {
    /* 离线：走快照 */
  }
  if (fs.existsSync(snapshot)) {
    return { doc: JSON.parse(fs.readFileSync(snapshot, 'utf8')), from: snapshot }
  }
  throw new Error(`无法获取 OpenAPI 文档：${apiUrl}，且快照不存在：${snapshot}`)
}

/** 把 OpenAPI 里的类型描述转成 TS 类型。 */
function tsType(raw, schemas) {
  if (!raw) return 'unknown'
  let type = String(raw).trim()
  let optional = false
  if (type.endsWith('?')) {
    optional = true
    type = type.slice(0, -1)
  }
  let out
  if (type.endsWith('[]')) {
    const item = type.slice(0, -2)
    out = `${item}[]`
  } else {
    switch (type) {
      case 'string':
        out = 'string'
        break
      case 'number':
        out = 'number'
        break
      case 'boolean':
        out = 'boolean'
        break
      case 'object':
        out = 'Record<string, unknown>'
        break
      case 'any':
        out = 'unknown'
        break
      default:
        out = schemas.has(type) ? type : 'unknown'
    }
  }
  return optional ? `${out} | null` : out
}

function pascal(name) {
  return name
    .replace(/[^A-Za-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('')
}

const { doc, from } = await loadDoc()
const schemas = new Map(Object.entries(doc.components?.schemas ?? {}))
const lines = []
lines.push('/* eslint-disable */')
lines.push('/**')
lines.push(' * 自动生成，请勿手改。')
lines.push(' *')
lines.push(` * 来源：${from}`)
lines.push(' * 生成命令：npm run gen:api')
lines.push(' */')
lines.push('')

for (const [name, schema] of schemas) {
  if (schema.type === 'array') {
    const ref = schema.items?.$ref ?? ''
    const itemType = ref ? ref.replace('#/components/schemas/', '') : 'unknown'
    lines.push(`export type ${pascal(name)} = ${tsType(`${itemType}[]`, schemas)}`)
    lines.push('')
    continue
  }
  const props = schema.properties ?? {}
  const fields = Object.entries(props).map(([fname, meta]) => {
    const type = tsType(meta?.type, schemas)
    return `  ${fname}${type.includes('| null') ? '?' : ''}: ${type}`
  })
  lines.push(`export interface ${pascal(name)} {`)
  if (!fields.length) lines.push('  [key: string]: unknown')
  else lines.push(...fields)
  lines.push('}')
  lines.push('')
}

fs.mkdirSync(path.dirname(outFile), { recursive: true })
fs.writeFileSync(outFile, lines.join('\n'), 'utf8')
console.log(`已生成 ${outFile}（${schemas.size} 个 schema，来源 ${from}）`)
