# 静态口径限定：SUPER_ADMIN的单项目例外

执行会话CLOSE-04已纠正“全部阶段入口统一resolve/404”的主要错误；本文件补充其摘要中“非成员404”的角色限定，作为独立审阅可引用口径，不修改冻结交付。

当前 `projectAccess.js:26` 先拒绝不存在/软删项目，对SUPER_ADMIN同样适用。

当前 `projectAccess.js:35-43` 在项目存在且未软删时，SUPER_ADMIN即使不是成员也返回完整capabilities及elevated标记；`phases.js:36-38`随后记录elevated审计并断言read能力。

当前 `projectAccess.js:46-47` 的非成员404适用于非SUPER_ADMIN。准确描述为：

> 项目不存在或软删时404；非SUPER_ADMIN且无有效成员资格时404；SUPER_ADMIN访问活跃的非成员项目有既定elevated路径，仍需入口系统权限并按现有代码审计。

无projectId全局列表仍按manager/活跃成员范围过滤，SUPER_ADMIN不附加该过滤；当前过滤不含project.deletedAt。此事实不批准阶段过滤或其他政策。

层次：STATIC_SOURCE_REVIEW；动态阶段API/UI NOT_RUN；政策CONTRACT_UNRESOLVED。该限定可随下一次元数据订正引用，无需单独开阶段修复包。
