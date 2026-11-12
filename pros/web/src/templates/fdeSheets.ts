import type { CanvasTheme, FdeBlock, FdeRoiScenario, FdeSheetDocumentJSON } from '../types/canvas'

const theme: CanvasTheme = {
  background: { pattern: 'none', color: '#f7f7f7' },
  page: '#f7f7f7',
  frame: '#ececec',
  hairline: 'rgba(60, 50, 20, 0.08)',
}

function html(text = ''): string {
  const lines = text.split('\n').map((line) => line.trim()).filter(Boolean)
  if (!lines.length) return '<p></p>'
  return lines
    .map((line) => `<p>${line.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</p>`)
    .join('')
}

function rich(id: string, title: string, hint: string, text = ''): FdeBlock {
  return { id, kind: 'rich', title, hint, html: html(text) }
}

function checks(id: string, title: string, hint: string, labels: string[]): FdeBlock {
  return {
    id,
    kind: 'checks',
    title,
    hint,
    items: labels.map((label, index) => ({ id: `${id}_${index + 1}`, label, checked: false, note: '' })),
  }
}

function scores(
  id: string,
  title: string,
  hint: string,
  items: { label: string; hint?: string }[],
  max = 2,
): FdeBlock {
  return {
    id,
    kind: 'score',
    title,
    hint,
    items: items.map((item, index) => ({
      id: `${id}_${index + 1}`,
      label: item.label,
      hint: item.hint,
      score: 0,
      max,
      note: '',
    })),
  }
}

function table(
  id: string,
  title: string,
  hint: string,
  columns: { id: string; label: string }[],
  rows: string[][],
): FdeBlock {
  return {
    id,
    kind: 'table',
    title,
    hint,
    columns,
    rows: rows.map((cells, index) => ({
      id: `${id}_${index + 1}`,
      cells: Object.fromEntries(columns.map((col, i) => [col.id, cells[i] ?? ''])),
    })),
  }
}

function cards(
  id: string,
  title: string,
  hint: string,
  items: { title: string; summary: string; fit: string; risk: string }[],
): FdeBlock {
  return {
    id,
    kind: 'cards',
    title,
    hint,
    cards: items.map((item, index) => ({
      id: `${id}_${index + 1}`,
      title: item.title,
      summary: item.summary,
      fit: item.fit,
      risk: item.risk,
      note: '',
      chosen: false,
    })),
  }
}

function roi(scenarios: FdeRoiScenario[]): FdeBlock {
  return {
    id: 'roi',
    kind: 'roi',
    title: '三组情景',
    hint: '每月毛价值 = 每月任务量 × 单次节省分钟 ÷ 60 × 时薪 × 有效采用率。每月净价值再减去平台与运维成本。首年净价值还要扣掉一次性建设成本。这是讨论用的情景，不是收益承诺。',
    scenarios,
  }
}

function sheet(
  id: string,
  kicker: string,
  title: string,
  lede: string,
  blocks: FdeBlock[],
  compute?: 'self' | 'roi',
): FdeSheetDocumentJSON {
  return {
    id: `canvas_${id.replace(/-/g, '_')}`,
    type: 'fde_sheet',
    schemaVersion: 1,
    theme,
    kicker,
    title,
    lede,
    compute,
    blocks,
  }
}

export const FDE_SHEET_IDS = [
  'fde-scenario',
  'fde-select',
  'fde-pilot',
  'fde-eval',
  'fde-launch',
  'fde-roi',
  'fde-pricing',
  'fde-org',
  'fde-self',
  'fde-interview',
  'fde-portfolio',
  'fde-requirements',
  'fde-acceptance',
  'fde-tooling',
  'fde-contract',
  'fde-kickoff',
] as const

export type FdeSheetId = (typeof FDE_SHEET_IDS)[number]

