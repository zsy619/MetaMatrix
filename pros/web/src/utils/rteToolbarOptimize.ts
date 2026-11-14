/** 工具栏栏目、搜索和字号菜单用的纯逻辑。 */

export type RibbonMove = 'prev' | 'next' | 'home' | 'end'

export function readStoredRibbonTab(raw: string | null | undefined, available: readonly string[]): string {
  const ids = available.filter((id) => id.trim())
  if (raw && ids.includes(raw)) return raw
  return ids[0] || 'edit'
}

export function stepRibbonTab(ids: readonly string[], current: string, move: RibbonMove): string {
  if (!ids.length) return current
  if (move === 'home') return ids[0]!
  if (move === 'end') return ids[ids.length - 1]!
  const index = Math.max(0, ids.indexOf(current))
  const next = move === 'next' ? index + 1 : index - 1
  return ids[(next + ids.length) % ids.length]!
}

export type ToolbarSearchTool = {
  key: string
  label?: string
  title?: string
  disabled?: boolean | (() => boolean)
}

/** 按钮当前点不了。判断函数抛错时当作可用，避免搜索被一颗按钮拖垮。 */
export function toolIsUnavailable(tool: { disabled?: boolean | (() => boolean) } | null | undefined): boolean {
  if (!tool?.disabled) return false
  try {
    return typeof tool.disabled === 'function' ? !!tool.disabled() : !!tool.disabled
  } catch {
    return false
  }
}
export type ToolbarSearchGroup = { id: string; label: string; tools: readonly ToolbarSearchTool[] }
export type ToolbarSearchHit = { groupId: string; groupLabel: string; key: string; label: string }

