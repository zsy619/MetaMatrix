# 飞书文档编辑器技术架构深度分析

**核心结论：飞书文档不是一个简单的 Markdown 编辑器，而是一套以结构化文档模型为基础，集成富文本编辑、实时协同、块级内容管理、评论批注、权限控制和云端持久化的在线文档系统。**

如果准备在 Vue 3 项目中实现类似飞书文档的编辑体验，我建议研究的不是单独一个 Markdown 编辑器，而是飞书背后的五个核心技术体系：

1. 编辑器内核：富文本编辑与文档结构模型。
2. Block 模型：把文档拆分成可独立操作的内容块。
3. 协同引擎：OT / CRDT，解决多人同时编辑。
4. 扩展体系：表格、图片、代码块、流程图、评论等。
5. 文档服务：版本管理、权限、自动保存、云端同步。

先说明一个调研边界：飞书没有公开其完整编辑器内核和全部服务端实现，因此下面会区分**公开可确认的产品能力、公开技术分享，以及我们可以据此设计的工程实现**，不会把推测说成飞书内部的确定实现。

## 一、飞书文档的产品技术拆解

<AsyncImageGroup query={["飞书文档在线编辑器界面 块级菜单","飞书文档 富文本编辑器 图片 表格 代码块","飞书文档 多人协同编辑 光标 评论界面"]} aspectRatio="16:9" layout="bento"/>

从产品表现看，飞书文档具有以下几个显著特征：

| 功能 | 用户看到的表现 | 背后涉及的技术 |
|---|---|---|
| 富文本编辑 | 直接编辑标题、段落 | Rich Text Editor |
| 块级编辑 | 每段内容独立操作 | Block Model |
| Markdown 快捷输入 | 输入 `#` 自动识别标题 | Input Rules |
| 多类型内容 | 图片、表格、代码、视频 | Node Extension |
| 实时协作 | 多人同时编辑 | OT / CRDT |
| 协作者光标 | 显示其他人的编辑位置 | Awareness |
| 评论批注 | 选中文字添加评论 | Anchor / Annotation |
| 自动保存 | 无需手动保存 | Incremental Persistence |
| 历史版本 | 查看和恢复历史内容 | Versioning |
| 权限控制 | 查看、编辑、评论权限 | ACL / RBAC |

飞书官方介绍了多人协作、实时云端同步、评论、代码块、任务列表、流程图等功能，也支持 Markdown 快捷输入。<Cite refs={["turn370305search0","turn370305search3"]}/>

## 二、核心技术一：Block-based 文档模型

这是我认为最值得研究的部分。

### 1. 为什么不是简单的 Markdown 字符串？

传统 Markdown 编辑器通常采用：

```text
Markdown String
      |
      v
Markdown Parser
      |
      v
HTML Renderer
      |
      v
Preview
```

例如：

```markdown
# 项目介绍

这是项目介绍。

## 技术架构

- Vue 3
- Go
- MySQL
```

本质上整个文档就是一段字符串。

但飞书文档需要实现：

- 单独移动某个段落。
- 删除一个代码块。
- 把段落转换成标题。
- 给某一段添加评论。
- 在段落之间插入图片。
- 拖动内容块调整顺序。
- 多人同时编辑不同区域。

单纯操作一个 Markdown 字符串会让这些能力变得复杂。

### 2. Block 数据模型

更适合采用树形结构：

<box border radius="lg" padding={3} gap={2}>
  **Document：项目技术文档**
  <box padding={{left:3}} gap={2}>
    <row align=center gap={2}>
      <icon name="folder-tree" color="#D97706"/>
      **Root Block**
    </row>
    <box padding={{left:3}} gap={2}>
      <row align=center gap={2}>
        <badge color="info">H1</badge>
        **项目介绍**
      </row>
      <row align=center gap={2}>
        <badge>Paragraph</badge>
        <text size="sm">这是项目介绍内容。</text>
      </row>
      <row align=center gap={2}>
        <badge color="info">H2</badge>
        **技术架构**
      </row>
      <row align=center gap={2}>
        <badge color="success">List</badge>
        <text size="sm">技术栈列表</text>
      </row>
      <row align=center gap={2}>
        <badge color="discovery">Code</badge>
        <text size="sm">代码块</text>
      </row>
      <row align=center gap={2}>
        <badge color="warning">Image</badge>
        <text size="sm">图片资源</text>
      </row>
      <row align=center gap={2}>
        <badge>Table</badge>
        <text size="sm">数据表格</text>
      </row>
    </box>
  </box>
