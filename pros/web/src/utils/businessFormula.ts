/** 业务公式：解析、布局、模板（移植自 ywgs / 业务公式 Pro） */
export type LayoutDirection = 'horizontal' | 'vertical'
export type PaletteName = 'rainbow' | 'classic' | 'business' | 'warm' | 'cool'

export interface FormulaNode {
  name: string
  depth: number
  children: FormulaNode[]
  operators: string[]
  totalHeight: number
  x: number
  y: number
}

export interface FormulaLink {
  d: string
  colorIndex: number
  op: string
  badgeX: number
  badgeY: number
}

export interface FormulaFlatNode {
  name: string
  depth: number
  x: number
  y: number
  displayName: string
}

export interface DiagramModel {
  nodes: FormulaFlatNode[]
  links: FormulaLink[]
}

export type IndustryId =
  | 'ecommerce_retail'
  | 'local_life'
  | 'platform_internet'
  | 'enterprise_service'
  | 'manufacturing_energy'
  | 'finance_insurance'
  | 'content_media'
  | 'health_edu'
  | 'other'

export type FormulaTypeId =
  | 'growth_funnel'
  | 'finance_perf'
  | 'user_value'
  | 'ops_supply'
  | 'engagement'
  | 'ad_roi'
  | 'general'

export interface TemplateButton {
  key: string
  label: string
  icon: string
  emoji: string
  industry: IndustryId
  formulaType: FormulaTypeId
}

export interface FilterOption {
  id: string
  label: string
}

export interface SavedFormula {
  name: string
  content: string
}


