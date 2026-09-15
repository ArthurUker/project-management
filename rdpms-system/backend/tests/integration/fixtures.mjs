/**
 * tests/integration/fixtures.mjs —— 集成测试最小夹具（专用隔离库 rdpms_test）
 *
 * 原则：
 *   - 只使用固定 ID 的合成数据（前缀 it-），便于重复执行与清理；
 *   - 不依赖种子账号，不复用生产/演练数据；
 *   - 每个用例结束自行清理自己写入的行，保持库可反复使用。
 */

export const IT = {
  userAuthor: 'it-user-author',
  userOther: 'it-user-other',
  project: 'it-project-1',
  project2: 'it-project-2',
  report: 'it-report-1',
  phase: 'it-phase-1',
  phaseOther: 'it-phase-other',
  task: 'it-task-1',
};

export const DAILY_PERIOD = '2026-09-15';

/** 建立作者 / 另一成员 / 项目 / 成员关系 / 草稿日报（幂等 upsert） */
export async function seedMinimalFixture(prisma) {
  const users = [
    { id: IT.userAuthor, username: 'it-author', displayName: '集成测试作者' },
    { id: IT.userOther, username: 'it-other', displayName: '集成测试他人' },
  ];
  for (const u of users) {
    await prisma.user.upsert({
      where: { id: u.id },
      update: { displayName: u.displayName, deletedAt: null, status: 'ACTIVE' },
      create: {
        id: u.id,
        username: u.username,
        email: `${u.username}@example.invalid`,
        passwordHash: 'not-a-real-hash',
        displayName: u.displayName,
        systemRole: 'MEMBER',
        status: 'ACTIVE',
      },
    });
  }

  await prisma.project.upsert({
    where: { id: IT.project },
    update: { deletedAt: null },
    create: {
      id: IT.project,
      code: 'IT-PRJ-1',
      name: '集成测试项目',
      type: 'TESTING',
      managerId: IT.userAuthor,
    },
  });

  for (const [userId, role] of [[IT.userAuthor, 'OWNER'], [IT.userOther, 'MEMBER']]) {
    await prisma.projectMember.upsert({
      where: { projectId_userId: { projectId: IT.project, userId } },
      update: { leftAt: null, role },
      create: { projectId: IT.project, userId, role, leftAt: null },
    });
  }

  await prisma.report.upsert({
    where: { id: IT.report },
    update: { status: 'DRAFT', content: {}, deletedAt: null },
    create: {
      id: IT.report,
      projectId: IT.project,
      authorId: IT.userAuthor,
      reportType: 'DAILY',
      periodKey: DAILY_PERIOD,
      content: {},
      status: 'DRAFT',
    },
  });

  // RF04 需要：第二个项目、两个阶段（跨项目引用用例）、一个任务
  await prisma.project.upsert({
    where: { id: IT.project2 },
    update: { deletedAt: null },
    create: {
      id: IT.project2,
      code: 'IT-PRJ-2',
      name: '集成测试项目二',
      type: 'TESTING',
      managerId: IT.userAuthor,
    },
  });

  for (const [id, projectId, name] of [
    [IT.phase, IT.project, '集成测试阶段'],
    [IT.phaseOther, IT.project2, '他项目阶段'],
  ]) {
    await prisma.projectPhase.upsert({
      where: { id },
      update: { deletedAt: null },
      create: { id, projectId, code: `PH-${id}`, name, sortOrder: 1 },
    });
  }

  await prisma.task.upsert({
    where: { id: IT.task },
    update: { deletedAt: null, status: 'NOT_STARTED', assigneeId: null },
    create: {
      id: IT.task,
      projectId: IT.project,
      phaseId: IT.phase,
      title: '集成测试任务',
      status: 'NOT_STARTED',
    },
  });
}

/** 把作者移出项目（用于「撤权后不得回放」用例） */
export async function revokeAuthorMembership(prisma) {
  await prisma.projectMember.update({
    where: { projectId_userId: { projectId: IT.project, userId: IT.userAuthor } },
    data: { leftAt: new Date() },
  });
}

/** 恢复作者成员关系 */
export async function restoreAuthorMembership(prisma) {
  await prisma.projectMember.update({
    where: { projectId_userId: { projectId: IT.project, userId: IT.userAuthor } },
    data: { leftAt: null },
  });
}

/** 清理本用例产生的回执 / 审计 / 版本（保留最小夹具主体） */
export async function cleanupReceiptsAndAudit(prisma) {
  await prisma.mutationReceipt.deleteMany({
    where: { actorId: { in: [IT.userAuthor, IT.userOther] } },
  });
  await prisma.auditLog.deleteMany({
    where: { entityId: IT.report },
  });
  await prisma.reportVersion.deleteMany({ where: { reportId: IT.report } });
}
