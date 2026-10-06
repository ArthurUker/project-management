/** Candidate editor adapter: original read baseline and explicit removal intent. */
type Row = Record<string, unknown>;
export interface ProjectEditSnapshot {
    updatedAt: string;
    tasks: Row[];
    milestones: Row[];
    managerId?: string | null;
}
const statuses: Record<string, string> = { '待开始': 'NOT_STARTED', '未开始': 'NOT_STARTED', '待完成': 'NOT_STARTED', '进行中': 'IN_PROGRESS', '已完成': 'COMPLETED', '已阻塞': 'BLOCKED', '已取消': 'CANCELLED' };
const priorities: Record<string, string> = { '低': 'LOW', '中': 'MEDIUM', '高': 'HIGH', '紧急': 'URGENT' };
const normalized = (key: string, value: unknown) => key === 'status' ? (statuses[String(value)] ?? value) : key === 'priority' ? (priorities[String(value)] ?? value) : key === 'dueDate' ? (value ? String(value).slice(0, 10) : null) : value;
function delta(original: Row[], planned: Row[], kind: 'task' | 'milestone') {
    const byId = new Map(original.map(r => [String(r.id), r]));
    const seen = new Set<string>();
    const output: Row[] = [];
    const keys = kind === 'task' ? ['title', 'priority', 'status', 'phaseId', 'dueDate', 'assigneeId'] : ['name', 'status', 'phaseId', 'dueDate'];
    for (const row of planned) {
        const id = String(row.id ?? '');
        const before = byId.get(id);
        if (before && seen.has(id))
            throw Error('DUPLICATE_CHILD_ID');
        if (!before && /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(id))
            throw Error('UNPROVEN_CHILD_DRAFT_BASE');
        if (before)
            seen.add(id);
        const patch: Row = {};
        for (const key of keys) {
            let value = row[key];
            if (key === 'dueDate' && value === undefined)
                value = row.date;
            if (value === undefined)
                continue;
            value = normalized(key, value);
            if (!before || normalized(key, before[key]) !== value)
                patch[key] = value;
        }
        if (!before)
            output.push(patch);
        else if (Object.keys(patch).length) {
            if (typeof before.updatedAt !== 'string')
                throw Error('CHILD_BASELINE_REQUIRED');
            output.push({ id, baseUpdatedAt: before.updatedAt, ...patch });
        }
    }
    return { upserts: output, deleted: original.filter(r => !seen.has(String(r.id))).map(r => String(r.id)) };
}
export function buildProjectChildEdit(snapshot: ProjectEditSnapshot, tasks: Row[], milestones: Row[]) {
    if (!snapshot.updatedAt || !Number.isFinite(Date.parse(snapshot.updatedAt)))
        throw Error('PROJECT_BASELINE_REQUIRED');
    const t = delta(snapshot.tasks, tasks, 'task'), m = delta(snapshot.milestones, milestones, 'milestone');
    return { baseUpdatedAt: snapshot.updatedAt, tasks: t.upserts, milestones: m.upserts, deletedTaskIds: t.deleted, deletedMilestoneIds: m.deleted };
}
export function projectEditSnapshotSignature(snapshot: ProjectEditSnapshot) {
    const refs = (rows: Row[]) => rows.map(r => [r.id, r.updatedAt]).sort((a, b) => String(a[0]).localeCompare(String(b[0])));
    return JSON.stringify({ updatedAt: snapshot.updatedAt, tasks: refs(snapshot.tasks), milestones: refs(snapshot.milestones) });
}