export const FORMULA_TEMPLATES: Record<string, string> = {
  "ecommerce": "女装店收入 = 流量指标 * 转化指标 * 客单价指标\n流量指标 = 进店人数 + 站外引流\n进店人数 = 站内流量 + 站外流量\n付费转化率 = 详情页转化 * 支付转化\n转化指标 = 付费转化率 + 详情页转化\n客单价指标 = 平均件单价 * 人均购买件数\n平均件单价 = 基础价 * 折扣率",
  "saas": "MRR = 客户指标 * ARPU指标 + 本月新增\n客户指标 = 存量客户 + 新增客户\n存量客户 = 上月存量 - 流失客户数\n本月新增 = 线索量 * 试用转化率 * 成交率\n流失客户数 = 存量客户 * 流失率\nARPU指标 = 基础订阅 + 增值服务",
  "retail": "单店产出 = 客流指标 * 转化指标 * 客单价指标\n客流指标 = 橱窗客流 * 进店率\n转化率 = 试穿率 * 购买率\n转化指标 = 转化率 + 试穿率\n客单价指标 = 连带率 * 平均单价\n平均单价 = 基础价 * 折扣率",
  "content": "内容总收益 = 阅读量指标 * 收益指标\n阅读量指标 = 粉丝分发 + 算法推荐 + 社群传播\n粉丝分发 = 粉丝数 * 打开率\n算法推荐 = 内容质量分 * 关键词权重\n社群传播 = 社群用户 * 分享率\n收益指标 = 千次阅读收益 + 广告分成\n内容质量分 = 点击率 + 点赞率 * 2 + 完读率 * 5",
  "education": "课程收入 = 学员指标 * 客单价指标\n学员指标 = 试听转化 * 咨询转化 * 促单转化\n咨询转化 = 试听人数 * 课程匹配度 * 顾问能力\n促单转化 = 转化率 * 成交率\n客单价指标 = 课程定价 * 优惠系数",
  "private": "私域GMV = 社群产出 + 直播产出 + 1对1产出\n社群产出 = 社群人数 * 人均产出\n社群人数 = 存量用户 + 新增用户 - 流失用户\n新增用户 = 裂变新增 + 内容新增 + 活动新增\n流失用户 = 社群人数 * 流失率\n人均产出 = 互动率 * 转化率 * 客单价",
  "restaurant": "餐饮营收 = 内场营收 + 外卖营收\n内场营收 = 堂食客流 * 客单价 * 翻台率\n堂食客流 = 自然客流 * 截流率\n截流率 = 门口曝光 * 入店转化\n外卖营收 = 线上订单 * 平均单价 * 平台抽成",
  "livestream": "直播GMV = 场观人数 * 停留时长 * 千次观看产出\n场观人数 = 短视频引流 + 付费投流 + 粉丝召回\n停留时长 = 互动率 * 内容吸引力 * 话术转化\n千次观看产出 = 点击转化率 * 付款转化率 * 客单价",
  "medical": "医院营收 = 门诊收入 + 住院收入 + 体检收入\n门诊收入 = 挂号人次 * 均次费用 * 看诊转化\n住院收入 = 在院人数 * 日均费用 * 平均住院天数\n体检收入 = 体检人数 * 客单价 * 深度检查率\n均次费用 = 药品收入占比 * 检验收入占比 * 治疗收入占比",
  "realestate": "中介佣金 = 二手房佣金 + 新房佣金 + 租赁佣金\n二手房佣金 = 成交套数 * 成交均价 * 费率\n新房佣金 = 带看组数 * 成交转化率 * 单套佣金\n租赁佣金 = 租赁单数 * 月租金 * 收费月数\n成交套数 = 有效客户 * 需求匹配度 * 成交意愿度",
  "finance": "基金销售收入 = 管理费收入 + 申赎费收入 + 投顾服务费\n管理费收入 = AUM规模 * 综合管理费率\nAUM规模 = 存量规模 * 保有率 + 新增规模\n保有率 = 1 - 赎回率\n申赎费收入 = 认申购额 * 申赎费率均值 * 前端费率占比",
  "insurance": "保险佣金 = 首年指标 + 续期指标\n首年指标 = 新单保费 * 首年佣金率\n新单保费 = 有效拜访量 * 拜访转化率 * 件均保费\n有效拜访量 = 名单量 * 电话接通率 * 约见成功率\n件均保费 = 主险件均 + 附加险件均 * 组合率\n续期指标 = 续期佣金 + 团队管理津贴",
  "gaming": "游戏流水 = 内购收入 + 广告收入 + 订阅收入\n内购收入 = 活跃用户 * 付费率 * ARPU\n活跃用户 = 新增用户 * 次留率 * 回流率\n付费率 = 付费人数 / 活跃人数\nARPU = 首充金额 * 充值频次 + 累计充值 * 付费深度",
  "logistics": "物流营收 = 快递指标 + 快运指标 + 仓储指标\n快递指标 = 揽件量 * 均重 * 单价 * 增值服务率\n揽件量 = 上门客户数 * 下单转化 * 客均件数\n快运指标 = 票数 * 票均重量 * 干线单价 * 增值系数\n仓储指标 = 库存容量 * 库容利用率 * 仓储单价",
  "hotel": "酒店营收 = 客房指标 + 餐饮指标\n客房指标 = 可售房数 * 出租率 * 平均房价\n出租率 = 实际出租间夜 / 可售间夜\n平均房价 = ADR指数 * 市场均价 * 溢价系数\n餐饮指标 = 早餐收入 + 中晚餐收入 + 宴会收入",
  "tourism": "旅游营收 = 门票指标 + 住宿指标\n门票指标 = 客流量 * 门票单价 * 二次入园率\n客流量 = 线上渠道 + 线下渠道 + 团队渠道\n住宿指标 = 入住率 * 房间数 * 均价 * 平均天数",
  "beauty": "美容院营收 = 疗程指标 + 产品指标 + 会员指标\n疗程指标 = 新客成交 * 疗程单价 + 老客复购 * 疗程单价\n新客成交 = 咨询人数 * 体验转化率 * 成交转化率\n老客复购 = 存量客户 * 复购率 * 升单率\n产品指标 = 办卡人数 * 会员等级 * 平均充值金额",
  "fitness": "健身房营收 = 会籍指标 + 私教指标 + 课程指标\n会籍指标 = 新入会人数 * 年卡均价 + 续会人数 * 续会折扣\n新入会人数 = 潜客量 * 到店率 * 转化率\n私教指标 = 私教课时数 * 课时单价 * 续课率\n续课率 = 满意客户占比 * 需求匹配度\n课程指标 = 开课数 * 班均人数 * 课程单价",
  "auto": "4S店营收 = 销售指标 + 服务指标 + 保险指标\n销售指标 = 展厅客流 * 成交率 * 车价毛利\n展厅客流 = 自然进店 + 电话邀约 + 老带新\n服务指标 = 进场台次 * 客单价 * 进场频次\n保险指标 = 新保保费 * 手续费率 + 续保保费 * 续保手续费率",
  "farm": "农产品营收 = 线上指标 + 线下指标 + 体验采摘 + 会员配送\n线上指标 = 订单量 * 客单价 * 复购率\n线下指标 = 批发商数量 * 批发频次 * 批发均价\n体验采摘 = 体验人次 * 人均消费 * 转化会员率\n会员配送 = 会员数量 * 月均订单 * 月均消费",
  "beautyProd": "美妆品牌营收 = 电商指标 + 私域指标\n电商指标 = 天猫收入 + 抖音收入\n天猫收入 = 访客数 * 转化率 * 客单价\n访客数 = 搜索流量 + 付费流量 + 内容流量\n转化率 = 点击率 * 成交率\n抖音收入 = GMV * 退货率 * 佣金扣点\n私域指标 = 社群人数 * 人均产出 * 转化率",
  "furniture": "家具营收 = 零售指标 + 工程指标 + 定制指标\n零售指标 = 进店客流 * 留资率 * 成交率 * 客单价\n工程指标 = 中标项目数 * 项目规模 * 工程折扣\n定制指标 = 订单数 * 投影面积 * 单价 * 五金系数",
  "hotelTravel": "旅行社营收 = 跟团游指标 + 自由行指标 + 定制游指标\n跟团游指标 = 出团数 * 团均人数 * 人均团费 * 利润分成\n自由行指标 = 机票收入 + 酒店收入 + 门票收入\n机票收入 = 出票量 * 平均票价 * 代理费率\n定制游指标 = 订单数 * 定制客单价 * 服务费率",
  "cleaning": "家政营收 = 服务指标 + 保姆指标\n服务指标 = 保洁收入 + 清洗收入 + 收纳收入\n保洁收入 = 服务单量 * 单次价格 * 复购率\n清洗收入 = 空调清洗数 * 均价 + 油烟机清洗数 * 均价\n收纳收入 = 上门次数 * 次均价格 * 转化收纳套餐率\n保姆指标 = 在岗保姆数 * 月均服务费 * 中介费率",
  "repair": "维修营收 = 维修指标 + 配件指标 + 延保指标\n维修指标 = 上门维修 + 寄修服务\n上门维修 = 订单数 * 均价 * 上门成功率\n寄修服务 = 寄修件数 * 维修均价 * 修复率\n配件指标 = 配件SKU数 * 周转率 * 配件毛利率\n延保指标 = 销售台数 * 延保单价 * 延保转化率",
  "pet": "宠物店营收 = 服务指标 + 商品指标\n服务指标 = 洗美收入 + 医疗收入\n洗美收入 = 到店宠物数 * 洗美均价 * 月均频次\n医疗收入 = 就诊数 * 客单价 * 手术转化率\n商品指标 = 食品收入 + 活体收入\n食品收入 = 客户数 * 月均消费 * 食品毛利率\n活体收入 = 引进只数 * 加价率 * 成活率",
  "florist": "花店营收 = 零售指标 + 定制指标\n零售指标 = 客流 * 成交率 * 客单价\n定制指标 = 婚礼布置 + 绿植租摆 + 企业定制\n婚礼布置 = 接单数 * 场均单价 * 道具复用率\n绿植租摆 = 租摆数量 * 月租单价 * 续租率\n企业定制 = 企业客户数 * 年均消费 * 复购率",
  "photography": "摄影营收 = 摄影指标 + 直播指标\n摄影指标 = 婚纱摄影 + 儿童摄影 + 商业摄影\n婚纱摄影 = 接单数 * 套系均价 * 后期加片率\n儿童摄影 = 到店儿童数 * 套系选择率 * 精修张数\n商业摄影 = 拍摄天数 * 日均报价 * 后期调色费\n直播指标 = 活动场次 * 观看人次 * 人均转化",
  "educationTrain": "培训营收 = 教育指标 + 认证指标\n教育指标 = 线下面授 + 在线课程 + 企业培训\n线下面授 = 开班期数 * 班均人数 * 课程单价\n在线课程 = 学员数 * 课程定价 * 完课率\n企业培训 = 签约企业数 * 企均单价 * 交付满意度\n认证指标 = 报考人数 * 报考费 * 通过率 * 补考率",
  "consulting": "咨询营收 = 咨询指标 + 培训指标\n咨询指标 = 战略咨询 + 管理咨询 + 数字化咨询\n战略咨询 = 项目数 * 项目均价 * 项目周期\n管理咨询 = 顾问人数 * 人天单价 * 人均产值\n数字化咨询 = 方案报价 * 实施折扣 * 验收通过率\n培训指标 = 辅导场次 * 场次均价 * 客户满意度",
  "law": "律所营收 = 诉讼指标 + 非诉指标 + 法律顾问 + 尽职调查\n诉讼指标 = 立案数 * 案件均价 * 胜诉率 * 加权系数\n非诉指标 = 服务时长 * 小时费率 * 业务难度系数\n法律顾问 = 顾问单位数 * 年费标准 * 续约率\n尽职调查 = 调查项目数 * 项目规模 * 收费梯度",
  "hr": "人力资源营收 = 猎头指标 + RPO指标 + 派遣指标\n猎头指标 = 成功职位数 * 职位均价 * 猎头费率\nRPO指标 = 招聘岗位数 * 岗位均价 * RPO费率\n派遣指标 = 派遣人数 * 人月均价 * 管理费率",
  "it": "IT外包营收 = 人力指标 + 项目指标 + 运维指标\n人力指标 = 外派人数 * 人月单价 * 在岗月数\n项目指标 = 项目数量 * 项目均价 * 项目完成率\n运维指标 = 签约客户数 * 年服务费 * 续约率",
  "design": "设计营收 = 设计指标 + 数字指标\n设计指标 = 品牌设计 + 空间设计 + 产品设计\n品牌设计 = 项目数 * 项目均价 * 提案通过率\n空间设计 = 设计面积 * 单位报价 * 施工配合费\n产品设计 = 开发项目数 * 项目均价 * 打样通过率\n数字指标 = 页面数量 * 页面单价 * 客户满意率",
  "marketing": "营销Agency营收 = 策略指标 + 投放指标 + 执行指标\n策略指标 = 项目数 * 服务月费 * 策略通过率\n投放指标 = 媒介投放 + 内容创作\n媒介投放 = 投放金额 * 代理折扣 * 效果达成率\n内容创作 = 内容数量 * 内容单价 * 客户复用率\n执行指标 = 活动场次 * 场次均价 * 执行满意度",
  "advertising": "广告营收 = 品牌指标 + 效果指标 + 数字指标\n品牌指标 = 投放品牌数 * 品牌均价 * 续约率\n效果指标 = 消耗金额 * 返点系数 * 转化达成率\n数字指标 = 曝光量 * CPM单价 * 点击转化率",
  "media": "媒体营收 = 订阅指标 + 广告指标 + 版权指标\n订阅指标 = 付费用户数 * 订阅单价 * 续订率\n广告指标 = 广告位 * 填充率 * CPM * 有效曝光\n版权指标 = IP授权数 * 授权单价 * 授权期限",
  "newsletter": "知识付费营收 = 课程指标 + 会员指标\n课程指标 = 专栏订阅 + 单课购买\n专栏订阅 = 订阅人数 * 专栏年费 * 内容更新率\n单课购买 = 购课人数 * 课程单价 * 完课率\n会员指标 = 会员订阅 + 付费社群\n会员订阅 = 会员人数 * 月费标准 * 月活跃率\n付费社群 = 入群人数 * 入群费用 * 年均活跃月",
  "community": "社区运营营收 = 流量指标 + 电商指标 + 会员指标\n流量指标 = 广告收入\n广告收入 = DAU * 广告加载率 * CPM * 有效点击率\n电商指标 = 商品曝光 * 点击率 * 转化率 * 客单价\n会员指标 = 会员数 * 会员年费 * 权益使用率",
  "didi": "出行平台营收 = 快车指标 + 专车指标 + 顺风车指标\n快车指标 = 完单量 * 客单价 * 抽成比例\n完单量 = 日活司机 * 人均单量 * 出勤率\n专车指标 = 专车订单 * 专车均价 * 专车抽成\n顺风车指标 = 顺风车单数 * 均价 * 平台抽成",
  "delivery": "外卖平台营收 = GMV指标 + 配送指标\nGMV指标 = 抽佣收入 + 广告收入\n抽佣收入 = GMV * 抽佣率 * 有效订单占比\nGMV = 活跃商家数 * 日均订单 * 均价 * 天数\n广告收入 = 商家数 * 广告渗透率 * 户均广告消耗\n配送指标 = 配送单量 * 配送单价 * 配送效率",
  "shortvideo": "短视频营收 = 直播指标 + 内容指标\n直播指标 = 直播打赏 + 直播带货\n直播打赏 = 直播时长 * 观众人数 * 打赏转化率 * 均值\n直播带货 = GMV * 佣金率 * 退货系数\n内容指标 = 广告植入 + 知识付费\n广告植入 = 视频数 * 视频均价 * 完播率\n知识付费 = 付费用户 * 课程单价 * 完课率",
  "ecommercePinduoduo": "拼多多营收 = 佣金指标 + 广告指标 + 增值服务 + 佣金返利\n佣金指标 = GMV * 佣金率 * 退款率\n广告指标 = 付费商家数 * 户均消耗 * 消耗增速\n增值服务 = 服务商家数 * 户均服务费 * 服务渗透率\n佣金返利 = 支付佣金 * 返利比例 * 返利条件达成率",
  "cloud": "云服务营收 = IaaS指标 + PaaS指标 + SaaS指标\nIaaS指标 = 主机数 * 均价 * 使用时长 * 续费率\nPaaS指标 = API调用量 * 单价 * 套餐渗透率\nSaaS指标 = 付费用户数 * ARPU * 续费率",
  "security": "安全服务营收 = 产品指标 + 服务指标\n产品指标 = 销售许可证数 * 产品均价 * 续费转化率\n服务指标 = 安全服务 + 安全培训 + 应急响应\n安全服务 = 服务天数 * 人天单价 * 客户满意度\n应急响应 = 响应次数 * 次均收费 * 响应时效系数",
  "data": "数据服务营收 = 采集指标 + 分析指标\n采集指标 = 数据量 * 采集单价 * 采集质量\n数据清洗 = 脏数据量 * 清洗单价 * 清洗合格率\n分析指标 = 分析项目数 * 项目均价 * 报告通过率\n数据产品 = API调用量 * 调用单价 * 调用稳定性",
  "ai": "AI服务营收 = API指标 + 算力指标 + 定制开发 + 模型训练\nAPI指标 = 调用次数 * 单次价格 * 套餐升级率\n定制开发 = 开发人月 * 人月单价 * 验收通过率\n算力指标 = GPU数量 * 小时单价 * 使用时长\n模型训练 = 训练任务数 * 任务均价 * 训练成功率",
  "blockchain": "区块链营收 = 开发指标 + 运营指标 + 智能合约\n开发指标 = 项目数 * 开发均价 * 技术难度系数\n智能合约 = 合约数 * 合约均价 * 审计通过率\n运营指标 = DApp运营 + 咨询培训\nDApp运营 = 活跃用户 * 人均消费 * 留存率",
  "chip": "芯片设计营收 = 销售指标 + 设计指标\n销售指标 = 出货量 * 芯片单价 * 毛利率\nIP授权 = 授权客户数 * 授权单价 * 授权年限\n设计指标 = 设计项目数 * 项目均价 * 验收通过率\n流片服务 = 流片次数 * 流片均价 * 良率系数",
  "autoParts": "汽车配件营收 = 配套指标 + 电商指标\n配套指标 = OEM配套 + 售后配件\nOEM配套 = 车型覆盖数 * 套均单价 * 供货份额\n售后配件 = 维修站数 * 配件渗透率 * 配件周转率\n电商指标 = 出口业务 + 电商平台\n出口业务 = 出口订单量 * 出口单价 * 汇率系数\n电商平台 = SKU数 * 转化率 * 客单价",
  "newEnergy": "新能源营收 = 产品指标 + 服务指标\n产品指标 = 光伏产品 + 储能产品\n光伏产品 = 出货量 * 组件单价 * 毛利率\n储能产品 = 出货量 * 系统单价 * 系统毛利率\n服务指标 = 系统集成 + 运维服务\n运维服务 = 运维电站数 * 年运维费 * 运维续约率",
  "battery": "电池营收 = 销售指标 + 回收指标\n销售指标 = 电芯销售 + PACK销售\n电芯销售 = 出货量 * 电芯单价 * 材料成本系数\nPACK销售 = PACK数量 * PACK单价 * 毛利率\n回收指标 = 回收利用 + 技术服务\n技术服务 = 技术支持项目数 * 项目均价 * 验收通过率",
  "semiconductor": "半导体营收 = 制造指标 + 设计指标 + 材料销售\n制造指标 = 晶圆制造 + 封装测试\n晶圆制造 = 晶圆片数 * 晶圆单价 * 良率系数\n封装测试 = 封装数量 * 封装单价 * 测试良率\n设计指标 = 设计项目数 * 设计费均价 * 流片成功率\n材料销售 = 材料销售量 * 材料单价 * 客户复购率",
  "robot": "机器人营收 = 产品指标 + 服务指标 + 售后服务\n产品指标 = 工业机器人 + 服务机器人 + 核心零部件\n工业机器人 = 出货量 * 机器人单价 * 毛利率\n服务机器人 = 应用场景数 * 场景单价 * 场景渗透率\n核心零部件 = 零部件出货量 * 零部件单价 * 配套率\n服务指标 = 售后服务\n售后服务 = 维保合同数 * 合同均价 * 续约率",
  "biomed": "生物医药营收 = 研发指标 + 销售指标+CRO服务\n研发指标 = 在研项目数 * 项目进度 * 里程碑收入\n销售指标 = 试剂销售 + 医学检测\n试剂销售 = 试剂销量 * 试剂单价 * 渠道渗透率\nCRO服务 = 临床试验数 * 试验均价 * 试验完成率\n医学检测 = 检测样本数 * 检测单价 * 阳性检出率",
  "medicalDevice": "医疗器械营收 = 设备指标 + 服务指标 + 耗材销售 + 租赁服务\n设备指标 = 装机医院数 * 设备均价 * 市场占有率\n耗材销售 = 装机量 * 耗材月用量 * 耗材单价\n服务指标 = 维保服务 + 租赁服务\n租赁服务 = 租赁设备数 * 月租单价 * 租赁时长",
  "eldercare": "养老服务营收 = 机构指标 + 居家指标 + 健康管理\n机构指标 = 入住床位数 * 床位均价 * 入住率\n社区养老 = 服务站点数 * 站点收入 * 服务频次\n居家指标 = 服务老人数 * 每次价格 * 月均服务次数\n健康管理 = 会员数 * 年费标准 * 服务激活率",
  "childcare": "母婴服务营收 = 服务指标 + 商品指标 + 母婴用品\n服务指标 = 月嫂服务 + 育儿嫂 + 产后康复\n月嫂服务 = 月嫂数量 * 月均工资 * 管理费率\n育儿嫂 = 育儿嫂数量 * 月均服务费 * 中介费率\n产后康复 = 产后妈妈数 * 康复套餐均价 * 套餐渗透率\n商品指标 = 母婴用品\n母婴用品 = 门店客流 * 转化率 * 客单价",
  "laundry": "干洗营收 = 洗涤指标 + 团购指标\n洗涤指标 = 衣物洗涤 + 皮具护理 + 奢侈品养护\n衣物洗涤 = 衣物件数 * 洗涤均价 * 会员折扣\n皮具护理 = 皮具件数 * 护理均价 * 护理等级系数\n奢侈品养护 = 奢侈品件数 * 养护均价 * 品牌系数\n团购指标 = 合作酒店数 * 日均洗涤量 * 洗涤单价",
  "carWash": "洗车营收 = 洗车指标 + 会员指标 + 广告收入\n洗车指标 = 精洗收入 + 打蜡镀晶 + 内饰清洁\n精洗收入 = 洗车台次 * 精洗单价 * 会员折扣\n打蜡镀晶 = 施工台次 * 施工单价 * 材质系数\n内饰清洁 = 清洁台次 * 清洁均价 * 清洁深度系数\n会员指标 = 新办卡数 * 卡均金额 * 续卡率",
  "parking": "停车场营收 = 停车指标 + 充电指标 + 广告收入\n停车指标 = 车位总数 * 车位利用率 * 每小时均价 * 平均停车时长\n广告收入 = 停车场数量 * 媒体位数 * 单价 * 刊挂率\n充电指标 = 充电桩数 * 利用率 * 电价差价 * 服务费",
  "charging": "充电桩营收 = 充电指标 + 会员指标 + 广告收入\n充电指标 = 充电度数 * 电价 * 服务费系数\n充电度数 = 桩数 * 功率利用率 * 日运行时长 * 天数\n会员指标 = 会员数 * 年费标准 * 会员活跃率\n广告收入 = 充电桩屏幕数 * 投放时长 * CPM单价",
  "sharing": "共享经济营收 = 租赁指标 + 押金收入 + 租金收入 + 广告指标 + 增值服务\n租赁指标 = 押金收入 + 租金收入\n押金收入 = 在租设备数 * 押金单价 * 押金周转率\n租金收入 = 订单数 * 订单均价 * 平台抽成率\n广告指标 = 设备屏幕数 * 曝光量 * CPM * 刊挂率\n增值服务 = 保险收入 + 数据服务收入 + 供应链服务",
  "rental": "租赁营收 = 租赁指标 + 二手指标 + 增值服务\n租赁指标 = 长租收入 + 短租收入\n长租收入 = 长租订单数 * 月均租金 * 平均租期\n短租收入 = 短租订单数 * 日均租金 * 平均天数\n二手指标 = 二手成交量 * 均价 * 交易服务费率\n增值服务 = 保险收入 + 配送收入 + 上门服务收入",
  "leasing": "融资租赁营收 = 利息指标 + 咨询指标 + 服务费收入+残值收入\n利息指标 = 租赁资产余额 * 综合利率 * 租期系数\n服务费收入 = 新签约项目数 * 项目规模 * 服务费率\n残值收入 = 到期设备数 * 设备评估残值 * 处置系数\n咨询指标 = 项目数 * 咨询均价 * 客户满意度",
  "factoring": "保理营收 = 利息指标 + 咨询指标\n利息指标 = 保理余额 * 年化利率 * 资金占用天数\n服务费收入 = 保理发生额 * 服务费率 * 客户等级系数\n逾期收入 = 逾期金额 * 逾期利率 * 催收成功率\n咨询指标 = 咨询项目数 * 项目均价 * 方案通过率",
  "microloan": "小贷营收 = 利息指标 + 逾期罚息 + 服务指标 + 贷后管理\n利息指标 = 贷款余额 * 年化利率 * 实际占用天数\n逾期罚息 = 逾期余额 * 逾期利率 * 逾期天数\n服务指标 = 新增贷款额 * 服务费率 * 客户评级\n贷后管理 = 管理客户数 * 管理费 * 客户留存率",
  "payment": "支付营收 = 手续费指标 + 跨境指标\n手续费指标 = GMV * 费率 * 有效交易占比\nGMV = 活跃商户数 * 商户日均交易量 * 平均单价 * 天数\n增值服务 = 金融产品收入 + 营销收入 + 数据服务收入\n跨境指标 = 跨境交易量 * 跨境费率 * 汇率系数",
  "insuranceTech": "保险科技营收 = 技术指标 + 佣金指标 + 广告收入\n技术指标 = 保险公司数 * 技术服务费 * 功能模块数\n数据服务费 = 数据调用量 * 数据单价 * 数据质量系数\n佣金指标 = 保费规模 * 佣金比例 * 理赔反佣系数\n广告收入 = 保险客户触达量 * 广告单价 * 转化率",
  "eduOnline": "在线教育营收 = 课程指标 + 试听转化 + 企业指标\n课程指标 = 正价课收入 + 训练营收入\n试听转化 = 引流人数 * 试听转化率 * 试听客单价\n正价课收入 = 试听成交 * 续费率 * 续费次数 * 正价课单价\n续费率 = 完课率 * 作业提交率 * 考试通过率 * 服务满意度\n训练营收入 = 训练营期数 * 班容量 * 人均学费 * 复购转化率\n企业指标 = 签约企业 * 企均学员 * 课程定价 * 交付满意度",
  "douyinEcom": "抖音电商营收 = 直播指标 + 短视频指标\n直播指标 = 直播GMV + 广告收入\n直播GMV = 场观人数 * 点击率 * 转化率 * 客单价 * 退货系数\n场观人数 = 粉丝量 * 开播率 + 付费流量 * 投放ROI + 自然推荐 * 推荐系数\n转化率 = 话术转化 * 价格敏感度 * 主播能力系数\n短视频指标 = 短视频GMV + 橱窗GMV\n短视频GMV = 视频播放量 * 商品曝光率 * 点击转化 * 客单价\n橱窗GMV = 粉丝数 * 内容渗透率 * 购物车点击率 * 成交转化",
  "wechatEcom": "微信电商营收 = 小程序指标 + 企业微信指标\n小程序指标 = 访问用户 * 转化率 * 客单价 * 复购频次\n访问用户 = 公众号粉丝 * 图文打开率 * 小程序跳转率 + 广告投放 * 点击转化\n转化率 = 商品曝光 * 详情页转化 * 加购率 * 支付成功率\n企业微信指标 = 社群用户 * 私信触达率 * 一对一转化率 * 客单价",
  "taobaoEcom": "淘宝电商营收 = 推广指标 + 淘客指标\n推广指标 = 直通车收入 + 钻展收入\n直通车收入 = 点击消耗 * 点击转化率 * 客单价 * 利润率\n钻展收入 = 展示曝光 * CPM * 点击率 * 转化率 * 客单价\n淘客指标 = 淘客佣金 + 生意参谋\n淘客佣金 = GMV * 佣金比例 * 团长服务费 * 渠道返利\n生意参谋 = 数据服务费 * 订阅用户数 * 功能升级率 * 续约率",
  "jdEcom": "京东电商营收 = 自营指标 + 广告指标\n自营指标 = 自营GMV + 第三方GMV\n自营GMV = 订单量 * 均件金额 * 退货率修正 * 毛利率\n订单量 = 访客数 * 转化率 * 客件数 * 复购率\n访客数 = 搜索流量 + 首页推荐 + 付费广告 + 站外引流\n广告指标 = 商家数 * 渗透率 * 户均消耗 * 续费转化率",
  "meituan": "美团营收 = 外卖指标 + 到店指标 + 新业务指标\n外卖指标 = 外卖佣金\n外卖佣金 = GMV * 抽佣率 * 有效订单占比\nGMV = 活跃商家 * 日均订单 * 均单价 * 天数 * 活动补贴系数\n到店指标 = 到店酒旅\n到店酒旅 = 交易额 * 佣金率 + 酒店间夜 * 间夜均价 * 佣金率\n新业务指标 = 闪购GMV * 佣金率 + 买菜GMV * 佣金率 * 履约成本系数",
  "dianping": "大众点评营收 = 团购指标 + 广告指标\n团购指标 = 团购佣金\n团购佣金 = 团购GMV * 佣金率 * 核销率\n团购GMV = 曝光量 * 点击率 * 浏览转化 * 客单价 * 核销率\n曝光量 = 搜索曝光 + 推荐曝光 + banner曝光 + 粉丝推送\n广告指标 = 商户数 * 广告渗透率 * 月均消耗 * 续约率",
  "autohome": "汽车之家营收 = 广告指标 + 线索指标 + 数据指标\n广告指标 = 品牌广告 * 续约率 + 经销商广告 * 投放转化系数\n线索指标 = 线索量 * 线索单价 * 线索有效率 * 成交转化系数\n线索量 = 访问UV * 留资率 * 车型关注度 * 季节系数\n数据指标 = 数据报告数 * 报告均价 * 企业采购率 * 复购率",
  "anjuke": "安居客营收 = 端口指标 + 推广指标 + 金融指标\n端口指标 = 经纪人端口数 * 端口均价 * 续约率\n经纪人端口数 = 有效经纪人 * 渗透率 * 多端口率\n推广指标 = 推广消耗 * 曝光转化率 * 有效带看率 * 成交转化\n金融指标 = 贷款申请量 * 批贷率 * 贷款额 * 金融佣金率",
  "lianjia": "链家营收 = 交易指标 + 租赁指标\n交易指标 = 二手房佣金 + 新房分销\n二手房佣金 = 成交套数 * 成交均价 * 佣金率 * 贷款系数\n成交套数 = 有效客户 * 带看转化率 * 谈判成功率\n新盘分销 = 分销套数 * 分销均价 * 分销费率 * 结佣周期\n租赁指标 = 租赁佣金\n租赁佣金 = 租赁单数 * 月租金 * 佣金月数 * 续约系数",
  "newRetail": "新零售营收 = 线上指标 + 线下指标 + 会员指标\n线上指标 = 即时配送 + 社区团购\n即时配送 = 线上订单 * 履约率 * 客单价 * 配送效率津贴\n社区团购 = 团长数 * 团均GMV * 开团频次 * 团长佣金率\n线下指标 = 到店销售\n到店销售 = 客流 * 进店率 * 转化率 * 客单价\n会员指标 = 付费会员数 * 年费 * 权益使用率 * 续卡率",
  "freshRetail": "生鲜零售营收 = 生鲜指标 + 加工指标 + 品牌指标\n生鲜指标 = 客流 * 截流率 * 客单价 * 损耗率\n截流率 = 陈列质量 * 产品新鲜度 * 促销力度 * 员工推荐率\n加工指标 = 熟食加工\n熟食加工 = 加工间产能 * 产能利用率 * 加价率 * 销售转化\n品牌指标 = 进口商品 + 自有品牌\n自有品牌 = SKU数 * 品类渗透率 * 复购率 * 毛利率优势",
  "convenience": "便利店营收 = 鲜食指标 + 标准指标 + 增值指标\n鲜食指标 = 午餐时段 + 晚餐时段 + 早餐时段 * 鲜食毛利率\n午餐时段 = 写字楼客流 * 午峰占比 * 截流率 * 客单价\n晚餐时段 = 社区客流 * 晚峰占比 * 复购率 * 客单价\n标准指标 = 标准商品\n增值指标 = 快递代收 * 代收费率 + 彩票销售 * 佣金率 + 充值服务",
  "pharmacy": "药店营收 = 药品指标 + 保健品指标\n药品指标 = 客流 * 接待率 * 成交率 * 客单价\n客流 = 线上订单 + 线下客流 * O2O转化率 + 处方外流\n成交率 = 品种满足率 * 推荐成功率 * 医保使用率 * 价格敏感度\n保健品指标 = 会员销售 + 非会员销售 * 品类关联率 * 客单价",
  "eyeglass": "眼镜店营收 = 配镜指标 + 隐形指标 + 太阳镜指标\n配镜指标 = 验光配镜\n验光配镜 = 验光人数 * 配镜转化率 * 镜片单价 * 镜架系数\n验光人数 = 到店客流 * 预约率 + 线上预约 * 转化率\n隐形指标 = 配镜人数 * 隐形比例 * 品牌系数 * 护理液套装\n太阳镜指标 = 客流 * 季节系数 * 连带率 * 均单价",
  "dental": "口腔诊所营收 = 洁牙指标 + 治疗指标 + 美白指标\n洁牙指标 = 新客洁牙 * 洁牙转化率 * 洁牙均价\n治疗指标 = 治疗收入 + 修复收入\n治疗收入 = 治疗患者 * 人均治疗次数 * 治疗均价 * 医保使用率\n修复收入 = 修复患者数 * 修复项目数 * 修复材料系数 * 医生系数\n美白指标 = 咨询人数 * 方案接受率 * 矫正客单价 * 复诊系数",
  "fitnessClub": "健身会所营收 = 会籍指标 + 私教指标 + 团课指标\n会籍指标 = 新开卡数 * 年卡均价 + 续卡数 * 续卡折扣 * 续卡周期\n新开卡数 = 潜客名单 * 邀约率 * 到店率 * 成交转化率\n私教指标 = 私教会员 * 购买课包 * 课单价 * 续课率\n团课指标 = 团课人次 * 团课单价 * 排课利用率 * 满班率",
  "yoga": "瑜伽馆营收 = 会籍指标 + 团课指标 + 私教指标\n会籍指标 = 新会员 * 年卡均价 + 老会员续会 * 续会折扣\n团课指标 = 团课课时 * 场均人次 * 场馆利用率 * 客单价\n私教指标 = 私教课时数 * 课时费 * 续课转化率 * 课程升级率",
  "swimming": "游泳馆营收 = 门票指标 + 培训指标 + 商品指标\n门票指标 = 进场人次 * 均价 * 季节系数 * 时段利用率\n进场人次 = 会员人次 + 散客人次 * 转化率\n培训指标 = 教练人数 * 人均课时 * 课时费 * 续课率\n商品指标 = 泳具SKU * 品类渗透率 * 连带率 * 毛利率",
  "cinema": "影院营收 = 票房指标 + 卖品指标 + 广告指标\n票房指标 = 排片场次 * 上座率 * 场均人次 * 平均票价 * 分账比例\n上座率 = 黄金场占比 * 黄金场上座率 + 非黄占比 * 非黄上座率\n卖品指标 = 观影人次 * 卖品转化率 * 客单价 * 会员折扣系数\n广告指标 = 映前广告 * 刊挂率 * 单场价格 + 阵地广告 * 媒体价值",
  "ktv": "KTV营收 = 包厢指标 + 酒水指标 + 餐饮指标\n包厢指标 = 开台数 * 平均时长 * 时段单价 * 包厢等级系数\n开台数 = 预约数 * 到店率 * 续时率\n酒水指标 = 消费人次 * 人均酒水 * 酒水毛利率\n餐饮指标 = 开台数 * 餐饮渗透率 * 人均餐饮 * 餐饮毛利率",
  "bar": "酒吧营收 = 酒水指标 + 包场指标 + 表演指标\n酒水指标 = 来客数 * 客座率 * 人均消费 * 酒水毛利率\n来客数 = 散台人次 + 卡座人次 + VIP人次 * 预约转化\n包场指标 = 包场场次 * 包场均价 * 时段系数 * 最低消费达成率\n表演指标 = 演出场次 * 票价收入 * 座位转化 * 打赏分成",
  "coffee": "咖啡店营收 = 饮品指标 + 会员指标\n饮品指标 = 客流 * 截流率 * 人均杯数 * 均单价\n食品销售 = 饮品客流 * 食品搭配率 * 均单价 * 食品毛利率\n会员指标 = 会员充值 * 会员折扣差 * 储值消耗率",
  "tea": "茶饮店营收 = 茶饮指标 + 会员指标\n茶饮指标 = 客流 * 转化率 * 人均杯数 * 均单价 * 季节系数\n甜点销售 = 茶饮客流 * 搭配率 * 甜点客单价 * 损耗率\n会员指标 = 新办卡数 * 卡均价 * 会员复购率 * 续卡率",
  "noodle": "面馆营收 = 面食指标 + 外卖指标\n面食指标 = 翻台人次 * 面食占比 * 均单价 * 出餐效率系数\n翻台人次 = 座位数 * 翻台率 * 午高峰占比 * 晚高峰占比\n小菜销售 = 面食客流 * 小菜搭配率 * 均单价 * 毛利率\n外卖指标 = 外卖订单 * 均单价 * 平台抽成 * 活动补贴",
  "hotpot": "火锅店营收 = 堂食指标 + 会员指标\n堂食指标 = 锅底收入 + 菜品收入 + 酒水收入\n锅底收入 = 桌数 * 锅底单价 * 锅底毛利率\n菜品收入 = 桌数 * 桌均菜品 * 人均消费 * 食材成本率\n酒水收入 = 桌数 * 桌均酒水 * 酒水毛利率\n会员指标 = 会员充值 * 折扣差 * 储值消耗率 * 复购率",
  "bbq": "烧烤店营收 = 堂食指标 + 外卖指标\n堂食指标 = 烤串销售 + 酒水销售 + 主食销售\n烤串销售 = 客流 * 桌均串数 * 串均价格 * 食材成本率\n酒水销售 = 桌数 * 桌均酒水 * 酒水毛利率 * 开瓶率\n主食销售 = 客流 * 主食点单率 * 均单价 * 毛利率\n外卖指标 = 外卖订单 * 均单价 * 平台抽成 * 活动折扣",
  "chicken": "炸鸡店营收 = 外卖指标 + 到店指标 + 会员指标\n外卖指标 = 曝光量 * 进店率 * 下单转化 * 均单价 * 平台抽成\n到店指标 = 路过客流 * 进店率 * 转化率 * 客单价\n会员指标 = 会员注册数 * 激活率 * 人均消费 * 复购频次",
  "ramen": "拉面馆营收 = 面食指标 + 外卖指标\n面食指标 = 出餐份数 * 份均价格 * 毛利率\n出餐份数 = 座位周转 * 午峰出餐 + 晚峰出餐 + 外卖出餐\n饮料销售 = 面食客流 * 饮品搭配率 * 均单价 * 毛利率\n外卖指标 = 外卖订单 * 均单价 * 平台抽成 * 活动折扣",
  "bento": "便当外卖营收 = 团餐指标 + 散客指标\n团餐指标 = 企业客户数 * 团餐频次 * 人均餐标 * 配送成本差\n企业客户 = BD拓展数 * 转化率 * 客单价 * 续约率\n散客指标 = 平台曝光 * 进店转化 * 下单转化 * 均单价",
  "freshMeal": "生鲜电商营收 = B2C指标 + 团购指标\nB2C指标 = 注册用户 * 转化率 * 客单价 * 月均频次 * 复购率\n团购指标 = 团长数 * 开团频次 * 团均GMV * 团长佣金率",
  "grocery": "社区超市营收 = 销售指标 + 熟食指标\n销售指标 = 生鲜销售 + 标品销售\n生鲜销售 = 陈列面积 * 坪效 * 毛利率\n标品销售 = 客流 * 转化率 * 客单价 * 标品毛利率\n熟食指标 = 加工产能 * 利用率 * 加价率 * 损耗率",
  "warehouse": "仓储超市营收 = 会员指标 + 销售指标\n会员指标 = 付费会员数 * 年费 * 续会率\n销售指标 = 客流量 * 转化率 * 客单价 * 毛利率",
  "secondHand": "二手电商营收 = 交易指标 + 验机指标\n交易指标 = C2C交易 + B2C销售\nC2C交易 = 发布量 * 成单率 * 均单价 * 平台抽佣率\n验机指标 = 验机收入 + 增值服务",
  "auction": "拍卖平台营收 = 佣金指标 + 鉴定指标\n佣金指标 = 成交额 * 佣金率 * 买家佣金率 * 卖家佣金率\n鉴定指标 = 鉴定服务 + 仓储寄存 + 金融业务",
  "vacation": "度假旅游营收 = 旅游指标 + 定制指标\n旅游指标 = 跟团游 + 自由行\n跟团游 = 出游人数 * 人均团费 * 利润分成比例\n定制指标 = 定制游 + 签证服务",
  "homestay": "民宿营收 = 住宿指标 + 体验指标\n住宿指标 = 房间数 * 入住率 * 均价 * 平均天数\n体验指标 = 体验活动 + 周边产品 + 拍摄服务",
  "homestayPlatform": "民宿平台营收 = 抽佣指标 + 增值指标\n抽佣指标 = GMV * 抽佣率 * 房源质量系数\n增值指标 = 保险收入 + 增值服务 + 广告",
  "hotelChain": "连锁酒店营收 = 经营指标 + 会员指标\n经营指标 = 直营店收入 + 特许收入\n直营店收入 = 直营店数 * 入住率 * RevPAR * 利润率\n会员指标 = 会员收入 + 集采收入",
  "apartment": "长租公寓营收 = 租金指标 + 衍生指标\n租金指标 = 在租房间 * 月租金 * 出租率 * 空置损耗\n衍生指标 = 服务费 + 衍生收入 + 托管费",
  "coLiving": "联合办公营收 = 工位指标 + 服务指标\n工位指标 = 入驻企业 * 企均工位数 * 工位均价 * 入驻率\n服务指标 = 会议室 + 打印服务 + 社群活动",
  "cosmetics": "美妆工厂营收 = 代工指标 + 品牌指标\n代工指标 = OEM代工 + ODM定制\nOEM代工 = 代工订单量 * 规格数量 * 代工单价 * 良率系数\n品牌指标 = 原料销售 + 研发服务",
  "textile": "纺织服装营收 = 面料指标 + 成衣指标\n面料指标 = 面料产量 * 产销率 * 均价 * 原材料成本差\n成衣指标 = 成衣加工 + 出口业务 + 品牌运营",
  "furnitureFactory": "家具工厂营收 = 工程指标 + 零售指标\n工程指标 = 中标项目 * 项目规模 * 工程折扣 * 回款周期系数\n零售指标 = 零售订单 + 出口订单 + 配件销售",
  "machine": "机械设备营收 = 整机指标 + 服务指标\n整机指标 = 销售台数 * 整机单价 * 毛利率 * 配件捆绑率\n服务指标 = 配件供应 + 维保服务 + 技术培训",
  "3dPrint": "3D打印服务营收 = 打印指标 + 材料指标\n打印指标 = 原型打印 + 小批量生产\n原型打印 = 打印订单数 * 均打印量 * 克单价 * 材料利用率\n材料指标 = 材料销售 + 设计服务",
  "laserCut": "激光切割营收 = 加工指标 + 设备指标\n加工指标 = 加工工时 * 时单价 * 设备利用率 * 工艺复杂度系数\n设备指标 = 材料销售 + 设计费 + 设备销售",
  "mold": "模具制造营收 = 设计指标 + 加工指标\n设计指标 = 设计工时 * 时薪单价 * 设计复杂度系数 * 修改次数系数\n加工指标 = 模具加工 + 试模服务 + 材料销售",
  "plastics": "塑料制品营收 = 注塑指标 + 定制指标\n注塑指标 = 注塑机台数 * 台均产能 * 产能利用率 * 加工单价\n定制指标 = 吹塑产品 + 定制件 + 原材料贸易",
  "metal": "金属加工营收 = 钣金指标 + 组装指标\n钣金指标 = 加工面积 * 单位价格 * 材料利用率 * 工艺系数\n组装指标 = 冲压件 + 表面处理 + 组装服务",
  "circuit": "电路板营收 = 制板指标 + 组装指标\n制板指标 = PCB制板 + SMT贴片\nPCB制板 = 订单面积 * 单位价格 * 良率系数 * 层数系数\n组装指标 = 元器件采购 + 组装测试",
  "led": "LED显示营收 = 显示屏指标 + 服务指标\n显示屏指标 = 销售面积 * 单位价格 * 像素密度系数 * 品牌溢价\n服务指标 = 控制系统 + 安装服务 + 维护保养",
  "batteryCell": "电芯制造营收 = 生产指标 + 组装指标\n生产指标 = 产能利用率 * 设计产能 * 出货量 * 均价格 * 合格率\n组装指标 = PACK组装 + 研发服务 + 材料贸易",
  "solar": "光伏组件营收 = 组件指标 + 服务指标\n组件指标 = 出货量 * 组件单价 * 功率系数 * 市场渠道渗透率\n服务指标 = 系统集成 + EPC服务 + 运维服务",
  "evCharger": "充电桩制造营收 = 产品指标 + 服务指标\n产品指标 = 交流桩 + 直流桩\n交流桩 = 订单数量 * 均价格 * 毛利率 * 配套安装率\n服务指标 = 运营平台 + 维保服务",
  "smartHome": "智能家居营收 = 方案指标 + 单品指标\n方案指标 = 订单数 * 户均价格 * 方案通过率 * 交付满意度\n单品指标 = 单品销售 + 平台服务 + 线下体验",
  "smartLock": "智能门锁营收 = 产品指标 + 服务指标\n产品指标 = 家用锁 + 公寓锁 + 酒店锁\n家用锁 = 渠道销量 * 转化率 * 均价格 * 安装服务费\n服务指标 = 配件销售",
  "securityCam": "安防摄像头营收 = 设备指标 + 存储指标\n设备指标 = 摄像头数量 * 均价格 * 渠道渗透率 * 项目配套率\n存储指标 = 后端存储 + 系统集成 + 云存储",
  "network": "网络设备营收 = 设备指标 + 安全指标\n设备指标 = 交换机 + 路由器 + 无线AP\n交换机 = 端口数 * 均端口价 * 毛利率 * 企业渗透率\n安全指标 = 网络安全",
  "server": "服务器营收 = 整机指标 + 服务指标\n整机指标 = 出货量 * 均价格 * 毛利率 * 配置升级系数\n服务指标 = 配件销售 + 维保服务 + 托管服务",
  "cloudBackup": "云备份营收 = 存储指标 + 企业指标\n存储指标 = 存储容量 * GB单价 * 使用率 * 续费率\n企业指标 = 带宽收入 + 恢复服务 + 企业订阅",
  "cdn": "CDN服务营收 = 流量指标 + 边缘指标\n流量指标 = 带宽峰值 * 价格系数 * 计费时长 * 流量利用率\n边缘指标 = 增值服务 + 专线收入 + 边缘计算",
  "videoCloud": "视频云营收 = 转码指标 + AI指标\n转码指标 = 转码时长 * 时长单价 * 分辨率系数 * 编码效率系数\nAI指标 = 直播收入 + 点播收入 + AI服务",
  "sms": "短信服务营收 = 验证码指标 + 营销指标\n验证码指标 = 发送条数 * 条均价格 * 到达率 * 客户续约率\n营销指标 = 营销短信 + 行业短信 + 国际短信",
  "push": "消息推送营收 = 推送指标 + 数据指标\n推送指标 = 日活推送 + 营销推送\n日活推送 = DAU * 推送覆盖率 * 点击率 * 单价 * 有效推送率\n数据指标 = 全推服务 + 数据服务",
  "email": "邮件服务营收 = 企业邮箱指标 + API指标\n企业邮箱指标 = 账户数 * 账户均价 * 续费率 * 增值功能渗透率\nAPI指标 = 营销邮件 + 国际邮件 + API服务",
  "audio": "语音服务营收 = 语音指标 + 录音指标\n语音指标 = 语音通知 + 语音验证码 + 国际语音\n语音通知 = 通话时长 * 分钟单价 * 接通率 * 客户续约率\n录音指标 = 录音服务",
  "faceRecog": "人脸识别营收 = 算法指标 + 服务指标\n算法指标 = 授权点数 * 均授权费 * 授权类型系数 * 续约率\n服务指标 = 硬件销售 + 系统集成 + 运维服务",
  "ocr": "文字识别营收 = 识别指标 + 自定义指标\n识别指标 = 文字识别 + 证件识别 + 票据识别\n文字识别 = 调用次数 * 单次价格 * 识别准确率 * 企业客户渗透率\n自定义指标 = 自定义识别",
  "speech": "语音识别营收 = 转写指标 + 合成指标\n转写指标 = 语音转写 + 实时字幕\n语音转写 = 转写时长 * 时长单价 * 识别准确率 * 行业定制系数\n合成指标 = 语音合成 + 声纹识别",
  "nlp": "NLP服务营收 = 分析指标 + 对话指标\n分析指标 = 文本分析 + 情感分析\n文本分析 = 分析文档数 * 均价格 * 精度系数 * 行业应用系数\n对话指标 = 智能问答 + 对话系统",
  "recommend": "推荐系统营收 = API指标 + 优化指标\nAPI指标 = 推荐调用次数 * 单次价格 * 推荐准确率 * AB测试转化提升\n优化指标 = 推荐策略 + 效果优化 + 定制服务",
  "bi": "BI分析营收 = 可视化指标 + 订阅指标\n可视化指标 = 数据可视化 + 数据集成\n数据可视化 = 仪表盘数 * 均价格 * 用户活跃率 * 续约率\n订阅指标 = 自助分析 + 企业订阅",
  "crm": "CRM营收 = 账号指标 + 营销指标\n账号指标 = 用户数 * 人均年费 * 功能模块系数 * 续约率\n营销指标 = 呼叫中心 + 营销自动化 + 数据服务",
  "scm": "供应链管理营收 = 采购指标 + 物流指标\n采购指标 = 采购金额 * 管理费率 * 供应商活跃度 * 流程优化系数\n物流指标 = 库存管理 + 物流管理 + 金融服务",
  "pm": "项目管理营收 = 协作指标 + 资源指标\n协作指标 = 团队账号数 * 均年费 * 功能渗透率 * 续约率\n资源指标 = 任务管理 + 甘特图 + 资源管理",
  "hrSaaS": "HR SaaS营收 = 招聘指标 + 薪酬指标\n招聘指标 = 招聘职位数 * 均价格 * 招聘周期 * 续约转化率\n薪酬指标 = 薪酬社保 + 绩效考核 + 培训学习",
  "financeSaaS": "财务SaaS营收 = 记账指标 + 预算指标\n记账指标 = 服务企业数 * 均价 * 续约率 * 增值服务渗透率\n预算指标 = 发票管理 + 预算管理 + 资金管理",
  "legalTech": "法律科技营收 = 审查指标 + 咨询指标\n审查指标 = 合同审查 + 诉讼管理\n合同审查 = 审查份数 * 均价格 * 审查准确率 * 企业客户渗透率\n咨询指标 = 法律检索 + 在线咨询",
  "contract": "电子合同营收 = 签署指标 + 认证指标\n签署指标 = 签署企业数 * 企均签署量 * 单价 * 续约率\n认证指标 = 存证服务 + 认证服务 + API服务",
  "digitalSign": "数字签名营收 = 签名指标 + 认证指标\n签名指标 = 签名次数 * 单价 * 认证等级系数 * 行业渗透率\n认证指标 = 身份认证 + 时间戳 + 举证服务",
  "blockchainSvc": "区块链服务营收 = 平台指标 + 合约指标\n平台指标 = 联盟链数 * 均价格 * 节点配置系数 * 运维服务费\n合约指标 = 智能合约 + 存证溯源 + 积分通证",
  "userGrowth": "用户增长营收 = 拉新指标 + 促活指标 + 留存指标 + 变现指标\n拉新指标 = 获客数 * 获客成本 * 获客效率\n获客数 = 曝光量 * 点击率 * 注册转化率\n点击率 = 点击人数 / 曝光人数 * 100%\n注册转化率 = 注册人数 / 点击人数 * 100%\n促活指标 = DAU * 活跃率 * 促活成本\n活跃率 = 日活人数 / 累计用户 * 100%\n留存指标 = 次日留存 / 新增用户 * 100%\n流失率 = 流失用户 / 总用户 * 100%\n变现指标 = 付费人数 * 客单价",
  "liveEcomMetrics": "直播电商指标 = GMV指标 + 流量指标 + 转化指标 + 用户指标\nGMV指标 = 场观人数 * 停留时长 * 千次观看产出\n场观人数 = 粉丝量 * 开播率 + 付费流量 * 投放ROI + 自然推荐 * 推荐系数\n停留时长 = 互动率 * 内容吸引力 * 话术转化\n千次观看产出 = 点击率 * 转化率 * 客单价 * 千次基数\n流量指标 = 短视频引流 + 付费投流 + 粉丝召回\n转化指标 = 点击率 + 转化率 + 加购率 + 支付转化率\n点击率 = 点击人数 / 曝光人数 * 100%\n转化率 = 成交人数 / 点击人数 * 100%\n加购率 = 加购人数 / 访客人数 * 100%\n支付转化率 = 支付人数 / 下单人数 * 100%\n用户指标 = UV价值 + 粉丝价值\nUV价值 = GMV / 访客数",
  "ecomFunnel": "电商漏斗转化 = 展现 + 点击 + 加购 + 下单 + 支付\n展现量 = 搜索流量 + 推荐流量 + 付费流量 + 站外流量\n点击量 = 展现量 * 点击率\n点击率 = 点击量 / 展现量 * 100%\n加购量 = 点击量 * 加购率\n加购率 = 加购量 / 点击量 * 100%\n下单量 = 加购量 * 下单转化率\n下单转化率 = 下单量 / 加购量 * 100%\n支付量 = 下单量 * 支付转化率\n支付转化率 = 支付量 / 下单量 * 100%\n整体转化率 = 支付量 / 展现量 * 100%",
  "repurchase": "复购分析 = 复购指标 + 客群指标 + GMV贡献\n复购指标 = 复购率 + 复购频次\n复购率 = 复购人数 / 总购买人数 * 100%\n复访率 = 回访人数 / 购买人数 * 100%\n复购频次 = 总订单数 / 复购人数\n客群指标 = 新客贡献 + 老客贡献\n客单价 = GMV / 成交人数\n复购客单价 = 复购GMV / 复购人数\n新客贡献 = 新客GMV / 总GMV * 100%\n老客贡献 = 老客GMV / 总GMV * 100%",
  "retentionChurn": "留存与流失 = 留存指标 + 流失指标 + 价值指标\n留存指标 = 留存率 + 次日留存 + 7日留存 + 30日留存\n留存率 = 期末用户 / 期初用户 * 100%\n次日留存 = 次日回访 / 新增用户 * 100%\n7日留存 = 7日回访 / 新增用户 * 100%\n30日留存 = 30日回访 / 新增用户 * 100%\n流失指标 = 流失率 + 挽回率\n流失率 = 流失用户 / 总用户 * 100%\n挽回率 = 挽回用户 / 流失用户 * 100%\n价值指标 = 留存价值 + 挽回贡献\n留存价值 = 用户生命周期价值 / 获客成本\n挽回贡献 = 挽回GMV / 总GMV * 100%",
  "roiMetrics": "投资回报指标 = 投资回报率 + 财务比率 + 投放效率\n投资回报率 = ROI + ROE + ROA\nROI = 销售额 / 广告消耗 * 100%\nROE = 净利润 / 净资产 * 100%\nROA = 净利润 / 总资产 * 100%\n财务比率 = 净利率 + 资产周转率\n净利率 = 净利润 / 销售额 * 100%\n资产周转率 = 销售额 / 总资产\n投放效率 = ROI - 投放成本率",
  "cacLtv": "用户价值分析 = 获客成本 + 生命周期价值 + 效率指标\n获客成本 = CAC + 边际CAC\nCAC = 广告消耗 / 有效获客数\n边际CAC = 新增费用 / 新增用户\n生命周期价值 = LTV + 用户价值\nLTV = 月均消费 * 留存月数 * 毛利率\n用户价值 = GMV / 用户数\n效率指标 = LTV/CAC + 回本周期\nLTV/CAC = 用户生命周期价值 / 获客成本\n回本周期 = CAC / 月均收入\n月均收入 = LTV / 留存月数",
  "marketShare": "市场份额分析 = 份额指标 + 增长指标 + 竞争指标\n份额指标 = 市场份额 + 渗透率\n市场份额 = 企业销售额 / 行业总销售额 * 100%\n渗透率 = 使用用户 / 目标用户 * 100%\n增长指标 = 增长率 + 增量贡献\n增长率 = (本期 - 上期) / 上期 * 100%\n增量贡献 = 增量 / 行业增量 * 100%\n竞争指标 = 市场集中度 + 价格指数\n市场集中度 = Top3份额 / 市场总量 * 100%\n价格指数 = 企业均价 / 市场均价 * 100%",
  "conversionRate": "转化率分析 = 整体转化率 + 漏斗转化率 + 渠道转化率\n整体转化率 = 最终成交 / 入口流量 * 100%\n漏斗转化率 = 展现点击率 + 点击下单率 + 下单支付率\n展现点击率 = 点击量 / 展现量 * 100%\n点击下单率 = 下单量 / 点击量 * 100%\n下单支付率 = 支付量 / 下单量 * 100%\n浏览支付率 = 支付量 / 浏览量 * 100%\n渠道转化率 = 页面转化率 + 搜索转化率\n页面转化率 = 下单量 / 页面UV * 100%\n搜索转化率 = 点击量 / 搜索UV * 100%\n渠道转化 = 渠道成交 / 渠道流量 * 100%",
  "arpuArpu": "用户价值指标 = 人均指标 + 付费指标 + 生命周期\n人均指标 = ARPU + ARPU边际\nARPU = GMV / 访客数\nARPU边际 = 新增ARPU - 流失ARPU\n付费指标 = ARPPU + 付费率\nARPPU = GMV / 付费人数\n付费率 = 付费人数 / 活跃人数 * 100%\n生命周期 = LTV + 用户价值\nLTV = ARPU * 平均生命周期月数\n用户价值 = LTV - CAC",
  "engagement": "用户活跃指标 = 用户规模 + 活跃率 + 互动指标\n用户规模 = DAU + MAU\nDAU = 新增用户 + 活跃老用户\nMAU = 日活累计去重用户数\n活跃率 = 日活率 + 周活率 + 月活率\n日活率 = DAU / 累计用户 * 100%\n周活率 = 周活人数 / 累计用户 * 100%\n月活率 = 月活人数 / 累计用户 * 100%\n互动指标 = 参与度 + 互动率\n参与度 = 互动用户 / 活跃用户 * 100%\n互动率 = 互动次数 / 访问次数 * 100%\n内容发布率 = 发布人数 / 活跃人数 * 100%",
  "aarrrMetrics": "AARRR增长 = 获取指标 + 激活指标 + 留存指标 + 变现指标 + 推荐指标\n获取指标 = 获客 + 获客成本\n获客成本 = 营销费用 / 有效获客数\n激活指标 = 激活率 + 激活用户\n激活率 = 激活用户 / 获客用户 * 100%\n留存指标 = 留存率 + 变现率\n留存率 = 回访用户 / 期初用户 * 100%\n变现率 = 付费用户 / 活跃用户 * 100%\n推荐指标 = 推荐率 + NPS\n推荐率 = 推荐用户 / 活跃用户 * 100%\n裂变系数 = 邀请人数 / 发起人数\nNPS = 推荐者% - 贬损者%",
  "finPerformance": "财务绩效 = 盈利指标 + 费用指标 + 效率指标\n盈利指标 = 毛利率 + 净利率\n毛利率 = (收入 - 成本) / 收入 * 100%\n净利率 = 净利润 / 销售额 * 100%\n费用指标 = 费用率 + 营销费用率 + 人力成本率\n费用率 = 费用 / 销售额 * 100%\n营销费用率 = 营销费用 / 销售额 * 100%\n人力成本率 = 人力成本 / 营收 * 100%\n效率指标 = 人效 + 坪效 + 时效\n人效 = 营收 / 人数\n坪效 = 营收 / 面积\n时效 = 营收 / 时间",
  "supplyChain": "供应链效率 = 周转指标 + 履约指标 + 损耗指标\n周转指标 = 周转率 + 库存周转率\n库存周转天数 = 365 / 周转率\n周转率 = 出库量 / 平均库存\n库存周转率 = 销售成本 / 平均库存\n备货率 = 备货量 / 需求预测 * 100%\n履约指标 = 满足率 + 履约率\n满足率 = 满足订单 / 总订单 * 100%\n履约率 = 按时履约 / 总订单 * 100%\n损耗指标 = 破损率 + 退货率 + 损耗率\n破损率 = 破损量 / 总发货量 * 100%\n退货率 = 退货量 / 发货量 * 100%\n损耗率 = 损耗量 / 总库存 * 100%",
  "serviceLevel": "服务水平指标 = 满意度指标 + 响应指标 + 完成指标 + 投诉指标 + 首响时间 + 差评率\n满意度指标 = 满意度 + NPS\n满意度 = 满意人数 / 评价人数 * 100%\nNPS = 推荐者% - 贬损者%\n响应指标 = 响应率 + 响应时效\n响应率 = 及时响应 / 总咨询 * 100%\n响应时效 = 响应总时长 / 咨询量\n首响时间 = 首次响应时长 / 咨询量\n完成指标 = 完成率 + 好评率\n完成率 = 完成订单 / 总订单 * 100%\n好评率 = 好评数 / 评价总数 * 100%\n差评率 = 差评数 / 评价总数 * 100%\n投诉指标 = 投诉率 + 投诉处理率\n投诉率 = 投诉量 / 服务量 * 100%\n投诉处理率 = 已处理 / 投诉总量 * 100%",
  "productMetrics": "产品指标 = 渗透率指标 + 使用率指标 + 留存指标 + 功能覆盖率 + 功能满意度\n渗透率指标 = 市场渗透率 + 页面渗透率\n市场渗透率 = 用户数 / 目标用户 * 100%\n页面渗透率 = 访问页面 / 总页面 * 100%\n使用率指标 = 功能使用率 + 核心功能使用率\n功能使用率 = 使用功能 / 活跃用户 * 100%\n功能覆盖率 = 使用功能数 / 总功能数 * 100%\n核心功能使用率 = 核心功能用户 / 活跃用户 * 100%\n留存指标 = 跳出率 + 退出率\n跳出率 = 跳出次数 / 访问次数 * 100%\n退出率 = 退出人数 / 访问人数 * 100%\n功能满意度 = 满意评分 * 使用人数 / 总用户",
  "adEffectiveness": "广告效果分析 = 成本指标 + ROI指标 + 转化指标\n成本指标 = CPM + CPC + CPA\nCPM = 消耗 / 曝光量 * 1000\nCPC = 消耗 / 点击量\nCPA = 消耗 / 转化量\nROI指标 = 广告ROI + 回本周期\n广告ROI = 产出金额 / 消耗\n回本周期 = 消耗 / 日均产出\n转化指标 = CTR + CVR + 整体转化率\nCTR = 点击量 / 曝光量 * 100%\nCVR = 转化量 / 点击量 * 100%\n整体转化率 = 转化量 / 曝光量 * 100%",
}