</box>

每个 Block 都具有独立 ID、类型、属性、内容和位置信息。

例如：

```typescript
interface Document {
  id: string
  title: string
  rootBlockId: string
  version: number
}

interface Block {
  id: string
  documentId: string
  parentId: string | null

  type:
    | 'paragraph'
    | 'heading'
    | 'bullet_list'
    | 'ordered_list'
    | 'code'
    | 'image'
    | 'table'
    | 'quote'
    | 'divider'

  content: RichText[]
  attrs: Record<string, unknown>

  children: Block[]
  position: number
}

interface RichText {
  text: string
  marks?: {
    bold?: boolean
    italic?: boolean
    underline?: boolean
    color?: string
    link?: string
  }
}
```

这里的模型是一个适合自行研发的简化设计，并非飞书内部数据结构的逆向还原。

### 3. Block 模型的价值

| 传统 Markdown | Block 文档模型 |
|---|---|
| 整篇字符串 | 多个独立内容块 |
| 字符串位置定位 | Block ID 定位 |
| 修改需要处理文本范围 | 可以独立更新 Block |
| 评论需要复杂锚定 | 可以关联 Block 和文本范围 |
| 内容类型依赖语法 | 内容类型独立定义 |
| 协同粒度较难控制 | 可以设计块级协同 |

**技术建议：采用 Block + RichText + Extension 的组合模型。**

需要注意：Block 并不意味着所有协同操作都是块级的。一个段落内部的文字编辑仍然需要字符或文本范围级别的操作处理。

## 三、核心技术二：编辑器内核

飞书文档的交互体验，核心在于一个能够理解文档结构的编辑器内核。

这里有几个值得研究的开源技术。

<box gap={3}>
  <row align=start gap={3}>
    <AsyncImage query="ProseMirror rich text editor document schema demo" aspectRatio="1:1" maxWidth="104px"/>
    <box flex="1" gap={1}>
      **1. <Entity value="ProseMirror" category="software" disambig="结构化富文本编辑器框架"/>**
      <badge color="success">核心推荐</badge>
      - 结构化文档模型。
      - 自定义 Node、Mark。
      - Transaction 事务机制。
      - 插件系统和编辑规则。
      - 支持协同编辑扩展。

      <Link url="https://github.com/ProseMirror/prosemirror" title="GitHub"/>
    </box>
  </row>
  <divider color="subtle"/>
  <row align=start gap={3}>
    <AsyncImage query="Tiptap rich text editor bubble menu slash commands interface" aspectRatio="1:1" maxWidth="104px"/>
    <box flex="1" gap={1}>
      **2. <Entity value="Tiptap" category="software" disambig="基于 ProseMirror 的富文本编辑器框架"/>**
      <badge color="success">Vue 3 推荐</badge>
      - 基于 ProseMirror。
      - Vue 3 官方集成。
      - 丰富的扩展生态。
      - 支持 Slash Commands。
      - 支持自定义节点和工具栏。

      <Link url="https://github.com/ueberdosis/tiptap" title="GitHub"/>
    </box>
  </row>
  <divider color="subtle"/>
  <row align=start gap={3}>
    <AsyncImage query="Lexical editor playground rich text interface" aspectRatio="1:1" maxWidth="104px"/>
    <box flex="1" gap={1}>
      **3. <Entity value="Lexical" category="software" disambig="Meta 开源富文本编辑器框架"/>**
      - 模块化编辑器架构。
      - 自定义节点。
      - 编辑状态管理。
      - 性能优化。
      - 需要自行构建 Vue 3 适配层。

      <Link url="https://github.com/facebook/lexical" title="GitHub"/>
    </box>
  </row>
  <divider color="subtle"/>
  <row align=start gap={3}>
    <AsyncImage query="Milkdown Crepe markdown WYSIWYG editor" aspectRatio="1:1" maxWidth="104px"/>
    <box flex="1" gap={1}>
      **4. <Entity value="Milkdown" category="software" disambig="插件化 Markdown 编辑器框架"/>**
      - Markdown 原生数据模型。
      - 基于 ProseMirror。
      - 支持 Vue 3 集成。
      - 插件化程度高。

      <Link url="https://github.com/Milkdown/milkdown" title="GitHub"/>
    </box>
  </row>
