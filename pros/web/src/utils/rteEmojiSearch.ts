/**
 * 富文本表情搜索索引。
 *
 * 面板里的 emoji 来自 `emoji1016.txt`，只有字符、没有名称，所以中文搜索要自己补：
 *  - `ZH_ALIAS`：手工维护的中文别名（覆盖高频表情）；
 *  - `ICON_SEARCH`：`components/common/iconData.ts` 里带的 CLDR 英文名（页面已在用，不额外增大包体）;
 *  - 分类名：输入「旗帜」「手」这类词能直接命中分类。
 * 另外支持直接粘贴 emoji 字符检索。
 */

import { ICON_SEARCH } from '../components/common/iconData'
import { RTE_EMOJI_CATEGORIES, type RteEmojiCategory } from './rteEmojiList'

/** 英文名索引：字符 → CLDR 名称。 */
const NAME_BY_CHAR = new Map(ICON_SEARCH.map((item) => [item.char, item.name]))

/**
 * 中文别名（空格分隔，按需从左到右由具体到宽泛）。
 * 只覆盖高频表情；没覆盖的仍可用英文名 / 粘贴字符检索。
 */
export const ZH_ALIAS: Record<string, string> = {
  '😀': '笑 开心 咧嘴 露齿',
  '😂': '笑哭 大笑 眼泪 笑到哭',
  '🤣': '笑 笑翻 笑倒',
  '😊': '笑 微笑 开心',
  '😍': '爱 喜欢 心花怒放 迷住',
  '🥰': '爱 喜欢 幸福 爱心眼',
  '😘': '亲 飞吻 爱心',
  '🤔': '思考 想 疑问',
  '😎': '酷 墨镜 帅',
  '🤩': '星星眼 激动 崇拜',
  '🤗': '拥抱 欢迎 抱抱',
  '😏': '得意 调皮 眨眼',
  '😴': '睡觉 困 晚安',
  '😪': '困 犯困 睡',
  '😢': '哭 流泪 伤心',
  '😭': '哭 大哭 泪崩',
  '😡': '生气 愤怒 火大',
  '😱': '害怕 惊吓 尖叫',
  '😨': '害怕 惊恐 惊慌',
  '🤯': '震惊 爆炸 惊呆',
  '🥳': '庆祝 派对 兴奋',
  '🥺': '可怜 期待 撒娇',
    '🤡': '小丑 傻',
  '👻': '鬼 幽灵',
  '💀': '骷髅 死了 崩溃',
  '👽': '外星人',
  '🤖': '机器人',
  '💩': '便便 屎',
  '👍': '赞 点赞 同意 好评 大拇指',
  '👎': '踩 反对 差评 拇指向下',
  '👏': '鼓掌 掌声 厉害',
  '🙏': '拜托 求 感谢 祈祷',
  '🤝': '握手 合作 成交',
  '💪': '力量 加油 肌肉 厉害',
  '✌️': '胜利 耶 手势',
  '🤞': '好运 祈祷 交叉手指',
  '👋': '挥手 打招呼 再见',
  '🫶': '比心 爱你',
  '❤️': '爱 红心 喜欢 爱心',
  '💔': '心碎 伤心 失恋',
  '💕': '爱 爱心 亲亲',
  '💯': '满分 一百分 完美',
  '🔥': '火 热门 燃烧 爆',
  '✨': '闪亮 星光 闪耀',
  '⭐': '星 星标 收藏 星星',
  '🎉': '庆祝 派对 恭喜 彩带',
  '🎊': '庆祝 撒花 恭喜',
  '🎈': '气球 派对',
  '🎁': '礼物 礼品 赠送',
  '🏆': '奖杯 冠军 第一名',
  '🥇': '金牌 第一名 冠军',
  '🥈': '银牌 第二名',
  '🥉': '铜牌 第三名',
  '👑': '皇冠 女王 老板',
  '💎': '钻石 宝石 珍贵',
  '🔮': '占卜 算命 魔法',
  '🌈': '彩虹',
  '☀️': '太阳 晴天 白天',
  '🌙': '月亮 夜晚 月',
  '🌸': '花 樱花 春天',
  '🌺': '花 兰花',
  '🌻': '花 向日葵',
  '🌹': '花 玫瑰',
  '🍀': '幸运 四叶草',
  '🦋': '蝴蝶',
  '🦄': '独角兽  unicorn',
  '🐶': '狗 小狗',
  '🐱': '猫 小猫',
  '🐻': '熊',
  '🐼': '熊猫',
  '🦊': '狐狸',
  '🐯': '老虎',
  '🦁': '狮子',
  '🐸': '青蛙',
  '🐧': '企鹅',
  '🎵': '音乐 音符',
  '🎶': '音乐 音符',
  '💬': '对话 消息 气泡',
  '💭': '想法 思考 气泡',
  '✅': '完成 勾 对 正确',
  '❌': '叉 错误 关闭 取消',
  '⚠️': '警告 危险 注意',
  '❗': '感叹 重要 警告',
  '❓': '疑问 问号',
  '💡': '灯泡 想法 灵感',
  '📌': '图钉 重要',
  '📝': '便签 笔记 编辑',
  '📎': '附件 回形针',
  '📁': '文件夹 目录',
  '📄': '文件 文档',
  '📊': '图表 统计 报表',
  '📈': '上升 增长 趋势',
  '📉': '下降 跌',
  '📅': '日历 日程',
  '⏰': '闹钟 提醒 时间',
  '⏳': '沙漏 等待 hourglass',
  '🕒': '时间 时钟',
  '🔔': '铃铛 提醒 通知',
  '📣': '喇叭 通知 广播',
  '🔒': '锁 私密',
  '🔑': '钥匙',
  '🛠': '工具 维修 设置',
  '🔧': '扳手 工具 维修',
  '⚙️': '设置 齿轮 扳手',
  '🧪': '实验 试管 测试',
  '🧭': '指南针 方向',
  '🚀': '火箭 发布 上线',
  '🚗': '汽车 车',
  '✈️': '飞机 旅行 航班',
  '🏝': '海岛 度假',
  '🏔': '山 雪山',
  '🍎': '苹果 水果',
  '🍊': '橘子 水果',
  '🍋': '柠檬 水果',
  '🍉': '西瓜 水果',
  '🍓': '草莓 水果',
  '🍑': '桃子 水果',
  '🍕': '披萨',
  '🍔': '汉堡',
  '🍟': '薯条',
  '🍣': '寿司',
  '🍜': '面条 拉面',
  '🍚': '米饭 饭',
  '🍰': '蛋糕 甜点 生日',
  '🎂': '生日 蛋糕',
  '🍪': '饼干',
  '☕️': '咖啡',
  '🍵': '茶',
  '🍺': '啤酒',
  '🍻': '干杯 啤酒 庆祝',
  '🥂': '干杯 香槟 庆祝',
  '🎮': '游戏 手柄',
  '🎯': '目标 靶心',
  '🎲': '骰子',
  '🎳': '保龄球',
  '⚽️': '足球 运动',
  '🏀': '篮球',
  '🎾': '网球',
  '🏊': '游泳',
  '🗺': '地图 导航',
  '🏰': '城堡',
  '🎪': '马戏 帐篷',
  '🎨': '画 设计 调色',
  '🎭': '面具 表演 戏剧',
  '🎤': '麦克风 唱歌',
  '🎧': '耳机',
  '🎬': '电影 片场',
  '📷': '相机 拍照',
  '📸': '相机 拍照',
  '💰': '钱 钱袋 财富',
  '💳': '信用卡 刷卡',
  '💵': '钱 美元',
  '🧾': '发票 小票',
  '🚩': '红旗 旗',
  '🏁': '终点 旗 赛跑',
  '🏳️': '白旗 旗',
  '🏴': '黑旗 旗',
  '🎗': '书签 旗',
  '♻️': '回收 循环',
  '🔴': '红点 红',
  '🟠': '橙点 橙',
  '🟡': '黄点 黄',
  '🟢': '绿点 绿',
  '🔵': '蓝点 蓝',
  '🟣': '紫点 紫',
  '⚫️': '黑点 黑',
  '⚪️': '白点 白',
  '🟤': '棕点 棕',
  '🔺': '上三角 红色',
  '🔻': '下三角 红色',
  '▶️': '播放 三角',
  '⏸': '暂停',
  '⏹': '停止',
  '🔁': '循环 重复',
  'ℹ️': '信息',
}