export const TEMPLATE_BUTTONS: TemplateButton[] = [
  { key: "ecommerce", label: "电商零售", icon: "shopping-cart", emoji: "🛒", industry: "ecommerce_retail", formulaType: "growth_funnel" },
  { key: "saas", label: "SaaS增长", icon: "cloud", emoji: "☁️", industry: "platform_internet", formulaType: "user_value" },
  { key: "retail", label: "实体门店", icon: "store", emoji: "🏪", industry: "local_life", formulaType: "growth_funnel" },
  { key: "content", label: "内容生态", icon: "pen-tool", emoji: "✏️", industry: "content_media", formulaType: "engagement" },
  { key: "education", label: "在线教育", icon: "graduation-cap", emoji: "🎓", industry: "health_edu", formulaType: "growth_funnel" },
  { key: "private", label: "私域运营", icon: "users", emoji: "👥", industry: "platform_internet", formulaType: "growth_funnel" },
  { key: "restaurant", label: "餐饮连锁", icon: "utensils", emoji: "🍽️", industry: "local_life", formulaType: "general" },
  { key: "livestream", label: "直播电商", icon: "video", emoji: "📹", industry: "ecommerce_retail", formulaType: "growth_funnel" },
  { key: "medical", label: "医疗健康", icon: "stethoscope", emoji: "🩺", industry: "health_edu", formulaType: "finance_perf" },
  { key: "realestate", label: "房产中介", icon: "home", emoji: "🏠", industry: "local_life", formulaType: "finance_perf" },
  { key: "finance", label: "金融理财", icon: "trending-up", emoji: "📈", industry: "finance_insurance", formulaType: "finance_perf" },
  { key: "insurance", label: "保险经纪", icon: "shield", emoji: "🛡️", industry: "finance_insurance", formulaType: "finance_perf" },
  { key: "gaming", label: "游戏运营", icon: "gamepad-2", emoji: "🎮", industry: "platform_internet", formulaType: "engagement" },
  { key: "logistics", label: "物流运输", icon: "truck", emoji: "🚚", industry: "manufacturing_energy", formulaType: "ops_supply" },
  { key: "hotel", label: "酒店住宿", icon: "bed", emoji: "🛏️", industry: "local_life", formulaType: "finance_perf" },
  { key: "tourism", label: "旅游景区", icon: "map", emoji: "🗺️", industry: "local_life", formulaType: "general" },
  { key: "beauty", label: "美容美体", icon: "heart", emoji: "❤️", industry: "local_life", formulaType: "user_value" },
  { key: "fitness", label: "健身运动", icon: "dumbbell", emoji: "🏋️", industry: "local_life", formulaType: "user_value" },
  { key: "auto", label: "汽车4S店", icon: "car", emoji: "🚗", industry: "local_life", formulaType: "finance_perf" },
  { key: "farm", label: "农产品", icon: "leaf", emoji: "🍃", industry: "ecommerce_retail", formulaType: "ops_supply" },
  { key: "beautyProd", label: "美妆品牌", icon: "sparkles", emoji: "✨", industry: "ecommerce_retail", formulaType: "general" },
  { key: "furniture", label: "家具定制", icon: "sofa", emoji: "🛋️", industry: "ecommerce_retail", formulaType: "general" },
  { key: "hotelTravel", label: "旅行社", icon: "plane", emoji: "✈️", industry: "local_life", formulaType: "general" },
  { key: "cleaning", label: "家政服务", icon: "spray-can", emoji: "🧴", industry: "local_life", formulaType: "ops_supply" },
  { key: "repair", label: "维修服务", icon: "wrench", emoji: "🔧", industry: "local_life", formulaType: "ops_supply" },
  { key: "pet", label: "宠物服务", icon: "cat", emoji: "🐱", industry: "local_life", formulaType: "general" },
  { key: "florist", label: "花艺绿植", icon: "flower-2", emoji: "🌸", industry: "local_life", formulaType: "general" },
  { key: "photography", label: "摄影服务", icon: "camera", emoji: "📷", industry: "local_life", formulaType: "general" },
  { key: "educationTrain", label: "职业培训", icon: "book-open", emoji: "📖", industry: "health_edu", formulaType: "growth_funnel" },
  { key: "consulting", label: "管理咨询", icon: "briefcase", emoji: "💼", industry: "enterprise_service", formulaType: "finance_perf" },
  { key: "law", label: "法律服务", icon: "scale", emoji: "⚖️", industry: "enterprise_service", formulaType: "finance_perf" },
  { key: "hr", label: "人力资源", icon: "user-check", emoji: "✅", industry: "enterprise_service", formulaType: "ops_supply" },
  { key: "it", label: "IT外包", icon: "code", emoji: "💻", industry: "enterprise_service", formulaType: "ops_supply" },
  { key: "design", label: "设计服务", icon: "pencil", emoji: "✏️", industry: "enterprise_service", formulaType: "general" },
  { key: "marketing", label: "营销Agency", icon: "megaphone", emoji: "📣", industry: "enterprise_service", formulaType: "ad_roi" },
  { key: "advertising", label: "广告传媒", icon: "tv", emoji: "📺", industry: "content_media", formulaType: "ad_roi" },
  { key: "media", label: "媒体出版", icon: "newspaper", emoji: "📰", industry: "content_media", formulaType: "finance_perf" },
  { key: "newsletter", label: "知识付费", icon: "mail", emoji: "✉️", industry: "content_media", formulaType: "user_value" },
  { key: "community", label: "社区运营", icon: "globe", emoji: "🌐", industry: "content_media", formulaType: "engagement" },
  { key: "didi", label: "出行平台", icon: "navigation", emoji: "🧭", industry: "platform_internet", formulaType: "ops_supply" },
  { key: "delivery", label: "外卖平台", icon: "package", emoji: "📦", industry: "platform_internet", formulaType: "ops_supply" },
  { key: "shortvideo", label: "短视频", icon: "film", emoji: "🎬", industry: "platform_internet", formulaType: "engagement" },
  { key: "ecommercePinduoduo", label: "拼多多", icon: "shopping-bag", emoji: "🛍️", industry: "ecommerce_retail", formulaType: "finance_perf" },
  { key: "cloud", label: "云服务", icon: "server", emoji: "🖥️", industry: "platform_internet", formulaType: "finance_perf" },
  { key: "security", label: "安全服务", icon: "shield-check", emoji: "🛡️", industry: "platform_internet", formulaType: "general" },
  { key: "data", label: "数据服务", icon: "database", emoji: "🗄️", industry: "platform_internet", formulaType: "general" },
  { key: "ai", label: "AI服务", icon: "brain", emoji: "🧠", industry: "platform_internet", formulaType: "general" },
  { key: "blockchain", label: "区块链", icon: "link", emoji: "🔗", industry: "platform_internet", formulaType: "general" },
  { key: "chip", label: "芯片设计", icon: "cpu", emoji: "🔲", industry: "manufacturing_energy", formulaType: "finance_perf" },
  { key: "autoParts", label: "汽车配件", icon: "settings", emoji: "⚙️", industry: "manufacturing_energy", formulaType: "ops_supply" },
  { key: "newEnergy", label: "新能源", icon: "sun", emoji: "☀️", industry: "manufacturing_energy", formulaType: "general" },
  { key: "battery", label: "电池", icon: "battery-charging", emoji: "🔋", industry: "manufacturing_energy", formulaType: "ops_supply" },
  { key: "semiconductor", label: "半导体", icon: "zap", emoji: "⚡", industry: "manufacturing_energy", formulaType: "finance_perf" },
  { key: "robot", label: "机器人", icon: "bot", emoji: "🤖", industry: "manufacturing_energy", formulaType: "general" },
  { key: "biomed", label: "生物医药", icon: "flask-conical", emoji: "🧪", industry: "health_edu", formulaType: "finance_perf" },
  { key: "medicalDevice", label: "医疗器械", icon: "heart-pulse", emoji: "💓", industry: "health_edu", formulaType: "finance_perf" },
  { key: "eldercare", label: "养老服务", icon: "heart-handshake", emoji: "🤝", industry: "health_edu", formulaType: "ops_supply" },
  { key: "childcare", label: "母婴服务", icon: "baby", emoji: "👶", industry: "health_edu", formulaType: "general" },
  { key: "laundry", label: "干洗服务", icon: "shirt", emoji: "👕", industry: "local_life", formulaType: "ops_supply" },
  { key: "carWash", label: "洗车服务", icon: "droplets", emoji: "💧", industry: "local_life", formulaType: "user_value" },
  { key: "parking", label: "停车场", icon: "square-parking", emoji: "🅿️", industry: "local_life", formulaType: "finance_perf" },
  { key: "charging", label: "充电桩", icon: "plug-zap", emoji: "🔌", industry: "local_life", formulaType: "user_value" },
  { key: "sharing", label: "共享经济", icon: "share-2", emoji: "🔗", industry: "platform_internet", formulaType: "finance_perf" },
  { key: "rental", label: "租赁服务", icon: "repeat", emoji: "🔁", industry: "platform_internet", formulaType: "finance_perf" },
  { key: "leasing", label: "融资租赁", icon: "landmark", emoji: "🏛️", industry: "finance_insurance", formulaType: "finance_perf" },
  { key: "factoring", label: "商业保理", icon: "file-text", emoji: "📄", industry: "finance_insurance", formulaType: "finance_perf" },
  { key: "microloan", label: "小额贷款", icon: "coins", emoji: "🪙", industry: "finance_insurance", formulaType: "finance_perf" },
  { key: "payment", label: "支付", icon: "credit-card", emoji: "💳", industry: "finance_insurance", formulaType: "finance_perf" },
  { key: "insuranceTech", label: "保险科技", icon: "shield-alert", emoji: "🚨", industry: "finance_insurance", formulaType: "ad_roi" },
  { key: "eduOnline", label: "在线教育", icon: "laptop", emoji: "💻", industry: "health_edu", formulaType: "growth_funnel" },
  { key: "douyinEcom", label: "抖音电商", icon: "music", emoji: "🎵", industry: "ecommerce_retail", formulaType: "growth_funnel" },
  { key: "wechatEcom", label: "微信电商", icon: "message-circle", emoji: "💬", industry: "ecommerce_retail", formulaType: "growth_funnel" },
  { key: "taobaoEcom", label: "淘宝电商", icon: "shopping-cart", emoji: "🛒", industry: "ecommerce_retail", formulaType: "ad_roi" },
  { key: "jdEcom", label: "京东电商", icon: "box", emoji: "📦", industry: "ecommerce_retail", formulaType: "finance_perf" },
  { key: "meituan", label: "美团", icon: "chef-hat", emoji: "👨‍🍳", industry: "platform_internet", formulaType: "ops_supply" },
  { key: "dianping", label: "大众点评", icon: "star", emoji: "⭐", industry: "platform_internet", formulaType: "ad_roi" },
  { key: "autohome", label: "汽车之家", icon: "car-front", emoji: "🚗", industry: "platform_internet", formulaType: "ad_roi" },
  { key: "anjuke", label: "安居客", icon: "building", emoji: "🏢", industry: "platform_internet", formulaType: "ad_roi" },
  { key: "lianjia", label: "链家", icon: "building-2", emoji: "🏢", industry: "platform_internet", formulaType: "finance_perf" },
  { key: "newRetail", label: "新零售", icon: "shopping-bag", emoji: "🛍️", industry: "ecommerce_retail", formulaType: "general" },
  { key: "freshRetail", label: "生鲜零售", icon: "apple", emoji: "🍎", industry: "ecommerce_retail", formulaType: "ops_supply" },
  { key: "convenience", label: "便利店", icon: "store", emoji: "🏪", industry: "local_life", formulaType: "ops_supply" },
  { key: "pharmacy", label: "药店", icon: "pill", emoji: "💊", industry: "local_life", formulaType: "general" },
  { key: "eyeglass", label: "眼镜店", icon: "glasses", emoji: "👓", industry: "local_life", formulaType: "general" },
  { key: "dental", label: "口腔诊所", icon: "smile", emoji: "😊", industry: "local_life", formulaType: "general" },
  { key: "fitnessClub", label: "健身会所", icon: "dumbbell", emoji: "🏋️", industry: "local_life", formulaType: "user_value" },
  { key: "yoga", label: "瑜伽馆", icon: "flower", emoji: "🪷", industry: "local_life", formulaType: "user_value" },
  { key: "swimming", label: "游泳馆", icon: "waves", emoji: "🌊", industry: "local_life", formulaType: "general" },
  { key: "cinema", label: "影院", icon: "clapperboard", emoji: "🎬", industry: "local_life", formulaType: "finance_perf" },
  { key: "ktv", label: "KTV", icon: "mic", emoji: "🎤", industry: "local_life", formulaType: "general" },
  { key: "bar", label: "酒吧", icon: "wine", emoji: "🍷", industry: "local_life", formulaType: "general" },
  { key: "coffee", label: "咖啡店", icon: "coffee", emoji: "☕", industry: "local_life", formulaType: "user_value" },
  { key: "tea", label: "茶饮店", icon: "cup-soda", emoji: "🧋", industry: "local_life", formulaType: "user_value" },
  { key: "noodle", label: "面馆", icon: "bowl", emoji: "🍜", industry: "local_life", formulaType: "ops_supply" },
  { key: "hotpot", label: "火锅店", icon: "flame", emoji: "🔥", industry: "local_life", formulaType: "user_value" },
  { key: "bbq", label: "烧烤店", icon: "beef", emoji: "🥩", industry: "local_life", formulaType: "ops_supply" },
  { key: "chicken", label: "炸鸡店", icon: "drumstick", emoji: "🍗", industry: "local_life", formulaType: "ops_supply" },
  { key: "ramen", label: "拉面馆", icon: "salad", emoji: "🥗", industry: "local_life", formulaType: "ops_supply" },
  { key: "bento", label: "便当外卖", icon: "sandwich", emoji: "🥪", industry: "local_life", formulaType: "ops_supply" },
  { key: "freshMeal", label: "生鲜电商", icon: "croissant", emoji: "🥐", industry: "ecommerce_retail", formulaType: "ops_supply" },
  { key: "grocery", label: "社区超市", icon: "basket", emoji: "🧺", industry: "local_life", formulaType: "ops_supply" },
  { key: "warehouse", label: "仓储超市", icon: "warehouse", emoji: "🏭", industry: "local_life", formulaType: "ops_supply" },
  { key: "secondHand", label: "二手电商", icon: "refresh-cw", emoji: "🔄", industry: "ecommerce_retail", formulaType: "general" },
  { key: "auction", label: "拍卖平台", icon: "gavel", emoji: "🔨", industry: "ecommerce_retail", formulaType: "finance_perf" },
  { key: "vacation", label: "度假旅游", icon: "palmtree", emoji: "🌴", industry: "local_life", formulaType: "general" },
  { key: "homestay", label: "民宿", icon: "home", emoji: "🏠", industry: "local_life", formulaType: "general" },
  { key: "homestayPlatform", label: "民宿平台", icon: "key", emoji: "🔑", industry: "platform_internet", formulaType: "finance_perf" },
  { key: "hotelChain", label: "连锁酒店", icon: "hotel", emoji: "🏨", industry: "local_life", formulaType: "user_value" },
  { key: "apartment", label: "长租公寓", icon: "door-open", emoji: "🚪", industry: "local_life", formulaType: "finance_perf" },
  { key: "coLiving", label: "联合办公", icon: "layout-grid", emoji: "▦", industry: "enterprise_service", formulaType: "finance_perf" },
  { key: "cosmetics", label: "美妆工厂", icon: "palette", emoji: "🎨", industry: "manufacturing_energy", formulaType: "ops_supply" },
  { key: "textile", label: "纺织服装", icon: "scissors", emoji: "✂️", industry: "manufacturing_energy", formulaType: "ops_supply" },
  { key: "furnitureFactory", label: "家具工厂", icon: "hammer", emoji: "🔨", industry: "manufacturing_energy", formulaType: "ops_supply" },
  { key: "machine", label: "机械设备", icon: "cog", emoji: "⚙️", industry: "manufacturing_energy", formulaType: "ops_supply" },
  { key: "3dPrint", label: "3D打印", icon: "box", emoji: "📦", industry: "manufacturing_energy", formulaType: "ops_supply" },
  { key: "laserCut", label: "激光切割", icon: "layers", emoji: "📑", industry: "manufacturing_energy", formulaType: "ops_supply" },
  { key: "mold", label: "模具制造", icon: "archive", emoji: "📦", industry: "manufacturing_energy", formulaType: "ops_supply" },
  { key: "plastics", label: "塑料制品", icon: "circle", emoji: "⚪", industry: "manufacturing_energy", formulaType: "ops_supply" },
  { key: "metal", label: "金属加工", icon: "hexagon", emoji: "⬡", industry: "manufacturing_energy", formulaType: "ops_supply" },
  { key: "circuit", label: "电路板", icon: "cpu", emoji: "🔲", industry: "manufacturing_energy", formulaType: "ops_supply" },
  { key: "led", label: "LED显示", icon: "monitor", emoji: "🖥️", industry: "manufacturing_energy", formulaType: "general" },
  { key: "batteryCell", label: "电芯制造", icon: "battery-full", emoji: "🔋", industry: "manufacturing_energy", formulaType: "ops_supply" },
  { key: "solar", label: "光伏组件", icon: "sun", emoji: "☀️", industry: "manufacturing_energy", formulaType: "ops_supply" },
  { key: "evCharger", label: "充电桩制造", icon: "zap", emoji: "⚡", industry: "manufacturing_energy", formulaType: "ops_supply" },
  { key: "smartHome", label: "智能家居", icon: "home", emoji: "🏠", industry: "manufacturing_energy", formulaType: "general" },
  { key: "smartLock", label: "智能门锁", icon: "lock", emoji: "🔒", industry: "manufacturing_energy", formulaType: "general" },
  { key: "securityCam", label: "安防摄像头", icon: "video", emoji: "📹", industry: "manufacturing_energy", formulaType: "general" },
  { key: "network", label: "网络设备", icon: "wifi", emoji: "📶", industry: "manufacturing_energy", formulaType: "general" },
  { key: "server", label: "服务器", icon: "hard-drive", emoji: "💾", industry: "manufacturing_energy", formulaType: "finance_perf" },
  { key: "cloudBackup", label: "云备份", icon: "cloud", emoji: "☁️", industry: "platform_internet", formulaType: "finance_perf" },
  { key: "cdn", label: "CDN服务", icon: "globe", emoji: "🌐", industry: "platform_internet", formulaType: "ops_supply" },
  { key: "videoCloud", label: "视频云", icon: "play", emoji: "▶️", industry: "platform_internet", formulaType: "general" },
  { key: "sms", label: "短信服务", icon: "message-square", emoji: "💬", industry: "platform_internet", formulaType: "ad_roi" },
  { key: "push", label: "消息推送", icon: "bell", emoji: "🔔", industry: "platform_internet", formulaType: "engagement" },
  { key: "email", label: "邮件服务", icon: "inbox", emoji: "📥", industry: "platform_internet", formulaType: "general" },
  { key: "audio", label: "语音服务", icon: "phone-call", emoji: "📞", industry: "platform_internet", formulaType: "general" },
  { key: "faceRecog", label: "人脸识别", icon: "scan-face", emoji: "😊", industry: "platform_internet", formulaType: "general" },
  { key: "ocr", label: "文字识别", icon: "type", emoji: "🔤", industry: "platform_internet", formulaType: "general" },
  { key: "speech", label: "语音识别", icon: "mic", emoji: "🎤", industry: "platform_internet", formulaType: "general" },
  { key: "nlp", label: "NLP服务", icon: "brain", emoji: "🧠", industry: "platform_internet", formulaType: "general" },
  { key: "recommend", label: "推荐系统", icon: "sparkles", emoji: "✨", industry: "platform_internet", formulaType: "engagement" },
  { key: "bi", label: "BI分析", icon: "bar-chart", emoji: "📊", industry: "enterprise_service", formulaType: "finance_perf" },
  { key: "crm", label: "CRM", icon: "users", emoji: "👥", industry: "enterprise_service", formulaType: "user_value" },
  { key: "scm", label: "供应链管理", icon: "git-branch", emoji: "🌿", industry: "enterprise_service", formulaType: "ops_supply" },
  { key: "pm", label: "项目管理", icon: "kanban", emoji: "📋", industry: "enterprise_service", formulaType: "ops_supply" },
  { key: "hrSaaS", label: "HR SaaS", icon: "user-check", emoji: "✅", industry: "enterprise_service", formulaType: "ops_supply" },
  { key: "financeSaaS", label: "财务SaaS", icon: "calculator", emoji: "🧮", industry: "enterprise_service", formulaType: "finance_perf" },
  { key: "legalTech", label: "法律科技", icon: "scale", emoji: "⚖️", industry: "enterprise_service", formulaType: "general" },
  { key: "contract", label: "电子合同", icon: "file-signature", emoji: "✍️", industry: "enterprise_service", formulaType: "ops_supply" },
  { key: "digitalSign", label: "数字签名", icon: "pen-tool", emoji: "✏️", industry: "enterprise_service", formulaType: "ops_supply" },
  { key: "blockchainSvc", label: "区块链服务", icon: "link", emoji: "🔗", industry: "enterprise_service", formulaType: "general" },
  { key: "userGrowth", label: "用户增长", icon: "trending-up", emoji: "📈", industry: "other", formulaType: "growth_funnel" },
  { key: "liveEcomMetrics", label: "直播指标", icon: "video", emoji: "📹", industry: "other", formulaType: "growth_funnel" },
  { key: "ecomFunnel", label: "电商漏斗", icon: "filter", emoji: "🔻", industry: "other", formulaType: "growth_funnel" },
  { key: "repurchase", label: "复购分析", icon: "repeat", emoji: "🔁", industry: "other", formulaType: "user_value" },
  { key: "retentionChurn", label: "留存流失", icon: "users", emoji: "👥", industry: "other", formulaType: "user_value" },
  { key: "roiMetrics", label: "投资回报", icon: "percent", emoji: "%", industry: "other", formulaType: "finance_perf" },
  { key: "cacLtv", label: "CAC-LTV", icon: "dollar-sign", emoji: "$", industry: "other", formulaType: "user_value" },
  { key: "marketShare", label: "市场份额", icon: "pie-chart", emoji: "📊", industry: "other", formulaType: "finance_perf" },
  { key: "conversionRate", label: "转化率", icon: "arrow-right-circle", emoji: "➡️", industry: "other", formulaType: "growth_funnel" },
  { key: "arpuArpu", label: "ARPU指标", icon: "coins", emoji: "🪙", industry: "other", formulaType: "user_value" },
  { key: "engagement", label: "用户活跃", icon: "activity", emoji: "📶", industry: "other", formulaType: "engagement" },
  { key: "aarrrMetrics", label: "AARRR", icon: "target", emoji: "🎯", industry: "other", formulaType: "growth_funnel" },
  { key: "finPerformance", label: "财务绩效", icon: "bar-chart", emoji: "📊", industry: "other", formulaType: "finance_perf" },
  { key: "supplyChain", label: "供应链", icon: "package", emoji: "📦", industry: "other", formulaType: "ops_supply" },
  { key: "serviceLevel", label: "服务水平", icon: "star", emoji: "⭐", industry: "other", formulaType: "ops_supply" },
  { key: "productMetrics", label: "产品指标", icon: "box", emoji: "📦", industry: "other", formulaType: "engagement" },
  { key: "adEffectiveness", label: "广告效果", icon: "megaphone", emoji: "📣", industry: "other", formulaType: "ad_roi" },
]

