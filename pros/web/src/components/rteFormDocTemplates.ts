/**
 * 常用「表单文档」模板：供工具栏「模板 ▾」按分类浏览。
 * 与 rteDocTemplates.ts 中的办公/产品等文档模板并列；本文件只含带表单控件的模板。
 */
import type { RteDocTemplate, RteDocTemplateGroup, RteJsonNode } from './rteDocTemplates'

/** 本地副本，避免与 rteDocTemplates 形成运行时循环依赖 */
function sanitizeRteJsonNodes(nodes: RteJsonNode[]): RteJsonNode[] {
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

const ENTERPRISE_DEFAULTS = {
  readonly: false,
  disabled: false,
  helpText: '',
} as const

function uid(prefix: string) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`
}

function text(s: string, marks?: RteJsonNode['marks']): RteJsonNode | null {
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
  return { type: 'heading', attrs: { level }, content: t ? [t] : undefined }
}

function formText(
  label: string,
  opts?: { placeholder?: string; required?: boolean; name?: string },
): RteJsonNode {
  return {
    type: 'formTextInput',
    attrs: {
      ...ENTERPRISE_DEFAULTS,
      name: opts?.name || uid('text'),
      bindExpr: '',
      label,
      placeholder: opts?.placeholder ?? '请输入',
      value: '',
      required: opts?.required ?? true,
      minLength: '',
      maxLength: '',
    },
  }
}

function formTextarea(
  label: string,
  opts?: { placeholder?: string; required?: boolean; rows?: number },
): RteJsonNode {
  return {
    type: 'formTextarea',
    attrs: {
      ...ENTERPRISE_DEFAULTS,
      name: uid('textarea'),
      bindExpr: '',
      label,
      placeholder: opts?.placeholder ?? '请输入',
      value: '',
      rows: opts?.rows ?? 4,
      required: opts?.required ?? true,
      minLength: '',
      maxLength: '',
    },
  }
}

function formNumber(
  label: string,
  opts?: { min?: string; max?: string; step?: string; required?: boolean },
): RteJsonNode {
  return {
    type: 'formNumberInput',
    attrs: {
      ...ENTERPRISE_DEFAULTS,
      name: uid('number'),
      bindExpr: '',
      label,
      placeholder: '请输入数字',
      value: '',
      min: opts?.min ?? '',
      max: opts?.max ?? '',
      step: opts?.step ?? '1',
      required: opts?.required ?? true,
    },
  }
}

function formSelect(
  label: string,
  options: string[],
  opts?: { required?: boolean },
): RteJsonNode {
  return {
    type: 'formSelect',
    attrs: {
      ...ENTERPRISE_DEFAULTS,
      name: uid('select'),
      bindExpr: '',
      label,
      options: options.join('|'),
      value: '',
      placeholder: '请选择',
      required: opts?.required ?? true,
    },
  }
}

function formRadio(
  label: string,
  options: string[],
  opts?: { required?: boolean },
): RteJsonNode {
  return {
    type: 'formRadioGroup',
    attrs: {
      ...ENTERPRISE_DEFAULTS,
      name: uid('radio'),
      bindExpr: '',
      label,
      options: options.join('|'),
      value: '',
      required: opts?.required ?? true,
      layout: 'column',
      layoutColumns: 2,
    },
  }
}

function formCheckbox(
  label: string,
  options: string[],
  opts?: { required?: boolean },
): RteJsonNode {
  return {
    type: 'formCheckboxGroup',
    attrs: {
      ...ENTERPRISE_DEFAULTS,
      name: uid('check'),
      bindExpr: '',
      label,
      options: options.join('|'),
      value: '',
      required: opts?.required ?? false,
      layout: 'column',
      layoutColumns: 2,
    },
  }
}

function formDate(label: string, opts?: { required?: boolean }): RteJsonNode {
  return {
    type: 'formDateInput',
    attrs: {
      ...ENTERPRISE_DEFAULTS,
      name: uid('date'),
      bindExpr: '',
      label,
      kind: 'date',
      dateFormat: 'YYYY-MM-DD',
      value: '',
      required: opts?.required ?? true,
    },
  }
}

function formSwitch(label: string): RteJsonNode {
  return {
    type: 'formSwitch',
    attrs: {
      ...ENTERPRISE_DEFAULTS,
      name: uid('switch'),
      bindExpr: '',
      label,
      value: false,
      required: false,
    },
  }
}

function wrapBuild(fn: () => RteJsonNode[]): () => RteJsonNode[] {
  return () => sanitizeRteJsonNodes(fn())
}

const DEPT = ['产品', '研发', '设计', '运营', '市场', '综合', '财务', '人事', '其他'] as const
function leaveRequestForm(): RteJsonNode[] {
  return [
    h(1, '请假申请'),
    p('请填写以下信息提交请假。标 * 为必填项。'),
    formText('申请人', { placeholder: '姓名' }),
    formSelect('部门', [...DEPT]),
    formSelect('请假类型', ['年假', '事假', '病假', '调休', '婚假', '产假 / 陪产假', '其他']),
    formDate('开始日期'),
    formDate('结束日期'),
    formNumber('请假天数', { min: '0.5', max: '30', step: '0.5' }),
    formTextarea('事由说明', { placeholder: '简要说明请假原因', rows: 4 }),
    formText('工作交接人', { placeholder: '姓名', required: false }),
    formSwitch('已完成工作交接'),
  ]
}

function overtimeRequestForm(): RteJsonNode[] {
  return [
    h(1, '加班申请'),
    p('请填写加班信息。标 * 为必填项。'),
    formText('申请人', { placeholder: '姓名' }),
    formSelect('部门', [...DEPT]),
    formDate('加班日期'),
    formText('开始时间', { placeholder: '如 19:00' }),
    formText('结束时间', { placeholder: '如 22:00' }),
    formNumber('加班时长（小时）', { min: '0.5', max: '24', step: '0.5' }),
    formSelect('补偿方式', ['调休', '加班费', '待定']),
    formTextarea('加班事由', { placeholder: '任务与必要性说明', rows: 4 }),
    formSwitch('需要加班餐'),
  ]
}

function resignHandoverForm(): RteJsonNode[] {
  return [
    h(1, '离职交接表'),
    p('请逐项确认离职交接事项。'),
    formText('离职人', { placeholder: '姓名' }),
    formSelect('部门', [...DEPT]),
    formText('岗位', { placeholder: '职位名称' }),
    formDate('最后工作日'),
    formText('交接人', { placeholder: '接手同事姓名' }),
    formCheckbox('交接事项', ['工作文档', '进行中项目', '客户关系', '账号权限', '固定资产', '其他']),
    formTextarea('未完事项说明', { placeholder: '需跟进的事项与截止时间', rows: 4, required: false }),
    formSwitch('已归还门禁 / 工牌'),
    formSwitch('已归还电脑等设备'),
  ]
}

function recruitReqForm(): RteJsonNode[] {
  return [
    h(1, '招聘需求表'),
    p('请填写招聘岗位需求，便于人事排期。'),
    formText('需求提出人', { placeholder: '姓名' }),
    formSelect('需求部门', [...DEPT]),
    formText('岗位名称', { placeholder: '如：高级前端工程师' }),
    formNumber('需求人数', { min: '1', max: '50', step: '1' }),
    formSelect('用工性质', ['全职', '兼职', '实习', '外包', '其他']),
    formSelect('职级要求', ['初级', '中级', '高级', '专家 / 管理', '不限']),
    formDate('期望到岗日期', { required: false }),
    formTextarea('任职要求', { placeholder: '技能、经验、软性要求等', rows: 5 }),
    formTextarea('岗位职责', { placeholder: '主要工作内容', rows: 4, required: false }),
    formSwitch('可接受远程 / 异地'),
  ]
}

function interviewEvalForm(): RteJsonNode[] {
  return [
    h(1, '面试评价表'),
    p('面试结束后请及时填写评价。'),
    formText('候选人', { placeholder: '姓名' }),
    formText('应聘岗位', { placeholder: '岗位名称' }),
    formText('面试官', { placeholder: '姓名' }),
    formSelect('面试轮次', ['初试', '复试', '终面', '其他']),
    formDate('面试日期'),
    formRadio('专业能力', ['优秀', '良好', '一般', '较弱']),
    formRadio('沟通协作', ['优秀', '良好', '一般', '较弱']),
    formRadio('动机匹配', ['高', '中', '低']),
    formNumber('综合评分（1–10）', { min: '1', max: '10', step: '1' }),
    formSelect('结论', ['强烈推荐', '推荐', '待定', '不推荐']),
    formTextarea('评语与风险', { placeholder: '亮点、疑点、建议下一步', rows: 4 }),
  ]
}

function trainingSignupForm(): RteJsonNode[] {
  return [
    h(1, '培训报名表'),
    p('请填写培训报名信息。'),
    formText('姓名', { placeholder: '真实姓名' }),
    formSelect('部门', [...DEPT]),
    formText('手机号', { placeholder: '11 位手机号' }),
    formSelect('培训课程', ['新人入职', '产品赋能', '管理进阶', '安全合规', '其他']),
    formSelect('期望场次', ['上午场', '下午场', '全天', '线上回放']),
    formDate('报名日期'),
    formCheckbox('关注主题', ['业务知识', '工具技巧', '团队协作', '领导力', '其他']),
    formTextarea('特殊需求', { placeholder: '饮食、无障碍、请假说明等', required: false, rows: 3 }),
    formSwitch('同意培训期间遵守纪律'),
  ]
}

function assetClaimForm(): RteJsonNode[] {
  return [
    h(1, '固定资产领用'),
    p('请填写资产领用申请。'),
    formText('领用人', { placeholder: '姓名' }),
    formSelect('部门', [...DEPT]),
    formSelect('资产类型', ['笔记本电脑', '显示器', '手机', '外设配件', '办公家具', '其他']),
    formText('规格型号', { placeholder: '品牌 / 型号', required: false }),
    formNumber('数量', { min: '1', max: '99', step: '1' }),
    formDate('领用日期'),
    formDate('预计归还日期', { required: false }),
    formTextarea('用途说明', { placeholder: '工作用途与必要性', rows: 3 }),
    formSwitch('已阅读资产使用规范'),
  ]
}

function attendanceExceptionForm(): RteJsonNode[] {
  return [
    h(1, '考勤异常说明'),
    p('用于补卡、漏打卡等考勤异常说明。'),
    formText('申请人', { placeholder: '姓名' }),
    formSelect('部门', [...DEPT]),
    formSelect('异常类型', ['忘记打卡', '系统故障', '外勤未打卡', '迟到说明', '早退说明', '其他']),
    formDate('异常日期'),
    formText('应打卡时间', { placeholder: '如 09:00', required: false }),
    formText('实际到达 / 离开', { placeholder: '如 09:15', required: false }),
    formTextarea('情况说明', { placeholder: '经过与证明材料说明', rows: 4 }),
    formText('证明人', { placeholder: '同事姓名', required: false }),
    formSwitch('已附证明材料'),
  ]
}

function leadIntakeForm(): RteJsonNode[] {
  return [
    h(1, '销售线索登记'),
    p('请录入新线索，便于跟进分配。'),
    formText('公司名称', { placeholder: '客户公司全称' }),
    formText('联系人', { placeholder: '姓名' }),
    formText('职位', { placeholder: '如：采购经理', required: false }),
    formText('手机号', { placeholder: '11 位手机号' }),
    formText('邮箱', { placeholder: 'name@example.com', required: false }),
    formSelect('线索来源', ['官网留言', '展会', '转介绍', '电销', '广告投放', '渠道伙伴', '其他']),
    formSelect('意向程度', ['高', '中', '低', '未知']),
    formNumber('预估金额（元）', { min: '0', step: '100', required: false }),
    formTextarea('需求摘要', { placeholder: '客户痛点与需求', rows: 4 }),
    formDate('录入日期'),
  ]
}

function customerVisitForm(): RteJsonNode[] {
  return [
    h(1, '客户拜访记录'),
    p('拜访结束后请填写本表。'),
    formText('客户名称', { placeholder: '公司 / 个人' }),
    formText('拜访人', { placeholder: '我方人员' }),
    formText('客户对接人', { placeholder: '对方姓名 / 职位' }),
    formSelect('拜访方式', ['上门', '电话', '视频会议', '展会偶遇', '其他']),
    formDate('拜访日期'),
    formSelect('当前阶段', ['线索', '需求确认', '方案', '商务谈判', '成交', '续约']),
    formTextarea('沟通纪要', { placeholder: '讨论内容与客户反馈', rows: 5 }),
    formTextarea('下一步计划', { placeholder: '动作、负责人、截止时间', rows: 3 }),
    formRadio('商机判断', ['强意向', '一般', '观望', '暂无机会']),
  ]
}

function quoteApplyForm(): RteJsonNode[] {
  return [
    h(1, '报价申请单'),
    p('请填写报价申请，提交审批。'),
    formText('申请人', { placeholder: '姓名' }),
    formText('客户名称', { placeholder: '公司全称' }),
    formText('方案 / 产品', { placeholder: '产品线或方案名' }),
    formNumber('目录价合计（元）', { min: '0', step: '0.01' }),
    formNumber('申请折扣（%）', { min: '0', max: '100', step: '1', required: false }),
    formNumber('报价金额（元）', { min: '0', step: '0.01' }),
    formDate('报价有效期至'),
    formSelect('付款方式', ['全款', '分期', '年付', '其他']),
    formTextarea('折扣理由', { placeholder: '竞争、战略客户、批量等', rows: 3, required: false }),
    formSwitch('需法务审合同'),
  ]
}

function contractInfoForm(): RteJsonNode[] {
  return [
    h(1, '合同信息登记'),
    p('用于合同基本信息建档。'),
    formText('合同名称', { placeholder: '合同标题' }),
    formText('我方主体', { placeholder: '签约公司全称' }),
    formText('对方主体', { placeholder: '客户 / 供应商全称' }),
    formSelect('合同类型', ['销售合同', '采购合同', '服务协议', '保密协议', '框架协议', '其他']),
    formNumber('合同金额（元）', { min: '0', step: '0.01', required: false }),
    formDate('签约日期'),
    formDate('生效日期'),
    formDate('到期日期', { required: false }),
    formText('我方负责人', { placeholder: '姓名' }),
    formTextarea('备注', { placeholder: '付款节点、特殊条款等', required: false, rows: 3 }),
  ]
}

function aftersaleTicketForm(): RteJsonNode[] {
  return [
    h(1, '售后服务工单'),
    p('请描述客户售后问题，便于分派处理。'),
    formText('客户名称', { placeholder: '公司 / 联系人' }),
    formText('联系电话', { placeholder: '手机号' }),
    formText('产品 / 订单号', { placeholder: '相关单号', required: false }),
    formSelect('问题类型', ['功能咨询', '故障报修', '退换货', '发票 / 账单', '投诉', '其他']),
    formSelect('紧急程度', ['紧急', '高', '中', '低']),
    formDate('反馈日期'),
    formTextarea('问题描述', { placeholder: '现象、期望与已尝试操作', rows: 5 }),
    formText('受理人', { placeholder: '内部跟进人', required: false }),
    formSwitch('客户要求回电'),
  ]
}

function npsCallbackForm(): RteJsonNode[] {
  return [
    h(1, '客户回访登记'),
    p('定期回访记录，沉淀满意度与商机。'),
    formText('客户名称', { placeholder: '公司名称' }),
    formText('回访人', { placeholder: '我方姓名' }),
    formDate('回访日期'),
    formSelect('回访方式', ['电话', '微信', '上门', '问卷', '其他']),
    formRadio('整体满意度', ['非常满意', '满意', '一般', '不满意', '非常不满意']),
    formNumber('推荐意愿 NPS（0–10）', { min: '0', max: '10', step: '1' }),
    formSelect('续约 / 增购意向', ['明确意向', '观望', '暂无', '未知']),
    formTextarea('客户反馈', { placeholder: '表扬、吐槽、需求', rows: 4 }),
    formTextarea('跟进动作', { placeholder: '下一步计划', rows: 3, required: false }),
  ]
}

function partnerApplyForm(): RteJsonNode[] {
  return [
    h(1, '渠道伙伴申请'),
    p('意向成为渠道 / 合作伙伴请填写。'),
    formText('公司名称', { placeholder: '全称' }),
    formText('联系人', { placeholder: '姓名' }),
    formText('手机号', { placeholder: '11 位手机号' }),
    formText('邮箱', { placeholder: 'name@example.com', required: false }),
    formSelect('合作类型', ['经销商', '代理商', 'ISV', '实施伙伴', '推荐伙伴', '其他']),
    formText('覆盖区域', { placeholder: '如：华东 / 全国' }),
    formNumber('团队规模', { min: '1', step: '1', required: false }),
    formTextarea('优势与案例', { placeholder: '行业经验、客户案例', rows: 4 }),
    formSwitch('已阅读合作政策'),
  ]
}

function expenseClaimForm(): RteJsonNode[] {
  return [
    h(1, '报销申请'),
    p('请填写报销信息。标 * 为必填项。'),
    formText('申请人', { placeholder: '姓名' }),
    formSelect('部门', [...DEPT]),
    formSelect('费用类型', ['差旅', '交通', '餐饮', '办公用品', '招待', '培训', '其他']),
    formDate('费用发生日期'),
    formNumber('报销金额（元）', { min: '0', step: '0.01' }),
    formText('费用说明', { placeholder: '事由 / 明细摘要' }),
    formTextarea('明细备注', { placeholder: '可列多笔明细', required: false, rows: 4 }),
    formSwitch('已附发票 / 凭证'),
  ]
}

function travelLoanForm(): RteJsonNode[] {
  return [
    h(1, '差旅借款申请'),
    p('出差前借款请填写本表。'),
    formText('申请人', { placeholder: '姓名' }),
    formSelect('部门', [...DEPT]),
    formText('出差目的地', { placeholder: '城市 / 地点' }),
    formDate('出发日期'),
    formDate('返回日期'),
    formNumber('借款金额（元）', { min: '0', step: '0.01' }),
    formSelect('费用用途', ['交通', '住宿', '招待', '综合备用金', '其他']),
    formTextarea('事由说明', { placeholder: '出差目的与预算依据', rows: 4 }),
    formDate('预计冲销日期', { required: false }),
    formSwitch('同意按时报销冲销'),
  ]
}

function paymentRequestForm(): RteJsonNode[] {
  return [
    h(1, '付款申请单'),
    p('对外付款前请填写并附合同 / 发票。'),
    formText('申请人', { placeholder: '姓名' }),
    formSelect('部门', [...DEPT]),
    formText('收款单位', { placeholder: '对方全称' }),
    formText('开户行', { placeholder: '银行名称', required: false }),
    formText('账号', { placeholder: '银行账号', required: false }),
    formNumber('付款金额（元）', { min: '0', step: '0.01' }),
    formSelect('付款方式', ['银行转账', '支票', '承兑', '其他']),
    formDate('期望付款日'),
    formTextarea('付款事由', { placeholder: '合同号、费用说明等', rows: 4 }),
    formSwitch('已附合同 / 发票'),
  ]
}

function invoiceApplyForm(): RteJsonNode[] {
  return [
    h(1, '开票申请'),
    p('请准确填写开票信息。'),
    formText('申请人', { placeholder: '姓名' }),
    formText('客户名称', { placeholder: '发票抬头' }),
    formSelect('发票类型', ['增值税专用发票', '增值税普通发票', '电子普票', '其他']),
    formText('纳税人识别号', { placeholder: '税号' }),
    formText('地址电话', { placeholder: '专票必填', required: false }),
    formText('开户行及账号', { placeholder: '专票必填', required: false }),
    formNumber('开票金额（元）', { min: '0', step: '0.01' }),
    formText('货物 / 服务名称', { placeholder: '如：技术服务费' }),
    formText('接收邮箱', { placeholder: '电子票接收邮箱', required: false }),
    formTextarea('备注', { placeholder: '订单号、特殊要求', required: false, rows: 3 }),
  ]
}

function budgetApplyForm(): RteJsonNode[] {
  return [
    h(1, '预算申请表'),
    p('部门预算追加 / 新立项预算申请。'),
    formText('申请人', { placeholder: '姓名' }),
    formSelect('部门', [...DEPT]),
    formText('预算科目', { placeholder: '如：市场推广费' }),
    formSelect('预算周期', ['本月', '本季度', '本年度', '项目周期', '其他']),
    formNumber('申请金额（元）', { min: '0', step: '0.01' }),
    formNumber('已有预算余额（元）', { min: '0', step: '0.01', required: false }),
    formDate('期望生效日期'),
    formTextarea('用途与收益说明', { placeholder: '做什么、为何需要、预期产出', rows: 5 }),
    formSwitch('已与财务预沟通'),
  ]
}

function pettyCashForm(): RteJsonNode[] {
  return [
    h(1, '备用金申领'),
    p('部门零星支出备用金申领。'),
    formText('申领人', { placeholder: '姓名' }),
    formSelect('部门', [...DEPT]),
    formNumber('申领金额（元）', { min: '0', step: '0.01' }),
    formSelect('用途类型', ['快递物流', '临时采购', '团队活动', '客户招待', '其他']),
    formDate('申领日期'),
    formDate('预计核销日期'),
    formTextarea('用途说明', { placeholder: '预计支出明细', rows: 4 }),
    formText('保管人', { placeholder: '姓名', required: false }),
    formSwitch('同意按制度核销'),
  ]
}

function salaryAdjustForm(): RteJsonNode[] {
  return [
    h(1, '调薪申请表'),
    p('由上级或人事发起调薪申请。'),
    formText('员工姓名', { placeholder: '姓名' }),
    formSelect('部门', [...DEPT]),
    formText('岗位', { placeholder: '当前职位' }),
    formText('发起人', { placeholder: '上级 / HR' }),
    formNumber('当前月薪（元）', { min: '0', step: '1', required: false }),
    formNumber('拟调月薪（元）', { min: '0', step: '1' }),
    formNumber('调幅（%）', { min: '0', max: '100', step: '0.5', required: false }),
    formDate('生效日期'),
    formSelect('调薪原因', ['绩效晋升', '市场对标', '岗位调整', '特殊贡献', '其他']),
    formTextarea('理由说明', { placeholder: '业绩与对标依据', rows: 4 }),
  ]
}

function projectInitForm(): RteJsonNode[] {
  return [
    h(1, '项目立项申请'),
    p('新项目立项请填写本表提交评审。'),
    formText('项目名称', { placeholder: '简洁可识别的名称' }),
    formText('项目负责人', { placeholder: '姓名' }),
    formSelect('所属部门', [...DEPT]),
    formSelect('项目类型', ['产品研发', '客户交付', '内部提效', '市场活动', '其他']),
    formDate('计划开始日期'),
    formDate('计划结束日期'),
    formNumber('预算（元）', { min: '0', step: '0.01', required: false }),
    formTextarea('背景与目标', { placeholder: '为什么做、成功标准', rows: 4 }),
    formTextarea('范围说明', { placeholder: '范围内 / 外', rows: 3, required: false }),
    formSwitch('已对齐相关干系人'),
  ]
}

function changeRequestForm(): RteJsonNode[] {
  return [
    h(1, '项目变更申请'),
    p('范围 / 进度 / 成本变更请走本表。'),
    formText('项目名称', { placeholder: '项目名' }),
    formText('提出人', { placeholder: '姓名' }),
    formDate('提出日期'),
    formSelect('变更类型', ['范围', '进度', '成本', '质量', '资源', '其他']),
    formSelect('紧急程度', ['紧急', '一般', '可延后']),
    formTextarea('变更内容', { placeholder: '改什么', rows: 4 }),
    formTextarea('变更原因', { placeholder: '为什么改', rows: 3 }),
    formTextarea('影响评估', { placeholder: '对进度、成本、风险的影响', rows: 4 }),
    formRadio('建议决策', ['批准', '有条件批准', '驳回', '暂缓']),
  ]
}

function riskReportForm(): RteJsonNode[] {
  return [
    h(1, '项目风险上报'),
    p('发现新风险或风险升级时填写。'),
    formText('项目名称', { placeholder: '项目名' }),
    formText('上报人', { placeholder: '姓名' }),
    formDate('上报日期'),
    formText('风险标题', { placeholder: '一句话描述' }),
    formSelect('可能性', ['高', '中', '低']),
    formSelect('影响程度', ['高', '中', '低']),
    formSelect('风险状态', ['开放', '缓解中', '已关闭', '已接受']),
    formTextarea('风险描述', { placeholder: '背景、触发条件', rows: 4 }),
    formTextarea('应对措施', { placeholder: '规避 / 减轻 / 转移 / 接受', rows: 3 }),
    formText('责任人', { placeholder: '跟进人', required: false }),
  ]
}

function taskAcceptForm(): RteJsonNode[] {
  return [
    h(1, '任务验收单'),
    p('任务完成后由验收人填写。'),
    formText('任务名称', { placeholder: '任务 / 里程碑名' }),
    formText('执行人', { placeholder: '姓名' }),
    formText('验收人', { placeholder: '姓名' }),
    formDate('计划完成日'),
    formDate('实际完成日'),
    formSelect('交付物类型', ['文档', '代码', '设计稿', '数据报告', '其他']),
    formRadio('验收结论', ['通过', '有条件通过', '不通过']),
    formTextarea('验收意见', { placeholder: '问题清单与改进建议', rows: 4 }),
    formSwitch('已归档交付物'),
  ]
}

function resourceRequestForm(): RteJsonNode[] {
  return [
    h(1, '项目资源申请'),
    p('申请跨部门人力或设备资源。'),
    formText('项目名称', { placeholder: '项目名' }),
    formText('申请人', { placeholder: '姓名' }),
    formSelect('资源类型', ['人力支援', '设备', '账号权限', '预算', '其他']),
    formText('需求描述', { placeholder: '如：前端 1 人周' }),
    formNumber('需求数量', { min: '1', step: '1', required: false }),
    formDate('需要起始日'),
    formDate('需要结束日', { required: false }),
    formSelect('紧急程度', ['紧急', '一般', '可延后']),
    formTextarea('必要性说明', { placeholder: '为何需要、不做的影响', rows: 4 }),
  ]
}

function meetingBookingForm(): RteJsonNode[] {
  return [
    h(1, '会议预约表'),
    p('预约会议室或线上会议。'),
    formText('会议主题', { placeholder: '简洁主题' }),
    formText('发起人', { placeholder: '姓名' }),
    formDate('会议日期'),
    formText('开始时间', { placeholder: '如 14:00' }),
    formText('结束时间', { placeholder: '如 15:00' }),
    formSelect('会议形式', ['线下', '线上', '混合']),
    formText('会议室 / 会议号', { placeholder: '地点或链接', required: false }),
    formText('参会人', { placeholder: '姓名，逗号分隔' }),
    formTextarea('议程要点', { placeholder: '讨论事项', rows: 4, required: false }),
    formSwitch('需要投影 / 白板'),
  ]
}

function weeklyProgressForm(): RteJsonNode[] {
  return [
    h(1, '项目周进展填报'),
    p('项目成员每周填报进展。'),
    formText('项目名称', { placeholder: '项目名' }),
    formText('填报人', { placeholder: '姓名' }),
    formDate('周期起始'),
    formDate('周期结束'),
    formSelect('整体状态', ['正常', '有风险', '延期', '暂停']),
    formTextarea('本周完成', { placeholder: '可量化结果', rows: 4 }),
    formTextarea('进行中 / 阻塞', { placeholder: '卡点与需要支持', rows: 3 }),
    formTextarea('下周计划', { placeholder: '重点事项', rows: 3 }),
    formNumber('完成度（%）', { min: '0', max: '100', step: '1', required: false }),
  ]
}

function registrationForm(): RteJsonNode[] {
  return [
    h(1, '登记表'),
    p('请填写以下信息完成登记。标 * 为必填项。'),
    formText('姓名', { placeholder: '请输入真实姓名' }),
    formText('手机号', { placeholder: '11 位手机号' }),
    formText('邮箱', { placeholder: 'name@example.com', required: false }),
    formSelect('部门', ['产品', '研发', '设计', '运营', '市场', '其他']),
    formDate('登记日期'),
    formNumber('同行人数', { min: '0', max: '20', step: '1', required: false }),
    formTextarea('备注', { placeholder: '其他需要说明的信息', required: false }),
    formSwitch('同意接收后续通知'),
  ]
}

function visitorRegisterForm(): RteJsonNode[] {
  return [
    h(1, '访客登记'),
    p('欢迎来访，请填写以下信息。'),
    formText('访客姓名', { placeholder: '姓名' }),
    formText('所属单位', { placeholder: '公司 / 组织' }),
    formText('联系电话', { placeholder: '手机号' }),
    formText('拜访对象', { placeholder: '被访人姓名' }),
    formSelect('来访事由', ['商务洽谈', '面试', '送货', '维修', '参观', '其他']),
    formDate('来访日期'),
    formText('预计停留', { placeholder: '如 1 小时', required: false }),
    formTextarea('备注', { placeholder: '车牌号 / 随行人员等', required: false, rows: 3 }),
  ]
}

function eventSignupForm(): RteJsonNode[] {
  return [
    h(1, '活动报名'),
    p('请填写报名信息，我们会尽快确认名额。'),
    formText('姓名', { placeholder: '真实姓名' }),
    formText('手机号', { placeholder: '11 位手机号' }),
    formText('邮箱', { placeholder: 'name@example.com', required: false }),
    formSelect('参与身份', ['个人', '企业代表', '合作伙伴', '媒体', '其他']),
    formSelect('期望场次', ['上午场', '下午场', '全天', '待定']),
    formNumber('同行人数', { min: '0', max: '10', step: '1', required: false }),
    formCheckbox('关注议题', ['产品发布', '行业趋势', '技术分享', '圆桌讨论', '其他']),
    formTextarea('备注 / 特殊需求', { placeholder: '饮食禁忌、无障碍需求等', required: false, rows: 3 }),
    formSwitch('同意接收活动通知'),
  ]
}

function issueFeedbackForm(): RteJsonNode[] {
  return [
    h(1, '问题反馈'),
    p('请描述您遇到的问题，我们会尽快跟进。'),
    formText('反馈人', { placeholder: '姓名或花名' }),
    formText('联系方式', { placeholder: '手机 / 邮箱', required: false }),
    formSelect('问题类型', ['功能异常', '体验问题', '数据错误', '性能卡顿', '需求建议', '其他']),
    formSelect('影响程度', ['阻断工作', '严重', '一般', '轻微']),
    formText('相关页面 / 模块', { placeholder: '如：画布 / 富文本 / 导入导出' }),
    formDate('发现日期'),
    formTextarea('问题描述', { placeholder: '现象、复现步骤、期望结果', rows: 5 }),
    formTextarea('附件说明', { placeholder: '截图 / 录屏链接等', required: false, rows: 3 }),
  ]
}

function itTicketForm(): RteJsonNode[] {
  return [
    h(1, 'IT 报修单'),
    p('电脑、网络、账号等问题请填本表。'),
    formText('报修人', { placeholder: '姓名' }),
    formSelect('部门', [...DEPT]),
    formText('工位 / 地点', { placeholder: '如：3F-12', required: false }),
    formSelect('问题类别', ['电脑硬件', '软件安装', '网络', '账号权限', '打印机', '其他']),
    formSelect('紧急程度', ['紧急', '高', '中', '低']),
    formDate('发生日期'),
    formTextarea('故障描述', { placeholder: '现象、报错信息、已尝试操作', rows: 5 }),
    formText('联系电话', { placeholder: '方便上门时联系' }),
    formSwitch('可接受远程协助'),
  ]
}

function supplyRequestForm(): RteJsonNode[] {
  return [
    h(1, '办公用品申领'),
    p('申领文具、耗材等办公用品。'),
    formText('申领人', { placeholder: '姓名' }),
    formSelect('部门', [...DEPT]),
    formText('物品名称', { placeholder: '如：A4 纸、签字笔' }),
    formNumber('数量', { min: '1', step: '1' }),
    formSelect('单位', ['个', '盒', '包', '箱', '其他']),
    formDate('申领日期'),
    formTextarea('用途说明', { placeholder: '用途与规格', rows: 3, required: false }),
    formSwitch('急用（优先发放）'),
  ]
}

function carApplyForm(): RteJsonNode[] {
  return [
    h(1, '公务用车申请'),
    p('申请公司车辆请填写。'),
    formText('申请人', { placeholder: '姓名' }),
    formSelect('部门', [...DEPT]),
    formDate('用车日期'),
    formText('出发时间', { placeholder: '如 08:30' }),
    formText('返回时间', { placeholder: '如 18:00', required: false }),
    formText('出发地', { placeholder: '起点' }),
    formText('目的地', { placeholder: '终点' }),
    formNumber('乘车人数', { min: '1', max: '50', step: '1' }),
    formSelect('用车事由', ['客户接待', '机场接送', '外勤办公', '活动保障', '其他']),
    formTextarea('备注', { placeholder: '行李、特殊要求等', required: false, rows: 3 }),
    formSwitch('需要司机'),
  ]
}

function cardApplyForm(): RteJsonNode[] {
  return [
    h(1, '名片印制申请'),
    p('申请印制或加印名片。'),
    formText('姓名（中文）', { placeholder: '名片显示名' }),
    formText('姓名（英文）', { placeholder: '拼音 / 英文名', required: false }),
    formSelect('部门', [...DEPT]),
    formText('职位', { placeholder: '职衔' }),
    formText('手机号', { placeholder: '对外手机' }),
    formText('邮箱', { placeholder: '工作邮箱' }),
    formNumber('印制数量', { min: '50', max: '1000', step: '50' }),
    formDate('期望交付日', { required: false }),
    formTextarea('备注', { placeholder: '地址、二维码等特殊要求', required: false, rows: 3 }),
  ]
}

function simpleSurveyForm(): RteJsonNode[] {
  return [
    h(1, '简易问卷'),
    p('感谢填写。预计 1–2 分钟完成。'),
    formText('您的称呼', { placeholder: '怎么称呼您' }),
    formRadio('整体满意度', ['非常满意', '满意', '一般', '不满意', '非常不满意']),
    formCheckbox('您使用过哪些功能', ['文档编辑', '画布协作', '表单收集', '导入导出', '其他']),
    formSelect('使用频率', ['每天', '每周数次', '每月数次', '偶尔', '首次使用']),
    formNumber('推荐意愿（0–10）', { min: '0', max: '10', step: '1' }),
    formTextarea('建议与反馈', { placeholder: '欢迎写下您的想法', required: false }),
    formDate('填写日期', { required: false }),
  ]
}

function csatSurveyForm(): RteJsonNode[] {
  return [
    h(1, '客户满意度调查'),
    p('您的反馈将帮助我们改进服务。约 2 分钟。'),
    formText('贵公司 / 称呼', { placeholder: '选填', required: false }),
    formRadio('服务态度', ['非常满意', '满意', '一般', '不满意', '非常不满意']),
    formRadio('响应速度', ['非常满意', '满意', '一般', '不满意', '非常不满意']),
    formRadio('专业能力', ['非常满意', '满意', '一般', '不满意', '非常不满意']),
    formRadio('产品体验', ['非常满意', '满意', '一般', '不满意', '非常不满意']),
    formNumber('总体评分（1–10）', { min: '1', max: '10', step: '1' }),
    formCheckbox('最满意的方面', ['功能完整', '易于使用', '稳定可靠', '服务支持', '性价比', '其他']),
    formTextarea('改进建议', { placeholder: '欢迎畅所欲言', required: false, rows: 4 }),
    formSwitch('愿意接受后续回访'),
  ]
}

function employeePulseForm(): RteJsonNode[] {
  return [
    h(1, '员工脉搏调研'),
    p('匿名调研，用于改进团队体验。约 3 分钟。'),
    formSelect('所属部门（可选）', ['产品', '研发', '设计', '运营', '市场', '综合', '不便透露'], { required: false }),
    formRadio('工作负荷', ['过轻', '适中', '偏重', '过重']),
    formRadio('团队协作满意度', ['非常满意', '满意', '一般', '不满意']),
    formRadio('成长机会', ['充足', '一般', '不足', '不清楚']),
    formRadio('是否推荐朋友加入', ['强烈推荐', '推荐', '中立', '不推荐']),
    formNumber('敬业度评分（0–10）', { min: '0', max: '10', step: '1' }),
    formTextarea('最想改善的一点', { placeholder: '一条即可', required: false, rows: 3 }),
    formTextarea('想表扬的人或事', { placeholder: '选填', required: false, rows: 3 }),
  ]
}

function eventFeedbackForm(): RteJsonNode[] {
  return [
    h(1, '活动反馈问卷'),
    p('感谢参与！请花 1 分钟反馈。'),
    formText('您的称呼', { placeholder: '选填', required: false }),
    formSelect('参与场次', ['上午场', '下午场', '全天', '线上']),
    formRadio('内容质量', ['非常好', '好', '一般', '较差']),
    formRadio('组织秩序', ['非常好', '好', '一般', '较差']),
    formCheckbox('最有收获的环节', ['主题演讲', '圆桌讨论', '工作坊', '展区交流', '社交酒会', '其他']),
    formNumber('推荐意愿（0–10）', { min: '0', max: '10', step: '1' }),
    formTextarea('意见建议', { placeholder: '下次希望看到什么', required: false, rows: 4 }),
    formSwitch('希望获取演讲资料'),
  ]
}

function courseEvalForm(): RteJsonNode[] {
  return [
    h(1, '培训课程评价'),
    p('请对本次培训进行评价。'),
    formText('课程名称', { placeholder: '课程名' }),
    formText('讲师', { placeholder: '讲师姓名', required: false }),
    formDate('上课日期'),
    formRadio('内容实用性', ['非常有用', '有用', '一般', '用处不大']),
    formRadio('讲师表现', ['优秀', '良好', '一般', '待提升']),
    formRadio('课程难度', ['偏易', '适中', '偏难']),
    formNumber('综合评分（1–5）', { min: '1', max: '5', step: '1' }),
    formTextarea('收获与建议', { placeholder: '金句、改进点', required: false, rows: 4 }),
    formSwitch('愿意推荐给同事'),
  ]
}

function marketResearchForm(): RteJsonNode[] {
  return [
    h(1, '简易市场调研'),
    p('了解您的需求偏好，约 2 分钟。'),
    formSelect('您的角色', ['企业决策者', '业务负责人', '技术负责人', '个人用户', '其他']),
    formSelect('公司规模', ['1–20 人', '21–100 人', '101–500 人', '500 人以上', '个人 / 不适用']),
    formCheckbox('当前使用过哪些类型工具', ['文档协作', '项目管理', 'CRM', '低代码', '数据分析', '暂无']),
    formRadio('最关注的价值', ['提效', '降本', '协作', '合规安全', '创新体验']),
    formSelect('可接受年费区间', ['1 万以内', '1–5 万', '5–20 万', '20 万以上', '暂不确定']),
    formTextarea('未满足的需求', { placeholder: '痛点描述', required: false, rows: 4 }),
    formSwitch('愿意参与深度访谈'),
    formText('联系方式', { placeholder: '手机 / 邮箱', required: false }),
  ]
}

function bugVoteForm(): RteJsonNode[] {
  return [
    h(1, '产品需求投票'),
    p('帮我们排优先级：选出您最想要的能力。'),
    formText('您的称呼', { placeholder: '选填', required: false }),
    formSelect('使用身份', ['管理员', '编辑者', '只读成员', '试用用户', '其他']),
    formCheckbox('最想优先实现', ['移动端体验', '权限细化', '模板中心', '自动化流程', '数据看板', '开放 API', '其他']),
    formRadio('当前最大痛点', ['学习成本', '性能卡顿', '缺少模板', '协作冲突', '导入导出', '其他']),
    formNumber('该痛点影响程度（1–5）', { min: '1', max: '5', step: '1' }),
    formTextarea('补充说明', { placeholder: '场景与期望', required: false, rows: 4 }),
    formSwitch('愿意参加内测'),
  ]
}

function sealRequestForm(): RteJsonNode[] {
  return [
    h(1, '用章申请'),
    p('请填写用章信息。标 * 为必填项。'),
    formText('申请人', { placeholder: '姓名' }),
    formSelect('部门', ['产品', '研发', '设计', '运营', '市场', '综合', '法务', '其他']),
    formSelect('印章类型', ['公章', '合同章', '财务章', '法人章', '其他']),
    formText('文件名称', { placeholder: '需盖章文件名称' }),
    formNumber('份数', { min: '1', max: '99', step: '1' }),
    formDate('需用日期'),
    formTextarea('用途说明', { placeholder: '用途与对方单位等', rows: 4 }),
    formSwitch('是否外带印章'),
  ]
}

function purchaseRequestForm(): RteJsonNode[] {
  return [
    h(1, '采购申请'),
    p('请填写采购需求。标 * 为必填项。'),
    formText('申请人', { placeholder: '姓名' }),
    formSelect('部门', [...DEPT]),
    formText('物品名称', { placeholder: '采购物品 / 服务' }),
    formNumber('数量', { min: '1', step: '1' }),
    formNumber('预估单价（元）', { min: '0', step: '0.01', required: false }),
    formNumber('预估总价（元）', { min: '0', step: '0.01' }),
    formSelect('紧急程度', ['紧急', '一般', '可延后']),
    formDate('期望到货日期', { required: false }),
    formTextarea('用途与规格说明', { placeholder: '型号、规格、供应商建议等', rows: 4 }),
    formSwitch('已有预算批准'),
  ]
}

function travelApplyForm(): RteJsonNode[] {
  return [
    h(1, '出差申请'),
    p('出差前请提交本申请。'),
    formText('申请人', { placeholder: '姓名' }),
    formSelect('部门', [...DEPT]),
    formText('出差地点', { placeholder: '城市 / 地点' }),
    formDate('出发日期'),
    formDate('返回日期'),
    formNumber('出差天数', { min: '0.5', max: '60', step: '0.5' }),
    formSelect('交通方式', ['高铁', '飞机', '自驾', '其他']),
    formNumber('预估费用（元）', { min: '0', step: '0.01', required: false }),
    formTextarea('出差事由', { placeholder: '目的、拜访对象、预期产出', rows: 4 }),
    formSwitch('需要协助订票 / 酒店'),
  ]
}

function generalApprovalForm(): RteJsonNode[] {
  return [
    h(1, '通用审批单'),
    p('无专用模板时使用本通用审批。'),
    formText('申请人', { placeholder: '姓名' }),
    formSelect('部门', [...DEPT]),
    formText('审批标题', { placeholder: '一句话概括' }),
    formSelect('事项类型', ['费用', '人事', '合同', '行政', '其他']),
    formSelect('紧急程度', ['紧急', '一般', '低']),
    formNumber('涉及金额（元）', { min: '0', step: '0.01', required: false }),
    formDate('期望完成日', { required: false }),
    formTextarea('事项说明', { placeholder: '背景、诉求、附件说明', rows: 5 }),
    formText('建议审批人', { placeholder: '姓名 / 角色', required: false }),
  ]
}

function contractApprovalForm(): RteJsonNode[] {
  return [
    h(1, '合同审批单'),
    p('合同用印 / 签署前审批。'),
    formText('申请人', { placeholder: '姓名' }),
    formSelect('部门', [...DEPT]),
    formText('合同名称', { placeholder: '标题' }),
    formText('对方单位', { placeholder: '全称' }),
    formSelect('合同类型', ['销售', '采购', '服务', '保密', '框架', '其他']),
    formNumber('合同金额（元）', { min: '0', step: '0.01', required: false }),
    formDate('计划签署日'),
    formSelect('我方风险评级', ['低', '中', '高']),
    formTextarea('关键条款摘要', { placeholder: '付款、违约、知识产权等', rows: 4 }),
    formSwitch('法务已预审'),
  ]
}

function accessRequestForm(): RteJsonNode[] {
  return [
    h(1, '系统权限申请'),
    p('申请业务系统或工具权限。'),
    formText('申请人', { placeholder: '姓名' }),
    formSelect('部门', [...DEPT]),
    formText('系统 / 应用', { placeholder: '如：CRM / 代码仓库' }),
    formSelect('权限类型', ['只读', '编辑', '管理', '管理员', '其他']),
    formText('账号标识', { placeholder: '邮箱 / 工号', required: false }),
    formDate('生效日期'),
    formDate('失效日期', { required: false }),
    formTextarea('申请理由', { placeholder: '工作需要说明', rows: 4 }),
    formSwitch('已获得直属上级口头同意'),
  ]
}

function giftApplyForm(): RteJsonNode[] {
  return [
    h(1, '商务礼品申领'),
    p('客户礼品 / 伴手礼申领审批。'),
    formText('申请人', { placeholder: '姓名' }),
    formSelect('部门', [...DEPT]),
    formText('赠送对象', { placeholder: '客户 / 活动名称' }),
    formSelect('礼品类型', ['伴手礼', '节日礼盒', '定制周边', '样品', '其他']),
    formNumber('数量', { min: '1', step: '1' }),
    formNumber('预算合计（元）', { min: '0', step: '0.01' }),
    formDate('需要日期'),
    formTextarea('用途说明', { placeholder: '拜访、答谢、活动等', rows: 3 }),
    formSwitch('已列入费用预算'),
  ]
}

function publishApprovalForm(): RteJsonNode[] {
  return [
    h(1, '发文 / 公告审批'),
    p('正式发文或全员公告前审批。'),
    formText('起草人', { placeholder: '姓名' }),
    formSelect('发文部门', [...DEPT]),
    formText('文件标题', { placeholder: '公告 / 制度标题' }),
    formSelect('文件类型', ['通知', '制度', '任免', '表彰', '其他']),
    formSelect('发布范围', ['全员', '指定部门', '管理层', '外部']),
    formDate('计划发布日'),
    formDate('生效日期', { required: false }),
    formTextarea('内容摘要', { placeholder: '要点说明', rows: 4 }),
    formSwitch('需要法定代表人签发'),
  ]
}

/** 表单类分组（插入到文档类分组之后） */
export const RTE_FORM_TEMPLATE_GROUPS: Array<{ id: RteDocTemplateGroup; label: string }> = [
  { id: 'formHr', label: '人事/行政表单' },
  { id: 'formSales', label: '销售/客户表单' },
  { id: 'formFinance', label: '财务表单' },
  { id: 'formProject', label: '项目表单' },
  { id: 'formOffice', label: '日常办公表单' },
  { id: 'formSurvey', label: '问卷调研表单' },
  { id: 'formApproval', label: '审批流表单' },
]

export const RTE_FORM_DOC_TEMPLATES: RteDocTemplate[] = [
  { id: 'leave-request', label: '请假申请', description: '类型、日期与交接确认', group: 'formHr' as RteDocTemplateGroup, build: wrapBuild(leaveRequestForm) },
  { id: 'overtime-request', label: '加班申请', description: '加班时段、事由与用餐', group: 'formHr' as RteDocTemplateGroup, build: wrapBuild(overtimeRequestForm) },
  { id: 'resign-handover', label: '离职交接', description: '资产、权限与工作移交', group: 'formHr' as RteDocTemplateGroup, build: wrapBuild(resignHandoverForm) },
  { id: 'recruit-req', label: '招聘需求', description: '岗位、人数与到岗时间', group: 'formHr' as RteDocTemplateGroup, build: wrapBuild(recruitReqForm) },
  { id: 'interview-eval', label: '面试评价', description: '评分、结论与下一步', group: 'formHr' as RteDocTemplateGroup, build: wrapBuild(interviewEvalForm) },
  { id: 'training-signup', label: '培训报名', description: '课程、场次与特殊需求', group: 'formHr' as RteDocTemplateGroup, build: wrapBuild(trainingSignupForm) },
  { id: 'asset-claim', label: '资产领用', description: '设备类型、用途与归还', group: 'formHr' as RteDocTemplateGroup, build: wrapBuild(assetClaimForm) },
  { id: 'attendance-exception', label: '考勤异常', description: '异常类型、日期与说明', group: 'formHr' as RteDocTemplateGroup, build: wrapBuild(attendanceExceptionForm) },
  { id: 'lead-intake', label: '线索登记', description: '来源、客户与意向', group: 'formSales' as RteDocTemplateGroup, build: wrapBuild(leadIntakeForm) },
  { id: 'customer-visit', label: '客户拜访', description: '拜访方式、纪要与下一步', group: 'formSales' as RteDocTemplateGroup, build: wrapBuild(customerVisitForm) },
  { id: 'quote-apply', label: '报价申请', description: '产品、折扣与有效期', group: 'formSales' as RteDocTemplateGroup, build: wrapBuild(quoteApplyForm) },
  { id: 'contract-info', label: '合同信息', description: '甲乙方、金额与期限', group: 'formSales' as RteDocTemplateGroup, build: wrapBuild(contractInfoForm) },
  { id: 'aftersale-ticket', label: '售后工单', description: '问题类型、紧急度与描述', group: 'formSales' as RteDocTemplateGroup, build: wrapBuild(aftersaleTicketForm) },
  { id: 'nps-callback', label: '回访登记', description: '满意度与续约意向', group: 'formSales' as RteDocTemplateGroup, build: wrapBuild(npsCallbackForm) },
  { id: 'partner-apply', label: '渠道伙伴', description: '合作类型与覆盖区域', group: 'formSales' as RteDocTemplateGroup, build: wrapBuild(partnerApplyForm) },
  { id: 'expense-claim', label: '报销申请', description: '类型、金额与凭证', group: 'formFinance' as RteDocTemplateGroup, build: wrapBuild(expenseClaimForm) },
  { id: 'travel-loan', label: '差旅借款', description: '目的地、预算与归还', group: 'formFinance' as RteDocTemplateGroup, build: wrapBuild(travelLoanForm) },
  { id: 'payment-request', label: '付款申请', description: '收款方、金额与方式', group: 'formFinance' as RteDocTemplateGroup, build: wrapBuild(paymentRequestForm) },
  { id: 'invoice-apply', label: '开票申请', description: '抬头、税号与金额', group: 'formFinance' as RteDocTemplateGroup, build: wrapBuild(invoiceApplyForm) },
  { id: 'budget-apply', label: '预算申请', description: '科目、周期与金额', group: 'formFinance' as RteDocTemplateGroup, build: wrapBuild(budgetApplyForm) },
  { id: 'petty-cash', label: '备用金', description: '申领、额度与用途', group: 'formFinance' as RteDocTemplateGroup, build: wrapBuild(pettyCashForm) },
  { id: 'salary-adjust', label: '调薪申请', description: '调薪幅度与理由', group: 'formFinance' as RteDocTemplateGroup, build: wrapBuild(salaryAdjustForm) },
  { id: 'project-init-form', label: '立项申请', description: '目标、预算与里程碑', group: 'formProject' as RteDocTemplateGroup, build: wrapBuild(projectInitForm) },
  { id: 'change-request-form', label: '变更申请', description: '变更内容与影响评估', group: 'formProject' as RteDocTemplateGroup, build: wrapBuild(changeRequestForm) },
  { id: 'risk-report-form', label: '风险上报', description: '可能性、影响与应对', group: 'formProject' as RteDocTemplateGroup, build: wrapBuild(riskReportForm) },
  { id: 'task-accept', label: '任务验收', description: '交付物与验收结论', group: 'formProject' as RteDocTemplateGroup, build: wrapBuild(taskAcceptForm) },
  { id: 'resource-request', label: '资源申请', description: '人力、设备与时间', group: 'formProject' as RteDocTemplateGroup, build: wrapBuild(resourceRequestForm) },
  { id: 'meeting-booking', label: '会议预约', description: '时间、参会人与议题', group: 'formProject' as RteDocTemplateGroup, build: wrapBuild(meetingBookingForm) },
  { id: 'weekly-progress', label: '周进展填报', description: '完成、风险与下周', group: 'formProject' as RteDocTemplateGroup, build: wrapBuild(weeklyProgressForm) },
  { id: 'registration-form', label: '登记表', description: '姓名、联系方式与部门等', group: 'formOffice' as RteDocTemplateGroup, build: wrapBuild(registrationForm) },
  { id: 'visitor-register', label: '访客登记', description: '来访信息与事由', group: 'formOffice' as RteDocTemplateGroup, build: wrapBuild(visitorRegisterForm) },
  { id: 'event-signup', label: '活动报名', description: '场次、议题与联系方式', group: 'formOffice' as RteDocTemplateGroup, build: wrapBuild(eventSignupForm) },
  { id: 'issue-feedback', label: '问题反馈', description: '类型、影响与复现描述', group: 'formOffice' as RteDocTemplateGroup, build: wrapBuild(issueFeedbackForm) },
  { id: 'it-ticket', label: 'IT 报修', description: '故障设备与紧急度', group: 'formOffice' as RteDocTemplateGroup, build: wrapBuild(itTicketForm) },
  { id: 'supply-request', label: '办公用品', description: '物品、数量与用途', group: 'formOffice' as RteDocTemplateGroup, build: wrapBuild(supplyRequestForm) },
  { id: 'car-apply', label: '用车申请', description: '行程、人数与司机', group: 'formOffice' as RteDocTemplateGroup, build: wrapBuild(carApplyForm) },
  { id: 'card-apply', label: '名片申请', description: '姓名、职位与数量', group: 'formOffice' as RteDocTemplateGroup, build: wrapBuild(cardApplyForm) },
  { id: 'simple-survey', label: '简易问卷', description: '满意度与建议收集', group: 'formSurvey' as RteDocTemplateGroup, build: wrapBuild(simpleSurveyForm) },
  { id: 'csat-survey', label: '满意度调查', description: '服务评分与改进建议', group: 'formSurvey' as RteDocTemplateGroup, build: wrapBuild(csatSurveyForm) },
  { id: 'employee-pulse', label: '员工脉搏', description: '工作体验匿名调研', group: 'formSurvey' as RteDocTemplateGroup, build: wrapBuild(employeePulseForm) },
  { id: 'event-feedback', label: '活动反馈', description: '内容、组织与推荐度', group: 'formSurvey' as RteDocTemplateGroup, build: wrapBuild(eventFeedbackForm) },
  { id: 'course-eval', label: '课程评价', description: '讲师、内容与难度', group: 'formSurvey' as RteDocTemplateGroup, build: wrapBuild(courseEvalForm) },
  { id: 'market-research', label: '市场调研', description: '认知、偏好与预算', group: 'formSurvey' as RteDocTemplateGroup, build: wrapBuild(marketResearchForm) },
  { id: 'bug-vote', label: '需求投票', description: '痛点投票与补充', group: 'formSurvey' as RteDocTemplateGroup, build: wrapBuild(bugVoteForm) },
  { id: 'seal-request', label: '用章申请', description: '印章类型与用途', group: 'formApproval' as RteDocTemplateGroup, build: wrapBuild(sealRequestForm) },
  { id: 'purchase-request', label: '采购申请', description: '物品、数量与预算', group: 'formApproval' as RteDocTemplateGroup, build: wrapBuild(purchaseRequestForm) },
  { id: 'travel-apply', label: '出差申请', description: '地点、天数与预算', group: 'formApproval' as RteDocTemplateGroup, build: wrapBuild(travelApplyForm) },
  { id: 'general-approval', label: '通用审批', description: '事项、金额与紧急度', group: 'formApproval' as RteDocTemplateGroup, build: wrapBuild(generalApprovalForm) },
  { id: 'contract-approval', label: '合同审批', description: '对方、金额与风险', group: 'formApproval' as RteDocTemplateGroup, build: wrapBuild(contractApprovalForm) },
  { id: 'access-request', label: '权限申请', description: '系统、角色与期限', group: 'formApproval' as RteDocTemplateGroup, build: wrapBuild(accessRequestForm) },
  { id: 'gift-apply', label: '礼品申领', description: '对象、预算与用途', group: 'formApproval' as RteDocTemplateGroup, build: wrapBuild(giftApplyForm) },
  { id: 'publish-approval', label: '发文审批', description: '文号、范围与生效', group: 'formApproval' as RteDocTemplateGroup, build: wrapBuild(publishApprovalForm) },
]
