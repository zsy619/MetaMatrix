import { describe, expect, it } from 'vitest'
import {
  MERMAID_FLOW_DECISION,
  MERMAID_FLOW_LR,
  addFlowStep,
  isFlowChain,
  parseFlow,
  removeFlowNode,
  serializeFlow,
  setFlowDir,
  setFlowText,
} from './mermaidFlow'

describe('流程图步骤', () => {
  it('能读出横向三步，改名、加一步、删中间步后仍是一条线', () => {
    const model = parseFlow(MERMAID_FLOW_LR)
    expect(model?.dir).toBe('LR')
    expect(model?.nodes.map((node) => node.text)).toEqual(['开始', '处理', '结束'])
    expect(isFlowChain(model!)).toBe(true)
    const renamed = setFlowText(model!, 'A', '起步')
    expect(serializeFlow(renamed)).toContain('A[起步]')
    const added = addFlowStep(renamed)
    expect(added.nodes.map((node) => node.text)).toEqual(['起步', '处理', '结束', '新步骤'])
    expect(isFlowChain(added)).toBe(true)
    const removed = removeFlowNode(added, 'B')
    expect(removed.nodes.map((node) => node.text)).toEqual(['起步', '结束', '新步骤'])
    expect(removed.edges.map((edge) => `${edge.from}->${edge.to}`)).toEqual(['A->C', 'C->D'])
    expect(parseFlow(serializeFlow(setFlowDir(removed, 'TD')))?.dir).toBe('TD')
  })

  it('判断分支保留是和否', () => {
    const model = parseFlow(MERMAID_FLOW_DECISION)
    expect(model?.nodes.find((node) => node.id === 'B')?.shape).toBe('diamond')
    expect(model?.edges.map((edge) => edge.label)).toEqual(['', '是', '否'])
    expect(isFlowChain(model!)).toBe(false)
    expect(parseFlow(serializeFlow(model!))?.edges[1]?.label).toBe('是')
  })

  it('复杂源码不硬解析', () => {
    expect(parseFlow('flowchart LR\n  A[开始] --> B[处理] & C[旁路]')).toBeNull()
  })
})
