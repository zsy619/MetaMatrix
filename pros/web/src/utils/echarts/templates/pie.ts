/** 饼图（官方类别 pie）：基础 / 环形 / 南丁格尔 / 玫瑰。 */
import { def, withTitle } from './helpers'
import type { EchartsTemplateDef } from '../types'

const CHANNEL_DATA = [
  { name: '直接访问', value: 1048 },
  { name: '搜索引擎', value: 735 },
  { name: '邮件营销', value: 580 },
  { name: '联盟广告', value: 484 },
  { name: '视频广告', value: 300 },
]

export const pieTemplates: EchartsTemplateDef[] = [
  def({
    id: 'pie-basic',
    categoryId: 'pie',
    label: '基础饼图',
    hint: '占比构成',
    chartType: 'pie',
    build: (opts) =>
      withTitle(
        {
          title: { text: '渠道占比', left: 'center' },
          tooltip: { trigger: 'item', formatter: '{b}: {c} ({d}%)' },
          legend: { bottom: 0 },
          series: [
            {
              name: '渠道占比',
              type: 'pie',
              radius: '62%',
              center: ['50%', '46%'],
              label: { formatter: '{b} {d}%' },
              data: CHANNEL_DATA,
            },
          ],
        },
        opts?.title,
        '渠道占比',
      ),
  }),
  def({
    id: 'pie-donut',
    categoryId: 'pie',
    label: '环形饼图',
    hint: '内外双环对比',
    chartType: 'pie',
    build: (opts) =>
      withTitle(
        {
          title: { text: '环形占比', left: 'center' },
          tooltip: { trigger: 'item' },
          legend: { bottom: 0 },
          series: [
            {
              name: '本年',
              type: 'pie',
              radius: ['38%', '62%'],
              center: ['50%', '46%'],
              label: { formatter: '{b} {d}%' },
              data: CHANNEL_DATA,
            },
            {
              name: '去年',
              type: 'pie',
              radius: ['70%', '82%'],
              center: ['50%', '46%'],
              label: { formatter: '{b} {d}%' },
              data: [
                { name: '直接访问', value: 900 },
                { name: '搜索引擎', value: 690 },
                { name: '邮件营销', value: 520 },
                { name: '联盟广告', value: 410 },
                { name: '视频广告', value: 280 },
              ],
            },
          ],
        },
        opts?.title,
        '环形占比',
      ),
  }),
  def({
    id: 'pie-rose',
    categoryId: 'pie',
    label: '玫瑰图',
    hint: '半径映射数值',
    chartType: 'pie',
    build: (opts) =>
      withTitle(
        {
          title: { text: '玫瑰图', left: 'center' },
          tooltip: { trigger: 'item' },
          legend: { bottom: 0 },
          series: [
            {
              name: '玫瑰图',
              type: 'pie',
              roseType: 'radius',
              radius: ['18%', '72%'],
              center: ['50%', '46%'],
              label: { formatter: '{b} {d}%' },
              data: CHANNEL_DATA,
            },
          ],
        },
        opts?.title,
        '玫瑰图',
      ),
  }),
  def({
    id: 'pie-nightingale',
    categoryId: 'pie',
    label: '南丁格尔玫瑰图',
    hint: '面积映射数值',
    chartType: 'pie',
    build: (opts) =>
      withTitle(
        {
          title: { text: '南丁格尔玫瑰图', left: 'center' },
          tooltip: { trigger: 'item' },
          legend: { bottom: 0 },
          series: [
            {
              name: '南丁格尔',
              type: 'pie',
              roseType: 'area',
              radius: ['12%', '74%'],
              center: ['50%', '46%'],
              label: { formatter: '{b} {d}%' },
              data: CHANNEL_DATA,
            },
          ],
        },
        opts?.title,
        '南丁格尔玫瑰图',
      ),
  }),
]