export const INDUSTRY_OPTIONS: FilterOption[] = [
  { id: "all", label: "全部" },
  { id: "ecommerce_retail", label: "电商零售" },
  { id: "local_life", label: "本地生活" },
  { id: "platform_internet", label: "平台互联网" },
  { id: "enterprise_service", label: "企业服务" },
  { id: "manufacturing_energy", label: "制造能源" },
  { id: "finance_insurance", label: "金融保险" },
  { id: "content_media", label: "内容传媒" },
  { id: "health_edu", label: "健康教育" },
  { id: "other", label: "综合指标" },
]

export const FORMULA_TYPE_OPTIONS: FilterOption[] = [
  { id: "all", label: "全部" },
  { id: "growth_funnel", label: "增长漏斗" },
  { id: "finance_perf", label: "财务绩效" },
  { id: "user_value", label: "用户价值" },
  { id: "ops_supply", label: "运营供应链" },
  { id: "engagement", label: "活跃互动" },
  { id: "ad_roi", label: "投放ROI" },
  { id: "general", label: "综合" },
]

export function filterTemplateButtons(
  industry: string = 'all',
  formulaType: string = 'all',
  query: string = '',
): TemplateButton[] {
  const q = query.trim().toLowerCase()
  return TEMPLATE_BUTTONS.filter((btn) => {
    if (industry !== 'all' && btn.industry !== industry) return false
    if (formulaType !== 'all' && btn.formulaType !== formulaType) return false
    if (!q) return true
    return (
      btn.label.toLowerCase().includes(q) ||
      btn.key.toLowerCase().includes(q) ||
      btn.emoji.includes(query.trim())
    )
  })
}