/** 口语和说明里的叫法。按钮名称对不上时仍能搜到。 */
export const TOOLBAR_SEARCH_KEYWORDS: Record<string, readonly string[]> = {
  ruby: ['拼音', '注音', '拼音标注', '标音', '注拼音', '标个音', '再标音', '再注音', '帮我注音', '麻烦注音', '可否注音'],
  mermaid: ['流程图', '流程', '泳道', '画流程', '做流程图', '再画流程', '再做流程', '帮我画流程', '麻烦画流程', '可否画流程'],
  table: ['表格', '插入表格', '插表', '画表', '制表', '做表', '建个表', '再画表', '再制表', '再插表', '帮我做表', '麻烦做表', '可否做表'],
  find: ['查找', '搜索', '寻找', '找字', '搜字', '找内容', '搜寻', '找一找', '再搜搜', '再寻找', '再找字', '再找一找', '给我找一找', '麻烦找一找', '可否找一找'],
  undo: ['撤销', '撤回', '返回', '退回', '上一步', '撤销一下', '退回去', '往回退', '再撤回', '再退回', '再退一步', '给我退一步', '麻烦退一步', '可否退一步'],
  redo: ['重做', '恢复', '前进', '往前', '下一步', '再来一次', '重做一遍', '再重做', '再前进', '再往前', '帮我重做', '麻烦重做', '可否重做'],
  formatPainter: ['格式刷', '刷子', '复制格式', '刷格式', '刷一下', '再刷一次', '再复制格式', '再刷格式', '再刷一下', '给我刷一下', '麻烦刷一下', '可否刷一下'],
  callout: ['告示', '提示框', '警告', '高亮块', '提示条', '出个告示', '出提示', '再出告示', '再提示', '再出提示', '给我出提示', '麻烦出提示', '可否出提示'],
  columns: ['分栏', '多栏', '两栏', '三栏', '竖栏', '分列', '分成栏', '排成栏', '左右栏', '排两栏', '再分栏', '再排成栏', '再排两栏', '给我排两栏', '麻烦排两栏', '可否排两栏'],
  fontSize: ['字号', '磅值', '小四', '字的大小', '字体大小', '调字号', '改字号', '改成小四', '帮我改字号', '麻烦改字号', '可否改字号'],
  fontFamily: ['字体', '字形', '字库', '换字体', '换个字体', '换一套字', '再换字体', '再换一套字', '再换字形', '给我换字形', '麻烦换字形', '可否换字形'],
  highlight: ['高亮', '荧光笔', '底色', '涂黄', '标黄', '划重点', '做标记', '标一下', '标个黄', '再标黄', '再涂黄', '再划重点', '再标个黄', '给我标个黄', '麻烦标个黄', '可否标个黄'],
  color: ['颜色', '文字颜色', '字色', '换字色', '字换色', '再换色', '再字色', '帮我换字色', '麻烦换字色', '可否换字色'],
  quote: ['引用', '引文', '引语', '加引用', '来段引用', '引一段', '再引一段', '再来段引用', '再加引用', '帮我加引用', '能不能加引用', '要不要加引用'],
  quoteStyle: ['引用样式', '换引号', '换个引号', '我想换引号'],
  list: ['列表', '编号', '项目符号', '清单', '条目', '列个单', '列成清单', '帮我列个单', '能不能列个单', '要不要列个单'],
  listStyle: ['编号样式', '罗马', '字母', '换编号', '换成罗马数字', '我想换编号'],
  bold: ['加粗', '粗体', '加黑', '变粗', '黑体', '加粗字', '字变粗', '字加粗', '再加粗', '再变粗', '再黑体', '帮我加粗', '能不能加粗', '要不要加粗'],
  italic: ['斜体', '倾斜', '斜着', '斜字', '斜体字', '字变斜', '字倾斜', '再倾斜', '再斜着', '再斜字', '帮我变斜', '能不能变斜', '要不要变斜'],
  underline: ['下划线', '下划', '下横线', '底线', '加下划', '底下划线', '划底下', '再加下划', '再下划', '再底线', '帮我加下划', '能不能加下划', '要不要加下划'],
  strike: ['删除线', '划掉', '划线', '中划线', '加删除线', '划掉字', '字划掉', '再划掉', '再中划', '再划掉字', '帮我划掉', '能不能划掉', '要不要划掉'],
  align: ['对齐', '居中', '两端对齐', '居左', '居右', '两端', '摆正', '居中放', '居中摆', '再居中', '再摆正', '帮我居中', '能不能居中', '要不要居中'],
  image: ['图片', '插图', '插图片', '贴图', '配图', '插入图', '放张图', '再放图', '再贴图', '再配图', '再放张图', '帮我放张图', '能不能放张图', '要不要放张图'],
  imageLayout: ['环绕', '排法', '绕排', '文字绕图', '绕着排', '再绕排', '图文绕', '再文字绕图', '帮我文字绕图', '能不能文字绕图', '要不要文字绕图'],
  link: ['链接', '超链接', '网址', '链到', '跳转', '加链接', '挂链接', '链一下', '再加链', '再挂链', '再加链接', '再链一下', '给我链一下', '能不能链一下', '要不要链一下'],
  clear: ['清除格式', '清除样式', '去掉格式', '还原格式', '清格式', '格式清掉', '清干净', '再清掉', '再还原格式', '再清格式', '再清干净', '给我清干净', '能不能清干净', '要不要清干净'],
  heading: ['标题', '正文', '段落样式', '改标题', '改成标题', '升成标题', '再改标题', '再升成标题', '帮我改标题', '能不能改标题', '要不要改标题'],
  paraStyle: ['段样式', '导语', '改段样', '改成导语', '我想改成导语'],
  zoom: ['缩放', '放大', '缩小', '显示比例', '视图比例', '拉近', '拉远', '再拉近', '再放大', '再缩小', '再拉远', '帮我拉近', '能不能拉近', '要不要拉近'],
  print: ['打印', '打印纸', '印出来', '打出来', '去打印', '出纸', '打一份', '再打印', '再出纸', '再打出来', '再打一份', '给我打一份', '能不能打一份', '要不要打一份'],
  import: ['导入', '打开文档', '打开文件', '读入', '载入', '再载入', '再打开', '再读入', '再载入文件', '帮我导入', '能不能导入', '要不要导入'],
  export: ['导出', 'pdf', 'word', '下载', '另存', '存成', '存出去', '再存一份', '再导出', '再存成', '再另存', '帮我导出', '能不能导出', '要不要导出'],
  textTidy: ['整理', '半角', '全角', '理一理', '再整理', '再理一遍', '半角化', '再理一理', '帮我理一理', '能不能理一理', '要不要理一理'],
  textDir: ['方向', '从右到左', '竖排', '竖着排', '横着排', '改方向', '再竖排', '再横着排', '帮我竖排', '能不能竖排', '要不要竖排'],
  writingPaper: ['纸样', '田字格', '稿纸', '信纸', '方格纸', '铺格子', '铺稿纸', '再铺纸', '再铺格子', '再铺稿纸', '帮我铺稿纸', '能不能铺稿纸', '要不要铺稿纸'],
  tableStruct: ['行列', '插入行', '加一行', '再加一行', '我想加一行'],
  speak: ['朗读', '读出来', '念出来', '出声', '开始读', '读一读', '念给我听', '再念给我听', '给我念一念', '能不能念一念', '要不要念一念'],
  outline: ['大纲', '目录导航', '导航', '章节', '提纲', '看大纲', '打开大纲', '打开提纲', '再打开提纲', '给我打开提纲', '能不能打开提纲', '要不要打开提纲'],
  hr: ['分割线', '横线', '分隔线', '加横线', '画条线', '再画条线', '帮我画条线', '能不能画条线', '要不要画条线'],
  emoji: ['表情', '颜文字', '表情包', '表情符号', '插表情', '贴表情', '再贴表情', '帮我插表情', '能不能插表情', '要不要插表情'],
  qrcode: ['二维码', 'qr', '扫码', '扫一扫', '做二维码', '再做二维码', '再扫一扫', '给我做二维码', '能不能做二维码', '要不要做二维码'],
  formula: ['公式', 'latex', '数学', '算式', '方程式', '数学式', '写公式', '再写公式', '帮我写公式', '能不能写公式', '要不要写公式'],
  video: ['视频', '影片', '短片', '录像', '放视频', '播视频', '再看片', '再放视频', '给我放视频', '能不能放视频', '要不要放视频'],
  audio: ['音频', '声音', '录音', '音乐', '放音频', '播音频', '听一听', '再听一听', '给我听一听', '能不能听一听', '要不要听一听'],
  pageBreak: ['分页', '分页符', '换页', '断页', '另起一页', '再另起一页', '帮我另起一页', '能不能另起一页', '要不要另起一页'],
  printPreview: ['打印预览', '看打印', '预看', '再预看', '给我预看'],
  comment: ['评论', '批注', '留言', '评语', '点评', '写批注', '加批注', '再加批注', '帮我加批注', '能不能加批注', '要不要加批注'],
  footnote: ['脚注', '尾注', '注脚', '页下注', '加脚注', '补脚注', '再加脚注', '给我加脚注', '可否加脚注'],
  watermark: ['水印', '底纹', '背景字', '加水印', '再加水印', '帮我加水印', '能不能加水印', '要不要加水印'],
  emphasisDot: ['着重号', '加点', '再加点', '给我加点'],
  pastePlain: ['纯文本', '粘贴', '无格式粘贴', '纯粘贴', '只贴文字', '只贴字', '给我只贴字'],
  pasteFormat: ['粘贴格式', '带格式粘贴', '原样粘贴', '连格式贴', '连格式一起贴', '我想连格式贴'],
  tableZebra: ['斑马纹', '隔行', '隔行色', '隔行上色', '再隔行上色', '我想隔行上色'],
  subscript: ['下标', '下角标', '下标字', '写到下边', '再写下标', '给我写下标', '可否写下标'],
  superscript: ['上标', '上角标', '上标字', '写到上边', '再写上标', '给我写上标', '可否写上标'],
  imageReplace: ['换图', '替换图片', '换一张', '再换一张', '给我换一张'],
  headingAutoNum: ['标题号', '自动编号', '自动编标题号', '我想自动编号'],
  spellcheck: ['拼写检查', '错词', '查错', '检查拼写', '再查错', '给我查错', '可否查错'],
  revision: ['修订', '改动', '修订记录', '看修订记录', '给我看修订'],
  bookmark: ['书签', '锚点', '锚', '位置标记', '加书签', '再加书签', '帮我加书签', '可否加书签'],
  readTime: ['阅读时长', '时长', '要读多久', '要读几分钟', '给我看时长'],
  shortcuts: ['快捷键', '看快捷键', '看看快捷键', '给我看快捷键'],
  snippets: ['片段', '常用语', '常用段落', '常用句', '套一句', '再套一句', '给我套一句', '可否套一句'],
  timeline: ['时间线', '时间轴', '大事记', '排大事', '再排大事', '给我排大事', '可否排大事'],
  linkCard: ['网页卡', '链接卡片', '做成卡片', '再做成卡片', '给我做成卡片', '可否做成卡片'],
  speakStop: ['停止朗读', '停读', '别读了', '先别读了', '给我停读', '可否停读'],
  immersive: ['沉浸', '全屏', '全屏看', '再全屏看', '我想全屏看', '可否全屏看'],
  statusChip: ['徽章', '状态', '贴徽章', '再贴徽章', '我想贴徽章'],
  progressBar: ['进度条', '进度', '完成度', '完成比例', '画进度', '再画进度', '我想画进度'],
  sensitive: ['敏感词', '错别字', '敏感', '查敏感', '再查敏感', '我想查敏感'],
  wordStats: ['字数', '统计', '数字数', '再数字数', '我想数字数'],
  headingCheck: ['标题检查', '跳级', '标题检', '查标题', '再查标题', '我想查标题'],
  linkCheck: ['链接检查', '死链', '链检', '查链接', '再查链接', '我想查链接'],
  outbound: ['外链', '白名单', '管外链', '再管外链', '我想管外链'],
  note: ['注释', '加注释', '再加注释', '我想加注释'],
  form: ['表单', '单选', '多选', '做表单', '再做表单', '我想做表单', '可否做表单'],
  spacing: ['段距', '段前', '字间距', '段间距', '再调段距', '我想调段距', '可否调段距'],
  firstIndent: ['首行缩进', '首行', '空两格', '再空两格', '我想空两格'],
  indent: ['增加缩进', '缩进', '往里缩', '再往里缩', '我想往里缩', '可否往里缩'],
  outdent: ['减少缩进', '往外推', '再往外推', '我想往外推'],
  dropCap: ['首字下沉', '首字', '放大首字', '再放大首字', '我想放大首字', '可否放大首字'],
  spoiler: ['揭晓', '先藏着', '再先藏着', '我想先藏着'],
  imageRadius: ['圆角', '图片圆角', '再加圆角', '我想加圆角'],
  imageShadow: ['阴影', '投影', '再加投影', '我想加投影'],
  imageBorder: ['边框', '图框', '再加图框', '我想加图框'],
  imageAlt: ['替代文本', 'alt', '图片说明', '再写替代文本', '我想写替代文本'],
  tableSticky: ['冻结表头', '表头', '锁表头', '钉住表头', '再钉住表头', '我想钉住表头', '可否钉住表头'],
  tableColSticky: ['冻结首列', '首列', '钉住首列', '再钉住首列', '我想钉住首列'],
  tableFilter: ['筛选', '过滤', '筛表', '筛一下', '再筛一下', '我想筛一下'],
  tableEqual: ['均分列', '列宽', '列一样宽', '再列一样宽', '请来均分列'],
  tableSort: ['排序', '升序', '降序', '排表', '按序排', '再按序排', '请来排个序'],
  tableCsv: ['csv', '导出表格', '表csv', '导出表', '表存出来', '再表存出来', '请来导出表'],
  suggest: ['建议', '修订建议', '提建议', '再提建议', '请来提建议'],
  suggestAccept: ['接受修订', '接受', '再接受修订', '请来接受修订'],
  suggestReject: ['拒绝修订', '拒绝', '再拒绝修订', '请来拒绝修订'],
  deepOptimize: ['深度优化', '一键整理', '深优化', '整理全文', '再整理全文', '请来整理全文'],
  toggleBlock: ['折叠', '折起来', '再折起来', '请来折起来'],
  tabsBlock: ['标签页', '分页签', '分几页', '再分几页', '请来分几页'],
  blockOps: ['块操作', '上移', '下移', '往上挪', '再往上挪', '请来往上挪'],
  insertDate: ['日期', '今天', '今天日期', '插入今天', '写上今天', '再写上今天', '请来写上今天'],
  pageSetup: ['页面设置', '页边距', '纸张', '页边', '页设置', '设页面', '改页面', '再改页面', '请来改页面'],
  paperGuide: ['参考线', '纸张边界', '看边界', '再看边界', '请来看边界'],
  printUrls: ['打印链接', '印出网址', '印网址', '再印网址', '请来印网址'],
  copyMd: ['markdown', '复制markdown', '复制md', '拷成md', '再拷成md', '请来拷成md'],
  audit: ['审计', '操作记录', '看记录', '再看记录', '请来看记录'],
  inlineAi: ['改写', '文内', '文内ai', '帮我改', '再帮我改', '请来改一改'],
  codeInline: ['行内代码', '行内码', '行内写', '再行内写', '请来行内写'],
  caseTransform: ['大小写', '全大写', '全小写', '换大小写', '再换大小写', '请来换大小写'],
  specialChars: ['符号', '字符', '希腊字母', '特殊符号', '插符号', '再插符号', '帮我插符号'],
  tableFormula: ['求和', '格公式', '算一算', '再算一算', '请来算一算'],
  cjkTip: ['禁则', '避头尾', '避开头', '再避开头', '请来避开头'],
  captionNum: ['题注', '图注', '给图编号', '再给图编号', '请来给图编号'],
  footnoteList: ['脚注区', '脚注列表', '脚注清单', '再看脚注清单', '请来看脚注清单'],
  linkButton: ['按钮', '链接按钮', '做成按钮', '再做成按钮', '请来做成按钮'],
  crossDoc: ['跨文档', '同步块', '同步一块', '再同步一块', '请来同步一块'],
  mentionBtn: ['提及', 'at', '艾特', '@人', '再艾特', '请来艾特'],
  mentionPerm: ['提及权限', '谁能被提及', '再设提及权限', '请来设提及权限'],
  xref: ['交叉引用', '见图', '见表', '互相引用', '再互相引用', '请来互相引用'],
  'chart:basic': ['折线', '柱状', '饼图', '散点', '画柱子', '再画柱子', '麻烦画柱子'],
  'chart:stats': ['箱线', '热力', '仪表盘', '漏斗', '画漏斗', '再画漏斗', '麻烦画漏斗'],
  'chart:relation': ['关系图', '桑基', '和弦', '再画桑基', '麻烦画桑基'],
  'chart:hierarchy': ['树图', '矩形树', '旭日', '再画树图', '麻烦画树图'],
  'chart:geo': ['地图', '地理', '画地图', '再画地图', '麻烦画地图'],
  'chart:finance': ['k线', '蜡烛', '再画蜡烛', '麻烦画蜡烛'],
  'chart:coordinate': ['雷达', '平行坐标', '日历图', '画雷达', '再画雷达', '麻烦画雷达'],
  'chart:component': ['数据集', '区域缩放', '再做数据集', '麻烦做数据集'],
  'chart:gl': ['三维', '3d', '曲面', '再画曲面', '麻烦画曲面'],
  code: ['代码块', '代码', '编程', '写代码', '代码区', '代码段', '再写代码', '请来写代码', '可否写代码'],
  lineHeight: ['行距', '行高', '行间隔', '行稀疏', '拉开行', '行拉开', '再拉开行', '请来拉开行'],
  attach: ['附件', '回形针', '夹文件', '夹带', '加附件', '附上文件', '再附上文件', '麻烦附上文件'],
  tidyHalf: ['转半角', '变成半角', '再转半角', '麻烦转半角'],
  tidyFull: ['转全角', '变成全角', '再转全角', '麻烦转全角'],
  tidyPangu: ['中英文空格', '盘古', '加空格', '再加空格', '麻烦加空格'],
  tidySqueeze: ['压缩空格', '多余空格', '挤空格', '再挤空格', '麻烦挤空格'],
  viewExtras: ['更多视图', '视图更多', '更多看', '再更多看', '麻烦更多看'],
  revisionBase: ['修订基线', '基线', '设基线', '再设基线', '麻烦设基线'],
  template: ['模板', '文档模板', '用模板', '再用模板', '麻烦用模板', '可否用模板'],
}

