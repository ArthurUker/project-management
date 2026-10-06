/** ID-preserving child commands. Absence is never a deletion instruction. */
import { Prisma, TaskStatus, TaskPriority, TaskType, TaskApplicability } from '@prisma/client';
import { badRequest, HttpError } from '../../kernel/http.js';
import { assertActionPermission, assertProjectCapability, type AuthActor, type ProjectAccess } from '../access/writeGuards.js';
import { updateTaskFields, changeTaskStatus, assignTask, type TaskWriteDb } from '../tasks/taskCommands.js';
import { writeAuditStrict } from '../../platform/audit/strictAudit.js';
import { GLOBAL_FORBIDDEN_FIELDS, AUDIT_ACTIONS } from '../../kernel/constants.js';
/** Narrow adapter for the shared domain commands; no raw request reaches Prisma. */
function taskCommandDb(tx: Prisma.TransactionClient): TaskWriteDb {
    return { task: {
            update: args => tx.task.update({ where: args.where, data: args.data as Prisma.TaskUncheckedUpdateInput }),
            updateMany: args => tx.task.updateMany({ where: args.where as Prisma.TaskWhereInput, data: args.data as Prisma.TaskUncheckedUpdateManyInput }),
            findUnique: args => tx.task.findUnique({ where: args.where }),
        } };
}
const object = (v: unknown): v is Record<string, unknown> => Boolean(v && typeof v === 'object' && !Array.isArray(v));
const statuses: Record<string, string> = { '待开始': 'NOT_STARTED', '未开始': 'NOT_STARTED', '进行中': 'IN_PROGRESS', '已完成': 'COMPLETED', '待完成': 'NOT_STARTED', '已阻塞': 'BLOCKED', '已取消': 'CANCELLED' };
const priorities: Record<string, string> = { '低': 'LOW', '中': 'MEDIUM', '高': 'HIGH', '紧急': 'URGENT' };
const idOf = (v: unknown): string => { if (typeof v !== 'string' || !v.trim() || v.length > 180)
    throw badRequest('INVALID_REFERENCE', '子项ID无效'); return v; };
const date = (v: unknown): Date | null => { if (v === null || v === '')
    return null; if (typeof v !== 'string' || !Number.isFinite(Date.parse(v)))
    throw badRequest('INVALID_DATE', '日期必须为有效字符串'); return new Date(v); };
function entries(value: unknown): Record<string, unknown>[] { if (value === undefined)
    return []; if (!Array.isArray(value) || value.length > 500 || !value.every(object))
    throw badRequest('INVALID_CHILD_DELTA', '子项必须为最多500个对象'); return value; }
function ids(value: unknown): string[] { if (value === undefined)
    return []; if (!Array.isArray(value) || value.length > 500)
    throw badRequest('INVALID_CHILD_DELTA', '删除ID必须为最多500项数组'); const parsed = value.map(idOf); if (new Set(parsed).size !== parsed.length)
    throw badRequest('INVALID_CHILD_DELTA', '删除ID重复'); return parsed; }
