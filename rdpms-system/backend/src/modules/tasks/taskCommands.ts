/**
 * modules/tasks/taskCommands.ts —— 任务写命令（RF04，TS strict）
 *
 * 目标（05 §2）：普通 API、同步、导入调用**同一应用服务**，不各自复制校验与写入。
 * 拆分为三个命令，权限各自独立：
 *   - updateTaskFields：编辑字段（tasks.update + 项目 write）
 *   - changeTaskStatus：状态流转（tasks.change_status + 项目 transition）
 *   - assignTask：指派（tasks.assign + 项目 assign）
 *
 * 兼容接口（历史 PUT）必须把 status / assigneeId 路由到对应命令，
 * 不允许用一个通用 update 绕过专用动作权限（F13）。
 */
import { assertTaskEdit, assertTaskStatusChange, assertTaskAssign, type AuthActor, type ProjectAccess } from '../access/writeGuards.js';

export interface TaskLike {
  id: string;
  projectId: string;
  status: string;
  assigneeId?: string | null;
  startedAt?: Date | null;
}

/** 任务写入所需的最小数据库接口（Prisma 客户端或事务客户端） */
export interface TaskWriteDb {
  task: {
    update(args: {
      where: { id: string };
      data: Record<string, unknown>;
      include?: unknown;
    }): Promise<Record<string, unknown>>;
  };
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
  { actor, access, task, fields }: {
    actor: AuthActor; access: ProjectAccess; task: TaskLike; fields: Record<string, unknown>;
  },
): Promise<Record<string, unknown>> {
  assertTaskEdit(actor, access);
  return db.task.update({
    where: { id: task.id },
    data: { ...fields, updatedById: actor.userId },
  });
}

/** 状态流转 */
export async function changeTaskStatus(
  db: TaskWriteDb,
  { actor, access, task, status }: {
    actor: AuthActor; access: ProjectAccess; task: TaskLike; status: string;
  },
): Promise<Record<string, unknown>> {
  assertTaskStatusChange(actor, access);
  const data = statusSideEffects(status, task, { status, updatedById: actor.userId });
  return db.task.update({ where: { id: task.id }, data });
}

/** 指派 */
export async function assignTask(
  db: TaskWriteDb,
  { actor, access, task, assigneeId }: {
    actor: AuthActor; access: ProjectAccess; task: TaskLike; assigneeId: string | null;
  },
): Promise<Record<string, unknown>> {
  assertTaskAssign(actor, access);
  return db.task.update({
    where: { id: task.id },
    data: { assigneeId, updatedById: actor.userId },
  });
}
