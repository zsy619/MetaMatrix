import { h, type Component } from 'vue'

function toneIcon(color: string): Component {
  return {
    render() {
      return h(
        'svg',
        { viewBox: '0 0 24 24', width: '16', height: '16', 'aria-hidden': 'true' },
        [h('rect', { x: '4', y: '4', width: '16', height: '16', rx: '3', fill: color })],
      )
    },
  }
}

function ctxIcon(paths: string[]): Component {
  return {
    render() {
      return h(
        'svg',
        {
          viewBox: '0 0 24 24',
          width: '16',
          height: '16',
          fill: 'none',
          stroke: 'currentColor',
          'stroke-width': '1.8',
          'stroke-linecap': 'round',
          'stroke-linejoin': 'round',
          'aria-hidden': 'true',
        },
        paths.map((d) => h('path', { d })),
      )
    },
  }
}

/** 表格菜单（工具栏下拉、右键二级、操作面板）共用的线稿图标。 */
export const TABLE_MENU_ICONS: Record<string, Component> = {
  insert: ctxIcon(['M12 5v14', 'M5 12h14']),
  cell: ctxIcon(['M4 4h7v7H4z', 'M13 4h7v7h-7z', 'M4 13h7v7H4z', 'M13 13h7v7h-7z']),
  head: ctxIcon(['M4 5h16v14H4z', 'M4 10h16']),
  data: ctxIcon(['M5 7h14', 'M5 12h14', 'M5 17h9']),
  delete: ctxIcon(['M5 7h14', 'M9 7V5h6v2', 'M8 7l1 13h6l1-13']),
  read: ctxIcon(['M3 6h7a3 3 0 0 1 3 3v9', 'M21 6h-7a3 3 0 0 0-3 3v9', 'M12 9v9']),
  'read-off': toneIcon('#d0d3d8'),
  'read-blue': toneIcon('#1d4ed8'),
  'read-green': toneIcon('#1f7a4d'),
  'read-orange': toneIcon('#c2410c'),
  'read-gray': toneIcon('#4b5563'),
  'read-night': toneIcon('#111827'),
  'insert-table': ctxIcon(['M4 5h16v14H4z', 'M4 10h16', 'M4 15h16', 'M10 5v14']),
  zebra: ctxIcon(['M4 6h16v4H4z', 'M4 14h16v4H4z']),
  'row-before': ctxIcon(['M5 7h14', 'M12 18V10', 'M8.5 13.5L12 10l3.5 3.5']),
  'row-after': ctxIcon(['M5 17h14', 'M12 6v8', 'M8.5 10.5L12 14l3.5-3.5']),
  'col-before': ctxIcon(['M7 5v14', 'M18 12H10', 'M13.5 8.5L10 12l3.5 3.5']),
  'col-after': ctxIcon(['M17 5v14', 'M6 12h8', 'M10.5 8.5L14 12l-3.5 3.5']),
  'del-row': ctxIcon(['M4 12h16', 'M7 8l-3 4 3 4', 'M17 8l3 4-3 4']),
  'del-col': ctxIcon(['M12 4v16', 'M8 7l4-3 4 3', 'M8 17l4 3 4-3']),
  'del-table': ctxIcon(['M5 7h14', 'M9 7V5h6v2', 'M8 7l1 13h6l1-13']),
  merge: ctxIcon(['M4 8h7v8H4z', 'M13 8h7v8h-7z', 'M9 12h6']),
  split: ctxIcon(['M8 7h8v10H8z', 'M12 7v10']),
  'clear-cell': ctxIcon(['M5 16l8-8 3 3-8 8H5v-3z', 'M13 8l3 3']),
  'valign-top': ctxIcon(['M5 5h14', 'M8 9h8v8H8z']),
  'valign-middle': ctxIcon(['M5 12h14', 'M8 7h8v10H8z']),
  'valign-bottom': ctxIcon(['M5 19h14', 'M8 7h8v8H8z']),
  'align-left': ctxIcon(['M5 7h14', 'M5 12h9', 'M5 17h14']),
  'align-center': ctxIcon(['M5 7h14', 'M8 12h8', 'M5 17h14']),
  'align-right': ctxIcon(['M5 7h14', 'M10 12h9', 'M5 17h14']),
  header: ctxIcon(['M4 5h16v14H4z', 'M4 10h16', 'M4 5h16v5H4z']),
  'header-col': ctxIcon(['M4 5h16v14H4z', 'M10 5v14', 'M4 5h6v14H4z']),
  'sticky-header': ctxIcon(['M12 4v6', 'M8 8l4-4 4 4', 'M6 14h12v6H6z']),
  'sticky-col': ctxIcon(['M4 12h6', 'M8 8l-4 4 4 4', 'M14 6h4v12h-4z']),
  'dup-row': ctxIcon(['M8 8h10v10H8z', 'M6 6h10']),
  'equal-cols': ctxIcon(['M5 6h4v12H5z', 'M10 6h4v12h-4z', 'M15 6h4v12h-4z']),
  'cell-formula': ctxIcon(['M7 17l4-10h2l4 10', 'M9 13h6']),
  'calc-formula': ctxIcon(['M7 4h10v16H7z', 'M7 9h10', 'M10 13h.01', 'M14 13h.01', 'M10 16h.01', 'M14 16h.01']),
  'sum-row': ctxIcon(['M7 6h10l-5 6 5 6H7']),
  'sort-asc': ctxIcon(['M8 17V7', 'M5 10l3-3 3 3', 'M14 8h6', 'M14 12h4', 'M14 16h2']),
  'sort-desc': ctxIcon(['M8 7v10', 'M5 14l3 3 3-3', 'M14 8h2', 'M14 12h4', 'M14 16h6']),
  'row-filter': ctxIcon(['M4 6h16l-6 7v5l-4-2v-3z']),
  'copy-csv': ctxIcon(['M8 7h8v12H8z', 'M8 7V5h6l2 2v2']),
  'copy-tsv': ctxIcon(['M6 7h12v12H6z', 'M10 7v12', 'M14 7v12']),
}
