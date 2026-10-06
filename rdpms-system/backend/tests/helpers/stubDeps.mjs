/**
 * tests/helpers/stubDeps.mjs —— 无数据库路由测试的依赖桩（RF01）
 *
 * 用途：为 createApp({db, actorResolver}) 提供可注入的假数据库与假身份，
 * 使路由契约测试不连接 PostgreSQL、不监听端口、不读 JWT 密钥。
 *
 * 注意：这里是测试替身，只实现被调用到的方法；任何未实现的方法会抛错而不是静默返回 undefined，
 * 以便在用例中暴露「意外走到未覆盖代码路径」的情况。
 */

/** 未实现方法兜底：立即失败，避免静默 undefined 造成的假通过 */
function unimplemented(path) {
  return async () => {
    throw new Error(`[stubDeps] 未实现的数据库方法被调用: ${path}`);
  };
}

/** where 匹配（id + 标量/日期条件），用于原子 updateMany 的并发基线语义 */
function matchesWhere(row, where) {
  return Object.entries(where).every(([key, expected]) => {
    if (key === 'id') return row.id === expected;
    const actual = row[key];
    if (expected instanceof Date) {
      return actual instanceof Date && actual.getTime() === expected.getTime();
    }
    if (expected && typeof expected === 'object' && !Array.isArray(expected)) {
      // RP10-T02：状态白名单 `{ in: [...] }` 必须真实参与匹配，
      // 否则桩会把「仅限可编辑状态」的原子谓词当成恒成立，掩盖迟到保存缺陷。
      if (Array.isArray(expected.in)) return expected.in.includes(actual);
      return true; // 未使用的操作符条件
    }
    return actual === expected;
  });
}

/**
 * 构造一个最小可用的假 Prisma 客户端。
 * @param {object} [options]
 * @param {object} [options.project] 项目访问解析返回的项目行
 * @param {object|null} [options.membership] 成员关系行（null = 非成员）
 * @param {Array<object>} [options.reports] 预置汇报行
 * @param {() => Promise<void>} [options.beforeProjectLookup] 项目查询前的钩子（用于制造请求交错）
 */