/** 正在搜索时不要改分组顺序，避免按过滤后的结果把工具栏排乱。 */
export function toolbarGroupReorderAllowed(query: string): boolean {
  return !normalizeToolbarQuery(query)
}

/** 「更多」菜单里上下方向键、Home 和 End 该落到哪一项。没有对应按键时返回空。 */
export function menuFocusStep(index: number, count: number, key: string): number | null {
  if (count <= 0) return null
  if (key === 'Home') return 0
  if (key === 'End') return count - 1
  if (key !== 'ArrowDown' && key !== 'ArrowUp') return null
  if (index < 0) return key === 'ArrowDown' ? 0 : count - 1
  return cycleSearchIndex(index, count, key === 'ArrowDown' ? 1 : -1)
}

/** 未最大化时平时只留常用按钮；一旦开始搜索，就要能搜到收在「更多」里的按钮。 */
export function toolsForToolbar<T extends { key: string; kind?: string }>(
  tools: readonly T[],
  opts: { expanded: boolean; querying: boolean; primary: ReadonlySet<string> },
): T[] {
  return tools.filter((tool) => {
    if (tool.kind === 'divider') return false
    if (opts.expanded || opts.querying) return true
    return opts.primary.has(tool.key)
  })
}

/** 收掉首尾空格、全角空格和零宽字符，并把全角字母折成半角。 */
export function normalizeToolbarQuery(query: string): string {
  return query
    .normalize('NFKC')
    .replace(/[\u200b\u200c\u200d\ufeff]/g, '')
    .trim()
    .replace(/[\s\u3000]+/g, ' ')
    .toLowerCase()
}

/** 搜索词过长时只留前若干字，避免一次贴进整段正文。 */
export function clampToolbarQuery(query: string, max = 32): string {
  const chars = [...query]
  const limit = Math.max(1, max)
  return chars.length <= limit ? query : chars.slice(0, limit).join('')
}