</box>

### 1. 为什么 Tiptap 值得重点研究？

Tiptap 不只是一个 Markdown 编辑器，而是一个富文本编辑器框架。

它的核心结构可以理解为：

```text
Tiptap Editor
    |
    +-- Schema
    |    +-- Document
    |    +-- Paragraph
    |    +-- Heading
    |    +-- Image
    |    +-- Table
    |    +-- CodeBlock
    |
    +-- Extensions
    |    +-- Bold
    |    +-- Italic
    |    +-- Link
    |    +-- Placeholder
    |    +-- Table
    |    +-- Image
    |
    +-- Commands
    |    +-- insertContent
    |    +-- deleteRange
    |    +-- setNode
    |
    +-- Transactions
    |
    +-- Vue 3 Integration
```

例如插入一个标题：

```typescript
editor.commands.toggleHeading({
  level: 1
})
```

插入图片：

```typescript
editor.commands.setImage({
  src: '/uploads/demo.png'
})
```

获取结构化文档：

```typescript
const json = editor.getJSON()
```

获取 Markdown：

```typescript
const markdown = editor.getText()
```

注意：`getText()` 返回纯文本，不是 Markdown。需要安装和配置 Markdown 扩展，或者自行实现 JSON 与 Markdown 的转换。

### 2. 为什么 Block + Tiptap 很重要？

Tiptap 的 ProseMirror 文档本身就是结构化节点树。

例如：

```json
{
  "type": "doc",
  "content": [
    {
      "type": "heading",
      "attrs": {
        "level": 1
      },
      "content": [
        {
          "type": "text",
          "text": "项目介绍"
        }
      ]
    },
    {
      "type": "paragraph",
      "content": [
        {
          "type": "text",
          "text": "这是项目介绍"
        }
      ]
    }
  ]
}
```

这意味着可以在 ProseMirror 的结构上继续扩展：

- 自定义 Block 节点。
- 块级拖拽。
- 块级菜单。
- 自定义图片和文件节点。
- 自定义业务组件。

它是实现类飞书文档交互体验的很好的技术基础。

## 四、核心技术三：多人实时协同

这是飞书文档最有技术含量的部分之一。

### 1. 协同编辑需要解决什么？

假设两个人同时编辑：

<box border radius="lg" padding={3} gap={3}>
  **初始文档**
  <box background="surface-secondary" radius="md" padding={3}>
    今天我们讨论项目架构。
  </box>
  <grid columns={2} gap={2}>
    <grid-item>
      <row align=center gap={1}>
        <icon name="user-round" color="#3B82F6"/>
        **用户 A**
      </row>
      <box border={{size:1,color:"#3B82F6"}} radius="md" padding={2}>
        今天我们讨论项目架构，并确定技术方案。
      </box>
    </grid-item>
    <grid-item>
      <row align=center gap={1}>
        <icon name="user-round" color="#16A34A"/>
        **用户 B**
      </row>
      <box border={{size:1,color:"#16A34A"}} radius="md" padding={2}>
        今天我们讨论项目架构，确定开发计划。
      </box>
    </grid-item>
  </grid>
  <row align=center justify=center>
    <icon name="arrow-down" color="secondary" size="xl"/>
  </row>
  **最终协同结果**
  <box background="surface" border radius="md" padding={3}>
    今天我们讨论项目架构，并确定技术方案，确定开发计划。
  </box>
  <text color="secondary" size="xs">示意图：实际结果取决于操作位置、并发顺序及协同算法，不能简单拼接字符串。</text>