export function createStubDb(options = {}) {
  const beforeProjectLookup = options.beforeProjectLookup;
  const projectRow = options.project ?? {
    id: 'p1',
    code: 'SYN',
    name: '合成测试项目',
    deletedAt: null,
    managerId: 'u1',
  };
  const membership = options.membership === undefined
    ? { role: 'OWNER', leftAt: null }
    : options.membership;

  const state = {
    reports: [...(options.reports ?? [])],
    reportVersions: [],
    auditLogs: [],
    mutationReceipts: [...(options.mutationReceipts ?? [])],
    tasks: [...(options.tasks ?? [])],
    phases: [...(options.phases ?? [])],
    syncDevices: [],
    syncMutations: [],
    projects: [...(options.projects ?? [])],
    milestones: [...(options.milestones ?? [])],
    writes: [],
    rawQueries: [],
  };

  /** 事务回滚用的快照/还原（桩实现：失败时把状态还原，模拟真实事务语义） */
  const snapshot = () => structuredClone({
    reports: state.reports,
    reportVersions: state.reportVersions,
    auditLogs: state.auditLogs,
    mutationReceipts: state.mutationReceipts,
    tasks: state.tasks,
    phases: state.phases,
    syncDevices: state.syncDevices,
    syncMutations: state.syncMutations,
    projects: state.projects,
    milestones: state.milestones,
    writes: state.writes,
    rawQueries: state.rawQueries,
  });
  const restore = (snap) => {
    state.reports = snap.reports;
    state.reportVersions = snap.reportVersions;
    state.auditLogs = snap.auditLogs;
    state.mutationReceipts = snap.mutationReceipts;
    state.tasks = snap.tasks;
    state.phases = snap.phases;
    state.syncDevices = snap.syncDevices;
    state.syncMutations = snap.syncMutations;
    state.projects = snap.projects;
    state.milestones = snap.milestones;
    state.writes = snap.writes;
    state.rawQueries = snap.rawQueries;
  };

  const db = {
    state,
    dataRecoveryState: {findUniqueOrThrow: async()=>({id:1,status:'READY',epoch:'00000000-0000-4000-8000-000000000001'}),findUnique:async()=>({id:1,status:'READY',epoch:'00000000-0000-4000-8000-000000000001'})},
    project: {
      findUnique: async ({ where }) => {
        // 钩子点：位于请求处理链路内部，用于构造「A 挂起时 B 完成」的交错场景
        if (beforeProjectLookup) await beforeProjectLookup();
        const row = state.projects.find((r) => r.id === where.id)
          ?? (where.id === projectRow.id ? projectRow : null);
        return row ? structuredClone(row) : null;
      },
      findMany: async () => (state.projects.length
        ? state.projects.map((r) => ({ id: r.id }))
        : [{ id: projectRow.id }]),
      update: async ({ where, data }) => {
        const row = state.projects.find((r) => r.id === where.id);
        if (!row) throw new Error(`[stubDeps] project.update 目标不存在: ${where.id}`);
        Object.assign(row, data);
        state.writes.push({ op: 'project.update', id: where.id, data });
        return { ...row };
      },
      updateMany: async ({ where, data }) => {
        const row = state.projects.find((r) => matchesWhere(r, where));
        if (!row) return { count: 0 };
        Object.assign(row, data);
        state.writes.push({ op: 'project.updateMany', id: where.id, data });
        return { count: 1 };
      },
    },
    projectMember: {
      findUnique: async () => (membership ? { ...membership } : null),
    },
    report: {
      findUnique: async ({ where }) => {
        // 深拷贝：真实库每次查询返回独立对象，不与存储共享引用
        const match = (r) => {
          if (where.id) return r.id === where.id;
          const k = where.projectId_authorId_reportType_periodKey;
          if (k) {
            return r.projectId === k.projectId
              && r.authorId === k.authorId
              && r.reportType === k.reportType
              && r.periodKey === k.periodKey;
          }
          throw new Error(`[stubDeps] report.findUnique 未支持的 where: ${JSON.stringify(where)}`);
        };
        const row = state.reports.find(match);
        return row ? structuredClone(row) : null;
      },
      findFirst: async ({ where }) => state.reports.find((r) => r.id === where.id) ?? null,
      findMany: async () => [...state.reports],
      count: async () => state.reports.length,
      upsert: async ({ where, create, update }) => {
        const key = where.projectId_authorId_reportType_periodKey;
        const existing = state.reports.find(
          (r) => r.projectId === key.projectId
            && r.authorId === key.authorId
            && r.reportType === key.reportType
            && r.periodKey === key.periodKey,
        );
        if (existing) {
          Object.assign(existing, update);
          state.writes.push({ op: 'report.update', id: existing.id, data: update });
          return existing;
        }
        const row = {
          id: create.id ?? `r-${state.reports.length + 1}`,
          deletedAt: null,
          status: 'DRAFT',
          createdAt: new Date('2026-09-15T00:00:00Z'),
          ...create,
        };
        state.reports.push(row);
        state.writes.push({ op: 'report.create', id: row.id, data: create });
        return row;
      },
      update: async ({ where, data }) => {
        const row = state.reports.find((r) => r.id === where.id);
        if (!row) throw new Error(`[stubDeps] report.update 目标不存在: ${where.id}`);
        Object.assign(row, data);
        state.writes.push({ op: 'report.update', id: where.id, data });
        return { ...row };
      },
      updateMany: async ({ where, data }) => {
        const row = state.reports.find((r) => matchesWhere(r, where));
        if (!row) {
          state.writes.push({ op: 'report.updateMany.miss', id: where.id, data });
          return { count: 0 };
        }
        Object.assign(row, data);
        state.writes.push({ op: 'report.updateMany', id: where.id, data });
        return { count: 1 };
      },
      create: async ({ data }) => {
        const row = { id: data.id ?? `r-${state.reports.length + 1}`, deletedAt: null, ...data };
        state.reports.push(row);
        state.writes.push({ op: 'report.create', id: row.id, data });
        return row;
      },
    },
    reportVersion: {
      findFirst: async ({ where }) => state.reportVersions
        .filter((v) => v.reportId === where.reportId)
        .sort((a, b) => b.version - a.version)[0] ?? null,
      create: async ({ data }) => {
        const row = { id: `v-${state.reportVersions.length + 1}`, ...data };
        state.reportVersions.push(row);
        return row;
      },
      findMany: async () => [...state.reportVersions],
    },
    auditLog: {
      create: async ({ data }) => {
        if (options.failAuditWrite) {
          throw new Error('[stubDeps] 模拟审计写入失败');
        }
        const row = { id: `a-${state.auditLogs.length + 1}`, ...data };
        state.auditLogs.push(row);
        return row;
      },
      findMany: async () => [...state.auditLogs],
      count: async () => state.auditLogs.length,
    },
    mutationReceipt: {
      findUnique: async ({ where }) => {
        const key = where.actorId_command_resourceScope_idempotencyKey;
        const row = state.mutationReceipts.find((r) => r.actorId === key.actorId
          && r.command === key.command
          && r.resourceScope === key.resourceScope
          && r.idempotencyKey === key.idempotencyKey);
        // 深拷贝：真实库的 responseBody 经 JSONB 序列化，不与被改写的业务行共享引用
        return row ? structuredClone(row) : null;
      },
      create: async ({ data }) => {
        const exists = state.mutationReceipts.some((r) => r.actorId === data.actorId
          && r.command === data.command
          && r.resourceScope === data.resourceScope
          && r.idempotencyKey === data.idempotencyKey);
        if (exists) {
          const err = new Error('[stubDeps] 唯一约束冲突：mutation_receipts_scope_key');
          err.code = 'P2002';
          err.meta = { target: 'mutation_receipts_scope_key' };
          throw err;
        }
        const row = {
          id: `mr-${state.mutationReceipts.length + 1}`,
          status: 'COMPLETED',
          responseStatus: 0,
          responseBody: {},
          createdAt: new Date('2026-09-15T00:00:00Z'),
          ...structuredClone(data),
        };
        state.mutationReceipts.push(row);
        return structuredClone(row);
      },
      update: async ({ where, data }) => {
        const row = state.mutationReceipts.find((r) => r.id === where.id);
        if (!row) throw new Error(`[stubDeps] mutationReceipt.update 目标不存在: ${where.id}`);
        Object.assign(row, data);
        return { ...row };
      },
      count: async () => state.mutationReceipts.length,
      findMany: async () => [...state.mutationReceipts],
    },
    task: {
      findUnique: async ({ where }) => {
        const row = state.tasks.find((t) => t.id === where.id);
        return row ? structuredClone(row) : null;
      },
      findFirst: async ({ where }) => state.tasks.find((t) => t.id === where.id
        && (where.deletedAt === undefined || t.deletedAt === where.deletedAt)) ?? null,
      findMany: async () => [...state.tasks],
      update: async ({ where, data }) => {
        const row = state.tasks.find((t) => t.id === where.id);
        if (!row) throw new Error(`[stubDeps] task.update 目标不存在: ${where.id}`);
        Object.assign(row, data);
        state.writes.push({ op: 'task.update', id: where.id, data });
        return { ...row };
      },
      /** 原子并发基线：WHERE 条件不匹配则 count=0（模拟真实 UPDATE ... WHERE） */
      updateMany: async ({ where, data }) => {
        const row = state.tasks.find((t) => matchesWhere(t, where));
        if (!row) {
          state.writes.push({ op: 'task.updateMany.miss', id: where.id, data });
          return { count: 0 };
        }
        Object.assign(row, data);
        state.writes.push({ op: 'task.updateMany', id: where.id, data });
        return { count: 1 };
      },
    },
    milestone: {
      findUnique: async ({ where }) => {
        const row = state.milestones.find((r) => r.id === where.id);
        return row ? structuredClone(row) : null;
      },
      findMany: async () => state.milestones.map((r) => ({ id: r.id })),
      update: async ({ where, data }) => {
        const row = state.milestones.find((r) => r.id === where.id);
        if (!row) throw new Error(`[stubDeps] milestone.update 目标不存在: ${where.id}`);
        Object.assign(row, data);
        state.writes.push({ op: 'milestone.update', id: where.id, data });
        return { ...row };
      },
      updateMany: async ({ where, data }) => {
        const row = state.milestones.find((r) => matchesWhere(r, where));
        if (!row) return { count: 0 };
        Object.assign(row, data);
        state.writes.push({ op: 'milestone.updateMany', id: where.id, data });
        return { count: 1 };
      },
    },
    projectPhase: {
      findUnique: async ({ where }) => state.phases.find((p) => p.id === where.id) ?? null,
      findFirst: async ({ where }) => state.phases.find((p) => p.id === where.id) ?? null,
    },
    syncDevice: {
      upsert: async ({ where, create }) => {
        const row = state.syncDevices.find((d) => d.id === where.id) ?? { id: where.id, ...create };
        if (!state.syncDevices.includes(row)) state.syncDevices.push(row);
        return row;
      },
      update: async ({ where, data }) => {
        const row = state.syncDevices.find((d) => d.id === where.id);
        if (row) Object.assign(row, data);
        return row ?? { id: where.id };
      },
    },
    syncMutation: {
      findMany: async ({ where }) => state.syncMutations.filter(
        (m) => where?.clientMutationId?.in?.includes(m.clientMutationId) ?? true,
      ),
      create: async ({ data }) => {
        const row = { id: `sm-${state.syncMutations.length + 1}`, ...data };
        state.syncMutations.push(row);
        return row;
      },
      /** 失败结果重新判定后覆盖旧回执（与生产代码的 upsert 语义一致） */
      upsert: async ({ where, update, create }) => {
        const key = where?.clientMutationId;
        const idx = state.syncMutations.findIndex((m) => m.clientMutationId === key);
        if (idx >= 0) {
          state.syncMutations[idx] = { ...state.syncMutations[idx], ...update };
          return state.syncMutations[idx];
        }
        const row = { id: `sm-${state.syncMutations.length + 1}`, ...create };
        state.syncMutations.push(row);
        return row;
      },
    },
    permission: {
      findMany: async () => (options.permissions ?? [
        { code: 'reports.view' }, { code: 'reports.update' }, { code: 'tasks.update' },
      ]).map((c) => ({ code: c.code })),
    },
    user: { findUnique: unimplemented('user.findUnique') },
    userRole: { findMany: unimplemented('userRole.findMany') },
    /** 桩事务：失败时还原状态，模拟真实事务回滚（并发语义由真实集成测试覆盖） */
    $transaction: async (fn) => {
      const snap = snapshot();
      try {
        return await fn(db);
      } catch (err) {
        restore(snap);
        throw err;
      }
    },
    /**
     * 行锁语句（`SELECT id FROM reports WHERE id = $1 FOR UPDATE`）只做记录：
     * 桩不模拟锁竞争（并发语义由真实 PostgreSQL 集成测试覆盖），
     * 但必须真实返回查询结果，否则提交命令在契约测试里会 500。
     */
    $queryRaw: async (strings, ...values) => {
      state.rawQueries.push({ sql: Array.isArray(strings) ? strings.join('?') : String(strings ?? '') });
      return [];
    },
  };

  return db;
}