export const LAST_TOOLBAR_QUERY_KEY = 'rte-toolbar-last-query'
export const SEARCH_INPUT_HINT = 'Esc 清除，向下键定位首选。只有一个可用结果时，Enter 直接使用'

/** 从「加粗 (Ctrl/⌘+B)」里取出快捷键。 */
export function shortcutFromTitle(title: string): string {
  const matched = title.match(/[(（]([^()（）]*[+＋][^()（）]*)[)）]/)
  return matched?.[1]?.trim() || ''
}

export function shortcutNeedles(title: string): string[] {
  const raw = shortcutFromTitle(title)
  if (!raw) return []
  const out = new Set<string>()
  const combined = raw.toLowerCase().replace(/ctrl\/⌘/g, 'ctrl').replace(/\s/g, '')
  if (combined) out.add(combined)
  for (const bit of raw.split('/')) {
    const text = bit.trim().toLowerCase().replace(/\s/g, '')
    if (!text) continue
    out.add(text)
    out.add(text.replace(/⌘/g, 'ctrl'))
  }
  return [...out]
}

function searchScoreOne(tool: ToolbarSearchTool, query: string): number {
  const label = (tool.label || '').trim().toLowerCase()
  if (!label) return -1
  const title = (tool.title || '').toLowerCase()
  const aliases = (TOOLBAR_SEARCH_KEYWORDS[tool.key] || []).map((item) => item.toLowerCase())
  const key = tool.key.toLowerCase()
  const folded = query.replace(/\s/g, '')
  if (label === query) return 0
  if (label.startsWith(query)) return 1
  if (label.includes(query)) return 2
  if (aliases.some((item) => item === query || item.includes(query))) return 3
  if (title.includes(query)) return 4
  if (folded.length >= 2 && shortcutNeedles(tool.title || '').some((item) => item.includes(folded))) return 4
  if (key === query || key.startsWith(query)) return 5
  if (query.length >= 2 && key.includes(query)) return 5
  return -1
}

/** 「拼 音」去掉中间空格后再比一次。 */
function searchScore(tool: ToolbarSearchTool, query: string, groupLabel = ''): number {
  const compact = query.replace(/\s+/g, '')
  const spaced = searchScoreOne(tool, query)
  const tight = !compact || compact === query ? -1 : searchScoreOne(tool, compact)
  let own = spaced
  if (tight >= 0 && (own < 0 || tight < own)) own = tight
  const group = groupLabel.trim().toLowerCase()
  if (group && (group === query || group === compact) && own < 0) own = 6
  if (own < 0) return -1
  return own + (toolIsUnavailable(tool) ? 20 : 0)
}

/** 按名称、说明、别名或 key 找工具。空查询不返回结果。完全匹配排在前面。 */
export function searchToolbarTools(groups: readonly ToolbarSearchGroup[], query: string, limit = 8): ToolbarSearchHit[] {
  const q = normalizeToolbarQuery(query)
  if (!q) return []
  const ranked: Array<{ hit: ToolbarSearchHit; score: number; index: number }> = []
  let index = 0
  for (const group of groups) {
    for (const tool of group.tools) {
      const label = (tool.label || '').trim()
      const score = searchScore(tool, q, group.label)
      index += 1
      if (!label || score < 0) continue
      ranked.push({
        hit: { groupId: group.id, groupLabel: group.label, key: tool.key, label },
        score,
        index,
      })
    }
  }
  ranked.sort((a, b) => a.score - b.score || a.index - b.index)
  return ranked.slice(0, Math.max(1, limit)).map((item) => item.hit)
}

/** 搜索框下方的一句结果。空查询不显示。有结果时点出首选按钮和所在栏目。 */
export function toolbarSearchStatus(query: string, count: number, best = '', capped = false, place = '', bestDisabled = false): string {
  if (!normalizeToolbarQuery(query)) return ''
  if (count <= 0) return '没有匹配的按钮。试试拼音、表格或饼图'
  const first = best.trim() ? `，首选「${best.trim()}」` : ''
  const where = place.trim() ? `，在${place.trim()}` : ''
  const more = capped ? '，只列出前若干个' : ''
  if (count === 1 && bestDisabled) return `找到 1 个按钮${first}${where}，当前不可用`
  if (count === 1) return `找到 1 个按钮${first}${where}，按 Enter 直接使用`
  return `找到 ${count} 个按钮${first}${where}${more}，左右键可在结果间移动`
}

export type ToolbarMenuKeyAction = 'move' | 'open' | 'close' | 'ignore'

/** 工具栏浮层的按键该打开、移动、关闭，还是留给编辑器。 */
export function toolbarMenuKeyAction(key: string, inMenu: boolean, menuOpen: boolean): ToolbarMenuKeyAction {
  if (inMenu && key === 'Escape') return 'close'
  if (inMenu && (key === 'ArrowDown' || key === 'ArrowUp' || key === 'Home' || key === 'End')) return 'move'
  if (!inMenu && key === 'ArrowDown' && menuOpen) return 'move'
  if (!inMenu && key === 'ArrowDown') return 'open'
  return 'ignore'
}

/** 在菜单里打一个字，跳到下一个以它开头的项。没有就返回 -1。 */
export function menuTypeaheadIndex(labels: readonly string[], typed: string, from = -1): number {
  const q = typed.trim().toLowerCase()
  if (q.length !== 1) return -1
  const total = labels.length
  if (!total) return -1
  const start = Number.isInteger(from) ? from : -1
  for (let step = 1; step <= total; step += 1) {
    const index = (start + step + total) % total
    const label = (labels[index] || '').trim().toLowerCase()
    if (label.startsWith(q)) return index
  }
  return -1
}

