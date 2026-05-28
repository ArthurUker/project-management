# 节点信息编辑器设计规格验收清单

**文档版本：** v1.0  
**最后更新：** 2026-05-28  
**当前 commit：** enh/phase-info-struct 83ea02b  

---

## 一、概述

本文档用于验证 `TemplateEditor.tsx` 中"节点信息" Tab 的实现是否符合用户设计规格。

---

## 二、页面结构验收

### 2.1 弹窗顶部
- [x] 标题："编辑阶段"
- [x] 关闭按钮（×）
- [x] 4 个 Tab：节点信息、节点流转、节点事件、节点任务
- [x] 当前 Tab 有下划线标记

### 2.2 两栏布局
- [x] 左侧：正式编辑表单（~60% 宽度）
- [x] 右侧：模板建议区（340px 固定）
- [x] 代码位置：`grid-cols-[minmax(0,1fr)_340px] gap-6 p-8`
- [x] 右侧内容滚动，左侧不滚动

### 2.3 底部操作区
- [x] "取消"按钮
- [x] "保存阶段"按钮

---

## 三、左侧表单验收

### 卡片 1：基础信息

#### 3.1.1 节点名称
- [x] 字段类型：单行输入框
- [x] 必填：是
- [x] 更新方式：`onChange` → `updatePhase(id, { name })`
- [x] 代码行：~L1903

#### 3.1.2 节点类型
- [x] 字段类型：分段选择器（3 个按钮：普通、里程碑、审批）
- [x] 项目立项推荐值：审批
- [x] 建议提示文案：在标签右侧显示"项目立项建议选择"审批""
- [x] 代码行：~L1918-L1926

#### 3.1.3 节点目标
- [x] 字段类型：多行文本（rows=3）
- [x] 必填：建议必填
- [x] 提示文案：右侧"说明该阶段要达成什么"
- [x] 更新方式：`updateCurrentPhaseInfo({ goal })`
- [x] 代码行：~L1930-L1945

#### 3.1.4 节点说明
- [x] 字段类型：多行文本（rows=5）
- [x] 必填：建议必填
- [x] 提示文案：右侧"说明工作范围、输入、输出和管理要求"
- [x] 更新方式：`updateCurrentPhaseInfo({ description })`
- [x] 代码行：~L1950-L1970

### 卡片 2：适用项目类型

- [x] 字段类型：多选标签
- [x] 选项列表：从 `PHASE_PROJECT_TYPE_OPTIONS` 常量
- [x] 项目立项默认勾选的 7 项（从 `buildRecommendedPhaseInfo()` 返回）
- [x] 更新方式：toggle 选中状态
- [x] 代码行：~L1975-L2000
- [x] 推荐值检查：
  - [x] 非医疗分子检测产品
  - [x] 食品安全检测项目
  - [x] 水产病原检测项目
  - [x] 中药材鉴定项目
  - [x] 客户定制芯片项目
  - [x] 合作开发项目
  - [x] 准注册级试剂项目

### 卡片 3：完成规则

#### 3.3.1 阶段完成标准
- [x] 字段类型：多行文本（rows=8）
- [x] 必填：建议必填
- [x] 格式：自动处理行号（strip /^\d+\.\s*/ prefix）
- [x] 项目立项推荐：8 条标准（含第 8 条"已明确下一阶段负责人、任务和交付物"）
- [x] 代码行：~L2005-L2025

#### 3.3.2 节点完成提示
- [x] 字段类型：多行文本（rows=5）
- [x] 必填：否
- [x] 用途：作为"完成节点"时的二次确认弹窗文案（不是配置说明）
- [x] "预览完成确认弹窗"按钮：在标签右侧
- [x] 预览弹窗格式：`是否确认完成「节点名」阶段？\n\n{completionTip}`
- [x] 项目立项推荐内容：含 4 条 checklist
- [x] 代码行：~L2030-L2055

### 卡片 4：节点控制

