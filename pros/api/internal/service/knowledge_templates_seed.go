package service

import "metamatrix/api/internal/model"
import "strings"

// builtinTemplateDef 是内置模板的紧凑描述。
// Sections 用 "类型:标题[:参数]" 的紧凑写法描述骨架，
// 由 buildTemplateHTML 统一渲染成 HTML，保证 100+ 模板结构一致。
type builtinTemplateDef struct {
	Key      string
	Label    string
	Icon     string
	Category string
	Meta     []string
	Sections []string
}

// builtinTemplateDefs 内置模板种子表（100+ 套，覆盖 12 个分类）。
var builtinTemplateDefs = []builtinTemplateDef{
	{Key: "blank", Label: "空白文档", Icon: "📄", Category: "通用", Meta: nil, Sections: nil},
	{Key: "one-pager", Label: "一页纸方案", Icon: "📄", Category: "通用", Meta: nil, Sections: []string{"p:问题", "p:方案", "p:收益", "p:成本"}},
	{Key: "checklist", Label: "检查清单", Icon: "✅", Category: "通用", Meta: nil, Sections: []string{"ul:检查项", "p:结论"}},
	{Key: "glossary", Label: "术语表", Icon: "📖", Category: "通用", Meta: nil, Sections: []string{"kv:术语"}},
	{Key: "faq", Label: "常见问题 FAQ", Icon: "❓", Category: "通用", Meta: nil, Sections: []string{"p:常见问题", "p:回答"}},
	{Key: "read-note", Label: "读书笔记", Icon: "📚", Category: "通用", Meta: nil, Sections: []string{"p:书名与作者", "p:核心观点", "p:金句摘抄", "p:行动启发"}},
	{Key: "study-note", Label: "学习笔记", Icon: "🧠", Category: "通用", Meta: nil, Sections: []string{"p:学习主题", "ul:关键要点", "p:我的理解", "p:待复习"}},
	{Key: "project-charter", Label: "项目立项书", Icon: "🚀", Category: "通用", Meta: []string{"项目"}, Sections: []string{"p:背景与问题", "p:项目目标", "ul:范围说明", "ul:关键里程碑"}},
	{Key: "change-note", Label: "变更说明", Icon: "🔄", Category: "通用", Meta: []string{"版本"}, Sections: []string{"p:变更内容", "p:影响范围", "ul:回滚方案"}},
	{Key: "minutes-simple", Label: "简易会议记录", Icon: "🗒️", Category: "通用", Meta: []string{"日期", "参会人"}, Sections: []string{"ul:议题与结论", "ul:待办事项"}},
	{Key: "weekly", Label: "周报", Icon: "📅", Category: "协作", Meta: []string{"周期"}, Sections: []string{"ul:本周完成", "ul:下周计划", "p:风险与求助"}},
	{Key: "monthly", Label: "月报", Icon: "🗓️", Category: "协作", Meta: []string{"周期"}, Sections: []string{"ul:月度概览", "ul:关键进展", "ul:下月重点"}},
	{Key: "decision", Label: "决策记录", Icon: "⚖️", Category: "协作", Meta: nil, Sections: []string{"p:背景", "ul:候选方案", "p:结论", "ul:影响范围"}},
	{Key: "retro", Label: "项目复盘", Icon: "🔁", Category: "协作", Meta: nil, Sections: []string{"p:原定目标", "p:实际结果", "ul:做得好的", "ul:待改进", "ul:行动项"}},
	{Key: "handover", Label: "工作交接单", Icon: "🤝", Category: "协作", Meta: nil, Sections: []string{"p:交接事项", "ul:在办事项", "ul:账号与权限", "p:注意事项"}},
	{Key: "review", Label: "文档评审意见", Icon: "🔍", Category: "协作", Meta: []string{"评审人"}, Sections: []string{"p:评审结论", "ul:问题清单", "ul:修改建议"}},
	{Key: "interview", Label: "用户访谈纪要", Icon: "🎙️", Category: "协作", Meta: []string{"受访者"}, Sections: []string{"p:访谈目标", "ul:关键发现", "quote:原话摘录", "ul:后续行动"}},
	{Key: "brainstorm", Label: "头脑风暴", Icon: "💡", Category: "协作", Meta: nil, Sections: []string{"p:主题", "ul:想法清单", "p:筛选结论"}},
	{Key: "consensus", Label: "共识与投票", Icon: "🗳️", Category: "协作", Meta: []string{"参与人"}, Sections: []string{"ul:候选方案", "table:方案投票|方案|支持|反对|结论", "p:最终共识"}},
	{Key: "todo-track", Label: "待办追踪表", Icon: "✅", Category: "协作", Meta: []string{"负责人"}, Sections: []string{"table:事项清单|事项|负责人|截止时间|状态"}},
	{Key: "requirement", Label: "需求文档", Icon: "📋", Category: "产品", Meta: []string{"提出人"}, Sections: []string{"p:需求背景", "p:目标用户", "ul:功能需求", "ul:非功能需求"}},
	{Key: "prd", Label: "PRD 产品需求", Icon: "📘", Category: "产品", Meta: []string{"负责人"}, Sections: []string{"p:问题陈述", "p:用户与场景", "ul:需求清单", "ul:验收标准", "p:风险"}},
	{Key: "competitor", Label: "竞品分析", Icon: "🔍", Category: "产品", Meta: nil, Sections: []string{"table:竞品对比|维度|对标产品|我们的表现", "ul:优势", "ul:劣势", "p:结论"}},
	{Key: "persona", Label: "用户画像", Icon: "👤", Category: "产品", Meta: nil, Sections: []string{"p:姓名与角色", "ul:目标与痛点", "ul:常用场景", "p:关键特征"}},
	{Key: "feature-list", Label: "功能清单", Icon: "🧾", Category: "产品", Meta: nil, Sections: []string{"table:功能列表|功能|优先级|描述|状态", "p:说明"}},
	{Key: "proto-spec", Label: "原型说明", Icon: "🖼️", Category: "产品", Meta: nil, Sections: []string{"p:页面目标", "ul:主要流程", "ul:交互说明", "p:异常状态"}},
	{Key: "roadmap", Label: "产品路线图", Icon: "🛣️", Category: "产品", Meta: []string{"周期"}, Sections: []string{"table:阶段规划|阶段|目标|交付物|时间"}},
	{Key: "req-change", Label: "需求变更单", Icon: "🔁", Category: "产品", Meta: []string{"变更人"}, Sections: []string{"p:变更内容", "p:变更原因", "ul:影响评估", "p:决策结论"}},
	{Key: "acceptance", Label: "验收标准", Icon: "✔️", Category: "产品", Meta: nil, Sections: []string{"table:验收场景|场景|前置条件|操作|预期结果"}},
	{Key: "tracking", Label: "埋点方案", Icon: "📊", Category: "产品", Meta: nil, Sections: []string{"table:埋点清单|事件|触发时机|属性|用途"}},
	{Key: "sop", Label: "标准流程 SOP", Icon: "🧭", Category: "流程", Meta: nil, Sections: []string{"p:适用场景", "ol:执行步骤", "p:责任人", "p:异常处理"}},
	{Key: "onboarding", Label: "新人上手指南", Icon: "🧭", Category: "流程", Meta: nil, Sections: []string{"ul:第一天", "ul:第一周", "ul:常用工具", "p:找人指引"}},
	{Key: "incident", Label: "故障复盘报告", Icon: "🚨", Category: "流程", Meta: []string{"时间"}, Sections: []string{"p:影响面", "ol:时间线", "p:根因分析", "ul:改进项"}},
	{Key: "release", Label: "发布流程", Icon: "🚀", Category: "流程", Meta: []string{"版本"}, Sections: []string{"ol:发布步骤", "table:发布环节|环节|负责人|时间", "ul:回滚预案"}},
	{Key: "approval", Label: "审批流程", Icon: "🖋️", Category: "流程", Meta: nil, Sections: []string{"p:申请事项", "table:审批节点|节点|审批人|结论", "p:最终结果"}},
	{Key: "duty", Label: "值班安排表", Icon: "🕐", Category: "流程", Meta: []string{"周期"}, Sections: []string{"table:值班表|日期|值班人|备份|联系方式"}},
	{Key: "go-live-check", Label: "上线检查清单", Icon: "🧪", Category: "流程", Meta: nil, Sections: []string{"ul:功能检查", "ul:配置检查", "ul:监控检查", "p:上线结论"}},
	{Key: "emergency", Label: "应急预案", Icon: "🆘", Category: "流程", Meta: nil, Sections: []string{"p:触发条件", "ol:处置步骤", "ul:联系人", "p:恢复检查"}},
	{Key: "purchase", Label: "采购申请流程", Icon: "🛒", Category: "流程", Meta: nil, Sections: []string{"p:采购需求", "table:采购明细|物品|数量|预算", "ol:审批流程"}},
	{Key: "expense", Label: "报销流程", Icon: "💳", Category: "流程", Meta: nil, Sections: []string{"ul:报销材料", "table:费用明细|费用类型|金额|说明", "ol:审批流程"}},
	{Key: "okr", Label: "OKR 目标", Icon: "🎯", Category: "管理", Meta: []string{"周期"}, Sections: []string{"p:目标陈述", "ul:关键结果", "p:进展记录"}},
	{Key: "kpi", Label: "KPI 指标表", Icon: "📈", Category: "管理", Meta: []string{"周期"}, Sections: []string{"table:指标定义|指标|定义|目标值|当前值"}},
	{Key: "risk", Label: "风险登记册", Icon: "⚠️", Category: "管理", Meta: nil, Sections: []string{"table:风险清单|风险|影响|对策|责任人", "p:升级路径"}},
	{Key: "sprint-plan", Label: "迭代排期表", Icon: "🗓️", Category: "管理", Meta: []string{"迭代"}, Sections: []string{"table:任务列表|任务|负责人|优先级|状态", "p:里程碑"}},
	{Key: "gantt", Label: "甘特图排期", Icon: "📊", Category: "管理", Meta: []string{"周期"}, Sections: []string{"table:排期表|任务|开始|结束|进度", "p:关键路径"}},
	{Key: "project-weekly", Label: "项目周报", Icon: "📋", Category: "管理", Meta: []string{"周期", "项目"}, Sections: []string{"p:整体进度", "ul:本周进展", "ul:风险与阻塞"}},
	{Key: "milestone", Label: "里程碑清单", Icon: "🚩", Category: "管理", Meta: nil, Sections: []string{"table:里程碑表|里程碑|计划时间|实际时间|状态"}},
	{Key: "resource", Label: "资源计划表", Icon: "🧮", Category: "管理", Meta: nil, Sections: []string{"table:资源表|人力|角色|投入比例|周期"}},
	{Key: "resolution", Label: "会议决议", Icon: "📌", Category: "管理", Meta: nil, Sections: []string{"ul:决议事项", "ul:责任人", "ul:截止时间"}},
	{Key: "okr-breakdown", Label: "目标拆解表", Icon: "🧩", Category: "管理", Meta: nil, Sections: []string{"table:目标拆解|目标|子目标|负责人|周期"}},
	{Key: "marketing", Label: "营销方案", Icon: "📣", Category: "市场", Meta: []string{"周期"}, Sections: []string{"p:营销目标", "ul:目标人群", "p:核心卖点", "ul:渠道组合"}},
	{Key: "campaign", Label: "活动策划案", Icon: "🎪", Category: "市场", Meta: []string{"活动时间"}, Sections: []string{"p:活动主题", "ul:活动流程", "table:活动环节|环节|时间|负责人", "p:预算"}},
	{Key: "brand", Label: "品牌手册", Icon: "🏷️", Category: "市场", Meta: nil, Sections: []string{"p:品牌定位", "ul:视觉规范", "p:语言风格", "ul:禁用项"}},
	{Key: "press", Label: "新闻稿", Icon: "📰", Category: "市场", Meta: nil, Sections: []string{"p:标题", "p:导语", "p:正文", "p:联系方式"}},
	{Key: "social-plan", Label: "社媒排期表", Icon: "📱", Category: "市场", Meta: []string{"周期"}, Sections: []string{"table:发布排期|日期|平台|主题|文案|负责人"}},
	{Key: "competitor-news", Label: "竞品快讯", Icon: "🔭", Category: "市场", Meta: nil, Sections: []string{"table:动态记录|竞品|动态|时间|影响", "p:建议动作"}},
	{Key: "channel", Label: "渠道计划表", Icon: "🛒", Category: "市场", Meta: []string{"周期"}, Sections: []string{"table:渠道明细|渠道|预算|预期量|负责人"}},
	{Key: "email-marketing", Label: "邮件营销", Icon: "✉️", Category: "市场", Meta: nil, Sections: []string{"p:邮件主题", "p:正文内容", "ul:行动号召", "p:发送时间"}},
	{Key: "tech-design", Label: "技术方案", Icon: "🛠️", Category: "研发", Meta: []string{"作者"}, Sections: []string{"p:背景", "p:总体设计", "ul:关键模块", "ul:接口约定", "p:风险"}},
	{Key: "rfc", Label: "RFC 提案", Icon: "📜", Category: "研发", Meta: []string{"作者"}, Sections: []string{"p:动机", "p:详细设计", "p:兼容性", "ul:替代方案"}},
	{Key: "api-design", Label: "API 接口设计", Icon: "🔌", Category: "研发", Meta: nil, Sections: []string{"table:接口清单|接口|方法|入参|出参", "p:错误码"}},
	{Key: "data-model", Label: "数据模型设计", Icon: "🗃️", Category: "研发", Meta: nil, Sections: []string{"table:字段定义|实体|字段|类型|约束", "p:关系说明"}},
	{Key: "test-plan", Label: "测试计划", Icon: "🧪", Category: "研发", Meta: []string{"版本"}, Sections: []string{"p:测试范围", "ul:用例清单", "p:准入准出标准"}},
	{Key: "bug", Label: "缺陷报告", Icon: "🐛", Category: "研发", Meta: []string{"提交人"}, Sections: []string{"p:问题描述", "ol:复现步骤", "p:期望结果", "p:实际结果", "ul:附件"}},
	{Key: "release-note", Label: "发布说明", Icon: "📦", Category: "研发", Meta: []string{"版本"}, Sections: []string{"p:版本概要", "ul:新增功能", "ul:问题修复", "ul:破坏性变更"}},
	{Key: "arch-review", Label: "架构评审", Icon: "🏛️", Category: "研发", Meta: nil, Sections: []string{"p:背景", "p:候选架构", "ul:评审意见", "p:结论"}},
	{Key: "ops-weekly", Label: "运营周报", Icon: "📊", Category: "运营", Meta: []string{"周期"}, Sections: []string{"p:核心数据", "ul:本周动作", "ul:问题与风险"}},
	{Key: "manual", Label: "运营手册", Icon: "📔", Category: "运营", Meta: nil, Sections: []string{"p:适用范围", "ol:操作流程", "p:异常处理"}},
	{Key: "feedback", Label: "用户反馈汇总", Icon: "💬", Category: "运营", Meta: nil, Sections: []string{"table:反馈清单|用户|场景|反馈|处理状态", "p:结论"}},
	{Key: "faq-ops", Label: "客服话术", Icon: "🎧", Category: "运营", Meta: nil, Sections: []string{"table:话术清单|问题类型|标准话术|转人工条件"}},
	{Key: "event-review", Label: "活动复盘", Icon: "🎯", Category: "运营", Meta: nil, Sections: []string{"p:活动目标", "p:实际结果", "ul:有效动作", "ul改进"}},
	{Key: "metrics", Label: "指标看板说明", Icon: "📉", Category: "运营", Meta: nil, Sections: []string{"table:指标口径|指标|口径|来源|负责人", "p:更新频率"}},
	{Key: "backlog", Label: "需求池", Icon: "🗃️", Category: "运营", Meta: nil, Sections: []string{"table:需求清单|需求|来源|价值|成本|状态"}},
	{Key: "shift-handover", Label: "值班交接", Icon: "🌙", Category: "运营", Meta: nil, Sections: []string{"p:值班概况", "ul:未闭环事项", "p:客户影响"}},
	{Key: "budget", Label: "年度预算表", Icon: "💰", Category: "财务", Meta: []string{"周期"}, Sections: []string{"table:预算明细|科目|预算|实际|差异", "p:说明"}},
	{Key: "reimbursement", Label: "费用报销单", Icon: "🧾", Category: "财务", Meta: nil, Sections: []string{"table:报销明细|日期|项目|类别|金额", "p:说明"}},
	{Key: "cost-analysis", Label: "成本分析", Icon: "🔬", Category: "财务", Meta: []string{"周期"}, Sections: []string{"table:成本明细|成本项|金额|占比|同比", "p:结论"}},
	{Key: "quotation", Label: "报价单", Icon: "🧮", Category: "财务", Meta: []string{"客户"}, Sections: []string{"table:报价明细|项目|数量|单价|小计", "p:总价与付款方式"}},
	{Key: "cashflow", Label: "收支流水表", Icon: "🏦", Category: "财务", Meta: []string{"周期"}, Sections: []string{"table:流水明细|日期|摘要|收入|支出|余额"}},
	{Key: "invoice", Label: "发票台账", Icon: "🧷", Category: "财务", Meta: nil, Sections: []string{"table:发票清单|发票号|金额|类型|状态", "p:合计"}},
	{Key: "investment", Label: "投资分析报告", Icon: "💹", Category: "财务", Meta: nil, Sections: []string{"p:标的概况", "p:投资逻辑", "table:财务指标|关键财务指标", "p:风险与结论"}},
	{Key: "forecast", Label: "财务预测", Icon: "🔮", Category: "财务", Meta: []string{"周期"}, Sections: []string{"table:预测明细|科目|基期|预测期|说明"}},
	{Key: "headcount", Label: "招聘需求单", Icon: "👔", Category: "人力", Meta: []string{"部门"}, Sections: []string{"p:岗位信息", "ul:职责要求", "p:到岗时间"}},
	{Key: "interview-eval", Label: "面试评价表", Icon: "🧑‍💼", Category: "人力", Meta: []string{"候选人"}, Sections: []string{"table:评价维度|维度|评分|说明", "p:结论"}},
	{Key: "jd", Label: "岗位说明书", Icon: "📄", Category: "人力", Meta: nil, Sections: []string{"p:岗位概述", "ul:工作内容", "ul:任职要求", "p:汇报关系"}},
	{Key: "onboarding-check", Label: "入职清单", Icon: "🧳", Category: "人力", Meta: []string{"入职人"}, Sections: []string{"ul:材料准备", "ul:账号开通", "ul:培训安排"}},
	{Key: "training", Label: "培训计划表", Icon: "🎓", Category: "人力", Meta: []string{"周期"}, Sections: []string{"table:课程安排|课程|讲师|对象|时长"}},
	{Key: "performance", Label: "绩效考核表", Icon: "📝", Category: "人力", Meta: []string{"周期"}, Sections: []string{"table:考核维度|维度|目标|权重|得分", "p:改进计划"}},
	{Key: "offboarding", Label: "离职交接单", Icon: "🚪", Category: "人力", Meta: nil, Sections: []string{"ul:交接事项", "ul:资产归还", "ul:账号回收"}},
	{Key: "employee-record", Label: "员工档案", Icon: "🗂️", Category: "人力", Meta: nil, Sections: []string{"p:基本信息", "p:任职经历", "p:培训记录"}},
	{Key: "contract-review", Label: "合同评审", Icon: "📑", Category: "法务", Meta: []string{"对方"}, Sections: []string{"p:合同概要", "ul:风险条款", "p:修改建议", "p:结论"}},
	{Key: "nda", Label: "保密协议", Icon: "🤐", Category: "法务", Meta: []string{"签署方"}, Sections: []string{"p:保密信息范围", "ul:保密义务", "ul:期限与例外", "p:违约责任"}},
	{Key: "copyright", Label: "版权说明", Icon: "©️", Category: "法务", Meta: nil, Sections: []string{"p:权属信息", "p:授权范围", "p:使用限制"}},
	{Key: "compliance", Label: "合规检查表", Icon: "🛡️", Category: "法务", Meta: nil, Sections: []string{"ul:检查项", "p:整改要求"}},
	{Key: "disclaimer", Label: "免责声明", Icon: "⚖️", Category: "法务", Meta: nil, Sections: []string{"p:声明事项", "ul:责任限制"}},
	{Key: "privacy", Label: "数据合规说明", Icon: "🔐", Category: "法务", Meta: nil, Sections: []string{"table:数据项清单|数据项|用途|保存期限|权限", "p:处理原则"}},
	{Key: "syllabus", Label: "课程大纲", Icon: "📚", Category: "教学", Meta: []string{"课程"}, Sections: []string{"p:课程目标", "ul:教学内容", "table:教学安排|周次|主题|课时"}},
	{Key: "lesson-plan", Label: "备课教案", Icon: "📝", Category: "教学", Meta: []string{"课时"}, Sections: []string{"p:教学目标", "p:重点难点", "ol:教学过程", "ul:课后作业"}},
	{Key: "homework", Label: "作业设计", Icon: "📓", Category: "教学", Meta: nil, Sections: []string{"p:作业目标", "ul:题目", "p:提交要求"}},
	{Key: "grading", Label: "评分标准", Icon: "🖊️", Category: "教学", Meta: nil, Sections: []string{"table:评分项|评分项|权重|说明", "p:总分"}},
	{Key: "progress", Label: "学习进度表", Icon: "🎯", Category: "教学", Meta: nil, Sections: []string{"table:进度表|模块|目标|进度|状态"}},
	{Key: "lab-guide", Label: "实验指导书", Icon: "🧪", Category: "教学", Meta: nil, Sections: []string{"p:实验目的", "p:实验原理", "ol:实验步骤", "p:思考题"}},
	{Key: "exercise", Label: "习题集", Icon: "📔", Category: "教学", Meta: nil, Sections: []string{"p:基础题", "p:进阶题", "p:参考答案"}},
	{Key: "thesis", Label: "毕业设计", Icon: "🎓", Category: "教学", Meta: nil, Sections: []string{"p:选题背景", "ul:研究内容", "p:结论与展望"}},
	{Key: "sales-visit", Label: "客户拜访记录", Icon: "🤝", Category: "销售", Meta: []string{"客户", "日期"}, Sections: []string{"p:客户背景", "p:本次沟通要点", "ul:客户诉求", "ul:下一步动作"}},
	{Key: "sales-opportunity", Label: "销售机会跟进", Icon: "📈", Category: "销售", Meta: []string{"客户"}, Sections: []string{"table:阶段,预计金额,赢率,负责人", "p:关键需求", "ul:推进动作"}},
	{Key: "sales-quote", Label: "报价与议价", Icon: "🧮", Category: "销售", Meta: []string{"客户"}, Sections: []string{"table:产品,数量,单价,折扣", "p:报价条件", "p:议价底线"}},
	{Key: "sales-review", Label: "商机复盘", Icon: "🔍", Category: "销售", Meta: []string{"客户"}, Sections: []string{"p:赢单原因", "p:丢单原因", "ul:改进项"}},
	{Key: "sales-segment", Label: "客户分层", Icon: "🪜", Category: "销售", Meta: []string{"周期"}, Sections: []string{"table:客户,层级,价值,策略", "p:运营动作"}},
	{Key: "sales-partner", Label: "渠道合作方案", Icon: "🔗", Category: "销售", Meta: []string{"伙伴"}, Sections: []string{"p:合作模式", "ul:分工与收益", "p:推进节奏"}},
	{Key: "sales-bid", Label: "招投标文件", Icon: "📑", Category: "销售", Meta: []string{"项目"}, Sections: []string{"p:项目概况", "ul:资质材料", "ul:技术方案要点", "p:报价策略"}},
	{Key: "sales-script", Label: "销售话术", Icon: "🗣️", Category: "销售", Meta: nil, Sections: []string{"table:场景,客户痛点,话术,异议处理", "p:注意事项"}},
	{Key: "service-ticket", Label: "服务工单", Icon: "🎫", Category: "客服", Meta: []string{"客户"}, Sections: []string{"p:问题描述", "ol:处理过程", "p:处理结果", "p:客户反馈"}},
	{Key: "service-qc", Label: "客服质检", Icon: "🔎", Category: "客服", Meta: []string{"质检员"}, Sections: []string{"table:维度,得分,问题点", "ul:改进建议"}},
	{Key: "service-csat", Label: "客户满意度调研", Icon: "📊", Category: "客服", Meta: []string{"周期"}, Sections: []string{"table:问题,满意度,样本量", "p:结论"}},
	{Key: "service-complaint", Label: "投诉处理记录", Icon: "😤", Category: "客服", Meta: []string{"客户"}, Sections: []string{"p:投诉内容", "p:核实情况", "p:处理方案", "p:回访结果"}},
	{Key: "service-sla", Label: "服务 SLA 约定", Icon: "⏱️", Category: "客服", Meta: nil, Sections: []string{"table:问题类型,响应时限,解决时限,升级路径", "p:例外说明"}},
	{Key: "service-faq", Label: "常见问题库", Icon: "❓", Category: "客服", Meta: nil, Sections: []string{"table:问题,答案,更新时间", "p:维护说明"}},
	{Key: "service-handover", Label: "客服交接单", Icon: "🌙", Category: "客服", Meta: nil, Sections: []string{"p:值班概况", "ul:未闭环工单", "p:客户影响"}},
	{Key: "service-visit", Label: "服务回访记录", Icon: "📞", Category: "客服", Meta: []string{"客户"}, Sections: []string{"p:回访目的", "ul:客户反馈", "ul:改进承诺"}},
	{Key: "design-brief", Label: "设计需求单", Icon: "🎨", Category: "设计", Meta: []string{"设计师"}, Sections: []string{"p:项目背景", "p:视觉目标", "ul:交付物清单", "p:时间节点"}},
	{Key: "design-spec", Label: "视觉规范", Icon: "📐", Category: "设计", Meta: nil, Sections: []string{"ul:色彩", "ul:字体", "ul:间距", "ul:图标"}},
	{Key: "design-flow", Label: "交互稿说明", Icon: "🧭", Category: "设计", Meta: nil, Sections: []string{"p:页面目标", "ol:主流程", "ul:异常与空状态"}},
	{Key: "design-components", Label: "组件清单", Icon: "🧩", Category: "设计", Meta: nil, Sections: []string{"table:组件,状态,说明", "p:使用规则"}},
	{Key: "design-review-note", Label: "设计走查", Icon: "🔦", Category: "设计", Meta: []string{"走查人"}, Sections: []string{"table:页面,问题,严重度,负责人"}},
	{Key: "design-asset", Label: "素材版权登记", Icon: "©️", Category: "设计", Meta: nil, Sections: []string{"table:素材,来源,授权范围,到期时间"}},
	{Key: "design-palette", Label: "配色方案", Icon: "🎨", Category: "设计", Meta: nil, Sections: []string{"p:主色", "p:辅助色", "p:语义色", "p:对比度要求"}},
	{Key: "design-review", Label: "设计评审", Icon: "👀", Category: "设计", Meta: nil, Sections: []string{"p:评审对象", "ul:评审意见", "p:结论与分工"}},
	{Key: "data-funnel", Label: "漏斗分析", Icon: "📉", Category: "数据分析", Meta: []string{"周期"}, Sections: []string{"table:环节,人数,转化率,流失原因", "p:结论"}},
	{Key: "data-ab", Label: "A/B 实验报告", Icon: "🧪", Category: "数据分析", Meta: nil, Sections: []string{"p:实验假设", "ul:分组与流量", "table:指标,对照组,实验组,显著性", "p:结论"}},
	{Key: "data-segment", Label: "用户分群", Icon: "👥", Category: "数据分析", Meta: nil, Sections: []string{"table:人群,特征,规模,运营策略"}},
	{Key: "data-quality", Label: "数据质量检查", Icon: "🧯", Category: "数据分析", Meta: nil, Sections: []string{"ul:完整性", "ul:一致性", "ul:及时性", "p:整改项"}},
	{Key: "data-retention", Label: "留存分析", Icon: "⏳", Category: "数据分析", Meta: []string{"周期"}, Sections: []string{"table:日期,新增,次日,7日,30日", "p:结论"}},
	{Key: "data-attribution", Label: "归因分析", Icon: "🧭", Category: "数据分析", Meta: nil, Sections: []string{"table:渠道,曝光,点击,转化,价值", "p:结论"}},
	{Key: "data-board", Label: "数据看板需求", Icon: "📊", Category: "数据分析", Meta: []string{"负责人"}, Sections: []string{"p:看什么", "table:指标,维度,筛选", "p:更新频率"}},
	{Key: "data-report", Label: "数据月报", Icon: "📑", Category: "数据分析", Meta: []string{"周期"}, Sections: []string{"p:整体概览", "table:指标,本月,上月,环比", "ul:结论与行动"}},
	{Key: "sec-incident", Label: "安全事件报告", Icon: "🚨", Category: "安全", Meta: []string{"时间"}, Sections: []string{"p:事件概述", "ol:处置时间线", "p:影响面", "ul:改进项"}},
	{Key: "sec-permission", Label: "权限申请单", Icon: "🔑", Category: "安全", Meta: []string{"申请人"}, Sections: []string{"p:申请事由", "table:系统,角色,权限范围,期限", "p:审批"}},
	{Key: "sec-vuln", Label: "漏洞跟踪", Icon: "🪲", Category: "安全", Meta: nil, Sections: []string{"table:编号,漏洞,等级,状态,负责人", "p:修复计划"}},
	{Key: "sec-asset", Label: "资产清单", Icon: "🗄️", Category: "安全", Meta: []string{"周期"}, Sections: []string{"table:资产,负责人,位置,状态"}},
	{Key: "sec-backup", Label: "备份策略", Icon: "💽", Category: "安全", Meta: nil, Sections: []string{"table:数据,频率,保留期,恢复目标", "p:演练要求"}},
	{Key: "sec-drill", Label: "应急演练", Icon: "🚒", Category: "安全", Meta: nil, Sections: []string{"p:演练目标", "ol:演练步骤", "p:问题与改进"}},
	{Key: "admin-room", Label: "会议室预订", Icon: "🏢", Category: "行政", Meta: []string{"申请人"}, Sections: []string{"table:时间,会议室,人数,用途"}},
	{Key: "admin-visitor", Label: "访客登记", Icon: "🧑‍💼", Category: "行政", Meta: []string{"访客"}, Sections: []string{"p:来访人", "p:来访事由", "p:访问区域", "p:离场时间"}},
	{Key: "admin-supply", Label: "办公用品申请", Icon: "📦", Category: "行政", Meta: []string{"申请人"}, Sections: []string{"table:物品,数量,用途", "p:紧急程度"}},
	{Key: "admin-travel", Label: "差旅申请", Icon: "✈️", Category: "行政", Meta: []string{"出差人"}, Sections: []string{"p:出差事由", "table:行程,交通,时间", "p:预算"}},
	{Key: "admin-visit-expense", Label: "出差报销", Icon: "🧾", Category: "行政", Meta: []string{"出差人"}, Sections: []string{"table:日期,项目,费用类型,金额", "p:说明"}},
	{Key: "admin-vehicle", Label: "车辆使用", Icon: "🚗", Category: "行政", Meta: []string{"申请人"}, Sections: []string{"p:用车事由", "ol:行程安排", "p:归还检查"}},
	{Key: "admin-express", Label: "快递寄收", Icon: "📮", Category: "行政", Meta: nil, Sections: []string{"table:单号,寄件人,收件人,状态"}},
	{Key: "admin-invite", Label: "会议邀请", Icon: "💌", Category: "行政", Meta: []string{"召集人"}, Sections: []string{"p:会议主题", "ul:议程", "table:时间,参会人,形式"}},
	{Key: "growth-plan", Label: "学习计划", Icon: "🌱", Category: "个人成长", Meta: []string{"周期"}, Sections: []string{"p:目标", "table:主题,资源,时长,进度"}},
	{Key: "growth-skill", Label: "技能清单", Icon: "🧠", Category: "个人成长", Meta: nil, Sections: []string{"table:技能,熟练度,学习方式", "p:下一步"}},
	{Key: "growth-review", Label: "阶段复盘", Icon: "🪞", Category: "个人成长", Meta: []string{"周期"}, Sections: []string{"p:目标", "p:结果", "ul:做得好", "ul:不足"}},
	{Key: "growth-career", Label: "职业规划", Icon: "🧭", Category: "个人成长", Meta: nil, Sections: []string{"p:方向", "table:阶段,目标,行动", "p:风险"}},
	{Key: "growth-course", Label: "课程笔记", Icon: "📝", Category: "个人成长", Meta: nil, Sections: []string{"p:课程信息", "ul:核心要点", "p:行动"}},
	{Key: "growth-reading", Label: "主题阅读清单", Icon: "📚", Category: "个人成长", Meta: nil, Sections: []string{"table:书名,主题,状态,笔记链接"}},
	{Key: "train-newcomer", Label: "新员工培训计划", Icon: "🎓", Category: "培训", Meta: []string{"周期"}, Sections: []string{"table:阶段,主题,讲师,时长", "p:考核方式"}},
	{Key: "train-trainer", Label: "讲师手册", Icon: "🧑‍🏫", Category: "培训", Meta: nil, Sections: []string{"p:课程目标", "ol:授课流程", "ul:互动设计", "p:答疑预案"}},
	{Key: "train-student", Label: "学员手册", Icon: "🎒", Category: "培训", Meta: nil, Sections: []string{"ul:学习路径", "ul:作业要求", "p:服务支持"}},
	{Key: "train-exam", Label: "考试试卷", Icon: "📝", Category: "培训", Meta: nil, Sections: []string{"p:考试说明", "ul:选择题", "ul:问答题", "p:参考答案"}},
	{Key: "train-evaluate", Label: "培训评估", Icon: "📊", Category: "培训", Meta: []string{"讲师"}, Sections: []string{"table:维度,得分,建议", "p:改进"}},
	{Key: "train-cert", Label: "结业证书", Icon: "🏅", Category: "培训", Meta: []string{"学员"}, Sections: []string{"p:课程名称", "p:学时", "p:考核结果", "p:颁发日期"}},
	{Key: "content-calendar", Label: "内容日历", Icon: "🗓️", Category: "内容运营", Meta: []string{"周期"}, Sections: []string{"table:日期,渠道,主题,负责人,状态"}},
	{Key: "content-topic", Label: "选题池", Icon: "💡", Category: "内容运营", Meta: nil, Sections: []string{"table:选题,来源,价值,状态"}},
	{Key: "content-draft", Label: "稿件模板", Icon: "📄", Category: "内容运营", Meta: nil, Sections: []string{"p:标题", "p:导语", "ul:正文要点", "ul:行动号召", "p:素材"}},
	{Key: "content-proof", Label: "审校清单", Icon: "✅", Category: "内容运营", Meta: nil, Sections: []string{"ul:事实核对", "ul:错别字", "ul:合规", "p:签字"}},
	{Key: "content-right", Label: "素材版权说明", Icon: "©️", Category: "内容运营", Meta: nil, Sections: []string{"table:素材,来源,授权范围,署名要求"}},
	{Key: "content-review", Label: "传播复盘", Icon: "📈", Category: "内容运营", Meta: []string{"周期"}, Sections: []string{"table:内容,曝光,互动,转化", "p:结论"}},
	{Key: "biz-intent", Label: "合作意向书", Icon: "🤝", Category: "商务", Meta: []string{"伙伴"}, Sections: []string{"p:合作背景", "ul:合作范围", "p:初步条件"}},
	{Key: "biz-partner", Label: "合作伙伴评估", Icon: "🔍", Category: "商务", Meta: []string{"伙伴"}, Sections: []string{"table:维度,评分,说明", "p:结论"}},
	{Key: "biz-joint", Label: "联合方案", Icon: "🧩", Category: "商务", Meta: nil, Sections: []string{"p:合作形式", "ul:分工", "table:投入,产出,收益", "p:风险"}},
	{Key: "biz-price", Label: "渠道价格表", Icon: "💲", Category: "商务", Meta: []string{"周期"}, Sections: []string{"table:产品,建议零售价,渠道价,最低价"}},
	{Key: "biz-contract", Label: "合同要点备忘", Icon: "📑", Category: "商务", Meta: []string{"对方"}, Sections: []string{"ul:关键条款", "ul:风险点", "p:谈判底线"}},
	{Key: "biz-renew", Label: "续约沟通", Icon: "🔄", Category: "商务", Meta: []string{"伙伴"}, Sections: []string{"p:现状评估", "ul:续约诉求", "p:下一步"}},
	{Key: "pm-kickoff-review", Label: "立项评审", Icon: "🚀", Category: "项目", Meta: []string{"项目"}, Sections: []string{"p:立项背景", "ul:评审要点", "p:评审结论"}},
	{Key: "pm-risk-assess", Label: "项目风险评估", Icon: "⚠️", Category: "项目", Meta: nil, Sections: []string{"table:风险,概率,影响,应对", "p:整体评级"}},
	{Key: "pm-milestone-accept", Label: "里程碑验收", Icon: "🚩", Category: "项目", Meta: nil, Sections: []string{"p:验收范围", "ul:验收标准", "p:验收结论"}},
	{Key: "pm-summary", Label: "项目总结", Icon: "📑", Category: "项目", Meta: nil, Sections: []string{"p:目标回顾", "p:结果", "ul:经验", "ul:改进"}},
	{Key: "pm-change-review", Label: "变更评审", Icon: "🔄", Category: "项目", Meta: nil, Sections: []string{"p:变更内容", "p:影响评估", "p:决策结论"}},
	{Key: "pm-resource-req", Label: "资源申请", Icon: "🧮", Category: "项目", Meta: []string{"申请人"}, Sections: []string{"table:资源,数量,周期,用途", "p:优先级"}},
	{Key: "pm-dependency", Label: "依赖协调表", Icon: "🔗", Category: "项目", Meta: nil, Sections: []string{"table:依赖项,对方,期望时间,风险"}},
	{Key: "pm-report", Label: "向上汇报", Icon: "📤", Category: "项目", Meta: []string{"汇报人"}, Sections: []string{"p:结论先行", "ul:进展", "ul:风险与求助"}},
	{Key: "flow-prepare", Label: "会议筹备", Icon: "📋", Category: "流程", Meta: []string{"召集人"}, Sections: []string{"p:会议目的", "ul:议程", "ul:参会人", "ul:会前材料"}},
	{Key: "flow-followup", Label: "会后跟进", Icon: "📌", Category: "流程", Meta: nil, Sections: []string{"table:事项,负责人,截止时间,状态"}},
	{Key: "flow-approval", Label: "审批说明", Icon: "🖋️", Category: "流程", Meta: nil, Sections: []string{"p:申请事由", "ul:依据", "p:结论"}},
	{Key: "flow-response", Label: "服务响应", Icon: "⏱️", Category: "流程", Meta: nil, Sections: []string{"p:触发条件", "ol:响应步骤", "p:升级机制"}},
	{Key: "flow-implement", Label: "变更实施", Icon: "🔧", Category: "流程", Meta: nil, Sections: []string{"ol:实施步骤", "ul:验证方式", "p:回滚方案"}},
	{Key: "flow-archive", Label: "项目归档", Icon: "🗄️", Category: "流程", Meta: nil, Sections: []string{"ul:归档清单", "p:存放位置", "p:保留期限"}},
	{Key: "mg-align", Label: "目标对齐会", Icon: "🎯", Category: "管理", Meta: nil, Sections: []string{"p:目标", "table:团队,负责人,承诺", "p:对齐结论"}},
	{Key: "mg-perf-talk", Label: "绩效沟通", Icon: "💬", Category: "管理", Meta: []string{"员工"}, Sections: []string{"p:事实回顾", "p:反馈", "p:改进约定"}},
	{Key: "mg-crossdept", Label: "跨部门协作", Icon: "🤝", Category: "管理", Meta: nil, Sections: []string{"p:协作事项", "table:部门,交付物,时间", "p:机制"}},
	{Key: "mg-conflict", Label: "资源冲突协调", Icon: "⚡", Category: "管理", Meta: nil, Sections: []string{"p:冲突描述", "ul:方案一", "ul:方案二", "p:决策"}},
	{Key: "mg-reporting", Label: "周报汇报", Icon: "📤", Category: "管理", Meta: []string{"周期"}, Sections: []string{"p:一句话结论", "ul:关键进展", "ul:风险"}},
	{Key: "mg-metrics-review", Label: "指标复盘", Icon: "📊", Category: "管理", Meta: []string{"周期"}, Sections: []string{"table:指标,目标,实际,结论", "p:改进动作"}},
	{Key: "note-quick", Label: "快速笔记", Icon: "📝", Category: "通用", Meta: nil, Sections: []string{"p:标题", "p:内容"}},
	{Key: "note-jot", Label: "随手记录", Icon: "🖊️", Category: "通用", Meta: nil, Sections: []string{"p:想法", "ul:待办"}},
	{Key: "note-whiteboard", Label: "会议白板", Icon: "🧹", Category: "通用", Meta: nil, Sections: []string{"ul:关键议题", "ul:结论", "ul:待定"}},
	{Key: "note-idea", Label: "灵感收集", Icon: "💡", Category: "通用", Meta: nil, Sections: []string{"table:灵感,来源,可行性", "p:下一步"}},
	{Key: "note-todo", Label: "待办清单", Icon: "✅", Category: "通用", Meta: nil, Sections: []string{"table:事项,截止,优先级", "p:总结"}},
	{Key: "note-memo", Label: "备忘清单", Icon: "📌", Category: "通用", Meta: nil, Sections: []string{"ul:备忘", "p:更新日期"}},
}