const MENU_ITEM_TITLES: Record<string, string> = {
  '均分（1:1）': '把内容分成左右等宽的两栏',
  '左窄右宽（1:2）': '左边窄、右边宽',
  '左宽右窄（2:1）': '左边宽、右边窄',
  '均分（1:1:1）': '把内容分成等宽的三栏',
  '中宽（1:2:1）': '中间一栏更宽',
  '四栏': '分成四栏等宽',
  '五栏': '分成五栏等宽',
  '六栏': '分成六栏等宽',
  '蓝色按钮': '插入蓝色的链接按钮',
  '绿色按钮': '插入绿色的链接按钮',
  '橙色按钮': '插入橙色的链接按钮',
  '红色按钮': '插入红色的链接按钮',
  '灰色按钮': '插入灰色的链接按钮',
  '修改文字和链接': '改按钮上的字和打开的网址',
  '增加缩进': '把整段向右缩进',
  '减少缩进': '把整段向左退回',
  '只缩进文字': '只把文字往里收，不改列表层级',
  '只减少缩进': '只把文字往外放，不改列表层级',
  '首行缩进 2 字': '段首空出两个字',
  '取消首行缩进': '取消段首空出的两个字',
  '全大写': '把选中的英文变成大写',
  '全小写': '把选中的英文变成小写',
  '词首大写': '把每个英文词的首字母变成大写',
  '转为半角': '把全角字母和数字转成半角',
  '转为全角': '把半角字母和数字转成全角',
  '中英文加空格': '在汉字和英文数字之间补一个空格',
  '去掉多余空格': '把连续空格收成一个',
  '按行排序': '把每一行按文字顺序重排',
  '去掉重复行': '删掉内容相同的行',
  '给每行编号': '在每一行前面加上序号',
  '无序列表': '用圆点列出各项',
  '有序列表': '用数字列出各项',
  '任务列表': '用可勾选的待办列出各项',
  '数字 1. 2. 3.': '用 1、2、3 编号',
  '字母 a. b. c.': '用 a、b、c 编号',
  '罗马 i. ii. iii.': '用小写罗马数字编号',
  '1. 2. 3.': '用阿拉伯数字编号',
  'a. b. c.': '用小写字母编号',
  'A. B. C.': '用大写字母编号',
  'i. ii. iii.': '用小写罗马数字编号',
  'I. II. III.': '用大写罗马数字编号',
  '一、二、三': '用中文数字编号',
  '自定义起始…': '把这一项改成指定的起始编号',
  '自定义尺寸…': '自己填表格的行数和列数',
  '一键生成…': '按数据自动生成图表',
  '揭晓文字': '把选中文字收成需要点击才显示的内容',
  '首字下沉': '把段落第一个字放大下沉',
  '正文': '恢复默认字号和段距',
  '导语': '字号略大，段后多留一点空',
  '题注体': '小号灰色，用来写图或表的说明',
  '引用体': '改成斜体，并略向内缩',
  '等宽说明': '改成等宽小字',
  '注释小字': '改成更小的灰色字',
  '75%': '把编辑区缩到四分之三',
  '90%': '把编辑区略微缩小',
  '100%': '恢复编辑区的实际大小',
  '125%': '把编辑区放大到一又四分之一',
  '150%': '把编辑区放大到一倍半',
  '取消告示框': '去掉当前告示，留下里面的文字',
  '默认': '恢复普通编辑纸面',
  '小红书': '窄卡片，顶部一条红色',
  '公众号': '适合长文的窄栏',
  '信纸': '横线信纸',
  '稿纸': '方格稿纸',
  '田字格': '带拼音栏的田字格',
  '米字格': '习字用的米字格',
  '四线三格': '英文四线格',
  '点阵': '点阵练习纸',
  '康奈尔': '左边线索栏，底部总结栏',
  '竖排': '文字从上往下、从右往左排',
  '坐标纸': '小格加大格的坐标纸',
  '从左到右': '段落从左往右写',
  '从右到左': '段落从右往左写',
  '自动': '按文字自己决定方向',
  '标准引用': '左侧一条竖线',
  '强调引用': '浅色底，用来强调',
  '诗文引用': '居中，适合诗文',
  '直角': '图片四角保持直角',
  '小圆': '图片四角略圆',
  '圆角': '图片四角变成中等圆角',
  '大圆': '图片四角更圆',
  '胶囊': '图片变成胶囊形',
  '无影': '去掉图片阴影',
  '轻影': '给图片加一层浅阴影',
  '深影': '给图片加一层较深的阴影',
  '无边': '去掉图片边框',
  '细边': '给图片加一条细灰边',
  '强调': '给图片加一条蓝色粗边',
}

const BLOCK_MENU_TITLES: Record<string, string> = {
  paragraph: '把这一段改成正文',
  h1: '改成一级标题',
  h2: '改成二级标题',
  h3: '改成三级标题',
  'other-headings': '打开四级到六级标题',
  h4: '改成四级标题',
  h5: '改成五级标题',
  h6: '改成六级标题',
  ordered: '改成有序列表',
  bullet: '改成无序列表',
  task: '改成可勾选的任务列表',
  code: '改成代码块',
  quote: '改成引用',
  'quote-default': '左侧一条竖线的引用',
  'quote-emphasis': '浅色底的强调引用',
  'quote-verse': '居中的诗文引用',
  callout: '改成高亮告示',
  'callout-info': '插入蓝色提示告示',
  'callout-warn': '插入橙色警告告示',
  'callout-success': '插入绿色成功告示',
  'callout-error': '插入红色错误告示',
  sync: '插入一块会同步的内容',
}

/** 段落菜单每一项改完是什么。没有说明时返回空字符串。 */
export function blockMenuTitle(id: string): string {
  return BLOCK_MENU_TITLES[id] || ''
}

const WORD_STAT_TITLES: Record<string, string> = {
  chars: '去掉空白后的字符数，含标题、表格和代码',
  words: '按中英文分开估算的词数',
  minutes: '按大约 400 字一分钟估算',
  paragraphs: '有文字的段落个数，空段不算',
  lines: '按换行计算的行数',
  headings: '文档里的标题个数',
  cjk: '汉字的个数',
  ascii: '英文单词的个数',
  selectionChars: '当前选中、去掉空白后的字符数',
  selectionWords: '当前选中的词数',
  cn: '一个汉字算一个',
  images: '文档里的图片张数',
  dock: '打开或收起详细字数',
  close: '关掉字数条',
}

const PICKER_TAB_TITLES: Record<string, string> = {
  '常用': '最常插入的表情',
  '大号表情': '更大的表情格子',
  '颜文字': '用符号拼成的表情',
  '笑脸': '笑脸和情绪',
  '手势': '手和手势',
  '人物': '人和身体',
  '自然': '动物、植物和天气',
  '食物': '食物和饮料',
  '物品': '日常物品',
  '符号': '标记和符号表情',
  '旅行': '交通和地点',
  '活动': '庆祝和运动',
  '标点': '中英文标点',
  '数学': '加减乘除和比较号',
  '货币': '货币符号',
  '箭头': '方向箭头',
  '版权': '版权和商标符号',
  '括号': '各种括号',
  '希腊': '希腊字母',
  '单位': '常用单位符号',
  '序号': '带圈或带点的序号',
  '罗马': '罗马数字字符',
  '全角': '全角字母、数字和标点',
  '制表': '画表格用的线条',
  '拼音': '拼音声调符号',
}

const SPACING_GROUP_TITLES: Record<string, string> = {
  marginTop: '设置这一段和上一段之间空多少',
  marginBottom: '设置这一段和下一段之间空多少',
  letterSpacing: '设置字和字之间拉开多少',
  textIndent: '设置段首空出几个字',
  textDir: '设置这一段从哪边开始写',
}

const SPACING_OPTION_TITLES: Record<string, string> = {
  'marginTop:default': '段前用编辑器原来的距离',
  'marginTop:0': '这一段和上一段贴在一起',
  'marginTop:0.5em': '段前空出半个字',
  'marginTop:1em': '段前空出一个字',
  'marginTop:1.5em': '段前空出一个半字',
  'marginTop:2em': '段前空出两个字',
  'marginTop:3em': '段前空出三个字',
  'marginBottom:default': '段后用编辑器原来的距离',
  'marginBottom:0': '这一段和下一段贴在一起',
  'marginBottom:0.5em': '段后空出半个字',
  'marginBottom:1em': '段后空出一个字',
  'marginBottom:1.5em': '段后空出一个半字',
  'marginBottom:2em': '段后空出两个字',
  'marginBottom:3em': '段后空出三个字',
  'letterSpacing:default': '字间距用原来的疏密',
  'letterSpacing:0': '字和字贴紧',
  'letterSpacing:0.05em': '字间距略微拉开',
  'letterSpacing:0.1em': '字间距拉开约十分之一个字',
  'letterSpacing:0.15em': '字间距再拉开一点',
  'letterSpacing:0.2em': '字间距拉开约五分之一个字',
  'letterSpacing:0.3em': '字间距拉开约三分之一个字',
  'textIndent:default': '段首不空字',
  'textIndent:2em': '段首空出两个字',
  'textIndent:3em': '段首空出三个字',
  'textIndent:4em': '段首空出四个字',
  'textDir:default': '按文字自己决定从哪边写',
  'textDir:ltr': '这一段从左往右写',
  'textDir:rtl': '这一段从右往左写',
}

