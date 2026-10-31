/**
 * TipTap 内置文档模板：工具栏「模板 ▾」插入。
 * content 为函数，每次插入时重新生成表单 name，避免字段冲突。
 */
import { RTE_FORM_DOC_TEMPLATES, RTE_FORM_TEMPLATE_GROUPS } from './rteFormDocTemplates'

export type RteDocTemplateGroup =
  | 'office'
  | 'product'
  | 'project'
  | 'sales'
  | 'hr'
  | 'notes'
  | 'formHr'
  | 'formSales'
  | 'formFinance'
  | 'formProject'
  | 'formOffice'
  | 'formSurvey'
  | 'formApproval'

export type RteJsonNode = {
  type: string
  attrs?: Record<string, unknown>
  content?: RteJsonNode[]
  text?: string
  marks?: Array<{ type: string; attrs?: Record<string, unknown> }>
}

export type RteDocTemplate = {
  id: string
  label: string
  /** 菜单副标题，一句话说明用途 */
  description?: string
  group: RteDocTemplateGroup
  /** 每次调用返回顶层 block 节点数组（不含 doc 包裹） */
  build: () => RteJsonNode[]
}

/** 递归去掉空 text（ProseMirror 禁止），并去掉因此变空的无意义包装 */
export function sanitizeRteJsonNodes(nodes: RteJsonNode[]): RteJsonNode[] {
  const out: RteJsonNode[] = []
  for (const n of nodes) {
    if (!n || typeof n !== 'object') continue
    if (n.type === 'text') {
      if (typeof n.text === 'string' && n.text.length > 0) out.push(n)
      continue
    }
    const next: RteJsonNode = { ...n }
    if (Array.isArray(n.content)) {
      const kids = sanitizeRteJsonNodes(n.content)
      if (kids.length) next.content = kids
      else delete next.content
    }
    out.push(next)
  }
  return out
}

function text(s: string, marks?: RteJsonNode['marks']): RteJsonNode | null {
  // ProseMirror 禁止空 text node；空串应落到空 paragraph，而不是 text:''
  if (!s) return null
  return marks?.length ? { type: 'text', text: s, marks } : { type: 'text', text: s }
}

function p(...parts: Array<string | RteJsonNode>): RteJsonNode {
  const content: RteJsonNode[] = []
  for (const x of parts) {
    if (typeof x === 'string') {
      const t = text(x)
      if (t) content.push(t)
    } else if (x) {
      content.push(x)
    }
  }
  return content.length ? { type: 'paragraph', content } : { type: 'paragraph' }
}

function h(level: 1 | 2 | 3, s: string): RteJsonNode {
  const t = text(s)
  return {
    type: 'heading',
    attrs: { level },
    content: t ? [t] : undefined,
  }
}

function bullet(...items: string[]): RteJsonNode {
  return {
    type: 'bulletList',
    content: items.map((item) => ({
      type: 'listItem',
      content: [p(item)],
    })),
  }
}

function ordered(...items: string[]): RteJsonNode {
  return {
    type: 'orderedList',
    content: items.map((item) => ({
      type: 'listItem',
      content: [p(item)],
    })),
  }
}

/** 可勾选任务列表（TaskList / TaskItem）；checked 项用 ✓ 前缀或显式 true */
function tasks(
  ...items: Array<string | { text: string; checked?: boolean }>
): RteJsonNode {
  return {
    type: 'taskList',
    content: items.map((item) => {
      const raw = typeof item === 'string' ? item : item.text
      let checked =
        typeof item === 'string' ? false : !!item.checked
      let label = raw
      if (/^[□☐]\s*/.test(label)) {
        label = label.replace(/^[□☐]\s*/, '')
        checked = false
      } else if (/^[✓✔☑]\s*/.test(label)) {
        label = label.replace(/^[✓✔☑]\s*/, '')
        checked = true
      }
      return {
        type: 'taskItem',
        attrs: { checked },
        content: [p(label)],
      }
    }),
  }
}

