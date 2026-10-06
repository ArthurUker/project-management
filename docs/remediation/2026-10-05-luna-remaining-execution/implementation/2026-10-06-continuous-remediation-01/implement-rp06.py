from pathlib import Path
p=Path('rdpms-system/backend/src/routes/registrations.js');s=p.read_text();s=s.replace("import { badRequest, notFound } from '../kernel/http.js';","""import { badRequest, notFound } from '../kernel/http.js';
import { resolveProjectAccess, assertProjectCapability } from '../kernel/projectAccess.js';
import { assertActionPermission } from '../modules/access/writeGuards.js';
import { registrationActor, registrationScopeWhere, registrationLinks } from '../modules/projects/registrationAccess.js';
import { writeAuditStrict } from '../platform/audit/strictAudit.js';""")
insert="""
/** Recheck authority in the same snapshot/transaction as projection or mutation. */
async function registrationRun(c, permission, capability, work, id = null, write = false) {
  const authenticated = getAuth(c);
  return prisma.$transaction(async (tx) => {
    if (write) {
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${authenticated.userId} FOR UPDATE`;
      if (id) await tx.$queryRaw`SELECT id FROM projects WHERE id = ${id} FOR UPDATE`;
    }
    const auth = await registrationActor(tx, authenticated);
    assertActionPermission(auth, permission);
    let access = null;
    if (id) {
      const project = await tx.project.findFirst({ where: registrationProjectWhere({ id }), select: { id: true } });
      if (!project) throw notFound('REGISTRATION_NOT_FOUND', '注册项目不存在');
      access = await resolveProjectAccess(tx, auth, id);
      assertProjectCapability(access, capability, permission);
    }
    if (auth.systemRole === 'SUPER_ADMIN' && (!access || access.elevated)) {
      await writeAuditStrict(tx, { c, actorId: auth.userId, actorName: auth.user.displayName, actorRole: auth.systemRole,
        action: AUDIT_ACTIONS.READ_SENSITIVE, entityType: 'PROJECT', entityId: id, entityLabel: 'registration scope',
        metadata: { elevated: true, permissionCode: permission, scope: id ? 'nonmember-project' : 'registration-list' } });
    }
    return work(tx, auth, access);
  }, { isolationLevel: write ? 'Serializable' : 'RepeatableRead', maxWait: 10000, timeout: 15000 });
}
async function registrationAudit(tx, c, auth, id, permission, changedFields, extra = {}) {
  return writeAuditStrict(tx, { c, actorId: auth.userId, actorName: auth.user.displayName, actorRole: auth.systemRole,
    action: AUDIT_ACTIONS.UPDATE, entityType: 'REGISTRATION', entityId: id, changedFields,
    metadata: { permissionCode: permission, ...extra } });
}
"""
s=s.replace("registrations.use('*', authMiddleware);", "registrations.use('*', authMiddleware);\n"+insert)
# Structured handler wrapping: existing validated body remains in one current-authority tx.
def rewrite(start,end,transform):
 global s
 a=s.index(start);b=s.index(end,a);old=s[a:b];s=s[:a]+transform(old)+s[b:]
def wrap(old,permission,capability,write=False):
 first=old.index('async (c) => {')+len('async (c) => {');last=old.rindex('\n});');body=old[first:last];body=body.replace("  const auth = getAuth(c);\n",'').replace("  const id = c.req.param('id');\n",'');body=body.replace('prisma.','tx.');body=body.replace('  await tx.$transaction(async (tx) => {','  {').replace('  });\n\n  const updated =','  }\n\n  const updated =');
 header="\n  const id = c.req.param('id');" if capability else ''
 return old[:first]+header+"\n  return registrationRun(c, '"+permission+"', "+("'"+capability+"'" if capability else 'null')+", async (tx, auth, access) => {"+body+"\n  }, "+('id' if capability else 'null')+", "+str(write).lower()+");"+old[last:]