/**
 * 构造一个不经过 JWT 的固定身份（createApp 的 actorResolver 入参）。
 * @param {{userId?: string, systemRole?: string, permissions?: string[], displayName?: string}} [overrides]
 */
export function createStubActor(overrides = {}) {
  const userId = overrides.userId ?? 'u1';
  const systemRole = overrides.systemRole ?? 'MEMBER';
  const user = {
    id: userId,
    username: userId,
    displayName: overrides.displayName ?? '合成用户',
    email: `${userId}@example.invalid`,
    position: null,
    department: null,
    phone: null,
    systemRole,
    status: 'ACTIVE',
    mustChangePassword: false,
    avatarFileId: null,
  };
  return {
    userId,
    user,
    systemRole,
    permissions: overrides.permissions ?? [],
  };
}

/** 便捷 JSON 请求 */
export function jsonRequest(app, url, { method = 'POST', body, actor, headers: extra } = {}) {
  const headers = { 'content-type': 'application/json', ...(extra ?? {}) };
  if (actor) headers['x-test-actor'] = actor;
  return app.request(url, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

/** 可挂起的门闩，用于构造请求交错 */
export function createGate() {
  let release;
  let entered;
  const released = new Promise((resolve) => { release = resolve; });
  const arrived = new Promise((resolve) => { entered = resolve; });
  return {
    /** 处理器内调用：通知「已进入」并等待放行 */
    async wait() {
      entered();
      await released;
    },
    /** 等待处理器确实进入挂起状态 */
    get arrived() { return arrived; },
    /** 放行 */
    release,
  };
}