export const FDE_SHEET_TEMPLATES: Record<FdeSheetId, FdeSheetDocumentJSON> = {
  'fde-scenario': sheet(
    'fde-scenario',
    'FDE · 场景画布',
    '企业 AI 场景分析画布',
    '选一个候选场景，八栏都填完。填不出来的栏，就是还要去搞清楚的事。三个结论都打勾，才进入画流程。',
    [
      rich('name', '1. 场景名称', '一句话说清：谁在什么环节遇到什么问题。', '销售团队在报价环节手工查价填单，慢且易错。'),
      rich('now', '2. 问题现状', '这个问题多久发生一次？\n每次花多长时间？\n现在是怎么解决的？\n最容易出错的是哪一步？出错的后果是什么？'),
      rich('value', '3. 价值判断', '解决后谁受益？\n能量化吗：节省多少时间、降低多少错误、提升多少处理量？\n高频吗？耗时吗？有人愿意用吗？'),
      rich('data', '4. 数据与系统', '需要哪些数据？在哪里？\n数据质量怎么样？\n需要接入哪些现有系统？\n数据敏感级别：公开、内部，还是敏感？'),
      rich('split', '5. AI 与人工分工', '哪些步骤交给 AI 或自动化？\n哪些步骤必须人工确认？\nAI 出错时的兜底流程是什么？谁负责？'),
      rich('risk', '6. 风险与边界', '涉及钱、合同、对外承诺吗？\n最坏情况下，AI 出错会造成什么后果？\n有没有不适合用 AI 的部分？'),
      rich('success', '7. 成功指标', '做到什么算成功？要可量化。\n什么情况算失败，要停下来？'),
      rich('next', '8. 第一步行动', '接下来 48 小时内能做的一件小事是什么？\n访谈、要数据，或画流程图。'),
      checks('gate', '评估结论', '三个都打勾，才进入画流程。', [
        '这个场景值得做：高频、耗时、规则相对明确',
        '这个场景现在能做：数据拿得到、风险可控',
        '我知道第一步该做什么',
      ]),
    ],
  ),
  'fde-select': sheet(
    'fde-select',
    'FDE · 选场景',
    '选场景打分',
    '不是所有问题都值得用 AI 做。先列候选，再按频率、耗时、规则、出错代价、数据和意愿打高、中、低。第一个项目选小而确定的，不选最大的。',
    [
      table(
        'candidates',
        '候选场景',
        '每格填高、中或低。报价单这类每周大量、规则明确的优先；一年两次的战略规划先放下；涉及赔付的可以做，但必须人工兜底。',
        [
          { id: 'name', label: '场景' },
          { id: 'frequency', label: '频率' },
          { id: 'time', label: '耗时' },
          { id: 'rules', label: '规则明确度' },
          { id: 'cost', label: '出错代价' },
          { id: 'data', label: '数据可得性' },
          { id: 'will', label: '用户意愿' },
        ],
        [
          ['报价单制作', '高', '高', '高', '低', '高', '高'],
          ['年度战略规划', '低', '高', '低', '中', '低', '中'],
          ['客户投诉处理', '高', '高', '中', '高', '中', '中'],
        ],
      ),
      checks('gate', '选定前的检查', '五个都过，才把这一场景交给试点简报。', [
        '候选问题都有频率和耗时数据',
        '选中的场景规则相对明确、出错代价可控',
        '所需数据确认可以拿到',
        '有明确的使用者，且愿意配合试用',
        '和现有在途项目不冲突',
      ]),
    ],
  ),
  'fde-pilot': sheet(
    'fde-pilot',
    'FDE · 试点简报',
    '试点项目简报',
    '立项或阶段汇报时写成一页纸。给管理层看的东西，写清楚比写全面重要。目标值是待验证的假设，不是承诺。',
    [
      rich('problem', '1. 业务问题', '谁遇到了什么问题，频率和每次耗时，现在的做法和不足。三行以内。'),
      rich('plan', '2. 方案概述', '做什么，AI、程序、人工怎么分工，人工兜底机制。三行以内。'),
      table(
        'metrics',
        '3. 成功指标',
        '基准值是现在，目标值是试点结束时的假设。',
        [
          { id: 'metric', label: '指标' },
          { id: 'base', label: '基准值' },
          { id: 'goal', label: '目标值' },
        ],
        [
          ['单次处理时间', '20 分钟', '5 分钟'],
          ['错误率', '', ''],
          ['采用率', '', ''],
        ],
      ),
      rich('scope', '4. 试点范围', '多少人、谁，起止时间，所需数据与系统对接。'),
      table(
        'risks',
        '5. 风险与对策',
        '每条风险写一条对策。',
        [
          { id: 'risk', label: '风险' },
          { id: 'response', label: '对策' },
        ],
        [
          ['数据质量不足', '先抽样验证，不足则先清洗'],
          ['员工不愿用', '种子用户先行，负责人带头'],
          ['数据安全', '使用企业版服务，权限最小化'],
        ],
      ),
      rich('support', '6. 需要的支持', '哪个部门配合什么，需要的预算或工具，需要的决策。'),
      table(
        'milestones',
        '7. 里程碑',
        '试点结束时用同一张表填实际结果。',
        [
          { id: 'when', label: '时间' },
          { id: 'what', label: '交付' },
        ],
        [
          ['第 1–2 周', '访谈与流程图'],
          ['第 3–4 周', 'MVP 可试用'],
          ['第 5–6 周', '真实样本评测'],
          ['第 7–8 周', '试点数据与是否扩大的建议'],
        ],
      ),
    ],
  ),
  'fde-eval': sheet(
    'fde-eval',
    'FDE · 评测表',
    '真实样本评测表',
    '样本必须真实，标准答案由业务专家确认，错误必须分类。建议 30 到 100 个样本，常见和边界都要有。',
    [
      table(
        'samples',
        '1. 样本记录',
        '每个测试样本一行。',
        [
          { id: 'no', label: '编号' },
          { id: 'desc', label: '样本描述' },
          { id: 'source', label: '来源' },
          { id: 'kind', label: '常见/边界' },
          { id: 'gold', label: '标准答案' },
        ],
        [
          ['001', '某客户询价 A 产品 100 件', '历史邮件', '常见', '报价 12000 元，交期 2 周'],
          ['002', '含特殊折扣条款的合同', '历史合同库', '边界', '需人工审核折扣条款'],
        ],
      ),
      table(
        'results',
        '2. 结果记录',
        '结果用：正确、部分正确、错误、无法处理。',
        [
          { id: 'no', label: '编号' },
          { id: 'output', label: 'AI 输出' },
          { id: 'result', label: '结果' },
          { id: 'fix', label: '人工修正耗时' },
          { id: 'note', label: '备注' },
        ],
        [
          ['001', '报价 12000 元', '正确', '0', ''],
          ['002', '直接给出折扣价', '错误', '10 分钟', '未识别特殊条款'],
        ],
      ),
      table(
        'errors',
        '3. 错误分类',
        '只归类错误和部分正确的样本。',
        [
          { id: 'type', label: '错误类型' },
          { id: 'count', label: '数量' },
          { id: 'example', label: '例子' },
          { id: 'fix', label: '改进方向' },
        ],
        [
          ['数据缺失', '', '查不到客户历史价', '补数据源'],
          ['规则未覆盖', '', '特殊折扣条款', '补充规则或转人工'],
          ['AI 理解错误', '', '误解产品型号', '改提示词或加示例'],
          ['边界情况', '', '金额超出范围', '设定自动转人工'],
        ],
      ),
      table(
        'summary',
        '4. 指标汇总',
        '成功标准在开工前约定。',
        [
          { id: 'metric', label: '指标' },
          { id: 'result', label: '结果' },
          { id: 'bar', label: '成功标准' },
          { id: 'ok', label: '是否达标' },
        ],
        [
          ['完成率（正确+部分正确）', '', '', ''],
          ['错误率', '', '', ''],
          ['单次节省时间', '', '', ''],
          ['单次成本', '', '', ''],
        ],
      ),
      rich('conclusion', '5. 评测结论', '三句话：哪些场景表现好；哪些不可靠、怎么兜底；建议进入试点、改进后复测，还是停止。'),
    ],
  ),
  'fde-launch': sheet(
    'fde-launch',
    'FDE · 上线清单',
    '小范围上线清单',
    '上线不是把代码部署到服务器，而是让工具进入真实业务流程。核心是权限、安全和一小群人先用。',
    [
      checks('gate', '上线前核对', '有一项没过，就先不要扩大范围。', [
        '敏感数据已脱敏或隔离',
        '外部 AI 服务的数据条款已评估',
        '权限按最小必要配置',
        '操作有日志可查',
        'AI 出错时的人工兜底已就位',
        '试用范围小，人群明确',
        '有反馈渠道，并且每周看一次用量、报错和反馈',
      ]),
      rich('who', '试用人群与周期', '选一个部门或小组，试用 2 到 4 周。写清谁能用、谁能看数据、谁能改配置。'),
      rich('runbook', '使用说明', '一页纸讲清什么时候用、怎么用、出问题找谁。'),
      rich('systems', '接入的系统', '需要对接现有系统时，记下接口、账号和审计要求。'),
    ],
  ),
  'fde-roi': sheet(
    'fde-roi',
    'FDE · 收益估算',
    '项目收益估算',
    '先算清假设，再讨论 ROI。不要把员工省下的全部时间直接当成可兑现现金。结果不含税费、风险损失和机会成本，也不构成收益承诺。',
    [
      roi([
        { id: 'low', name: '保守', tasks: 800, beforeMin: 12, afterMin: 8, wage: 120, adoption: 0.4, monthlyCost: 5000, upfront: 40000 },
        { id: 'base', name: '基准', tasks: 1200, beforeMin: 12, afterMin: 5, wage: 120, adoption: 0.65, monthlyCost: 3000, upfront: 30000 },
        { id: 'high', name: '乐观', tasks: 1500, beforeMin: 12, afterMin: 4, wage: 120, adoption: 0.8, monthlyCost: 3000, upfront: 30000 },
      ]),
      rich('costs', '容易漏掉的成本', '数据清理、系统集成、领域专家评测、权限与安全、变更管理、支持、模型回归、供应商退出、失败试点。'),
      rich('gains', '不必强行折现的收益', '响应时效、错误避免、业务容量、员工体验、客户留存，以及以前做不成的新任务。单独列出，不必合成一个数字。'),
      checks('replace', '用试点数据替换假设', '采用定义为完成有效任务，不是登录或打开页面。', [
        '任务量的统计分母和季节性已经写明',
        '同时记录了改造前后的耗时分布，不只记平均值',
        '抽样检查过节省时间是否以质量下降为代价',
        '计入了人工复核和返工时间',
        '区分了账面节省、可重新分配产能和实际现金',
      ]),
    ],
    'roi',
  ),
  'fde-pricing': sheet(
    'fde-pricing',
    'FDE · 收费方式',
    '四种商业模式',
    'FDE 是交付责任，不是一种固定价目。选错模式，会把交付团队拖进项目越做越累、毛利越来越薄。这张画布用来给公司选收费方式，不替单个场景打分。',
    [
      cards('modes', '四种模式', '勾选当前采用或准备采用的模式，并写下为什么适合现在的客户。', [
        { title: '项目制', summary: '按单个交付物一次性结算。现金流一次确认，门槛低。', fit: '政企试点、年度信息化预算里的专项。周期常见 3 到 6 个月。', risk: '项目结束就没有续费，也没有数据复利。人天单价容易被压很低。' },
        { title: '订阅制', summary: '按年或按季收取平台与服务费，把一次性收入变成经常性收入。', fit: '中大型企业、已经有平台用量的客户。', risk: '第一年用量远低于承诺时，续约会被动。' },
        { title: '嵌入产品', summary: '客户买软件许可，再额外购买驻场。同一套平台复用到下一个客户时，现场投入下降。', fit: '制造、能源、金融等有标准产品载体的头部客户。', risk: '没有可复用的产品，驻场就会变成定制债务。' },
        { title: '能力转移 + 平台', summary: '初期前线主导，之后客户自己的工程师接管，前线退到许可和季度复盘。', fit: '集团级、愿意把方法论和平台留下的客户。周期往往要一年以上。', risk: '周期长，人才稀缺。没有转移条款，能力会跟着人走。' },
      ]),
      rich('mix', '更稳妥的混合收费', '诊断费做流程、数据和成功定义；建置费按里程碑或部署小组月费；上线后收平台与用量费；总费用里留一小部分，在 30、60、90 天按事先约定的结果支付。固定费用支付已经发生的工程，成果部分用来对齐双方利益。'),
    ],
  ),
  'fde-org': sheet(
    'fde-org',
    'FDE · 组织方式',
    '五种组织模式',
    'FDE 不是一个孤立岗位，而是一种组织设计。客户要深度定制，软件公司要规模化毛利。现场经验若不能沉淀成产品，就会滑成低毛利咨询。',
    [
      cards('modes', '五种形态', '勾选最接近的组织，并写下现场经验怎样回到产品和模型。', [
        { title: '平台 + 前线工程 + 业务策略', summary: '强平台作底座。工程角色做现场定制，策略角色管业务、关系和扩展。', fit: '已有可组装平台，客户价值要很快做出来。', risk: '人才密度要求高，服务成本高，容易堆积只服务一家的代码。' },
        { title: '研究 + 产品 + 前线', summary: '研究提供模型，产品提供接口，前线把能力放进客户场景，再把缺口喂回模型和产品。', fit: '模型能力变得很快、必须用客户真问题暴露缺口的实验室。', risk: '前线和产品各说各话，反馈没有正式入口。' },
        { title: '云平台 + 客户工程', summary: '在云上把模型、数据仓库、既有系统和权限串进生产环境。', fit: '客户已经在这朵云上，落地主要是集成和治理。', risk: '只做集成、不沉淀工作流，第二个客户还是从零开始。' },
        { title: '独立部署公司', summary: '模型公司用独立或半独立的部署组织，把落地能力规模化。', fit: '模型变化太快，传统集成商和客户 IT 跟不上。', risk: '部署公司如果没有平台所有权，会变成外包部门。' },
        { title: '早期工程师就是前线', summary: '没有专职岗位。创始人和早期工程师陪着发现需求、写定制、接数据、做验证、上线、再复制。', fit: '还没有专职前线编制的早期公司。', risk: '如果每个客户都从零写代码，这不是前线部署，是外包作坊。' },
      ]),
      checks('guard', '防止变成外包的机制', '销售不能无限承诺定制。每个项目结束要判断哪些必须产品化。', [
        '每个项目结束有产品化评审',
        '每季度沉淀连接器、模板、评测集或操作手册',
        '前线可以向产品提交正式改进',
        '定制代码有下线或替换计划',
        '销售承诺的范围有人把关',
        '除了收入，还看复用率和部署效率',
        '前线和核心产品工程师会轮换',
      ]),
    ],
  ),
  'fde-self': sheet(
    'fde-self',
    'FDE · 能力自测',
    'FDE 能力自测',
    '每项 0 到 2 分：0 没做过，1 做过但需要帮助，2 能独立完成且有真实案例。这是给自己看的，不是认证。最弱的一项决定上限。',
    [
      scores('discover', '1. 业务发现', '听真痛点，不听表面需求。', [
        { label: '我能通过访谈找到业务部门的真实痛点' },
        { label: '我能说清频率、单次耗时和出错代价' },
        { label: '我能区分用户想要的方案和真正要解决的问题' },
      ]),
      scores('flow', '2. 流程分析', '画得出步骤、人和耗时。', [
        { label: '我能把业务流程画成步骤图' },
        { label: '我能标出哪些步骤适合 AI、哪些必须人工' },
        { label: '我能画出目标流程并让一线确认' },
      ]),
      scores('ai', '3. AI 理解', '知道模型会在哪里出错。', [
        { label: '我知道大语言模型擅长什么、会在哪里出错' },
        { label: '我知道哪些任务不适合用 AI' },
        { label: '我能按任务选工具，而不是只会用一个' },
      ]),
      scores('build', '4. 快速构建', '先做能验证假设的最小版本。', [
        { label: '我能在约定周期内做出验证关键假设的最小版本' },
        { label: '我会用自动化平台和表格型数据库拼工具' },
        { label: '我能用 AI 代码工具生成并修改简单应用' },
      ]),
      scores('data', '5. 数据与集成', '数据要能接上，权限要能配上。', [
        { label: '我能把业务数据整理成结构化形式' },
        { label: '我能连接至少一种企业现有系统或数据源' },
        { label: '我知道基本的数据权限配置方法' },
      ]),
      scores('adopt', '6. 部署与采用', '上线之后还要有人天天用。', [
        { label: '我能把工具发布到线上并配置基本权限' },
        { label: '我写过使用说明，并培训过真实用户' },
        { label: '我推动过工具从试用走向日常使用' },
      ]),
      scores('govern', '7. 评估与治理', '没有评测和安全，就不算做完。', [
        { label: '我能为项目定义可量化的成功指标' },
        { label: '我用真实样本做过批量评测并记录错误分类' },
        { label: '我评估过数据安全和合规风险' },
      ]),
    ],
    'self',
  ),
  'fde-interview': sheet(
    'fde-interview',
    'FDE · 访谈清单',
    '业务访谈问题清单',
    '不要照着念。挑 8 到 10 个，让对方讲具体的事。这个阶段只听，不讲方案。不要只访谈管理者。',
    [
      checks('open', '开场', '从耗时间的事问起。', [
        '你日常工作中，最耗时间的一件事是什么？',
        '上周有没有哪件事让你觉得怎么又要做一遍？',
        '如果每天能省出一小时，你希望省在哪个环节？',
      ]),
      checks('flow', '现状流程', '让对方带你过一遍。', [
        '这项工作从头到尾有哪几步？',
        '每一步用什么工具？',
        '哪一步最花时间？哪一步最无聊？',
        '有没有规定做法和实际做法不一样的环节？',
      ]),
      checks('pain', '痛点', '要最近一次的例子。', [
        '哪个环节最容易出错？最近一次后来怎么处理的？',
        '有没有明明知道该做、但没时间做的事？',
        '新人最难学会的是什么？',
        '如果这个问题消失了，你的一天会有什么不同？',
      ]),
      checks('freq', '频率和代价', '要次数、时长和代价。', [
        '这个问题一周发生几次？每次大概花多久？',
        '出错一次的代价是什么？',
        '团队里还有谁也被这个问题困扰？',
      ]),
      checks('rules', '规则和数据', '规则写不出来，就先不要自动化。', [
        '判断规则是什么？能写出来吗？谁定的？',
        '相关数据存在哪里？',
        '这些数据我能看到吗？有没有保密要求？',
        '规则经常变吗？变了谁通知？',
      ]),
      checks('hope', '期望与边界', '问到不能交给机器决定的事。', [
        '你希望改善到什么程度？全自动，还是先打草稿？',
        '有没有绝对不能让机器替你做决定的事？',
        '如果有工具能帮你，你希望它长什么样？',
        '你愿意成为第一个试用的人吗？',
      ]),
      rich('after', '24 小时内整理', '写出问题清单、现状流程草稿、待确认事项，以及愿意试用和提供数据的人。'),
    ],
  ),
  'fde-portfolio': sheet(
    'fde-portfolio',
    'FDE · 作品集',
    'FDE 作品集',
    '一个「问题、方案、数据、反思」的完整案例，比「熟悉 AI 工具」有用。数据必须真实，口径要写清。',
    [
      rich('who', '个人定位', '一句话说明你的 FDE 类型和擅长场景。'),
      rich('problem', '1. 背景与问题', '谁在什么场景遇到什么问题，频率、耗时、代价，为什么值得解决。'),
      rich('process', '2. 过程', '怎么访谈，现状流程和目标流程差在哪，AI、程序、人工为什么这样分。'),
      rich('solution', '3. 方案与工具', '用了哪些工具，最小版本长什么样，人工兜底是什么。'),
      rich('effect', '4. 评测与效果', '多少真实样本，完成率和错误率，上线后的采用，节省的时间或降低的错误。标明是试点数据。'),
      rich('reflect', '5. 反思', '做对了什么，踩了什么坑，如果重做会改什么。'),
      checks('pack', '整本作品集还要有', '求职看闭环和反思，接项目看同行业方法，内部要资源看业务数字和下一步。', [
        '有 2 到 3 个按同一结构写完的案例',
        '七项能力都有证据，不只是自述',
        '附上访谈清单、评测表或流程图，证明方法能复用',
      ]),
    ],
  ),
  'fde-requirements': sheet(
    'fde-requirements',
    'FDE · 需求梳理',
    '需求梳理',
    '启动之前先把问题说清楚。用户想要的系统和真正要解决的问题，分开写。',
    [
      rich('problem', '1. 问题描述', '谁遇到了什么问题，现在怎么解决、耗时多久，最容易错在哪里，每周或每月发生多少次。'),
      rich('ideal', '2. 理想状态', '解决之后最理想的状态是什么，谁受益、怎么衡量，什么指标会变好、变好多少。'),
      rich('split', '3. 方案拆解', '哪些步骤可以用 AI 或自动化，哪些必须人工，需要哪些数据源和系统。'),
      rich('bar', '4. 成功标准', '最小版本包含什么，试用期多长、多少人参加，什么叫成功，什么叫失败。'),
    ],
  ),
  'fde-acceptance': sheet(
    'fde-acceptance',
    'FDE · 验收清单',
    '项目验收清单',
    '通过验收至少要同时满足这些项。缺一项，就还不能说项目做完了。',
    [
      checks('gate', '验收项', '逐项打勾，并在备注里写下证据放在哪里。', [
        '工具能跑通真实业务流程',
        '关键用户接受过培训，能独立使用',
        '数据安全和权限已配置',
        '有明确的使用文档',
        '能量化展示效果数据',
        '有后续迭代计划或维护方案',
        '有明确的数据归属和保密约定',
      ]),
    ],
  ),
  'fde-tooling': sheet(
    'fde-tooling',
    'FDE · 工具选型',
    '工具选型对比',
    '先形成候选清单。价格、能力和数据政策变化很快，正式选型时要打开官方文档和合同，不要把这张表当成长期事实。',
    [
      table(
        'tools',
        '候选工具',
        '优点、缺点和适合场景先写下来，再逐个核验。',
        [
          { id: 'name', label: '工具' },
          { id: 'good', label: '优点' },
          { id: 'bad', label: '缺点' },
          { id: 'fit', label: '适合场景' },
          { id: 'check', label: '已核验' },
        ],
        [
          ['ChatGPT', '通用能力与多种交互', '数据处理取决于产品和设置', '探索、分析、内容与协作', ''],
          ['Claude', '适合长文档与复杂任务', '限额与数据条款需按产品核验', '文档分析、研究和编码', ''],
          ['Cursor', '面向代码库的开发体验', '需要工程基础与代码审查', '软件开发与原型', ''],
          ['v0', '快速生成和迭代界面', '生产质量仍需工程验证', '前端原型', ''],
          ['Airtable', '上手快、协作好', '复杂查询弱', '轻量数据管理', ''],
          ['Supabase', '开源、功能全', '需要配置', '需要数据库的后端', ''],
          ['n8n', '自动化灵活、可自托管', '学习曲线', '跨系统工作流', ''],
          ['Vercel', '部署体验完整', '成本、区域和运行限制需核对', 'Web 与全栈应用', ''],
        ],
      ),
      rich('decision', '这次实际选型', '写下选定的组合、数据是否出域，以及还没核验的条款。'),
    ],
  ),
  'fde-contract': sheet(
    'fde-contract',
    'FDE · 合同注意事项',
    '合同注意事项',
    '接企业项目时，这些条款要在开工前写明。合作愉快时没人想退出，出问题时来不及补。',
    [
      rich('data', '1. 数据归属', '企业提供的数据归谁，项目产生的数据归谁，是否允许用于模型训练。'),
      rich('ip', '2. 知识产权', '代码、文档、工具归谁。是否允许二次销售和复用。'),
      rich('secret', '3. 保密义务', '哪些信息保密，期限多长，违约责任是什么。'),
      rich('accept', '4. 验收标准', '交付什么功能，达到什么效果指标，试用期多长，什么叫验收通过。'),
      rich('pay', '5. 付款方式', '一次付还是分阶段，每阶段交付什么，尾款是否和验收挂钩。'),
      rich('care', '6. 售后和维护', '结束后支持多久，是否提供培训和文档，后续迭代怎么收费。'),
    ],
  ),
  'fde-kickoff': sheet(
    'fde-kickoff',
    'FDE · 启动检查',
    '项目启动检查清单',
    '正式开工前过一遍。有一项答不上来，就先补这一项，不要靠演示往下冲。',
    [
      checks('gate', '开工前', '八项都过，再进入构建。', [
        '解决的是真实业务问题，而不是一个想要的系统',
        '范围足以验证关键假设，工期和风险相称',
        '有内部负责人',
        '数据质量够用，不够的已经安排清洗',
        '有人工兜底',
        '有可量化的效果标准',
        '考虑了数据安全和权限',
        '如果失败，有备选方案',
      ]),
    ],
  ),
}