function meetingMinutes(): RteJsonNode[] {
  return [
    h(1, '会议纪要'),
    p('会议主题：'),
    p('会议时间：　　　　　会议地点：'),
    p('主持人：　　　　　　记录人：'),
    h(2, '与会人员'),
    bullet('（姓名 / 部门）', '（姓名 / 部门）'),
    h(2, '议题与讨论'),
    ordered('议题一：', '议题二：', '议题三：'),
    h(2, '决议与行动项'),
    bullet('行动项：　　负责人：　　截止：', '行动项：　　负责人：　　截止：'),
    h(2, '其他说明'),
    p(''),
  ]
}

function weeklyReport(): RteJsonNode[] {
  return [
    h(1, '工作周报'),
    p('周期：____年__月__日 — __月__日　　汇报人：'),
    h(2, '本周完成'),
    ordered('完成事项一（结果 / 数据）', '完成事项二', '完成事项三'),
    h(2, '进行中'),
    bullet('事项：　　进度：　　风险：'),
    h(2, '下周计划'),
    ordered('计划一', '计划二', '计划三'),
    h(2, '问题与求助'),
    p(''),
    h(2, '备注'),
    p(''),
  ]
}

function requirementsSpec(): RteJsonNode[] {
  return [
    h(1, '需求说明'),
    p('文档版本：v0.1　　作者：　　更新日期：'),
    h(2, '背景与目标'),
    p('背景：'),
    p('目标：'),
    h(2, '用户与场景'),
    bullet('目标用户：', '核心场景：'),
    h(2, '功能需求'),
    ordered('需求一：描述 / 验收标准', '需求二：描述 / 验收标准', '需求三：描述 / 验收标准'),
    h(2, '非功能需求'),
    bullet('性能：', '安全：', '兼容性：'),
    h(2, '范围与约束'),
    bullet('范围内：', '范围外：', '依赖与约束：'),
    h(2, '开放问题'),
    p(''),
  ]
}

function retroChecklist(): RteJsonNode[] {
  return [
    h(1, '复盘清单'),
    p('主题 / 项目：　　　　时间范围：　　　　参与人：'),
    h(2, '目标回顾'),
    bullet('原定目标：', '实际结果：', '差距：'),
    h(2, '做得好的'),
    ordered('亮点一', '亮点二'),
    h(2, '可改进的'),
    ordered('问题一 → 根因 → 改进动作', '问题二 → 根因 → 改进动作'),
    h(2, '关键决策与假设'),
    bullet('当时假设：', '验证结果：'),
    h(2, '下次行动'),
    ordered('行动：　　负责人：　　截止：', '行动：　　负责人：　　截止：'),
  ]
}




function interviewNotes(): RteJsonNode[] {
  return [
    h(1, '面试记录'),
    p('候选人：　　　　　岗位：　　　　　面试官：'),
    p('面试时间：　　　　　轮次：初试 / 复试 / 终面'),
    h(2, '背景速览'),
    bullet('当前公司 / 职位：', '工作年限：', '期望薪资 / 到岗：'),
    h(2, '考察要点'),
    ordered('专业能力：', '项目经验：', '沟通协作：', '价值观与动机：'),
    h(2, '亮点'),
    bullet(''),
    h(2, '风险与疑点'),
    bullet(''),
    h(2, '结论'),
    p('评级：强烈推荐 / 推荐 / 待定 / 不推荐'),
    p('下一步：'),
  ]
}

function projectKickoff(): RteJsonNode[] {
  return [
    h(1, '项目立项'),
    p('项目名称：　　　　　负责人：　　　　　日期：'),
    h(2, '背景与目标'),
    p('背景：'),
    p('目标（可量化）：'),
    h(2, '范围'),
    bullet('范围内：', '范围外：'),
    h(2, '里程碑'),
    ordered('M1：　　交付：　　时间：', 'M2：　　交付：　　时间：', 'M3：　　交付：　　时间：'),
    h(2, '资源与依赖'),
    bullet('人力：', '预算：', '外部依赖：'),
    h(2, '风险'),
    bullet('风险：　　影响：　　应对：'),
    h(2, '成功标准'),
    p(''),
  ]
}



