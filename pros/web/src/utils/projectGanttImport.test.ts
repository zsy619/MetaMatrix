// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { parseMicrosoftProjectXml } from './projectGanttImport'

const XML = `<?xml version="1.0" encoding="UTF-8"?>
<Project xmlns="http://schemas.microsoft.com/project">
  <Title>办公楼改造</Title>
  <MinutesPerDay>480</MinutesPerDay>
  <Tasks>
    <Task>
      <UID>0</UID><ID>0</ID><Name>办公楼改造</Name>
      <OutlineLevel>0</OutlineLevel><Summary>1</Summary>
      <Start>2026-11-16T08:00:00</Start><Finish>2026-11-20T17:00:00</Finish>
    </Task>
    <Task>
      <UID>1</UID><ID>1</ID><Name>结构</Name>
      <OutlineLevel>1</OutlineLevel><Summary>1</Summary>
      <Start>2026-11-16T08:00:00</Start><Finish>2026-11-18T17:00:00</Finish>
      <PercentComplete>40</PercentComplete>
    </Task>
    <Task>
      <UID>4</UID><ID>4</ID><Name>空行</Name><IsNull>1</IsNull>
    </Task>
    <Task>
      <UID>3</UID><ID>3</ID><Name>验收</Name>
      <OutlineLevel>2</OutlineLevel><Milestone>1</Milestone><Manual>1</Manual>
      <Start>2026-11-16T08:00:00</Start><Finish>2026-11-16T08:00:00</Finish>
      <ManualStart>2026-11-18T09:30:00</ManualStart>
      <ManualFinish>2026-11-18T09:30:00</ManualFinish>
      <PredecessorLink>
        <PredecessorUID>2</PredecessorUID><Type>1</Type><LinkLag>4800</LinkLag><LagFormat>7</LagFormat>
      </PredecessorLink>
      <PredecessorLink>
        <PredecessorUID>1</PredecessorUID><Type>0</Type><LinkLag>-2400</LinkLag>
      </PredecessorLink>
      <PredecessorUID>99</PredecessorUID>
    </Task>
    <Task>
      <UID>2</UID><ID>2</ID><Name>浇筑</Name>
      <OutlineLevel>2</OutlineLevel>
      <Start>2026-11-16T08:00:00</Start><Finish>2026-11-17T17:00:00</Finish>
      <PercentComplete>25</PercentComplete>
      <Baseline><Number>0</Number><Start>2026-11-16T08:00:00</Start><Finish>2026-11-17T12:00:00</Finish></Baseline>
    </Task>
  </Tasks>
  <Resources>
    <Resource><UID>0</UID><Name>未分配</Name></Resource>
    <Resource><UID>1</UID><Name>张三</Name></Resource>
    <Resource><UID>2</UID><Name>李四</Name></Resource>
  </Resources>
  <Assignments>
    <Assignment><TaskUID>2</TaskUID><ResourceUID>1</ResourceUID></Assignment>
    <Assignment><TaskUID>2</TaskUID><ResourceUID>2</ResourceUID></Assignment>
    <Assignment><TaskUID>2</TaskUID><ResourceUID>0</ResourceUID></Assignment>
  </Assignments>
</Project>`

describe('导入 Microsoft Project XML', () => {
  it('按大纲、分钟、依赖、资源和比较基准还原', () => {
    const parsed = parseMicrosoftProjectXml(XML)
    expect('error' in parsed).toBe(false)
    if ('error' in parsed) return
    expect(parsed.title).toBe('办公楼改造')
    expect(parsed.tasks.map((task) => task.name)).toEqual(['结构', '浇筑', '验收'])
    const [summary, pour, check] = parsed.tasks
    expect(summary).toMatchObject({ id: 'msp_1', kind: 'summary', parentId: null, progress: 40, start: '2026-11-16 08:00', end: '2026-11-18 17:00' })
    expect(pour).toMatchObject({
      id: 'msp_2',
      parentId: 'msp_1',
      owner: '张三、李四',
      progress: 25,
      start: '2026-11-16 08:00',
      end: '2026-11-17 17:00',
      baselineStart: '2026-11-16 08:00',
      baselineEnd: '2026-11-17 12:00',
    })
    expect(check).toMatchObject({
      id: 'msp_3',
      kind: 'milestone',
      parentId: 'msp_1',
      start: '2026-11-18 09:30',
      end: '2026-11-18 09:30',
    })
    expect(check?.predecessors).toEqual([
      { taskId: 'msp_2', type: 'FS', lag: 1 },
      { taskId: 'msp_1', type: 'FF', lag: -0.5 },
    ])
  })

  it('不是 Project XML 时说明原因', () => {
    expect(parseMicrosoftProjectXml('<html></html>')).toEqual({ error: '这不是 Microsoft Project 的 XML' })
    expect(parseMicrosoftProjectXml('PK\u0003\u0004')).toEqual({ error: '请在 Project 里另存为 XML 后再导入' })
  })
})