</box>

如果采用简单的 HTTP 保存：

```text
用户 A 修改
    |
    v
POST /document/save

用户 B 修改
    |
    v
POST /document/save
```

就可能出现后写覆盖先写的问题。

所以需要协同算法。

### 2. OT 和 CRDT

两种主流技术：

| 比较 | OT | CRDT |
|---|---|---|
| 全称 | Operational Transformation | Conflict-free Replicated Data Types |
| 核心思路 | 转换并发操作 | 设计可合并的数据结构 |
| 服务端 | 常承担操作排序和转换 | 可以采用服务端中继 |
| 离线编辑 | 需要设计同步机制 | 通常更自然 |
| 实现难度 | 较高 | 也不低 |
| 典型开源方案 | ShareDB | Yjs |

关于飞书的内部协同算法，需要特别谨慎：公开技术分享中有飞书文档团队成员介绍在线文档的编辑器和协同算法，但不能据此认定当前所有文档类型、所有版本都采用同一种算法。<Cite refs={["turn370305search2","turn370305search6","turn370305search8"]}/>

### 3. 如果自己实现，建议采用 Yjs

<Entity value="Yjs" category="software" disambig="CRDT 实时协同编辑框架"/> 是成熟的开源协同技术。

<AsyncImage query="Yjs collaborative editing architecture awareness websocket synchronization diagram" aspectRatio="16:9" width="100%"/>

推荐技术组合：

| 技术 | 作用 |
|---|---|
| Tiptap | 编辑器 |
| ProseMirror | 文档模型 |
| Yjs | CRDT 协同 |
| y-prosemirror | ProseMirror 与 Yjs 适配 |
| Hocuspocus | WebSocket 协同服务 |
| Redis | 在线状态、消息分发辅助 |
| PostgreSQL / MySQL | 文档元数据和持久化 |

项目地址：

- <Link url="https://github.com/yjs/yjs" title="Yjs"/>
- <Link url="https://github.com/ueberdosis/y-prosemirror" title="y-prosemirror"/>
- <Link url="https://github.com/ueberdosis/hocuspocus" title="Hocuspocus"/>

注意：Tiptap + Yjs + Hocuspocus 是一套可行的自主研发方案，不代表飞书实际采用这套技术。

### 4. 协同架构

```text
       Browser A                Browser B
           |                        |
       Tiptap                    Tiptap
           |                        |
         Yjs                      Yjs
           |                        |
           +----------+-------------+
                      |
                  WebSocket
                      |
                Hocuspocus
                      |
                 Yjs Server
                      |
          +-----------+-----------+
          |                       |
       Redis                  Persistence
          |                       |
      在线状态                 PostgreSQL
```

一次编辑的流程：

1. 用户输入内容。
2. Tiptap 产生编辑事务。
3. Yjs 生成增量更新。
4. WebSocket 发送更新。
5. 服务端广播给其他用户。
6. 其他客户端应用更新。
7. 所有客户端最终收敛到一致状态。
8. 增量数据和快照持久化。

这里还要实现 Awareness：用于同步协作者在线状态、光标和选区，它与文档正文的持久化数据是不同的。

## 五、核心技术四：飞书式块级交互

飞书文档一个很有辨识度的体验是：鼠标移动到段落左侧，会出现块级操作菜单。

<AsyncImageGroup query={["飞书文档 块级菜单 六个点 拖拽","Notion editor block menu slash command interface","Tiptap drag handle block editor interface"]} aspectRatio="16:9"/>

这套交互可以拆分成四个模块。

### 1. Block Handle