function customerFollowup(): RteJsonNode[] {
  return [
    h(1, '客户跟进'),
    p('客户名称：　　　　　跟进人：　　　　　日期：'),
    h(2, '客户概况'),
    bullet('行业 / 规模：', '关键联系人：', '当前阶段：线索 / 需求 / 方案 / 商务 / 成交'),
    h(2, '本次沟通'),
    p('沟通方式：电话 / 微信 / 拜访 / 会议'),
    p('沟通纪要：'),
    p(''),
    h(2, '需求与痛点'),
    bullet(''),
    h(2, '竞品与异议'),
    bullet(''),
    h(2, '下一步'),
    ordered('动作：　　负责人：　　截止：', '动作：　　负责人：　　截止：'),
    h(2, '商机判断'),
    p('意向：高 / 中 / 低　　预估金额：　　预计成交：'),
  ]
}

function okrAlign(): RteJsonNode[] {
  return [
    h(1, 'OKR 对齐'),
    p('周期：　　　　　团队 / 个人：　　　　　对齐上级目标：'),
    h(2, 'O1'),
    p('目标陈述：'),
    ordered('KR1：　　当前：　　目标：', 'KR2：　　当前：　　目标：', 'KR3：　　当前：　　目标：'),
    h(2, 'O2'),
    p('目标陈述：'),
    ordered('KR1：　　当前：　　目标：', 'KR2：　　当前：　　目标：'),
    h(2, '依赖与协同'),
    bullet('需要谁支持：', '卡点：'),
    h(2, '本周推进'),
    ordered('', ''),
    h(2, '风险'),
    p(''),
  ]
}


function dailyReport(): RteJsonNode[] {
  return [
    h(1, '工作日报'),
    p('日期：____年__月__日　　汇报人：　　　　部门：'),
    h(2, '今日完成'),
    ordered('事项一（结果）', '事项二', '事项三'),
    h(2, '进行中 / 阻塞'),
    bullet('事项：　　进度：　　阻塞：'),
    h(2, '明日计划'),
    ordered('计划一', '计划二'),
    h(2, '需协调'),
    p(''),
  ]
}

function monthlyReport(): RteJsonNode[] {
  return [
    h(1, '工作月报'),
    p('月份：____年__月　　汇报人：　　　　部门：'),
    h(2, '本月目标回顾'),
    bullet('目标一：达成情况', '目标二：达成情况'),
    h(2, '主要成果'),
    ordered('成果一（数据 / 影响）', '成果二', '成果三'),
    h(2, '问题与反思'),
    bullet('问题：', '原因：', '改进：'),
    h(2, '下月计划'),
    ordered('重点一', '重点二', '重点三'),
    h(2, '资源与支持'),
    p(''),
  ]
}

function workPlan(): RteJsonNode[] {
  return [
    h(1, '工作计划'),
    p('周期：　　　　　负责人：　　　　　制定日期：'),
    h(2, '目标'),
    p(''),
    h(2, '关键任务'),
    ordered('任务：　　产出：　　截止：　　负责人：', '任务：　　产出：　　截止：　　负责人：', '任务：　　产出：　　截止：　　负责人：'),
    h(2, '里程碑'),
    bullet('节点：　　时间：　　验收：'),
    h(2, '风险与应对'),
    bullet('风险：　　应对：'),
    h(2, '备注'),
    p(''),
  ]
}

function meetingAgenda(): RteJsonNode[] {
  return [
    h(1, '会议议程'),
    p('会议主题：'),
    p('时间：　　　　　地点 / 会议号：　　　　　主持人：'),
    p('参会人：'),
    h(2, '议程'),
    ordered('开场与目标对齐（5′）', '议题一：　　主讲：　　（15′）', '议题二：　　主讲：　　（15′）', '讨论与决议（10′）', '行动项确认（5′）'),
    h(2, '会前材料'),
    bullet('材料一', '材料二'),
    h(2, '备注'),
    p(''),
  ]
}

function announcement(): RteJsonNode[] {
  return [
    h(1, '通知公告'),
    p('发文部门：　　　　　日期：　　　　　文号：'),
    h(2, '通知事项'),
    p(''),
    h(2, '适用范围'),
    bullet('适用对象：', '生效时间：'),
    h(2, '具体要求'),
    ordered('要求一', '要求二', '要求三'),
    h(2, '联系人'),
    p('姓名：　　　　电话：　　　　邮箱：'),
    h(2, '附件'),
    p(''),
  ]
}

