# RDPMS 当前文档入口

更新：2026-10-09；核对基线 `289d340`。本轮检查本地代码与服务器执行者入库资料，未访问服务器。

## 日常维护

- [项目 README](../README.md)：架构、接口、页面与当前原地部署形态。
- [部署指南](deployment/deploy-guide.md)：实际脚本能力及边界。
- [数据库迁移约束](deployment/schema-migration-guide.md)。
- [PostgreSQL 初始化参考](deployment/postgresql-init.md)：仅新环境设计，禁止套用到现有生产库。
- [当前未闭环事项](review/codebuddy/deepseek/open-items.md)。

## 保留的技术合同

- [RBAC 已签署合同](rbac/M-1-RBAC-v1.0-SIGNED.md)：仍被源码引用。
- [路由字段迁移对照](db/route-field-migration-map.md)：历史对照参考，当前模型以 schema.prisma 为准。
- [PostgreSQL 基线对象](refactor/postgres-baseline.md)：仍被迁移 SQL 引用。
- [移植枚举参考](port/tencent-feature-port-backlog.md)：仅保留源码所引用的枚举来源，不作为当前任务清单。
- [澳门 IVD 注册法规指导](澳门IVD注册法规指导文件.md)：业务参考，不属于本次部署清理范围。

## 审阅与历史清理

- [本轮核对结果](maintenance/2026-10-09/REVIEW.md)。
- [清理及本地归档记录](maintenance/2026-10-09/cleanup-manifest.json)。
- [仍有价值的服务器补正证据](review/codebuddy/deepseek/README.md)。

旧审计、整改过程、封存、截图与发布记录已从当前工作树移除，保存在校验过的本地归档及既有 Git 历史。
删除旧文档不表示历次问题均已修复或部署已独立验收；尚需实际服务器记录支持的结论继续保留限制。