export interface EmojiSearchHit {
  /** emoji 字符本身 */
  emoji: string
  /** 展示用名称：中文别名优先，其次英文名 */
  label: string
  /** 命中的分类名 */
  category: string
}

/** 面板里所有 emoji（去重后）。 */
const ALL_EMOJI: string[] = Array.from(
  new Set(RTE_EMOJI_CATEGORIES.flatMap((category) => category.emojis)),
)

/** 字符 → 所属分类名（取第一个出现的分类）。 */
const CATEGORY_BY_CHAR = new Map<string, string>()
for (const category of RTE_EMOJI_CATEGORIES as RteEmojiCategory[]) {
  for (const emoji of category.emojis) {
    if (!CATEGORY_BY_CHAR.has(emoji)) CATEGORY_BY_CHAR.set(emoji, category.label)
  }
}

function normalizeQuery(query: string): string {
  return query.trim().toLowerCase()
}

/** 中文别名 / 英文名 / 分类名 / 字符本身，任一命中即算匹配。 */
function matchEmoji(emoji: string, query: string): boolean {
  if (emoji === query) return true
  const alias = ZH_ALIAS[emoji]
  if (alias && alias.toLowerCase().includes(query)) return true
  const name = NAME_BY_CHAR.get(emoji)
  if (name && name.toLowerCase().includes(query)) return true
  const category = CATEGORY_BY_CHAR.get(emoji)
  if (category && category.toLowerCase().includes(query)) return true
  return false
}

/** 展示名称：中文别名第一个词 > 英文名 > emoji 本身。 */
function labelOf(emoji: string): string {
  const alias = ZH_ALIAS[emoji]
  if (alias) return alias.split(' ')[0]
  const name = NAME_BY_CHAR.get(emoji)
  if (name) return name
  return emoji
}

/**
 * 全库搜索（跨分类）。
 *
 * @param query 关键词；支持中文别名、英文名、分类名，或直接粘贴 emoji 字符
 * @param limit 最多返回多少条
 */
export function searchEmoji(query: string, limit = 120): EmojiSearchHit[] {
  const q = normalizeQuery(query)
  if (!q) return []
  const hits: EmojiSearchHit[] = []
  for (const emoji of ALL_EMOJI) {
    if (!matchEmoji(emoji, q)) continue
    hits.push({ emoji, label: labelOf(emoji), category: CATEGORY_BY_CHAR.get(emoji) ?? '' })
    if (hits.length >= limit) break
  }
  return hits
}

/** 分类是否被关键词命中（用于「跳到分类」）。 */
export function matchEmojiCategory(category: { label: string }, query: string): boolean {
  const q = normalizeQuery(query)
  return !!q && category.label.toLowerCase().includes(q)
}

/** 给 emoji 取一个可读名称（给 title / 无障碍标签用）。 */
export function emojiLabel(emoji: string): string {
  return labelOf(emoji)
}