function tripReport(): RteJsonNode[] {
  return [
    h(1, '出差报告'),
    p('出差人：　　　　　部门：　　　　　同行人：'),
    p('出差地点：　　　　　起止日期：'),
    h(2, '出差目的'),
    p(''),
    h(2, '行程与工作内容'),
    ordered('日期 / 地点：　　工作内容：', '日期 / 地点：　　工作内容：'),
    h(2, '主要结论与成果'),
    bullet('结论一', '结论二'),
    h(2, '待办与跟进'),
    ordered('事项：　　负责人：　　截止：'),
    h(2, '费用说明'),
    p('交通：　　住宿：　　其他：　　合计：'),
    h(2, '备注'),
    p(''),
  ]
}

function competitorAnalysis(): RteJsonNode[] {
  return [
    h(1, '竞品分析'),
    p('分析人：　　　　　日期：　　　　　竞品名称：'),
    h(2, '竞品概况'),
    bullet('定位 / 目标用户：', '核心卖点：', '定价 / 套餐：'),
    h(2, '功能对比'),
    ordered('功能点：我方 / 竞品 / 差异', '功能点：我方 / 竞品 / 差异', '功能点：我方 / 竞品 / 差异'),
    h(2, '优势与不足'),
    bullet('竞品优势：', '竞品不足：', '我方可借鉴：'),
    h(2, '策略建议'),
    ordered('建议一', '建议二'),
    h(2, '附录'),
    p(''),
  ]
}

function todoChecklist(): RteJsonNode[] {
  return [
    h(1, '任务清单'),
    p('主题：　　　　　负责人：　　　　　截止日期：'),
    h(2, '待办'),
    tasks(
      '任务一　　优先级：高 / 中 / 低　　截止：',
      '任务二　　优先级：高 / 中 / 低　　截止：',
      '任务三　　优先级：高 / 中 / 低　　截止：',
    ),
    h(2, '进行中'),
    tasks('任务：　　进度：'),
    h(2, '已完成'),
    tasks({ text: '已完成示例', checked: true }),
    h(2, '备注'),
    p(''),
  ]
}








function userStory(): RteJsonNode[] {
  return [
    h(1, '用户故事'),
    p('需求编号：　　　　　优先级：高 / 中 / 低　　　　迭代：'),
    h(2, '故事陈述'),
    p('作为（角色），我想要（能力），以便（价值）。'),
    h(2, '验收标准'),
    ordered('给定…当…则…', '给定…当…则…', '给定…当…则…'),
    h(2, '边界与非目标'),
    bullet('范围内：', '范围外：'),
    h(2, '依赖与风险'),
    bullet('依赖：', '风险：'),
    h(2, '备注'),
    p(''),
  ]
}

function techDesign(): RteJsonNode[] {
  return [
    h(1, '技术设计'),
    p('作者：　　　　　日期：　　　　　关联需求：'),
    h(2, '背景与目标'),
    p(''),
    h(2, '方案概述'),
    p(''),
    h(2, '架构 / 流程'),
    bullet('模块划分：', '数据流：', '关键时序：'),
    h(2, '数据模型'),
    ordered('实体 / 字段：', '实体 / 字段：'),
    h(2, '接口要点'),
    bullet('接口：　　方法：　　说明：'),
    h(2, '风险与回滚'),
    bullet('风险：', '回滚方案：'),
    h(2, '排期与分工'),
    ordered('任务：　　负责人：　　截止：'),
  ]
}

function apiSpec(): RteJsonNode[] {
  return [
    h(1, '接口说明'),
    p('服务 / 模块：　　　　　负责人：　　　　　版本：'),
    h(2, '接口列表'),
    ordered('METHOD /path —— 简述', 'METHOD /path —— 简述'),
    h(2, '接口详情'),
    h(3, '1. 接口名称'),
    bullet('路径：', '方法：GET / POST / PUT / DELETE', '鉴权：'),
    p('请求参数：'),
    bullet('字段：类型 / 必填 / 说明'),
    p('响应示例：'),
    p(''),
    h(2, '错误码'),
    bullet('code：含义 / 处理建议'),
    h(2, '变更记录'),
    ordered('日期：　　变更：　　作者：'),
  ]
}