export const DEFAULT_TEMPLATE_KEY = 'ecommerce'

export const DEFAULT_FORMULA_TEXT = FORMULA_TEMPLATES[DEFAULT_TEMPLATE_KEY]

export const PALETTES: Record<PaletteName, string[]> = {
  rainbow: ['#A84562', '#B85A38', '#A67C00', '#187A4E', '#0E8A84', '#2A649F', '#6B4C9A'],
  classic: ['#2A649F', '#6B4C9A', '#187A4E', '#A67C00', '#A84562', '#3E5A78', '#0E8A84'],
  business: ['#3E5A78', '#2A649F', '#0E8A84', '#187A4E', '#8A5A2A', '#1A7088', '#6B4C9A'],
  warm: ['#A84562', '#B85A38', '#A67C00', '#8A5A2A', '#7A3E86', '#C45C26', '#84344C'],
  cool: ['#0E8A84', '#1A7088', '#2A649F', '#3E5A78', '#6B4C9A', '#187A4E', '#125C3B'],
}

export const PALETTE_OPTIONS: { id: PaletteName; label: string }[] = [
  { id: 'rainbow', label: '彩虹' },
  { id: 'classic', label: '经典' },
  { id: 'business', label: '商务' },
  { id: 'warm', label: '暖色' },
  { id: 'cool', label: '冷色' },
]