每个内容块左侧有操作手柄：

- 拖动调整顺序。
- 点击打开操作菜单。
- 删除当前 Block。
- 复制当前 Block。
- 转换 Block 类型。

### 2. Slash Command

输入 `/` 弹出命令面板：

<AsyncImage query="Notion slash command menu heading image table code block editor" aspectRatio="16:9" width="100%"/>

例如：

```text
输入 /

    标题
    一级标题
    二级标题
    引用
    代码块
    图片
    表格
    分割线
    Mermaid
    数学公式
```

实现思路：

```typescript
const commands = [
  {
    name: 'heading',
    title: '标题',
    command: () => {
      editor.commands.toggleHeading({
        level: 1
      })
    }
  },
  {
    name: 'image',
    title: '图片',
    command: () => {
      openImageUpload()
    }
  },
  {
    name: 'table',
    title: '表格',
    command: () => {
      editor.commands.insertTable({
        rows: 3,
        cols: 3
      })
    }
  }
]
```

### 3. Bubble Menu

选中文字后弹出浮动工具栏：

- 加粗
- 斜体
- 下划线
- 删除线
- 超链接
- 文字颜色
- 高亮

Tiptap 已经提供 BubbleMenu、FloatingMenu 等扩展能力，可以减少自行开发的工作量。

### 4. 自定义 Block

可以继续扩展：

```text
Block
├── ParagraphBlock
├── HeadingBlock
├── ImageBlock
├── VideoBlock
├── FileBlock
├── TableBlock
├── CodeBlock
├── MermaidBlock
├── MathBlock
├── CalloutBlock
├── TodoBlock
└── DatabaseBlock
```

这才是构建类似飞书文档、Notion 的关键。

---

## 六、核心技术五：评论、版本管理和持久化

### 1. 评论批注

飞书可以选中某段文字添加评论。

建议将评论与正文分开存储。

```typescript
interface DocumentComment {
  id: string
  documentId: string
  blockId: string

  anchor: {
    from: number
    to: number
    quote: string
  }

  userId: string
  content: string

  status: 'open' | 'resolved'
  createdAt: string
}
```

其中 `from`、`to` 是示意性的文本位置。实际多人编辑时，建议使用能够随正文修改而映射的位置锚点，而不是只保存固定数字，否则文字被插入或删除后，评论可能定位错误。

### 2. 文档版本管理

推荐采用快照 + 增量操作日志。

```text
Document
   |
   +-- Version 1
   |      |
   |      +-- Snapshot
   |
   +-- Version 2
   |      |
   |      +-- Delta 1
   |      +-- Delta 2
   |
   +-- Version 3
          |
          +-- Delta 3
          +-- Delta 4
```

主要能力：

- 自动保存。
- 历史版本。
- 版本对比。
- 恢复历史版本。
- 操作记录。
- 编辑者追踪。

### 3. 后端数据库设计

如果采用 Vue 3 + Go Hertz + Gorm，可以考虑：

| 数据表 | 用途 |
|---|---|
| `doc_document` | 文档基本信息 |
| `doc_block` | 文档内容块 |
| `doc_block_revision` | 内容块历史版本 |
| `doc_comment` | 评论和批注 |
| `doc_collaborator` | 文档协作者 |
| `doc_permission` | 文档权限 |
| `doc_version` | 文档版本 |
| `doc_snapshot` | 文档快照 |
| `doc_operation` | 协同增量日志 |
| `doc_attachment` | 图片和附件 |

这里有一个重要的架构决策：

**不要把协同编辑的每次键盘输入都作为一条普通 Gorm 数据库更新操作。**

应该由协同引擎处理实时更新，后端负责权限校验、增量持久化、快照和业务数据管理。

## 七、推荐的整体技术架构

结合上面五个技术体系，我建议采用下面的方案：

