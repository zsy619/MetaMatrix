import { apiRequest } from './http'
import type { Project, ProjectPatch, ProjectSummary } from '../types/project'

export function listProjects() {
  return apiRequest<ProjectSummary[]>('/projects', { cache: 'no-store' })
}

export function getProject(id: string) {
  return apiRequest<Project>(`/projects/${id}`, { cache: 'no-store' })
}

export function createProject(name: string, emoji?: string) {
  return apiRequest<Project>('/projects', { method: 'POST', body: { name, emoji } })
}

/** 更新项目基本信息：名称、表情、进度。没传的字段保持不变。 */
export function updateProject(id: string, patch: ProjectPatch) {
  return apiRequest<Project>(`/projects/${id}`, { method: 'PUT', body: patch })
}

export function deleteProject(id: string) {
  return apiRequest<{ deleted: boolean }>(`/projects/${id}`, { method: 'DELETE' })
}

/** 项目内的画布引用图：画布 id → 它引用的画布 id 列表。 */
export function listProjectRefs(projectId: string) {
  return apiRequest<{ refs: Record<string, string[]> }>(`/projects/${projectId}/refs`, {
    cache: 'no-store',
  })
}
