/**
 * 项目类型（后端 ProjectType 枚举）——提交/筛选必须使用枚举值，中文仅供展示。
 *
 * 背景（实机缺陷）：历史实现把中文标签直接提交给后端（type='定制'），
 * Prisma 枚举校验失败 → 创建/更新项目 500；列表类型筛选也用中文比较，
 * 与后端返回的枚举值永远不相等 → 筛选形同失效。
 * 枚举约定见 docs/port/tencent-feature-port-backlog.md §G。
 */

export type ProjectTypeValue = 'PLATFORM' | 'CUSTOMIZATION' | 'COLLABORATION' | 'TESTING' | 'APPLICATION';

export const PROJECT_TYPE_OPTIONS: Array<{ value: ProjectTypeValue; label: string }> = [
  { value: 'PLATFORM', label: '平台' },
  { value: 'CUSTOMIZATION', label: '定制' },
  { value: 'COLLABORATION', label: '合作' },
  { value: 'TESTING', label: '测试' },
  { value: 'APPLICATION', label: '应用' },
];

/** 枚举值 → 中文标签（用于列表/卡片展示） */
export const PROJECT_TYPE_LABELS: Record<string, string> = PROJECT_TYPE_OPTIONS.reduce(
  (acc, o) => ({ ...acc, [o.value]: o.label }),
  {} as Record<string, string>,
);

/** 旧值映射：Tencent 中文标签 / 小写英文 / 历史“科技项目”（无对应枚举，归 CUSTOMIZATION，待业务确认） */
const LEGACY_PROJECT_TYPE_MAP: Record<string, ProjectTypeValue> = {
  platform: 'PLATFORM',
  '平台': 'PLATFORM',
  '定制': 'CUSTOMIZATION',
  '科技项目': 'CUSTOMIZATION',
  '合作': 'COLLABORATION',
  '测试': 'TESTING',
  '应用': 'APPLICATION',
};

/** 任意取值 → 合法枚举值；空值/未知值回退 CUSTOMIZATION（不抛错，避免阻断表单） */
export function normalizeProjectType(v?: string | null): ProjectTypeValue {
  const raw = String(v ?? '').trim();
  if (!raw) return 'CUSTOMIZATION';
  const upper = raw.toUpperCase();
  if (PROJECT_TYPE_OPTIONS.some((o) => o.value === upper)) return upper as ProjectTypeValue;
  return LEGACY_PROJECT_TYPE_MAP[raw] ?? LEGACY_PROJECT_TYPE_MAP[raw.toLowerCase()] ?? 'CUSTOMIZATION';
}

/** 展示用：枚举或旧值 → 中文标签 */
export function projectTypeLabel(v?: string | null): string {
  const t = normalizeProjectType(v);
  return PROJECT_TYPE_LABELS[t] ?? t;
}