// buildTemplateHTML 把紧凑定义渲染成模板正文。
func buildTemplateHTML(d builtinTemplateDef) string {
	if d.Key == "blank" {
		return ""
	}
	var b strings.Builder
	b.WriteString("<h1>{标题}</h1>")
	for _, m := range d.Meta {
		b.WriteString("<p><strong>")
		b.WriteString(m)
		b.WriteString("：</strong>")
		switch m {
		case "日期":
			b.WriteString("{日期}")
		case "作者":
			b.WriteString("{作者}")
		case "负责人":
			b.WriteString("{负责人}")
		}
		b.WriteString("</p>")
	}
	for _, sec := range d.Sections {
		bits := strings.SplitN(sec, ":", 3)
		kind := bits[0]
		title := ""
		if len(bits) > 1 {
			title = bits[1]
		}
		switch kind {
		case "p":
			b.WriteString("<h2>" + title + "</h2><p></p>")
		case "ul":
			b.WriteString("<h2>" + title + "</h2><ul><li></li><li></li></ul>")
		case "ol":
			b.WriteString("<h2>" + title + "</h2><ol><li></li><li></li></ol>")
		case "quote":
			b.WriteString("<h2>" + title + "</h2><blockquote></blockquote>")
		case "kv":
			b.WriteString("<h2>" + title + "</h2><p><strong>术语：</strong>　<strong>含义：</strong></p><p><strong>术语：</strong>　<strong>含义：</strong></p>")
		case "table":
			// table 段格式：table:标题|列1|列2|...
			parts := strings.Split(title, "|")
			title = parts[0]
			cols := parts[1:]
			if len(cols) == 0 {
				cols = []string{"项目", "说明"}
			}
			b.WriteString("<h2>" + title + "</h2><table><thead><tr>")
			for _, c := range cols {
				b.WriteString("<th>" + c + "</th>")
			}
			b.WriteString("</tr></thead><tbody>")
			row := "<tr>"
			for range cols {
				row += "<td></td>"
			}
			row += "</tr>"
			b.WriteString(row + row + row)
			b.WriteString("</tbody></table>")
		default:
			b.WriteString("<h2>" + title + "</h2><p></p>")
		}
	}
	return b.String()
}

// buildBuiltinTemplates 生成内置模板列表。
func buildBuiltinTemplates() []model.KnowledgeTemplate {
	out := make([]model.KnowledgeTemplate, 0, len(builtinTemplateDefs))
	for _, d := range builtinTemplateDefs {
		out = append(out, model.KnowledgeTemplate{
			Key:      d.Key,
			Label:    d.Label,
			Icon:     d.Icon,
			Category: d.Category,
			HTML:     buildTemplateHTML(d),
		})
	}
	return out
}
