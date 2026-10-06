// ../frontend/src/shared/projectEditCommand.ts
var statuses = { "\u5F85\u5F00\u59CB": "NOT_STARTED", "\u672A\u5F00\u59CB": "NOT_STARTED", "\u5F85\u5B8C\u6210": "NOT_STARTED", "\u8FDB\u884C\u4E2D": "IN_PROGRESS", "\u5DF2\u5B8C\u6210": "COMPLETED", "\u5DF2\u963B\u585E": "BLOCKED", "\u5DF2\u53D6\u6D88": "CANCELLED" };
var priorities = { "\u4F4E": "LOW", "\u4E2D": "MEDIUM", "\u9AD8": "HIGH", "\u7D27\u6025": "URGENT" };
var normalized = (key, value) => key === "status" ? statuses[String(value)] ?? value : key === "priority" ? priorities[String(value)] ?? value : key === "dueDate" ? value ? String(value).slice(0, 10) : null : value;
function delta(original, planned, kind) {
  const byId = new Map(original.map((r) => [String(r.id), r]));
  const seen = /* @__PURE__ */ new Set();
  const output = [];
  const keys = kind === "task" ? ["title", "priority", "status", "phaseId", "dueDate", "assigneeId"] : ["name", "status", "phaseId", "dueDate"];
  for (const row of planned) {
    const id = String(row.id ?? "");
    const before = byId.get(id);
    if (before && seen.has(id))
      throw Error("DUPLICATE_CHILD_ID");
    if (!before && /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(id))
      throw Error("UNPROVEN_CHILD_DRAFT_BASE");
    if (before)
      seen.add(id);
    const patch = {};
    for (const key of keys) {
      let value = row[key];
      if (key === "dueDate" && value === void 0)
        value = row.date;
      if (value === void 0)
        continue;
      value = normalized(key, value);
      if (!before || normalized(key, before[key]) !== value)
        patch[key] = value;
    }
    if (!before)
      output.push(patch);
    else if (Object.keys(patch).length) {
      if (typeof before.updatedAt !== "string")
        throw Error("CHILD_BASELINE_REQUIRED");
      output.push({ id, baseUpdatedAt: before.updatedAt, ...patch });
    }
  }
  return { upserts: output, deleted: original.filter((r) => !seen.has(String(r.id))).map((r) => String(r.id)) };
}
function buildProjectChildEdit(snapshot, tasks, milestones) {
  if (!snapshot.updatedAt || !Number.isFinite(Date.parse(snapshot.updatedAt)))
    throw Error("PROJECT_BASELINE_REQUIRED");
  const t = delta(snapshot.tasks, tasks, "task"), m = delta(snapshot.milestones, milestones, "milestone");
  return { baseUpdatedAt: snapshot.updatedAt, tasks: t.upserts, milestones: m.upserts, deletedTaskIds: t.deleted, deletedMilestoneIds: m.deleted };
}
function projectEditSnapshotSignature(snapshot) {
  const refs = (rows) => rows.map((r) => [r.id, r.updatedAt]).sort((a, b) => String(a[0]).localeCompare(String(b[0])));
  return JSON.stringify({ updatedAt: snapshot.updatedAt, tasks: refs(snapshot.tasks), milestones: refs(snapshot.milestones) });
}
export {
  buildProjectChildEdit,
  projectEditSnapshotSignature
};