<box border radius="lg" padding={3} gap={3}>
  <title size="lg">类飞书文档系统架构</title>
  <box background="rgba(59,130,246,0.08)" radius="md" padding={3} gap={2}>
    **Vue 3 前端应用**
    <grid columns={2} gap={2}>
      <grid-item background="surface" radius="md" padding={2}>
        **Document Editor**

        <text color="secondary" size="xs">Tiptap + ProseMirror</text>
      </grid-item>
      <grid-item background="surface" radius="md" padding={2}>
        **Block System**

        <text color="secondary" size="xs">节点、拖拽、Slash</text>
      </grid-item>
      <grid-item background="surface" radius="md" padding={2}>
        **Comment System**

        <text color="secondary" size="xs">批注、讨论、回复</text>
      </grid-item>
      <grid-item background="surface" radius="md" padding={2}>
        **Yjs Client**

        <text color="secondary" size="xs">实时协同、光标</text>
      </grid-item>
    </grid>
  </box>
  <box align=center>
    <icon name="arrow-down-up" color="secondary" size="xl"/>
    <text color="secondary" size="xs">HTTP API / WebSocket</text>
  </box>
  <grid columns={2} gap={2}>
    <grid-item background="rgba(16,185,129,0.08)" radius="md" padding={3} gap={1}>
      **Go Hertz 服务**
      <text color="secondary" size="xs">文档 CRUD</text>
      <text color="secondary" size="xs">权限管理</text>
      <text color="secondary" size="xs">评论和版本</text>
      <text color="secondary" size="xs">附件管理</text>
    </grid-item>
    <grid-item background="rgba(139,92,246,0.08)" radius="md" padding={3} gap={1}>
      **协同服务**
      <text color="secondary" size="xs">Yjs + Hocuspocus</text>
      <text color="secondary" size="xs">WebSocket</text>
      <text color="secondary" size="xs">在线状态</text>
      <text color="secondary" size="xs">增量同步</text>
    </grid-item>
  </grid>
  <box align=center>
    <icon name="arrow-down" color="secondary" size="xl"/>
  </box>
  <box background="surface-secondary" radius="md" padding={3} gap={2}>
    **基础设施**
    <grid columns={3} gap={2}>
      <grid-item>
        <icon name="database" size="xl"/>
        **MySQL**
        <text color="secondary" size="xs">业务数据</text>
      </grid-item>
      <grid-item>
        <icon name="zap" size="xl"/>
        **Redis**
        <text color="secondary" size="xs">缓存和状态</text>
      </grid-item>
      <grid-item>
        <icon name="hard-drive" size="xl"/>
        **MinIO**
        <text color="secondary" size="xs">图片附件</text>
      </grid-item>
    </grid>
  </box>
</box>

### 技术选型清单

| 层次 | 推荐技术 | 是否建议 |
|---|---|---|
| 前端 | Vue 3 + TypeScript | 必选 |
| 编辑器 | Tiptap 3 | 必选 |
| 编辑器内核 | ProseMirror | 必选 |
| UI | Element Plus / 自定义组件 | 推荐 |
| Markdown | Tiptap Markdown 扩展 | 推荐 |
| 协同 | Yjs | 多人编辑时必选 |
| WebSocket | Hocuspocus | 推荐 |
| 后端 | Go Hertz + Gorm | 推荐 |
| 数据库 | MySQL | 推荐 |
| 缓存 | Redis | 推荐 |
| 对象存储 | MinIO | 推荐 |
| 流程图 | Mermaid | 推荐 |
| 数学公式 | KaTeX | 推荐 |

---

## 八、值得研究的开源项目

如果要真正研究飞书的技术实现，我建议不要只研究编辑器，还要研究完整的在线文档系统。