rewrite("registrations.get('/',",'// 统计',lambda old:wrap(old,'registrations.view',None).replace('const where = registrationProjectWhere();','const where = registrationScopeWhere(auth);\n  const links = registrationLinks(auth);').replace("_count: { select: { tasks: { where: { deletedAt: null } }, members: { where: { leftAt: null } } } },","_count: { select: { ...(links.tasks ? { tasks: { where: { deletedAt: null } } } : {}), ...(links.members ? { members: { where: { leftAt: null } } } : {}) } },"))
rewrite("registrations.get('/stats',",'// 可用模板',lambda old:wrap(old,'registrations.view',None).replace('where: registrationProjectWhere(),','where: registrationScopeWhere(auth),'))
rewrite("registrations.get('/:id',",'// ── 创建',lambda old:wrap(old,'registrations.view','read').replace("  const item =", "  const links = registrationLinks(auth);\n  const item =").replace('members: {\n        include:', 'members: links.members ? {\n        where: { leftAt: null },\n        include:').replace('      },\n      tasks: {','      } : false,\n      tasks: links.tasks ? {').replace('regulatoryDocuments: {','regulatoryDocuments: links.regulatory ? {').replace('            },\n          },\n        },','            },\n          } : false,\n        },').replace('      },\n      milestones:', '      } : false,\n      milestones:').replace("milestones: { where: { deletedAt: null }, orderBy: { dueDate: 'asc' } },","milestones: links.milestones ? { where: { deletedAt: null }, orderBy: { dueDate: 'asc' } } : false,").replace("phases: { orderBy: { sortOrder: 'asc' } },","phases: links.phases ? { where: { deletedAt: null }, orderBy: { sortOrder: 'asc' } } : false,"))
rewrite("registrations.put('/:id',",'// ── 阶段推进',lambda old:wrap(old,'registrations.update','write',True).replace('  const updated =',"  await registrationAudit(tx, c, auth, id, 'registrations.update', Object.keys(body), { elevated: Boolean(access.elevated) });\n  const updated ="))
rewrite("registrations.patch('/:id/stage',",'// 单独更新档案',lambda old:wrap(old,'registrations.change_stage','transition',True).replace('await writeAudit(tx,','await writeAuditStrict(tx,').replace("metadata: { permissionCode: 'registrations.change_stage' },","metadata: { permissionCode: 'registrations.change_stage', elevated: Boolean(access.elevated) },"))
rewrite("registrations.patch('/:id/profile',",'export default registrations;',lambda old:wrap(old,'registrations.update','write',True).replace('  return c.json(profile);',"  await registrationAudit(tx, c, auth, id, 'registrations.update', Object.keys(payload), { elevated: Boolean(access.elevated) });\n  return c.json(profile);"))
# New-project creator ownership and one caller transaction across template scaffold.
a=s.index('async function scaffoldFromTemplate(');b=s.index('// ISAF',a);piece=s[a:b].replace('scaffoldFromTemplate(projectId, templateId, managerId)','scaffoldFromTemplate(db, projectId, templateId, managerId)').replace('prisma.','db.');s=s[:a]+piece+s[b:]
rewrite("registrations.post('/',",'// ── 更新',lambda old:wrap(old,'registrations.create',None,True).replace("const managerId = body.managerId || auth.userId;","""const managerId = body.managerId === undefined ? auth.userId : managerTransferId(body.managerId);
  const target = await tx.user.findUnique({ where: { id: managerId } });
  if (!target || target.deletedAt || target.status !== 'ACTIVE') throw badRequest('MANAGER_NOT_ACTIVE', '负责人必须为当前有效账号');""").replace("nextCode(prisma,",'nextCode(tx,').replace("members: { create: { userId: managerId, role: 'MANAGER', createdById: auth.userId } },","members: { create: [{ userId: auth.userId, role: 'OWNER', createdById: auth.userId }, ...(managerId === auth.userId ? [] : [{ userId: managerId, role: 'MANAGER', createdById: auth.userId }])] },").replace('scaffoldFromTemplate(created.id,', 'scaffoldFromTemplate(tx, created.id,').replace('await writeAudit(tx,','await writeAuditStrict(tx,'))
p.write_text(s)
