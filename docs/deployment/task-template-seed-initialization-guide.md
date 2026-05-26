# 任务模板一键初始化指南（立项阶段 10 任务版）

## 1. 本次更新内容

已更新任务模板 seed 文件：
- `rdpms-system/backend/src/data/taskTemplateSeed.js`
- `rdpms-system/backend/src/data/seedTaskTemplatesOnly.js`

核心变更：
- `1.1 项目立项任务` 已升级为 **10 个标准任务**（覆盖：基本信息、业务价值、应用场景、样本边界、声称边界、技术可行性、资源评估、风险识别、立项评审、下一阶段计划）。
- 一键初始化脚本从“已存在则跳过”改为“已存在则更新”，即：
  - 新模板会创建
  - 已有同名模板会自动覆盖为最新 seed 配置（并重建 steps）

---

## 2. 服务器执行步骤（推荐）

在服务器项目目录执行：

```bash
cd C:/rdpms/backend
npm run seed:templates-only
```

如果你使用生产环境变量执行：

```bash
cd C:/rdpms/backend
npm run seed:templates-only:prod
```

执行完成后，你会看到类似日志：
- `Created: X new templates`
- `Updated: Y existing templates`
- `Total templates now: ...`

其中 `Updated` 大于 0 说明旧模板已经被新版 seed 成功覆盖。

---

## 3. 与部署脚本配合方式

建议顺序：

```bash
cd C:/rdpms
./deploy.ps1
cd C:/rdpms/backend
npm run seed:templates-only
```

说明：
- `deploy.ps1` 负责拉代码、安装依赖、迁移、重启服务。
- `seed:templates-only` 负责把任务模板库同步到最新版本（不影响项目、用户、报告等业务数据）。

---

## 4. 新版“项目立项任务”10项清单

1. 填写项目基本信息
2. 明确项目目标与业务价值
3. 确认应用场景与目标用户
4. 定义样本范围与检测对象
5. 确认产品声称与边界
6. 完成技术可行性初评
7. 完成资源与周期初评
8. 识别主要风险和外部依赖
9. 完成立项评审
10. 指定项目负责人并生成下一阶段计划

---

## 5. 常见问题

### Q1：为什么我重跑 seed 后看起来没变化？
请检查日志中的 `Updated` 数值。如果是 0，可能当前环境没有使用最新代码。

### Q2：重跑会不会影响已创建项目中的任务？
不会。该脚本只更新 **任务模板库（TaskTemplate / TaskTemplateStep）**，不会修改业务项目任务数据。

### Q3：如何确认“1.1 项目立项任务”已经是10项？
可在前端任务模板库中打开该模板，或在数据库查看对应模板 steps 数量是否为 10。