function bugPostmortem(): RteJsonNode[] {
  return [
    h(1, '缺陷复盘'),
    p('缺陷编号：　　　　　严重级别：P0 / P1 / P2　　　　发现日期：'),
    h(2, '现象'),
    p(''),
    h(2, '影响范围'),
    bullet('用户 / 业务：', '环境：生产 / 预发 / 测试'),
    h(2, '根因'),
    bullet('直接原因：', '深层原因：'),
    h(2, '修复与验证'),
    ordered('修复方案：', '验证步骤：', '是否已上线：'),
    h(2, '改进措施'),
    ordered('措施：　　负责人：　　截止：'),
    h(2, '经验沉淀'),
    p(''),
  ]
}

function experimentLog(): RteJsonNode[] {
  return [
    h(1, '实验记录'),
    p('实验名称：　　　　　负责人：　　　　　周期：'),
    h(2, '假设'),
    p('如果我们做（改动），则（指标）会（方向），因为（原因）。'),
    h(2, '方案'),
    bullet('实验组：', '对照组：', '流量：'),
    h(2, '指标'),
    ordered('主指标：', '护栏指标：', '观察指标：'),
    h(2, '结果'),
    p(''),
    h(2, '结论与下一步'),
    bullet('结论：上线 / 迭代 / 放弃', '下一步：'),
  ]
}

function projectWeekly(): RteJsonNode[] {
  return [
    h(1, '项目周报'),
    p('项目：　　　　　周期：　　　　　项目经理：'),
    h(2, '本周进展'),
    ordered('进展一（完成度）', '进展二', '进展三'),
    h(2, '里程碑状态'),
    bullet('里程碑：　　计划：　　实际：　　状态：正常 / 风险 / 延期'),
    h(2, '风险与问题'),
    bullet('风险 / 问题：　　影响：　　应对：　　负责人：'),
    h(2, '下周计划'),
    ordered('计划一', '计划二'),
    h(2, '需决策 / 支持'),
    p(''),
  ]
}

function riskRegister(): RteJsonNode[] {
  return [
    h(1, '风险清单'),
    p('项目：　　　　　更新人：　　　　　日期：'),
    h(2, '风险条目'),
    ordered(
      '风险：　　可能性：高/中/低　　影响：高/中/低　　应对：　　负责人：　　状态：开放/缓解/关闭',
      '风险：　　可能性：高/中/低　　影响：高/中/低　　应对：　　负责人：　　状态：开放/缓解/关闭',
      '风险：　　可能性：高/中/低　　影响：高/中/低　　应对：　　负责人：　　状态：开放/缓解/关闭',
    ),
    h(2, '本周变化'),
    bullet('新增：', '关闭：', '升级：'),
    h(2, '备注'),
    p(''),
  ]
}

function milestoneTrack(): RteJsonNode[] {
  return [
    h(1, '里程碑跟踪'),
    p('项目：　　　　　负责人：　　　　　更新日期：'),
    h(2, '里程碑一览'),
    ordered(
      'M1：　　交付物：　　计划日期：　　实际：　　状态：未开始/进行中/完成/延期',
      'M2：　　交付物：　　计划日期：　　实际：　　状态：未开始/进行中/完成/延期',
      'M3：　　交付物：　　计划日期：　　实际：　　状态：未开始/进行中/完成/延期',
    ),
    h(2, '关键路径'),
    bullet('依赖：', '卡点：'),
    h(2, '调整说明'),
    p(''),
  ]
}

function changeRequest(): RteJsonNode[] {
  return [
    h(1, '变更说明'),
    p('项目：　　　　　提出人：　　　　　日期：'),
    h(2, '变更内容'),
    p(''),
    h(2, '变更原因'),
    bullet('业务原因：', '技术原因：', '其他：'),
    h(2, '影响评估'),
    bullet('范围：', '进度：', '成本：', '质量 / 风险：'),
    h(2, '方案选项'),
    ordered('方案 A：', '方案 B：'),
    h(2, '决策'),
    p('结论：批准 / 驳回 / 暂缓　　决策人：　　日期：'),
    h(2, '后续动作'),
    ordered('动作：　　负责人：　　截止：'),
  ]
}