const CODE_LANG_TITLES: Record<string, string> = {
  '纯文本': '不按语言上色，原样显示',
  'JavaScript': '按 JavaScript 的语法给这段代码上色',
  'TypeScript': '按 TypeScript 的语法给这段代码上色',
  'JSON': '按 JSON 的语法给这段代码上色',
  'HTML': '按 HTML 的语法给这段代码上色',
  'CSS': '按 CSS 的语法给这段代码上色',
  'Python': '按 Python 的语法给这段代码上色',
  'Java': '按 Java 的语法给这段代码上色',
  'Go': '按 Go 的语法给这段代码上色',
  'Rust': '按 Rust 的语法给这段代码上色',
  'SQL': '按 SQL 的语法给这段代码上色',
  'Bash': '按 Bash 命令的语法给这段代码上色',
  'Markdown': '按 Markdown 的语法给这段代码上色',
  'C': '按 C 的语法给这段代码上色',
  'C++': '按 C++ 的语法给这段代码上色',
}

const PAGE_SIZE_TITLES: Record<string, string> = {
  full: '编辑区铺满整个面板',
  feishu: '居中一条适中的阅读栏',
  a3: 'A3 纸，297×420 毫米',
  a4: 'A4 纸，210×297 毫米',
  a5: 'A5 纸，148×210 毫米',
  '8k': '8 开纸，大约 270×390 毫米',
  b5: 'B5 纸，176×250 毫米',
  letter: 'Letter 纸，216×279 毫米',
}

const IMAGE_WIDTH_TITLES: Record<string, string> = {
  '原始': '图片用本身的宽度',
  '25%': '图片缩到编辑区的四分之一宽',
  '50%': '图片缩到编辑区的一半宽',
  '75%': '图片缩到编辑区的四分之三宽',
  '100%': '图片铺满编辑区的宽度',
}

const BLOCK_HANDLE_TITLES: Record<string, string> = {
  menu: '打开这一块的操作：改类型、复制、移动或删除',
  insert: '在这一块下面插入空段，并打开插入菜单',
  paragraph: '把这一块改成正文',
  h1: '把这一块改成一级标题',
  h2: '把这一块改成二级标题',
  h3: '把这一块改成三级标题',
  bullet: '把这一块改成圆点列表',
  ordered: '把这一块改成数字列表',
  task: '把这一块改成可勾选的待办',
  quote: '把这一块改成引用',
  info: '把这一块改成蓝色提示告示',
  warn: '把这一块改成橙色警告告示',
  success: '把这一块改成绿色成功告示',
  error: '把这一块改成红色错误告示',
  copy: '在下面再复制一份这一块',
  up: '和上面一块交换位置',
  down: '和下面一块交换位置',
  delete: '删掉这一块',
}

const CROP_TITLES: Record<string, string> = {
  '原始': '取消裁剪，显示整张图',
  '1:1': '裁成正方形',
  '4:3': '裁成横图，宽比高是 4 比 3',
  '3:4': '裁成竖图，宽比高是 3 比 4',
  '16:9': '裁成宽屏，宽比高是 16 比 9',
  '9:16': '裁成竖屏，宽比高是 9 比 16',
}

const EMPTY_GUIDE_TITLES: Record<string, string> = {
  heading: '插入一级标题',
  list: '插入圆点列表',
  task: '插入可勾选的待办',
  callout: '插入蓝色提示告示',
  code: '插入代码块',
  formula: '插入数学公式',
  table: '打开表格尺寸对话框，自己填行数和列数',
  columns: '把内容分成左右等宽的两栏',
  date: '插入今天的日期',
}

const IMAGE_PLACE_TITLES: Record<string, string> = {
  '居中': '图片在这一行居中',
  '居左': '图片靠左，独占一行',
  '居右': '图片靠右，独占一行',
  '左环绕': '图片在左，文字绕着排',
  '右环绕': '图片在右，文字绕着排',
}

const ALIGN_CHOICE_TITLES: Record<string, string> = {
  left: '这一段靠左对齐',
  center: '这一段居中',
  right: '这一段靠右对齐',
  justify: '这一段左右两端对齐',
}

/** 空文档快捷按钮会插入什么。没有说明时返回空字符串。 */
export function emptyGuideTitle(id: string): string {
  return EMPTY_GUIDE_TITLES[id] || ''
}

/** 图片排法改完怎么占这一行。没有说明时返回空字符串。 */
export function imagePlaceTitle(label: string): string {
  return IMAGE_PLACE_TITLES[label.trim()] || ''
}

/** 选区条里的对齐改完怎么排。没有说明时返回空字符串。 */
export function alignChoiceTitle(align: string): string {
  return ALIGN_CHOICE_TITLES[align] || ''
}

/** 块手柄菜单改完这一块是什么。没有说明时返回空字符串。 */
export function blockHandleTitle(id: string): string {
  return BLOCK_HANDLE_TITLES[id] || ''
}

/** 图片裁剪比例改完是什么形状。没有说明时返回空字符串。 */
export function cropTitle(label: string): string {
  return CROP_TITLES[label.trim()] || ''
}

/** 代码语言改完怎么上色。没有说明时返回空字符串。 */
export function codeLangTitle(label: string): string {
  return CODE_LANG_TITLES[label.trim()] || ''
}

/** 页面大小改完纸面是什么样。没有说明时返回空字符串。 */
export function pageSizeTitle(id: string): string {
  return PAGE_SIZE_TITLES[id] || ''
}

/** 图片宽度改完占多宽。没有说明时返回空字符串。 */
export function imageWidthTitle(label: string): string {
  return IMAGE_WIDTH_TITLES[label.trim()] || ''
}

/** 段距面板的一组在调什么。没有说明时返回空字符串。 */
export function spacingGroupTitle(group: string): string {
  return SPACING_GROUP_TITLES[group] || ''
}

/** 段距面板里某一档改完是什么。没有说明时返回空字符串。 */
export function spacingOptionTitle(group: string, value: string): string {
  return SPACING_OPTION_TITLES[`${group}:${value || 'default'}`] || ''
}

/** 表情和特殊字符分类在收什么。没有说明时返回空字符串。 */
export function pickerTabTitle(label: string): string {
  return PICKER_TAB_TITLES[label.trim()] || ''
}

/** 字数面板每一行在数什么。没有说明时返回空字符串。 */
export function wordStatTitle(id: string): string {
  return WORD_STAT_TITLES[id] || ''
}

/** 菜单项的说明。没有单独说明时返回空字符串。 */
export function toolbarMenuItemTitle(label: string): string {
  return MENU_ITEM_TITLES[label.trim()] || ''
}

/** 带小三角，或声明了菜单的按钮，才响应向下键。 */
export function isToolbarMenuTrigger(attrs: { popup?: string | null; caret?: boolean }): boolean {
  return attrs.popup === 'menu' || !!attrs.caret
}

/** 栏目上 PageUp / PageDown 一次跳三格，不绕回。 */
export function stepRibbonTabBy(ids: readonly string[], current: string, delta: number): string {
  if (!ids.length || !Number.isFinite(delta) || delta === 0) return current
  const index = Math.max(0, ids.indexOf(current))
  const next = Math.min(ids.length - 1, Math.max(0, index + Math.trunc(delta)))
  return ids[next] || current
}

export function zoomToolLabel(zoom: number): string {
  if (!Number.isFinite(zoom) || Math.abs(zoom - 1) < 0.001) return '实际大小'
  return `${Math.round(zoom * 100)}%`
}

