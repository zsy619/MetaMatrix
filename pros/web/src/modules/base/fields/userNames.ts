/**
 * 人员名称解析（人员 / 创建人 / 更新人字段）。
 *
 * 系统字段 `created_by` / `updated_by` 存的是用户 UUID，
 * 界面上必须显示「人名」而不是一串 UUID —— 飞书多维表格就是这么做的。
 *
 * 通讯录只拉一次并缓存；失败时静默降级为「显示 ID」，
 * 不能因为通讯录挂了导致整张表打不开。
 */
import { ref } from "vue";
import { listDirectoryUsers, type DirectoryUser } from "../../../api/directory";

/** id → 名称。 */
const nameMap = ref<Record<string, string>>({});

/** 是否已经发起过加载（避免并发重复请求）。 */
let loading: Promise<void> | null = null;

/** 载入通讯录（幂等）。 */
export function ensureUserNames(): Promise<void> {
  if (loading) return loading;
  loading = (async () => {
    try {
      const users: DirectoryUser[] = await listDirectoryUsers({ limit: 200 });
      const next: Record<string, string> = {};
      for (const user of users) next[user.id] = user.name;
      nameMap.value = next;
    } catch {
      // 通讯录不可用时保持空表：调用方会回退显示原始 ID。
    }
  })();
  return loading;
}

/** 取用户名称；查不到时回退为传入的兜底文本。 */
export function resolveUserName(id: string, fallback = ""): string {
  if (!id) return fallback;
  return nameMap.value[id] ?? fallback;
}

/** 批量解析（多值字段）。 */
export function resolveUserNames(ids: string[]): string[] {
  return ids.map((id) => resolveUserName(id, id));
}

/** 当前名称表（只读快照，便于测试）。 */
export function userNameSnapshot(): Record<string, string> {
  return { ...nameMap.value };
}

/** 仅测试用：注入名称表。 */
export function __setUserNamesForTest(map: Record<string, string>): void {
  nameMap.value = { ...map };
}
