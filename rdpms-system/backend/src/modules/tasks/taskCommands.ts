/**
 * modules/tasks/taskCommands.ts —— 任务写命令（RF04，TS strict）
 *
 * 目标（05 §2）：普通 API、同步、导入调用**同一应用服务**，不各自复制校验与写入。
 * 拆分为三个命令，权限各自独立：
 *   - updateTaskFields：编辑字段（tasks.update + 项目 write）
 *   - changeTaskStatus：状态流转（tasks.change_status + 项目 transition）
 *   - assignTask：指派（tasks.assign + 项目 assign）
 *
 * 并发控制（RF04 复核）：幂等回执只解决「同一次操作重试」，**不能**替代并发版本校验。
 * 因此三个命令都支持 `cas`：把客户端基线时间戳写进 UPDATE 的 WHERE 条件
 * （`UPDATE ... WHERE id = ? AND updated_at = ?`），命中 0 行即冲突回滚，
 * 禁止「先读 → 比较 → 再无条件更新」。
 */
import { HttpError } from '../../kernel/http.js';
import {
  assertTaskEdit,
  assertTaskStatusChange,
  assertTaskAssign,
  type AuthActor,
  type ProjectAccess,
} from '../access/writeGuards.js';

export interface TaskLike {
  id: string;
  projectId: string;
  status: string;
  assigneeId?: string | null;
  startedAt?: Date | null;
  updatedAt?: Date;
}

/** 乐观锁条件：字段名 → 客户端基线值（例如 { updatedAt: Date }） */
export type CasFilter = Record<string, unknown>;

/** 任务写入所需的最小数据库接口（Prisma 客户端或事务客户端） */
export interface TaskWriteDb {
  task: {
    update(args: {
      where: { id: string };
      data: Record<string, unknown>;
      include?: unknown;
    }): Promise<Record<string, unknown>>;
    updateMany(args: {
      where: Record<string, unknown>;
      data: Record<string, unknown>;
    }): Promise<{ count: number }>;
    findUnique(args: { where: { id: string }; include?: unknown }): Promise<Record<string, unknown> | null>;
  };
}

export const CONCURRENCY_CONFLICT = {
  code: 'CONFLICT',
  message: '数据已被他人修改，请基于最新版本重试',
};

/**
 * 带并发基线的原子写入：命中 0 行即抛 409。
 * 未提供 cas 时退回无条件更新（仅用于旧客户端兼容路径，调用方必须留痕）。
 */
async function writeWithCas(
  db: TaskWriteDb,
  where: { id: string },
  data: Record<string, unknown>,
  cas?: CasFilter,
): Promise<Record<string, unknown>> {
  if (!cas) return db.task.update({ where, data });
  const result = await db.task.updateMany({ where: { ...where, ...cas }, data });
  if (result.count === 0) {
    throw new HttpError(409, CONCURRENCY_CONFLICT.code, CONCURRENCY_CONFLICT.message);
  }
  const row = await db.task.findUnique({ where });
  if (!row) throw new HttpError(404, 'TASK_NOT_FOUND', '任务不存在');
  return row;
}

/** 状态派生：完成/开始时间由服务端统一写入（客户端不可伪造） */
export function statusSideEffects(
  status: string,
  task: Pick<TaskLike, 'startedAt'>,
  data: Record<string, unknown>,
): Record<string, unknown> {
  if (status === 'COMPLETED') {
    data.completedAt = new Date();
    if (data.progressPercent === undefined) data.progressPercent = 100;
  }
  if (status === 'IN_PROGRESS' && !task.startedAt) data.startedAt = new Date();
  return data;
}

/** 编辑字段（不含 status / assigneeId） */
export async function updateTaskFields(
  db: TaskWriteDb,
  { actor, access, task, fields, cas }: {
    actor: AuthActor; access: ProjectAccess; task: TaskLike; fields: Record<string, unknown>; cas?: CasFilter;
  },
): Promise<Record<string, unknown>> {
  assertTaskEdit(actor, access);
  return writeWithCas(db, { id: task.id }, { ...fields, updatedById: actor.userId }, cas);
}

/** 状态流转 */
export async function changeTaskStatus(
  db: TaskWriteDb,
  { actor, access, task, status, cas }: {
    actor: AuthActor; access: ProjectAccess; task: TaskLike; status: string; cas?: CasFilter;
  },
): Promise<Record<string, unknown>> {
  assertTaskStatusChange(actor, access);
  const data = statusSideEffects(status, task, { status, updatedById: actor.userId });
  return writeWithCas(db, { id: task.id }, data, cas);
}

/** 指派 */
export async function assignTask(
  db: TaskWriteDb,
  { actor, access, task, assigneeId, cas }: {
    actor: AuthActor; access: ProjectAccess; task: TaskLike; assigneeId: string | null; cas?: CasFilter;
  },
): Promise<Record<string, unknown>> {
  assertTaskAssign(actor, access);
  return writeWithCas(db, { id: task.id }, { assigneeId, updatedById: actor.userId }, cas);
}