function salesLead(): RteJsonNode[] {
  return [
    h(1, '销售线索'),
    p('线索来源：　　　　　跟进人：　　　　　录入日期：'),
    h(2, '客户信息'),
    bullet('公司：', '联系人 / 职位：', '电话 / 微信 / 邮箱：', '行业 / 规模：'),
    h(2, '需求摘要'),
    p(''),
    h(2, '预算与决策'),
    bullet('预算区间：', '决策人：', '采购周期：'),
    h(2, '跟进记录'),
    ordered('日期：　　方式：　　纪要：', '日期：　　方式：　　纪要：'),
    h(2, '下一步'),
    p('意向：高 / 中 / 低　　下次动作：　　截止：'),
  ]
}

function proposalOutline(): RteJsonNode[] {
  return [
    h(1, '方案提纲'),
    p('客户：　　　　　方案负责人：　　　　　日期：'),
    h(2, '客户痛点'),
    bullet('痛点一', '痛点二'),
    h(2, '方案价值'),
    ordered('价值主张一', '价值主张二', '价值主张三'),
    h(2, '方案结构'),
    ordered('现状与目标', '解决方案概述', '实施路径与里程碑', '投入与收益', '案例 / 成功标准'),
    h(2, '差异化'),
    bullet('相对竞品：'),
    h(2, '待确认问题'),
    bullet(''),
  ]
}

function quoteNotes(): RteJsonNode[] {
  return [
    h(1, '报价要点'),
    p('客户：　　　　　报价人：　　　　　有效期：'),
    h(2, '报价范围'),
    bullet('包含：', '不包含：'),
    h(2, '价格明细'),
    ordered('项目：　　数量：　　单价：　　小计：', '项目：　　数量：　　单价：　　小计：'),
    h(2, '商务条款'),
    bullet('付款方式：', '交付周期：', '质保 / 服务：'),
    h(2, '折扣与审批'),
    p('折扣：　　审批人：　　状态：'),
    h(2, '备注'),
    p(''),
  ]
}

function onboardingChecklist(): RteJsonNode[] {
  return [
    h(1, '入职清单'),
    p('新人：　　　　　部门：　　　　　入职日：　　　　导师：'),
    h(2, '入职第 1 天'),
    tasks('账号与权限开通', '设备与工位', '制度与安全培训', '团队介绍'),
    h(2, '入职第 1 周'),
    tasks('业务背景阅读', '熟悉工具与流程', '认领首个小任务', '1:1 沟通（导师）'),
    h(2, '入职第 1 月'),
    tasks('独立完成一项交付', '阶段反馈面谈', '目标对齐（试用期）'),
    h(2, '备注'),
    p(''),
  ]
}

function perfReview(): RteJsonNode[] {
  return [
    h(1, '绩效面谈'),
    p('员工：　　　　　上级：　　　　　周期：　　　　　日期：'),
    h(2, '目标回顾'),
    ordered('目标：　　结果：　　自评：　　上级评：'),
    h(2, '亮点'),
    bullet(''),
    h(2, '待提升'),
    bullet(''),
    h(2, '下周期目标'),
    ordered('目标：　　衡量标准：　　支持所需：'),
    h(2, '发展意愿'),
    p(''),
    h(2, '双方确认'),
    p('员工签字：　　　　　上级签字：'),
  ]
}

function trainingNotes(): RteJsonNode[] {
  return [
    h(1, '培训纪要'),
    p('主题：　　　　　讲师：　　　　　日期：　　　　　参与人：'),
    h(2, '培训目标'),
    p(''),
    h(2, '要点笔记'),
    ordered('要点一', '要点二', '要点三'),
    h(2, '练习 / 案例'),
    bullet(''),
    h(2, '行动项'),
    ordered('行动：　　负责人：　　截止：'),
    h(2, '反馈'),
    p('收获：　　　　建议：'),
  ]
}