export const NODE_W = 180
export const NODE_H = 50
export const LEVEL_GAP = 120
export const NODE_GAP = 50

const TOKEN_NAME_RE = /([\u4e00-\u9fa5a-zA-Z][\u4e00-\u9fa5a-zA-Z0-9]*)/g
const OPS = new Set(['+', '-', '*', '/', '×', '÷'])

function isCoef(s: string): boolean {
  return /^[0-9]+(\.[0-9]+)?%?$/.test(s)
}

export function parseFormulas(text: string): FormulaNode | null {
  const lines = text.split('\n').filter((line) => line.includes('= '))
  const map: Record<string, string[]> = {}
  const definedNames = new Set<string>()

  lines.forEach((line) => {
    const parts = line.split(' = ')
    if (parts.length < 2) return
    const lhs = parts[0].trim()
    const rhs = parts[1].trim()
    const tokenRegex = /([\+\-×\*\/\÷])|([^\+\-×\*\/\÷]+)/g
    const rawTokens: string[] = []
    let match: RegExpExecArray | null
    while ((match = tokenRegex.exec(rhs)) !== null) {
      const t = match[0].trim()
      if (t) rawTokens.push(t)
    }
    const mergedTokens: string[] = []
    for (let i = 0; i < rawTokens.length; i++) {
      const current = rawTokens[i]
      if (
        (current === '*' || current === '×') &&
        i + 1 < rawTokens.length &&
        isCoef(rawTokens[i + 1]) &&
        mergedTokens.length > 0 &&
        !OPS.has(mergedTokens[mergedTokens.length - 1])
      ) {
        const prev = mergedTokens.pop()!
        const coef = rawTokens[i + 1]
        mergedTokens.push(`${prev} × ${coef}`)
        i++
      } else {
        mergedTokens.push(current)
      }
    }
    if (!definedNames.has(lhs)) {
      map[lhs] = mergedTokens
      definedNames.add(lhs)
    }
  })

  if (Object.keys(map).length === 0) return null
  const firstLhs = lines[0].split(' = ')[0].trim()
  return buildTree(firstLhs, map, 0, new Set())
}