export const FDE_SHEET_META: Record<FdeSheetId, { name: string; badge: string; description: string; category: 'fde' }> = {
  'fde-scenario': { name: '企业 AI 场景分析画布', badge: 'FDE · 场景', description: '八栏填完一个场景。三个结论都打勾，才进入画流程。', category: 'fde' },
  'fde-select': { name: '选场景打分', badge: 'FDE · 选场景', description: '按频率、耗时、规则、出错代价、数据和意愿给候选场景打高、中、低。', category: 'fde' },
  'fde-pilot': { name: '试点项目简报', badge: 'FDE · 简报', description: '一页纸说清问题、方案、指标、范围、风险、支持和里程碑。', category: 'fde' },
  'fde-eval': { name: '真实样本评测表', badge: 'FDE · 评测', description: '用真实样本记录结果、错误分类和是否达标。', category: 'fde' },
  'fde-launch': { name: '小范围上线清单', badge: 'FDE · 上线', description: '权限、安全、日志和兜底都过了，才让一小群人先用。', category: 'fde' },
  'fde-roi': { name: '项目收益估算', badge: 'FDE · 收益', description: '保守、基准、乐观三组情景。用来讨论，不当成承诺。', category: 'fde' },
  'fde-pricing': { name: '四种商业模式', badge: 'FDE · 收费', description: '项目制、订阅、嵌入产品、能力转移加平台。用来给公司选收费方式。', category: 'fde' },
  'fde-org': { name: '五种组织模式', badge: 'FDE · 组织', description: '前线怎么进现场，经验怎么回到产品。防止做成外包。', category: 'fde' },
  'fde-self': { name: 'FDE 能力自测', badge: 'FDE · 自测', description: '七项能力各三题，0 到 2 分。最弱的一项决定上限。', category: 'fde' },
  'fde-interview': { name: '业务访谈问题清单', badge: 'FDE · 访谈', description: '开场、流程、痛点、频率、规则和边界。这个阶段只听。', category: 'fde' },
  'fde-portfolio': { name: 'FDE 作品集', badge: 'FDE · 作品集', description: '按问题、过程、方案、效果和反思写一个能被追问的案例。', category: 'fde' },
  'fde-requirements': { name: '需求梳理', badge: 'FDE · 需求', description: '问题、理想状态、方案拆解和成功标准，开工前写清楚。', category: 'fde' },
  'fde-acceptance': { name: '项目验收清单', badge: 'FDE · 验收', description: '流程跑通、培训、权限、文档、效果、维护和数据归属。', category: 'fde' },
  'fde-tooling': { name: '工具选型对比', badge: 'FDE · 选型', description: '先列候选工具的优劣和场景，再按官方文档和合同核验。', category: 'fde' },
  'fde-contract': { name: '合同注意事项', badge: 'FDE · 合同', description: '数据、知识产权、保密、验收、付款和售后，开工前写明。', category: 'fde' },
  'fde-kickoff': { name: '项目启动检查清单', badge: 'FDE · 启动', description: '真实问题、范围、负责人、数据、兜底、指标、安全和失败预案。', category: 'fde' },
}