export function pasteFormatLabel(mode: string): string {
  if (mode === 'plain') return '粘贴·纯文本'
  if (mode === 'markdown') return '粘贴·MD'
  return '粘贴·保留'
}

export function tableToolLabel(inTable: boolean): string {
  return inTable ? '表操作' : '插表格'
}

export function quoteToolTitle(active: boolean): string {
  return active ? '已在引用中，再点一次取消 (Ctrl/⌘+Shift+9)' : '引用 (Ctrl/⌘+Shift+9)'
}

export function codeBlockToolTitle(active: boolean): string {
  return active ? '光标在代码块里，再点一次取消' : '代码块 (Ctrl/⌘+Shift+E)'
}

export function spellcheckToolTitle(active: boolean): string {
  return active ? '拼写检查已开启，再点一次关闭' : '拼写检查（用浏览器词典）'
}

export const EMPTY_GROUP_NOTE = '本组按钮都已隐藏，双击组名恢复'

export const RIBBON_TAB_BLURBS: Record<string, string> = {
  edit: '撤销、查找、格式刷、粘贴',
  style: '字号、颜色、加粗、高亮',
  paragraph: '段落、列表、对齐、行距',
  writing: '方向、引用样式、纸样',
  tidy: '半角、全角、空格',
  insert: '链接、图片、二维码、公式',
  picture: '排法、换图、替代文本',
  frame: '圆角、阴影、边框',
  charts: '基础、统计、关系等图表',
  table: '插入、斑马纹、冻结、行列',
  blocks: '告示、分栏、流程图、模板',
  notes: '批注、脚注、书签',
  review: '检查、修订、朗读',
  view: '缩放、大纲、字数',
  file: '打印、导入、导出',
  page: '纸张、分页、打印预览',
}

/** 栏目悬停时写出里面有什么。 */
export function ribbonTabHint(id: string, label: string): string {
  const name = label.trim() || '栏目'
  const blurb = RIBBON_TAB_BLURBS[id]
  return blurb ? `${name}：${blurb}` : name
}

/** 定义里有按钮、但当前都被隐藏时，仍留出分组以便恢复。 */
export function hiddenGroupPlaceholders<T extends { id: string }>(
  visible: readonly T[],
  allowedIds: readonly string[],
  defined: readonly { id: string; label: string; keyCount: number }[],
): Array<T | { id: string; label: string; tools: []; hiddenAll: true }> {
  const seen = new Set(visible.map((group) => group.id))
  const extra: Array<{ id: string; label: string; tools: []; hiddenAll: true }> = []
  for (const id of allowedIds) {
    if (seen.has(id)) continue
    const def = defined.find((item) => item.id === id)
    if (!def || def.keyCount <= 0) continue
    extra.push({ id: def.id, label: def.label, tools: [], hiddenAll: true })
  }
  return [...visible.map((group) => ({ ...group, hiddenAll: false as const })), ...extra]
}

export function listToolLabel(kind: 'bullet' | 'ordered' | 'task' | ''): string {
  if (kind === 'task') return '任务'
  if (kind === 'ordered') return '有序'
  if (kind === 'bullet') return '无序'
  return '列表'
}

export function formatPainterLabel(mode: 'off' | 'once' | 'sticky'): string {
  if (mode === 'sticky') return '连刷'
  if (mode === 'once') return '刷中'
  return '格式刷'
}

/** 鼠标移向菜单时多留一点时间，避免菜单提前关掉。 */
export const MENU_CLOSE_DELAY_MS = 320

export function searchEnterActivates(count: number, bestDisabled = false): boolean {
  return count === 1 && !bestDisabled
}

/** 在搜索结果之间循环。到头之后回到另一端。 */
export function cycleSearchIndex(index: number, count: number, delta: number): number {
  if (count <= 0) return 0
  const base = Number.isInteger(index) && index >= 0 && index < count ? index : 0
  return (base + Math.trunc(delta) + count * 8) % count
}

export function moreToolsCaption(count: number): string {
  const n = Math.max(0, Math.floor(count))
  return n > 0 ? `更多 ${n}` : '更多'
}

export function moreToolsTitle(count: number): string {
  const n = Math.max(0, Math.floor(count))
  return n > 0 ? `还有 ${n} 个按钮` : '更多格式与插入'
}

export function ribbonSearchLabel(label: string, hits: number): string {
  const name = label.trim() || '栏目'
  const n = Math.max(0, Math.floor(hits))
  return n > 0 ? `${name}，${n} 个匹配` : name
}

/** 按相关度重排分组和组内按钮。空查询返回空列表。 */
export function orderToolbarSearchGroups<T extends ToolbarSearchTool>(
  groups: readonly { id: string; label: string; tools: readonly T[] }[],
  query: string,
  limit = 24,
): { groups: Array<{ id: string; label: string; tools: T[] }>; total: number; capped: boolean } {
  const cap = Math.max(1, limit)
  const hits = searchToolbarTools(groups, query, cap + 1)
  const shown = hits.slice(0, cap)
  const lookup = new Map<string, T>()
  for (const group of groups) {
    for (const tool of group.tools) lookup.set(`${group.id}:${tool.key}`, tool)
  }
  const ordered: Array<{ id: string; label: string; tools: T[] }> = []
  for (const hit of shown) {
    const tool = lookup.get(`${hit.groupId}:${hit.key}`)
    if (!tool) continue
    let bucket = ordered.find((item) => item.id === hit.groupId)
    if (!bucket) {
      bucket = { id: hit.groupId, label: hit.groupLabel, tools: [] }
      ordered.push(bucket)
    }
    bucket.tools.push(tool)
  }
  return { groups: ordered, total: hits.length, capped: hits.length > cap }
}

/** 搜索时组名带上命中数量。 */
export function searchGroupCaption(label: string, count: number, searching: boolean): string {
  const name = label.trim() || '分组'
  if (!searching) return name
  return `${name} · ${Math.max(0, count)}`
}