function readingNotes(): RteJsonNode[] {
  return [
    h(1, '读书笔记'),
    p('书名 / 文章：　　　　　作者：　　　　　日期：'),
    h(2, '一句话摘要'),
    p(''),
    h(2, '关键观点'),
    ordered('观点一', '观点二', '观点三'),
    h(2, '金句摘录'),
    bullet(''),
    h(2, '我的思考'),
    p(''),
    h(2, '可实践动作'),
    ordered('动作一', '动作二'),
  ]
}

function meetingScratch(): RteJsonNode[] {
  return [
    h(1, '会议速记'),
    p('主题：　　　　　时间：　　　　　参与：'),
    h(2, '速记'),
    p(''),
    p(''),
    p(''),
    h(2, '待办'),
    tasks('待办一', '待办二'),
    h(2, '待确认'),
    bullet(''),
  ]
}

function ideaMemo(): RteJsonNode[] {
  return [
    h(1, '灵感备忘'),
    p('标题：　　　　　日期：　　　　　标签：'),
    h(2, '灵感'),
    p(''),
    h(2, '为什么有价值'),
    bullet(''),
    h(2, '怎么验证'),
    ordered('最小验证：', '成功标准：'),
    h(2, '相关链接 / 材料'),
    bullet(''),
    h(2, '下一步'),
    p(''),
  ]
}

function studyPlan(): RteJsonNode[] {
  return [
    h(1, '学习计划'),
    p('主题：　　　　　周期：　　　　　目标水平：'),
    h(2, '学习目标'),
    bullet('目标一（可检验）', '目标二'),
    h(2, '资源'),
    bullet('书籍 / 课程：', '练习项目：', '人脉 / 社群：'),
    h(2, '周计划'),
    ordered('第 1 周：', '第 2 周：', '第 3 周：', '第 4 周：'),
    h(2, '检查点'),
    bullet('如何验收：', '复盘日：'),
    h(2, '备注'),
    p(''),
  ]
}


export const RTE_DOC_TEMPLATE_GROUPS: Array<{
  id: RteDocTemplateGroup
  label: string
}> = [
  { id: 'office', label: '办公文档' },
  { id: 'product', label: '产品研发' },
  { id: 'project', label: '项目管理' },
  { id: 'sales', label: '销售客户' },
  { id: 'hr', label: '人事行政' },
  { id: 'notes', label: '个人笔记' },
  ...RTE_FORM_TEMPLATE_GROUPS,
]

function wrapBuild(fn: () => RteJsonNode[]): () => RteJsonNode[] {
  return () => sanitizeRteJsonNodes(fn())
}

