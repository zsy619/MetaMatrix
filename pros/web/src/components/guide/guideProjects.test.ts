// @vitest-environment happy-dom
/**
 * 首页右侧的项目模块。
 *
 * 关键约定：侧栏只显示前 5 个项目，其余交给「全部项目」页；
 * 没登录时不去请求接口，只提示登录。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'

vi.mock('../../api/projects', () => ({
  listProjects: vi.fn(async () => []),
  createProject: vi.fn(async () => ({ id: 'p-new', name: '新项目' })),
}))

import * as projectsApi from '../../api/projects'
import GuideProjects from './GuideProjects.vue'
import type { ProjectSummary } from '../../types/project'

function project(index: number): ProjectSummary {
  return {
    id: 'p' + index,
    name: '项目' + index,
    emoji: '📁',
    progress: index * 10,
    canvasCount: index,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  }
}

function mountProjects(authenticated: boolean) {
  return mount(GuideProjects, {
    props: { authenticated },
    // RouterLink 要渲染默认插槽，否则链接文字在测试里看不到。
    global: { stubs: { RouterLink: { template: '<a><slot /></a>' } } },
  })
}

describe('首页项目模块', () => {
  beforeEach(() => {
    vi.mocked(projectsApi.listProjects).mockReset()
    vi.mocked(projectsApi.listProjects).mockResolvedValue([])
  })

  it('未登录时不请求接口，只提示登录', () => {
    const wrapper = mountProjects(false)
    expect(projectsApi.listProjects).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('登录后可管理项目')
    wrapper.unmount()
  })

  it('登录后列出项目，并给出进入全部项目的入口', async () => {
    vi.mocked(projectsApi.listProjects).mockResolvedValue([project(1), project(2)])
    const wrapper = mountProjects(true)
    await vi.waitFor(() => expect(wrapper.findAll('.project-item')).toHaveLength(2))
    expect(wrapper.text()).toContain('项目1')
    expect(wrapper.text()).toContain('1 张')
    expect(wrapper.text()).toContain('全部项目')
    wrapper.unmount()
  })

  it('超过 5 个项目时只显示前 5 个，并在入口上标出总数', async () => {
    vi.mocked(projectsApi.listProjects).mockResolvedValue(
      Array.from({ length: 7 }, (_, i) => project(i + 1)),
    )
    const wrapper = mountProjects(true)
    await vi.waitFor(() => expect(wrapper.findAll('.project-item')).toHaveLength(5))
    expect(wrapper.text()).toContain('全部项目（7）')
    wrapper.unmount()
  })
})