export function buildTree(
  name: string,
  map: Record<string, string[]>,
  depth: number,
  visited: Set<string>,
): FormulaNode {
  const node: FormulaNode = {
    name,
    depth,
    children: [],
    operators: [],
    totalHeight: 0,
    x: 0,
    y: 0,
  }
  let lookupName = name
  const splitIndex = name.indexOf(' × ')
  if (
    splitIndex > -1 &&
    /^[0-9\.]+%?$/.test(name.substring(splitIndex + 3))
  ) {
    lookupName = name.substring(0, splitIndex)
  }

  if (visited.has(lookupName)) {
    return node
  }
  visited.add(lookupName)

  if (map[lookupName]) {
    const tokens = map[lookupName]
    tokens.forEach((token) => {
      if (OPS.has(token)) {
        node.operators.push(token)
      } else if (token !== lookupName && token !== name) {
        node.children.push(buildTree(token, map, depth + 1, visited))
      }
    })
  }
  return node
}

export function calculateLayout(
  node: FormulaNode,
  layoutDirection: LayoutDirection,
): number {
  if (node.children.length === 0) {
    const size =
      layoutDirection === 'horizontal' ? NODE_H + NODE_GAP : NODE_W + NODE_GAP
    node.totalHeight = size
    return size
  }

  let total = 0
  node.children.forEach((child) => {
    total += calculateLayout(child, layoutDirection)
  })

  const minSize =
    layoutDirection === 'horizontal' ? NODE_H + NODE_GAP : NODE_W + NODE_GAP
  node.totalHeight = Math.max(total, minSize)
  return node.totalHeight
}