function patch(raw: Record<string, unknown>, kind: 'task' | 'milestone') {
    // id/baseUpdatedAt are command envelope fields, never ORM payload fields.
    const forbidden = GLOBAL_FORBIDDEN_FIELDS.filter((f: string) => f !== 'id' && Object.hasOwn(raw, f));
    if (forbidden.length)
        throw badRequest('INVALID_CHILD_DELTA', '子项包含服务端字段', { forbidden });
    const fields: Record<string, unknown> = {};
    const strings = kind === 'task' ? ['title', 'description', 'parentId', 'phaseId', 'assigneeId', 'expectedDeliverable', 'regulatoryNotes'] : ['name', 'description', 'phaseId'];
    for (const key of strings)
        if (Object.hasOwn(raw, key)) {
            const v = raw[key];
            if (v !== null && typeof v !== 'string')
                throw badRequest('INVALID_CHILD_TYPE', `${key}必须为字符串`);
            if (v === null && ['title', 'name'].includes(key))
                throw badRequest('INVALID_CHILD_TYPE', `${key}不能为空`);
            fields[key] = v;
        }
    if (raw.date !== undefined && raw.dueDate === undefined)
        fields.dueDate = date(raw.date);
    for (const key of ['dueDate', 'startDate'])
        if (Object.hasOwn(raw, key))
            fields[key] = date(raw[key]);
    const enums: Record<string, string[]> = kind === 'task' ? { status: Object.values(TaskStatus), priority: Object.values(TaskPriority), taskType: Object.values(TaskType), applicability: Object.values(TaskApplicability) } : { status: Object.values(TaskStatus) };
    for (const [key, allowed] of Object.entries(enums))
        if (Object.hasOwn(raw, key)) {
            const v = raw[key];
            if (typeof v !== 'string')
                throw badRequest('INVALID_CHILD_TYPE', `${key}必须为字符串`);
            const normalized = (key === 'status' ? statuses[v] : key === 'priority' ? priorities[v] : undefined) ?? v;
            if (!allowed.includes(normalized))
                throw badRequest('INVALID_CHILD_ENUM', `${key}枚举无效`);
            fields[key] = normalized;
        }
    for (const key of ['sortOrder', 'estimatedHours', 'progressPercent'])
        if (Object.hasOwn(raw, key)) {
            if (kind !== 'task')
                throw badRequest('INVALID_CHILD_DELTA', '里程碑字段无效');
            const v = raw[key];
            if (typeof v !== 'number' || !Number.isFinite(v) || v < 0)
                throw badRequest('INVALID_CHILD_TYPE', `${key}必须为非负数`);
            fields[key] = v;
        }
    return fields;
}
export async function assertLiveTaskReferences(tx: Prisma.TransactionClient, projectId: string, data: Record<string, unknown>, taskId?: string) {
    if (data.parentId !== undefined && data.parentId !== null) {
        await tx.$queryRaw `SELECT id FROM tasks WHERE id = ${idOf(data.parentId)} FOR SHARE`;
        const parent = await tx.task.findUnique({ where: { id: idOf(data.parentId) } });
        if (!parent || parent.projectId !== projectId || parent.deletedAt || parent.id === taskId)
            throw badRequest('INVALID_REFERENCE', '父任务必须为本项目有效任务');
    }
    if (data.phaseId !== undefined && data.phaseId !== null) {
        await tx.$queryRaw `SELECT id FROM project_phases WHERE id = ${idOf(data.phaseId)} FOR SHARE`;
        const phase = await tx.projectPhase.findUnique({ where: { id: idOf(data.phaseId) } });
        if (!phase || phase.projectId !== projectId || phase.deletedAt)
            throw badRequest('INVALID_REFERENCE', '阶段必须为本项目有效阶段');
    }
}
export async function tombstoneTasks(tx: Prisma.TransactionClient, args: {
    actor: AuthActor;
    access: ProjectAccess;
    projectId: string;
    ids: string[];
    c?: unknown;
    audit?: boolean;
}) {
    assertActionPermission(args.actor, 'tasks.delete');
    assertProjectCapability(args.access, 'delete', 'tasks.delete');
    if (!args.ids.length)
        return { count: 0 };
    await tx.$queryRaw(Prisma.sql `SELECT id FROM tasks WHERE id IN (${Prisma.join(args.ids)}) ORDER BY id FOR UPDATE`);
    const records = await tx.task.findMany({ where: { id: { in: args.ids } } });
    if (records.length !== args.ids.length || records.some(t => t.projectId !== args.projectId))
        throw badRequest('INVALID_REFERENCE', '删除子项不属于本项目');
    const live = records.filter(t => !t.deletedAt).map(t => t.id);
    if (!live.length)
        return { count: 0 };
    const child = await tx.task.findFirst({ where: { parentId: { in: live }, deletedAt: null, id: { notIn: live } }, select: { id: true, projectId: true } });
    if (child)
        throw new HttpError(409, 'LIVE_TASK_REFERENCE', '任务仍有有效子任务；须显式处理子任务后删除');
    const dependency = await tx.taskDependency.findFirst({ where: { prerequisiteId: { in: live }, taskId: { notIn: live }, task: { deletedAt: null } } });
    if (dependency)
        throw new HttpError(409, 'LIVE_TASK_REFERENCE', '任务仍被有效任务依赖；须显式处理后删除');
    const changed = await tx.task.updateMany({ where: { id: { in: live }, projectId: args.projectId, deletedAt: null }, data: { deletedAt: new Date(), updatedById: args.actor.userId } });
    if (changed.count !== live.length)
        throw new HttpError(409, 'CONFLICT', '任务删除状态已变化');
    if (args.audit !== false)
        await writeAuditStrict(tx, { c: args.c, actorId: args.actor.userId, actorName: args.actor.user?.displayName, actorRole: args.actor.systemRole, action: AUDIT_ACTIONS.DELETE, entityType: 'TASK', entityId: live[0], changedFields: ['deletedAt'], metadata: { permissionCode: 'tasks.delete', command: 'EXPLICIT_TASK_TOMBSTONE_V1', ids: live, projectId: args.projectId, elevated: Boolean(args.access.elevated) } });
    return changed;
}
export async function applyProjectChildren(tx: Prisma.TransactionClient, args: {
    actor: AuthActor;
    access: ProjectAccess;
    projectId: string;
    body: Record<string, unknown>;
    c: unknown;
}) {
    const tasks = entries(args.body.tasks), milestones = entries(args.body.milestones), deletedTasks = ids(args.body.deletedTaskIds), deletedMilestones = ids(args.body.deletedMilestoneIds);
    if (!tasks.length && !milestones.length && !deletedTasks.length && !deletedMilestones.length)
        return;
    const project = await tx.project.findUniqueOrThrow({ where: { id: args.projectId } });
    if (typeof args.body.baseUpdatedAt !== 'string' || !Number.isFinite(Date.parse(args.body.baseUpdatedAt)) || project.updatedAt.getTime() !== Date.parse(args.body.baseUpdatedAt))
        throw new HttpError(409, 'CHILD_BASELINE_REQUIRED', '子项修改需要原读取项目基线');
    for (const [kind, raws, deleted] of [['task', tasks, deletedTasks], ['milestone', milestones, deletedMilestones]] as const) {
        const seen = new Set<string>();
        for (const raw of raws) {
            if (raw.id !== undefined) {
                const id = idOf(raw.id);
                if (seen.has(id) || deleted.includes(id))
                    throw badRequest('INVALID_CHILD_DELTA', '子项重复或同时修改删除');
                seen.add(id);
            }
        }
        for (const raw of raws) {
            const id = raw.id === undefined ? undefined : idOf(raw.id), fields = patch(raw, kind);
            const current = id ? (kind === 'task' ? await tx.task.findUnique({ where: { id } }) : await tx.milestone.findUnique({ where: { id } })) : null;
            if (id && (!current || current.projectId !== args.projectId || current.deletedAt))
                throw badRequest('INVALID_REFERENCE', '子项必须为本项目当前有效记录');
            if (current && (typeof raw.baseUpdatedAt !== 'string' || !Number.isFinite(Date.parse(raw.baseUpdatedAt)) || current.updatedAt.getTime() !== Date.parse(raw.baseUpdatedAt)))
                throw new HttpError(409, 'CHILD_CONFLICT', '子项已变化或缺少原基线');
            if (kind === 'task') {
                await assertLiveTaskReferences(tx, args.projectId, fields, id);
                if (!current) {
                    assertActionPermission(args.actor, 'tasks.create');
                    assertProjectCapability(args.access, 'write', 'tasks.create');
                    if (typeof fields.title !== 'string' || !fields.title.trim())
                        throw badRequest('INVALID_CHILD_DELTA', '新任务需要标题');
                    await tx.task.create({ data: { ...fields, projectId: args.projectId, createdById: args.actor.userId } as Prisma.TaskUncheckedCreateInput });
                }
                else {
                    const task = current as Awaited<ReturnType<typeof tx.task.findUniqueOrThrow>>;
                    const nextStatus = fields.status, assignee = fields.assigneeId;
                    delete fields.status;
                    delete fields.assigneeId;
                    let consumed = false;
                    const cas = () => { if (consumed)
                        return undefined; consumed = true; return { updatedAt: task.updatedAt, deletedAt: null, projectId: args.projectId }; };
                    if (Object.keys(fields).length)
                        await updateTaskFields(taskCommandDb(tx), { actor: args.actor, access: args.access, task, fields, cas: cas() });
                    if (nextStatus !== undefined && nextStatus !== task.status)
                        await changeTaskStatus(taskCommandDb(tx), { actor: args.actor, access: args.access, task, status: String(nextStatus), cas: cas() });
                    if (assignee !== undefined && assignee !== task.assigneeId)
                        await assignTask(taskCommandDb(tx), { actor: args.actor, access: args.access, task, assigneeId: assignee as string | null, cas: cas() });
                }
            }
            else {
                assertActionPermission(args.actor, current ? 'milestones.update' : 'milestones.create');
                assertProjectCapability(args.access, 'write', 'milestones.update');
                await assertLiveTaskReferences(tx, args.projectId, fields);
                if (current) {
                    const changed = await tx.milestone.updateMany({ where: { id: current.id, projectId: args.projectId, updatedAt: current.updatedAt, deletedAt: null }, data: { ...fields, updatedById: args.actor.userId } as Prisma.MilestoneUncheckedUpdateManyInput });
                    if (changed.count !== 1)
                        throw new HttpError(409, 'CHILD_CONFLICT', '里程碑已变化');
                }
                else {
                    if (typeof fields.name !== 'string' || !fields.name.trim() || !(fields.dueDate instanceof Date))
                        throw badRequest('INVALID_CHILD_DELTA', '新里程碑需要名称和到期日');
                    await tx.milestone.create({ data: { ...fields, projectId: args.projectId, createdById: args.actor.userId } as Prisma.MilestoneUncheckedCreateInput });
                }
            }
        }
    }
    if (deletedTasks.length)
        await tombstoneTasks(tx, { ...args, ids: deletedTasks });
    if (deletedMilestones.length) {
        assertActionPermission(args.actor, 'milestones.delete');
        assertProjectCapability(args.access, 'delete', 'milestones.delete');
        const rows = await tx.milestone.findMany({ where: { id: { in: deletedMilestones } } });
        if (rows.length !== deletedMilestones.length || rows.some(m => m.projectId !== args.projectId))
            throw badRequest('INVALID_REFERENCE', '删除里程碑不属于本项目');
        await tx.milestone.updateMany({ where: { id: { in: deletedMilestones }, projectId: args.projectId, deletedAt: null }, data: { deletedAt: new Date(), updatedById: args.actor.userId } });
    }
    await writeAuditStrict(tx, { c: args.c, actorId: args.actor.userId, actorName: args.actor.user?.displayName, actorRole: args.actor.systemRole, action: AUDIT_ACTIONS.UPDATE, entityType: 'PROJECT', entityId: args.projectId, changedFields: ['childDelta'], metadata: { command: 'PROJECT_CHILD_DELTA_V1', taskIds: tasks.map(t => t.id ?? null), milestoneIds: milestones.map(m => m.id ?? null), deletedTaskIds: deletedTasks, deletedMilestoneIds: deletedMilestones, elevated: Boolean(args.access.elevated) } });
}