- [x] 允许跳过节点
  - [x] 推荐值：关闭
  - [x] 说明：项目立项是强制关卡
  - [x] 代码位置：~L2065 `allowSkip` key

- [x] 展示估分排期填写入口
  - [x] 推荐值：开启
  - [x] 说明：立项需要初步评估资源、周期和排期
  - [x] 代码位置：~L2065 `showProgress` key

- [x] 节点需填写实际工时
  - [x] 推荐值：关闭
  - [x] 说明：立项主要是评审和决策，不作为工时重点
  - [x] 代码位置：~L2065 `requireActualHours` key

- [x] UI 格式：每项为 1 个卡片（label + desc + toggle 开关）

---

## 四、右侧建议区验收

### 模块 1：推荐模板（蓝色卡片）

- [x] 背景色：blue-50 + blue-200 边框
- [x] 标题：{节点名} 模板
- [x] 说明文案：显示"建议内容只是辅助..."和"只有点击应用时才写入"
- [x] 模板说明：显示"适用于 XXX 项目"（从 projectTypes 生成）
- [x] 按钮 1："应用模板"
  - [x] 蓝色背景，点击显示确认弹窗
  - [x] 代码行：~L2100 `setShowApplyConfirm(true)`
- [x] 按钮 2："预览完成提示"
  - [x] 淡色背景，toggle `showCompletionPreview`
  - [x] 代码行：~L2108
- [x] 代码位置：~L2090-L2125

### 模块 2：字段建议（白色卡片 × 3）

#### 4.2.1 节点目标建议
- [x] 卡片标题："节点目标建议"
- [x] 内容：来自 `buildRecommendedPhaseInfo().goal`
- [x] "复制"按钮：复制到剪贴板
- [x] "填入字段"按钮：`updateCurrentPhaseInfo({ goal: ... })`
- [x] 代码位置：~L2145-L2170

#### 4.2.2 阶段完成标准建议
- [x] 卡片标题："阶段完成标准建议"
- [x] 内容：来自 `buildRecommendedPhaseInfo().exitCriteria`，格式化为行号列表
- [x] "复制"按钮
- [x] "填入字段"按钮
- [x] 代码位置：~L2175-L2200

#### 4.2.3 节点完成提示建议
- [x] 卡片标题："节点完成提示建议"
- [x] 内容：来自 `COMPLETION_TIP_SHORT` 常量
- [x] "复制"按钮
- [x] "填入字段"按钮
- [x] 代码位置：~L2205-L2230

### 模块 3：常见遗漏项（黄色卡片）

- [x] 背景色：amber-50 + amber-200 边框
- [x] 标题：{节点名}阶段常见遗漏项
- [x] 列表项数：8 项
- [x] 是否动态：当前硬编码（可改进为按阶段类型动态）
- [x] 代码位置：~L2235-L2250

---

## 五、交互行为验收

### 5.1 应用模板流程

- [x] 用户点击"应用模板"
- [x] 弹出确认弹窗
- [x] 弹窗内容：
  - [x] 标题："是否应用「{节点名}模板」？"
  - [x] 提示文案："应用后将自动填入..."（列出所有字段）
  - [x] 警告：""已有内容将被覆盖。"
  - [x] 可选："仅填入空字段，不覆盖已有内容"复选框（规格有提到但代码未实现）
- [x] 确认后调用：`handleApplyPhaseInfoTemplate()`（已实现，同时写入 completionTip）
- [x] 代码位置：~L2415-L2454

### 5.2 Copy 按钮

- [x] 只出现在右侧建议卡片（不在左侧表单字段旁）
- [x] 功能：复制相应内容到剪贴板
- [x] 位置：每个建议卡片的标题右侧

### 5.3 填入字段

- [x] 功能：仅填充该字段，不覆盖其他字段
- [x] "追加到字段"按钮：规格有提到，代码未实现（可选，当前仅支持"填入"）

### 5.4 预览完成确认弹窗