export function fontFamilyCaption(value: string, options: readonly { label: string; value: string }[]): string {
  const current = value.trim()
  if (!current) return '字体'
  const named = options.find((item) => item.value === current)
  const raw = named?.label && named.label !== '默认字体' ? named.label.split('/')[0].trim() : current.split(',')[0].replace(/["']/g, '').trim()
  if (!raw || raw === '默认字体') return '字体'
  return raw.length > 6 ? `${raw.slice(0, 6)}…` : raw
}

export function lineHeightCaption(value: string, options: readonly { label: string; value: string }[]): string {
  const current = value.trim()
  if (!current) return '行距'
  const named = options.find((item) => item.value === current)
  if (!named || named.label === '默认行高') return current
  return named.label
}

export function alignToolTitle(align: string): string {
  if (align === 'center') return '当前居中。可选左对齐、居中、右对齐、两端对齐'
  if (align === 'right') return '当前右对齐。可选左对齐、居中、右对齐、两端对齐'
  if (align === 'justify') return '当前两端对齐。可选左对齐、居中、右对齐、两端对齐'
  if (align === 'left') return '当前左对齐。可选左对齐、居中、右对齐、两端对齐'
  return '对齐：左对齐、居中、右对齐、两端对齐'
}

export function zoomToolTitle(zoom: number): string {
  if (!Number.isFinite(zoom) || Math.abs(zoom - 1) < 0.001) return '编辑区缩放，当前为实际大小'
  return `编辑区缩放，当前 ${Math.round(zoom * 100)}%`
}

/** Alt+1 到 Alt+9 对应前九个栏目。越界返回空字符串。 */
export function ribbonTabForDigit(ids: readonly string[], digit: number): string {
  if (!Number.isInteger(digit) || digit < 1 || digit > 9) return ''
  return ids[digit - 1] || ''
}

/** 栏目上直接打字，拼进搜索词。方向键和修饰键不接收。 */
export function ribbonTypeaheadQuery(key: string, current: string): string | null {
  if (key === 'Backspace') return current.slice(0, -1)
  if (key.length !== 1 || /[\s\u0000-\u001f]/.test(key)) return null
  return `${current}${key}`
}

export const FOCUS_MODE_NOTE = '专注中，只留撤销、重做和查找。再点视图里的专注模式即可退出'

/** 当前栏目可 Tab 进去，其余交给方向键。 */
export function ribbonTabTabIndex(selected: boolean): 0 | -1 {
  return selected ? 0 : -1
}

const MENU_TOOL_KINDS = new Set([
  'heading', 'list', 'align', 'paraStyle', 'listStyle', 'fontSize', 'fontFamily', 'lineHeight',
  'form', 'template', 'callout', 'presetMenu', 'textTidy', 'imageLayout', 'zoom', 'viewExtras',
  'caseTransform', 'import', 'export', 'table', 'echartsGroup', 'linkButton', 'columns',
  'hr', 'blockOps', 'insertDate', 'highlight', 'color', 'wordStats', 'shortcuts', 'spacing',
])

/** 会打开菜单的按钮需要小三角。 */
export function menuToolNeedsCaret(kind: string | undefined): boolean {
  return !!kind && MENU_TOOL_KINDS.has(kind)
}

/** 不可用时在原提示后补一句，避免只看到灰掉的图标。 */
export function disabledToolTitle(title: string, disabled: boolean): string {
  const base = title.trim() || '按钮'
  if (!disabled) return base
  return base.includes('当前不可用') ? base : `${base}（当前不可用）`
}

/** 拖动手柄说明带上本组还剩几个按钮。 */
export function groupHandleTitle(label: string, count: number): string {
  const name = label.trim() || '分组'
  const n = Math.max(0, Math.floor(count))
  return `拖动${name}分组，本组 ${n} 个按钮。Alt+左/右也可移动`
}

export function fontSizeCaption(value: string, options: readonly { label: string; value: string }[]): string {
  const current = value.trim()
  if (!current) return '字号'
  const named = options.find((item) => item.value === current)
  if (named?.label && named.label !== '默认') return named.label
  return current
}

export function pushRecentValue(list: readonly string[], value: string, limit = 5): string[] {
  const next = value.trim()
  if (!next) return [...list]
  return [next, ...list.filter((item) => item !== next)].slice(0, Math.max(1, limit))
}

export function recentOptions<T extends { value: string }>(options: readonly T[], recent: readonly string[]): T[] {
  const byValue = new Map(options.map((item) => [item.value, item]))
  const out: T[] = []
  for (const value of recent) {
    const item = byValue.get(value)
    if (item && !out.includes(item)) out.push(item)
  }
  return out
}

/** 专注模式只留这几个按钮。 */
export const FOCUS_TOOLBAR_KEYS = ['undo', 'redo', 'find'] as const

/** 工具栏里原先只有短说明的 30 个动作，悬停时写出改完会怎样。 */
export const TOOLBAR_ACTION_TITLES: Record<string, string> = {
  'list-continue': '接着上一段列表往下编号，编号不会从 1 重来',
  'list-restart': '从 1 开始一个新的有序列表，和上一段分开',
  'list-start': '把当前这一项改成指定的起始编号',
  'list-renumber': '从这一项起，后面的编号重新往下数',
  'form-radio': '插入一组只能选一个的选项',
  'form-check': '插入一组可以同时勾选多项的选项',
  'form-text': '插入一行可以填写的文字框',
  'form-textarea': '插入可以写多行的填写框',
  'form-number': '插入只接受数字的填写框',
  'form-select': '插入从列表里选一项的下拉框',
  'form-date': '插入选择日期的框',
  'form-datetime': '插入选择日期和时间的框',
  'form-switch': '插入开或关的开关',
  'form-duplicate': '再复制一个当前选中的表单字段',
  'form-check-fill': '检查必填项有没有空着',
  'source-apply': '把改过的源码写回文档，会盖掉正文里对应的内容',
  'search-clear': '清除搜索并回到全部按钮 (Esc)',
  'import-doc': '打开本机的 Markdown 或 Word 文档',
  'import-link': '从链接导入，例如公众号文章',
  'export-feishu': '复制成飞书能直接粘贴的 HTML',
  'export-html': '下载成可以在浏览器打开的网页文件',
  'export-text': '下载成没有格式的纯文本',
  'export-md': '下载成 Markdown 文件',
  'export-png': '把当前文档导出成一张 PNG 图片',
  'export-pdf': '把当前文档导出成 PDF',
  'export-word': '把当前文档导出成 Word',
  'table-zebra': '隔行加底色，只改变显示，不改单元格内容',
  'table-another': '再插入一张表格，自己填行数和列数',
  'font-size-input': '输入小四或 12，按 Enter 应用这个字号',
  'table-insert-count': '填几就插入几行或几列，最少 1',
  'rows-collapse': '收起工具栏面板，只留当前这一行',
  'rows-expand': '展开工具栏。收起时放不下的分组会排到下一行',
  'group-search-lock': '正在搜索，先清除搜索再调整分组顺序',
  'group-context': '右键可设置这一组里按钮的显隐和顺序',
  'group-dbl-reset': '双击组名，恢复这一组按钮的默认显隐和顺序',
  'form-menu': '插入单选、多选、填写框、下拉和日期',
  'template-menu': '插入已经写好结构的文档模板',
  'highlight-menu': '给选中的文字加底色，再点一次可以换颜色',
  'color-menu': '改选中文字的颜色，再点一次可以换颜色',
  'link-button-menu': '插入一个可以点开链接的按钮',
  'table-inside': '光标在表格里，打开行列、样式和公式',
  'table-insert': '插入表格，可以先选行数和列数',
  'import-menu': '从本机的 Markdown、Word 或一个链接导入',
  'export-menu': '导出成网页、Markdown、图片、PDF 或 Word',
  'emoji-menu': '插入表情，可以按分类挑选',
  'spacing-menu': '调整段前、段后、字间距和首行缩进',
  'para-style-menu': '把这一段改成导语、提示或其他段落样式',
  'list-style-menu': '改编号是数字、字母还是罗马数字',
  'word-stats-menu': '查看字数、词数、段落和阅读时长',
  'code-lines': '在代码块左侧显示行号，再点一次关掉',
  'code-wrap': '长行在代码块里自动换行，再点一次关掉',
  'code-copy': '把当前这段代码复制到剪贴板',
  'table-size-dialog': '打开表格尺寸对话框，自己填行数和列数',
  'shortcut-find': '搜快捷键，可以打 bold、引用或 tab',
  'group-restore': '把这一组按钮的显隐和顺序恢复成最初的样子',
  'group-done': '关闭分组设置，刚才的改动已经留下',
  'cell-fill-clear': '去掉单元格底色',
  'attach-menu': '插入 PDF、Word、表格、音频或视频附件',
  'list-menu': '无序、有序或任务列表，也可以改编号和缩进',
  'para-current': '当前段落样式：',
}

export function toolbarActionTitle(id: string): string {
  return TOOLBAR_ACTION_TITLES[id] || ''
}