export const RTE_DOC_TEMPLATES: RteDocTemplate[] = [
  // —— 办公文档 ——
  { id: 'meeting-minutes', label: '会议纪要', description: '议题、决议与行动项', group: 'office', build: wrapBuild(meetingMinutes) },
  { id: 'meeting-agenda', label: '会议议程', description: '时间、议题与材料', group: 'office', build: wrapBuild(meetingAgenda) },
  { id: 'daily-report', label: '工作日报', description: '今日完成与明日计划', group: 'office', build: wrapBuild(dailyReport) },
  { id: 'weekly-report', label: '工作周报', description: '完成 / 进行中 / 下周计划', group: 'office', build: wrapBuild(weeklyReport) },
  { id: 'monthly-report', label: '工作月报', description: '成果、反思与下月计划', group: 'office', build: wrapBuild(monthlyReport) },
  { id: 'work-plan', label: '工作计划', description: '目标、任务与里程碑', group: 'office', build: wrapBuild(workPlan) },
  { id: 'todo-checklist', label: '任务清单', description: '待办 / 进行中 / 已完成', group: 'office', build: wrapBuild(todoChecklist) },
  { id: 'announcement', label: '通知公告', description: '事项、要求与联系人', group: 'office', build: wrapBuild(announcement) },
  { id: 'trip-report', label: '出差报告', description: '行程、结论与费用', group: 'office', build: wrapBuild(tripReport) },
  { id: 'retro-checklist', label: '复盘清单', description: '亮点、问题与下次行动', group: 'office', build: wrapBuild(retroChecklist) },
  { id: 'okr-align', label: 'OKR 对齐', description: '目标、KR 与依赖', group: 'office', build: wrapBuild(okrAlign) },

  // —— 产品研发 ——
  { id: 'requirements-spec', label: '需求说明', description: '背景、功能与验收要点', group: 'product', build: wrapBuild(requirementsSpec) },
  { id: 'user-story', label: '用户故事', description: '角色、诉求与验收标准', group: 'product', build: wrapBuild(userStory) },
  { id: 'tech-design', label: '技术设计', description: '方案、模型与排期', group: 'product', build: wrapBuild(techDesign) },
  { id: 'api-spec', label: '接口说明', description: '路径、参数与错误码', group: 'product', build: wrapBuild(apiSpec) },
  { id: 'bug-postmortem', label: '缺陷复盘', description: '现象、根因与改进', group: 'product', build: wrapBuild(bugPostmortem) },
  { id: 'experiment-log', label: '实验记录', description: '假设、指标与结论', group: 'product', build: wrapBuild(experimentLog) },
  { id: 'competitor-analysis', label: '竞品分析', description: '对比、优劣与建议', group: 'product', build: wrapBuild(competitorAnalysis) },

  // —— 项目管理 ——
  { id: 'project-kickoff', label: '项目立项', description: '目标、范围与里程碑', group: 'project', build: wrapBuild(projectKickoff) },
  { id: 'project-weekly', label: '项目周报', description: '进展、风险与下周计划', group: 'project', build: wrapBuild(projectWeekly) },
  { id: 'risk-register', label: '风险清单', description: '可能性、影响与应对', group: 'project', build: wrapBuild(riskRegister) },
  { id: 'milestone-track', label: '里程碑跟踪', description: '交付物与状态', group: 'project', build: wrapBuild(milestoneTrack) },
  { id: 'change-request', label: '变更说明', description: '影响评估与决策', group: 'project', build: wrapBuild(changeRequest) },

  // —— 销售客户 ——
  { id: 'customer-followup', label: '客户跟进', description: '沟通纪要与下一步', group: 'sales', build: wrapBuild(customerFollowup) },
  { id: 'sales-lead', label: '销售线索', description: '客户信息与跟进记录', group: 'sales', build: wrapBuild(salesLead) },
  { id: 'proposal-outline', label: '方案提纲', description: '痛点、价值与结构', group: 'sales', build: wrapBuild(proposalOutline) },
  { id: 'quote-notes', label: '报价要点', description: '范围、明细与条款', group: 'sales', build: wrapBuild(quoteNotes) },

  // —— 人事行政 ——
  { id: 'interview-notes', label: '面试记录', description: '考察要点与结论', group: 'hr', build: wrapBuild(interviewNotes) },
  { id: 'onboarding-checklist', label: '入职清单', description: '首日 / 首周 / 首月', group: 'hr', build: wrapBuild(onboardingChecklist) },
  { id: 'perf-review', label: '绩效面谈', description: '回顾、目标与发展', group: 'hr', build: wrapBuild(perfReview) },
  { id: 'training-notes', label: '培训纪要', description: '要点、行动与反馈', group: 'hr', build: wrapBuild(trainingNotes) },

  // —— 个人笔记 ——
  { id: 'reading-notes', label: '读书笔记', description: '观点、金句与行动', group: 'notes', build: wrapBuild(readingNotes) },
  { id: 'meeting-scratch', label: '会议速记', description: '速记、待办与待确认', group: 'notes', build: wrapBuild(meetingScratch) },
  { id: 'idea-memo', label: '灵感备忘', description: '灵感、验证与下一步', group: 'notes', build: wrapBuild(ideaMemo) },
  { id: 'study-plan', label: '学习计划', description: '目标、资源与周计划', group: 'notes', build: wrapBuild(studyPlan) },

  // —— 常用表单（分类见 RTE_FORM_TEMPLATE_GROUPS）——
  ...RTE_FORM_DOC_TEMPLATES,
]

export function getRteDocTemplate(id: string): RteDocTemplate | undefined {
  return RTE_DOC_TEMPLATES.find((t) => t.id === id)
}

export function listRteDocTemplates(group?: RteDocTemplateGroup): RteDocTemplate[] {
  return group
    ? RTE_DOC_TEMPLATES.filter((t) => t.group === group)
    : [...RTE_DOC_TEMPLATES]
}
