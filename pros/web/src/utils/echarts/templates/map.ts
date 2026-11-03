/** 地理坐标 / 地图（官方类别 map）：基础地图 / 地图热力 / 地图散点。 */
import { def, withTitle } from './helpers'
import { DEMO_MAP_NAME } from '../demoMap'
import type { EchartsTemplateDef } from '../types'

const REGION_DATA = [
  { name: '北部', value: 320 },
  { name: '西部', value: 240 },
  { name: '东部', value: 410 },
  { name: '南部', value: 180 },
]

export const mapTemplates: EchartsTemplateDef[] = [
  def({
    id: 'map-basic',
    categoryId: 'map',
    label: '基础地图',
    hint: '内置极小示例 GeoJSON',
    chartType: 'map',
    build: (opts) =>
      withTitle(
        {
          title: { text: '区域分布', left: 'center' },
          tooltip: { trigger: 'item' },
          series: [
            {
              name: '区域',
              type: 'map',
              map: DEMO_MAP_NAME,
              roam: false,
              label: { show: true },
              itemStyle: { areaColor: '#dbe9f6', borderColor: '#8fb6d9' },
              data: REGION_DATA,
            },
          ],
        },
        opts?.title,
        '区域分布',
      ),
  }),
  def({
    id: 'map-heatmap',
    categoryId: 'map',
    label: '地图热力',
    hint: 'visualMap 连续色带',
    chartType: 'map',
    build: (opts) =>
      withTitle(
        {
          title: { text: '地图热力分布', left: 'center' },
          tooltip: { trigger: 'item' },
          visualMap: {
            min: 0,
            max: 500,
            left: 'center',
            bottom: 0,
            calculable: true,
            inRange: { color: ['#e8f1fb', '#9dc9e8', '#3f7fbf', '#12395f'] },
          },
          series: [
            {
              name: '热度',
              type: 'map',
              map: DEMO_MAP_NAME,
              roam: false,
              label: { show: true },
              data: REGION_DATA,
            },
          ],
        },
        opts?.title,
        '地图热力分布',
      ),
  }),
  def({
    id: 'map-scatter',
    categoryId: 'map',
    label: '地图散点',
    hint: 'geo 坐标系 + 散点',
    chartType: 'scatter',
    build: (opts) =>
      withTitle(
        {
          title: { text: '地图散点', left: 'center' },
          tooltip: { trigger: 'item' },
          geo: {
            map: DEMO_MAP_NAME,
            roam: false,
            label: { show: true },
            itemStyle: { areaColor: '#f2f6fb', borderColor: '#8fb6d9' },
          },
          series: [
            {
              name: '门店',
              type: 'scatter',
              coordinateSystem: 'geo',
              symbolSize: 14,
              data: [
                { name: '北京店', value: [30, 40, 120] },
                { name: '上海店', value: [70, 50, 260] },
                { name: '广州店', value: [60, 85, 180] },
              ],
            },
          ],
        },
        opts?.title,
        '地图散点',
      ),
  }),
]
