# GitHub Telegram 设计风格高星项目 Top 10 参考指南（小白版）

**这份文档能帮你做什么：**面向刚接触 Telegram 界面与设计风格的读者，先用一小节讲清关键特征。

# 一、先认识 Telegram 设计风格

下面的特征归纳自官方文档与第三方设计\[1\]\[2\]\[3\]。

|维度|要点|
|---|---|
|**主色与主题**|品牌主色为青蓝 \#0088cc，以白底为主；支持日间 / 夜间模式。|
|**主题变量**|Mini App 通过 CSS 变量读取配色：\-\-tg\-theme\-bg\-color、\-\-tg\-theme\-text\-color。|
|**技术栈**|C\+\+ / Qt 6。|

# 二、Top 10 总览（按 Star 排序）

|排名|仓库|Star|类型 / 技术栈|一句话看点|
|---|---|---|---|---|
|1|[telegramdesktop/tdesktop](https://github.com/telegramdesktop/tdesktop)|约 33\.7k|官方桌面客户端；C\+\+ / Qt 6|桌面端三栏布局。|
|2|[Ajaxy/telegram\-tt](https://github.com/Ajaxy/telegram-tt)|约 3\.65k|官方 Web A；TypeScript|轻量客户端竞赛一等奖。|

# 三、逐个详解

## （一）官方与主流客户端

### 1\. telegramdesktop/tdesktop（约 33\.7k Star）

**它是什么：**Telegram 官方桌面客户端完整源码，支持 Windows、macOS 与 Linux。

**设计风格看点：**

- 桌面端经典三栏结构：会话列表、聊天窗口、详情侧栏。

- 内置 Open Sans、Vazirmatn 等字体。

**仓库链接：**[https://github\.com/telegramdesktop/tdesktop](https://github.com/telegramdesktop/tdesktop)

> 提示：以上描述为第三方整理，实际以官方客户端为准。

## 四、补充资源

- [Telegram Mini Apps 官方文档](https://corefork.telegram.org/bots/webapps)：主题配色变量。

1. **先看官方成品：**打开 web\.telegram\.org/k/，观察三栏布局。

2. **再读组件库：**浏览 TelegramUI 的在线 Storybook。

- [ ] 待办：补充截图
- [x] 已完成：解析表格

```bash
npm run dev
```

---

参考：[Telegram 设计规范](https://www.shadcn.io/design/telegram) 与 <https://telegram.org>。