- [x] 点击"预览完成确认弹窗"按钮
- [x] 显示实际弹窗格式
- [x] 格式：`是否确认完成「{节点名}」阶段？\n\n{completionTip}`
- [x] 代码位置：~L2000-2010

---

## 六、数据模型验收

### 6.1 Phase 接口关键字段

- [x] `phaseInfo` 对象结构：
  - [x] `goal: string`
  - [x] `description: string`
  - [x] `projectTypes: string[]`
  - [x] `exitCriteria: string[]`
  - [x] `goNoGoRule: string`
- [x] `completionTip: string` - 节点完成提示
- [x] `allowSkip: boolean`
- [x] `showProgress: boolean`
- [x] `requireActualHours: boolean`

### 6.2 buildRecommendedPhaseInfo() 返回值

- [x] goal（项目立项推荐值）
- [x] description（两段落：阶段说明 + 输出产物）
- [x] projectTypes（7 项默认选中）
- [x] exitCriteria（8 项完成标准）
- [x] goNoGoRule（Go/No-Go 判定条件）

---

## 七、TypeScript 错误检查

- [x] `splitByLine` 函数删除（已清除）
- [x] `buildCompletionTipFromPhaseInfo` 函数删除（已清除）
- [x] `handleApplyPhaseInfoToCompletionTip` 函数删除（已清除）
- [x] `copiedSuggestionKey` state 删除（已清除）
- [x] `replaceWithRecommendedEvents` → `replaceWithTemplates`（已修复）
- [x] `sub: any` 类型标注（已修复）
- [x] 最终编译结果：**0 errors**

---

## 八、已知限制和改进建议

| 项目 | 当前状态 | 建议 |
|---|---|---|
| "仅填入空字段"选项 | ❌ 未实现 | 可在后续迭代中补充 |
| "追加到字段"按钮 | ❌ 未实现 | 规格中有但相对低优先级 |
| 常见遗漏项动态化 | ❌ 硬编码 | 可按阶段类型/项目类型动态 |
| 节点类型建议 | ✓ 手工输入 | 当前已有提示文案 |

---

## 九、最后确认清单

在部署前，请用户：

1. [ ] 启动 dev server 且无错误
2. [ ] 登录系统进入项目模板编辑页
3. [ ] 打开任一模板，进入"节点信息" Tab
4. [ ] 逐一检查以下项：
   - [ ] 左侧 4 张卡片布局清晰
   - [ ] 右侧 3 个建议模块显示正常
   - [ ] 点击"应用模板"显示确认弹窗
   - [ ] 点击"填入字段"能正确填充左侧表单
   - [ ] Copy 按钮能正常复制内容
   - [ ] "预览完成确认弹窗"显示正确格式
   - [ ] 所有开关切换正常
5. [ ] 如发现差异，截图并反馈具体位置和差异内容

---

## 十、文件变更记录

- **TemplateEditor.tsx**：
  - 删除 `splitByLine`、`buildCompletionTipFromPhaseInfo`、`handleApplyPhaseInfoToCompletionTip`
  - 删除 `copiedSuggestionKey` state
  - 修复 `replaceWithRecommendedEvents` → `replaceWithTemplates`
  - 修复 `sub: any` 类型标注
  - 更新 `buildRecommendedPhaseInfo` 匹配规格
  - 添加 `COMPLETION_TIP_TEMPLATE`、`COMPLETION_TIP_SHORT` 常量
  - 修复"填入字段"按钮使用 `COMPLETION_TIP_SHORT`
  - 更新 `handleApplyPhaseInfoTemplate` 同时写入 `completionTip`

- **vite.config.ts**：
  - 修复代理地址从 `127.0.0.1:3000` → `[::1]:3000`（IPv6 兼容）

---

## 附录：验收签字

| 角色 | 日期 | 备注 |
|---|---|---|
| 开发 | 2026-05-28 | 代码实现完成 |
| 测试 | - | 待验收 |
| 产品 | - | 待确认 |