<box gap={3}>
  <row align=start gap={3}>
    <AsyncImage query="AFFiNE workspace document editor interface" aspectRatio="1:1" maxWidth="88px"/>
    <box flex="1" gap={1}>
      **<Entity value="AFFiNE" category="software" disambig="开源文档和知识库协作平台"/>**
      <badge color="success">重点研究</badge>
      文档、白板、知识库一体化，适合研究 Notion 类产品架构。

      <Link url="https://github.com/toeverything/AFFiNE" title="GitHub"/>
    </box>
  </row>
  <divider color="subtle"/>
  <row align=start gap={3}>
    <AsyncImage query="AppFlowy document editor interface" aspectRatio="1:1" maxWidth="88px"/>
    <box flex="1" gap={1}>
      **<Entity value="AppFlowy" category="software" disambig="开源 Notion 风格工作空间"/>**
      块式文档、数据库、知识管理，适合研究完整产品设计。

      <Link url="https://github.com/AppFlowy-IO/AppFlowy" title="GitHub"/>
    </box>
  </row>
  <divider color="subtle"/>
  <row align=start gap={3}>
    <AsyncImage query="Outline wiki collaborative document editor screenshot" aspectRatio="1:1" maxWidth="88px"/>
    <box flex="1" gap={1}>
      **<Entity value="Outline" category="software" disambig="开源团队知识库和文档系统"/>**
      团队知识库、权限、协作和文档组织。

      <Link url="https://github.com/outline/outline" title="GitHub"/>
    </box>
  </row>
  <divider color="subtle"/>
  <row align=start gap={3}>
    <AsyncImage query="Docmost collaborative document editor screenshot" aspectRatio="1:1" maxWidth="88px"/>
    <box flex="1" gap={1}>
      **<Entity value="Docmost" category="software" disambig="开源实时协作文档平台"/>**
      适合研究多人协作、文档权限和实时编辑的工程实现。

      <Link url="https://github.com/docmost/docmost" title="GitHub"/>
    </box>
  </row>
  <divider color="subtle"/>
  <row align=start gap={3}>
    <AsyncImage query="Team Docs Tiptap collaborative editor interface" aspectRatio="1:1" maxWidth="88px"/>
    <box flex="1" gap={1}>
      **Team Docs**
      Tiptap + Yjs + Hocuspocus 的协同文档实战案例。

      <Link url="https://jishuzhan.net/article/2067556112819384321" title="技术实现分析"/>
    </box>
  </row>
</box>

官方还有一个值得关注的方向：如果不想自己研发完整编辑器，飞书开放平台提供云文档组件，可以把飞书文档嵌入企业系统，并利用其协同编辑、评论和权限能力。<Cite refs={["turn370305search4","turn370305search7"]}/>

---

## 九、最终技术决策：应该怎么做？

我建议把项目分成三个阶段，不要一开始就试图完整复制飞书。

| 阶段 | 建设内容 | 主要技术 |
|---|---|---|
| 第一阶段 | 单人富文本、Block、Markdown、图片、表格 | Vue 3 + Tiptap |
| 第二阶段 | 多人协作、光标、评论、自动保存 | Yjs + Hocuspocus |
| 第三阶段 | 历史版本、权限、知识库、AI、文档数据库 | Go Hertz + Gorm |

**我的最终建议：**

不要使用纯 Markdown 编辑器作为飞书文档的核心内核。

采用：

- Tiptap + ProseMirror：编辑器内核。
- 自定义 Block：文档结构。
- Yjs：实时协同。
- Hocuspocus：协同服务。
- Go Hertz + Gorm：业务后端。
- MySQL + Redis + MinIO：基础设施。

Markdown 应该作为一种输入和导出格式，而不是整个文档系统唯一的数据模型。

**这套架构既能实现类似飞书的文档编辑体验，也为未来的知识库、AI 文档助手、企业协作平台留下扩展空间。**

如果下一步要深入落地，我建议直接以 **Vue 3 + Tiptap + Yjs + Go Hertz + Gorm** 为基础，设计一个完整的「飞书文档核心编辑器开源替代方案」，先把 Block 模型、编辑器插件体系和协同数据协议设计好，再开始编码。

---

If you want, I can:

- 继续讲解整体技术架构和服务端实现
- 示例展示如何实现块级拖拽和菜单交互
- 解析飞书文档中的协同编辑数据同步流程