export function assignPositions(
  node: FormulaNode,
  startMain: number,
  startCross: number,
  layoutDirection: LayoutDirection,
): void {
  if (layoutDirection === 'horizontal') {
    node.x = startMain
    node.y = startCross
  } else {
    node.y = startMain
    node.x = startCross
  }

  if (node.children.length > 0) {
    let currentCross = startCross - node.totalHeight / 2
    node.children.forEach((child) => {
      const childCross = currentCross + child.totalHeight / 2
      const nextMain =
        startMain +
        (layoutDirection === 'horizontal'
          ? NODE_W + LEVEL_GAP
          : NODE_H + LEVEL_GAP)
      assignPositions(child, nextMain, childCross, layoutDirection)
      currentCross += child.totalHeight
    })
  }
}

function bezierPoint(
  t: number,
  startX: number,
  startY: number,
  cp1x: number,
  cp1y: number,
  cp2x: number,
  cp2y: number,
  endX: number,
  endY: number,
): { x: number; y: number } {
  const mt = 1 - t
  const x =
    mt * mt * mt * startX +
    3 * mt * mt * t * cp1x +
    3 * mt * t * t * cp2x +
    t * t * t * endX
  const y =
    mt * mt * mt * startY +
    3 * mt * mt * t * cp1y +
    3 * mt * t * t * cp2y +
    t * t * t * endY
  return { x, y }
}

export function buildDiagramModel(
  text: string,
  layoutDirection: LayoutDirection,
  viewportCrossCenter = 400,
): DiagramModel | null {
  const tree = parseFormulas(text)
  if (!tree) return null
  calculateLayout(tree, layoutDirection)
  assignPositions(tree, 100, viewportCrossCenter, layoutDirection)

  const nodes: FormulaFlatNode[] = []
  const links: FormulaLink[] = []

  function walk(node: FormulaNode) {
    let displayName = node.name
    if (displayName.length > 20) displayName = displayName.substring(0, 18) + '..'
    nodes.push({
      name: node.name,
      depth: node.depth,
      x: node.x,
      y: node.y,
      displayName,
    })

    node.children.forEach((child, index) => {
      let startX: number
      let startY: number
      let endX: number
      let endY: number
      let cp1x: number
      let cp1y: number
      let cp2x: number
      let cp2y: number

      if (layoutDirection === 'horizontal') {
        startX = node.x + NODE_W
        startY = node.y
        endX = child.x
        endY = child.y
        const midX = startX + (endX - startX) / 2
        cp1x = midX
        cp1y = startY
        cp2x = midX
        cp2y = endY
      } else {
        startX = node.x
        startY = node.y + NODE_H / 2
        endX = child.x
        endY = child.y - NODE_H / 2
        const midY = startY + (endY - startY) / 2
        cp1x = startX
        cp1y = midY
        cp2x = endX
        cp2y = midY
      }

      const d = `M ${startX} ${startY} C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${endX} ${endY}`
      let op = ''
      if (node.operators.length > 0) {
        if (index === 0) op = node.operators[0]
        else
          op =
            node.operators[index - 1] ||
            node.operators[node.operators.length - 1]
      }
      const mid = bezierPoint(
        0.5,
        startX,
        startY,
        cp1x,
        cp1y,
        cp2x,
        cp2y,
        endX,
        endY,
      )
      links.push({
        d,
        colorIndex: index % 7,
        op: op === '*' ? '×' : op === '/' ? '÷' : op,
        badgeX: mid.x,
        badgeY: mid.y,
      })
      walk(child)
    })
  }

  walk(tree)
  return { nodes, links }
}

export function formatFormulaText(text: string): string {
  const lines = text.split('\n').filter((line) => line.includes('= '))
  if (lines.length === 0) return text

  const map: Record<string, string> = {}
  const lhsList: string[] = []
  const definedNames = new Set<string>()

  lines.forEach((line) => {
    const parts = line.split(' = ')
    if (parts.length >= 2) {
      const lhs = parts[0].trim()
      const rhs = parts.slice(1).join(' = ').trim()
      if (!definedNames.has(lhs)) {
        map[lhs] = rhs
        lhsList.push(lhs)
        definedNames.add(lhs)
      }
    }
  })

  const rhsTokens = new Set<string>()
  Object.values(map).forEach((rhs) => {
    TOKEN_NAME_RE.lastIndex = 0
    let match: RegExpExecArray | null
    while ((match = TOKEN_NAME_RE.exec(rhs)) !== null) {
      const token = match[0].trim()
      if (token && !/^[0-9\.]+%?$/.test(token)) {
        rhsTokens.add(token)
      }
    }
  })

  let roots = lhsList.filter((lhs) => !rhsTokens.has(lhs))
  if (roots.length === 0 && lhsList.length > 0) {
    roots = [lhsList[0]]
  }

  const maxNameLen = Math.max(...Object.keys(map).map((k) => k.length))
  const visited = new Set<string>()
  const outputLines: string[] = []

  function traverse(node: string, indent: number) {
    if (visited.has(node)) return
    const rhs = map[node]
    if (rhs === undefined) return
    visited.add(node)

    let cleanRhs = rhs.replace(/\s*([+\-*\/×÷])\s*/g, ' $1 ')
    cleanRhs = cleanRhs.replace(/\s+/g, ' ').trim()
    cleanRhs = cleanRhs.replace(/\s*=\s*/g, ' = ')
    cleanRhs = cleanRhs.replace(/([^\s])\s*=\s*/g, '$1 = ')
    cleanRhs = cleanRhs.replace(/\s*=\s*([^\s])/g, '= $1')
    cleanRhs = cleanRhs.replace(/  +/g, ' ')

    const prefix = '\u3000\u3000'.repeat(indent)
    const paddedName = node.padEnd(maxNameLen)
    let formattedLine = `${prefix}${paddedName} = ${cleanRhs}`
    formattedLine = formattedLine.replace(/  +/g, ' ')
    outputLines.push(formattedLine)

    const children: string[] = []
    const localRegex = /([\u4e00-\u9fa5a-zA-Z][\u4e00-\u9fa5a-zA-Z0-9]*)/g
    let match: RegExpExecArray | null
    while ((match = localRegex.exec(rhs)) !== null) {
      const token = match[0].trim()
      if (map[token] && !visited.has(token)) {
        children.push(token)
      }
    }
    children.forEach((child) => traverse(child, indent + 1))
  }

  roots.forEach((r) => traverse(r, 0))
  lhsList.forEach((lhs) => {
    if (!visited.has(lhs)) traverse(lhs, 0)
  })

  return outputLines.join('\n')
}

export function nodeRectAttrs(
  node: FormulaFlatNode,
  layoutDirection: LayoutDirection,
): { x: number; y: number; width: number; height: number } {
  if (layoutDirection === 'horizontal') {
    return { x: node.x, y: node.y - NODE_H / 2, width: NODE_W, height: NODE_H }
  }
  return {
    x: node.x - NODE_W / 2,
    y: node.y - NODE_H / 2,
    width: NODE_W,
    height: NODE_H,
  }
}

export function nodeTextAttrs(
  node: FormulaFlatNode,
  layoutDirection: LayoutDirection,
): { x: number; y: number } {
  if (layoutDirection === 'horizontal') {
    return { x: node.x + NODE_W / 2, y: node.y + 4 }
  }
  return { x: node.x, y: node.y + 4 }
}

export function opCircleClass(op: string): string {
  if (op === '*' || op === '×') return 'op-multiply'
  if (op === '/' || op === '÷') return 'op-divide'
  if (op === '+') return 'op-plus'
  if (op === '-') return 'op-minus'
  return 'op-default'
}
