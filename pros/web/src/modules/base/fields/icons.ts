/**
 * 多维表格字段类型图标。
 *
 * registry 里的 icon 只是语义名（'text' / 'star' / 'relation'），
 * 不是 Vue 组件，直接 <component :is="icon" /> 渲染不出任何东西。
 * 这里把字段类型映射到 @element-plus/icons-vue 的真实组件。
 */
import type { Component } from 'vue'
import {
  Calendar,
  Check,
  Clock,
  Collection,
  Connection,
  DataBoard,
  DataLine,
  Document,
  EditPen,
  Link,
  Message,
  Money,
  Paperclip,
  Phone,
  Select,
  Star,
  TrendCharts,
  User,
} from '@element-plus/icons-vue'
import type { FieldType } from '../types'

const ICONS: Record<FieldType, Component> = {
  text: EditPen,
  long_text: Document,
  number: DataLine,
  currency: Money,
  percent: DataBoard,
  rating: Star,
  date: Calendar,
  datetime: Clock,
  checkbox: Check,
  single_select: Select,
  multi_select: Collection,
  email: Message,
  phone: Phone,
  url: Link,
  user: User,
  attachment: Paperclip,
  formula: TrendCharts,
  link: Connection,
  doc: Document,
}

/** 取字段类型图标组件；未知类型回退到文本图标。 */
export function fieldTypeIcon(type: string): Component {
  return ICONS[type as FieldType] ?? EditPen
}
