# UI 规范与可落地性评估（v8 视觉方案）

生成时间: 2026-04-15T02:41:09.985Z
目标：评估将 v8 视觉设计方案落地到当前代码库的成本、风险与最小可交付范围。

---

## 一、设计令牌 / 主题变量（扫描结果）

现状（可复用 token）
- 全局 CSS 变量（已声明在 frontend/src/index.css）:
  - --primary: #0A84FF
  - --primary-hover: #0070e0
  - --accent: #FF9500
  - --success: #30D158
  - --warning: #FFD60A
  - --danger: #FF453A
  - --bg-dark: #1C1C1E
  - --bg-light: #F2F2F7
  - --text-primary: #1D1D1F
  - --text-secondary: #636366
  证据: frontend/src/index.css lines 9-20

- Tailwind 原语被广泛使用（@tailwind ... 在 index.css），并存在大量 `bg-primary-500`, `text-primary-600`, `bg-primary-50` 等类的使用点（例如 Layout.tsx, ProjectDetail.tsx, KanbanBoard.tsx 等）。证据：多个文件引用（grep 区域），示例：
  - frontend/src/pages/ProjectDetail.tsx lines ~41-47, ~80-85
  - frontend/src/components/Layout.tsx lines ~35-36, ~148-152
  - frontend/src/components/KanbanBoard.tsx many uses of primary classes

- 组件/样式定义（index.css）提供了基础组件类：.card, .btn, .btn-primary, .input 等（frontend/src/index.css lines 83-116）

- 但未发现项目内可直接读取的 tailwind.config.js 或集中 color scale 定义（repo 中未找到 tailwind.config.js）——风险：Tailwind 自定义色阶（primary-500 等）可能在构建外部定义或缺失。
  证据：未在仓库根路径找到 tailwind.config.js


## 二、可复用组件清单与主题支持情况

发现的常用组件（文件路径）及主题支持性（简评）：
- Card: .card + card patterns, used across pages. 文件/位置: frontend/src/index.css (.card) 和多处组件使用 <div className="card">（e.g., ProjectDetail, Projects）
  - 主题支持：部分（class 依赖 tailwind），但许多卡片额外使用 inline 样式（borderRadius、background、glass）使覆盖困难。证据: ProjectCard.tsx（大量 inline 背景/圆角/boxShadow/backdropFilter）

- Button: .btn, .btn-primary, .btn-secondary in index.css. 使用点：CreateProjectModal.tsx, TemplateLibrary.tsx 等。主题支持：好（类集中），但也存在 inline color override。证据: index.css lines 92-107

- Modal / Drawer: Modal 通过 Tailwind classes + fixed overlays in components (CreateProjectModal.tsx, EditProjectModal.tsx, KanbanTask modal). 主题支持：中等（结构统一但样式混杂）。

- Table: many pages use table markup + utility classes (Users.tsx). 主题支持：依赖 Tailwind；可定制。

- Tag/Badge: ad-hoc spans with Tailwind or inline styles (ProjectCard tags use inline color/border). Theme support: limited.

- FilterBar: Projects.tsx has custom filter bar built with inline styles and tailwind-like classes; themeable but mixed.

- Kanban / Card components: KanbanBoard.tsx & ProjectCard.tsx use many inline styles and status color maps (duplicate systems) — themeability poor.

总结：基本组件存在，但主题支持不一致。Tailwind 类与 index.css utilities 提供基础可覆盖面，但许多重视觉（玻璃效果、阴影、细粒度圆角、状态色）是通过 inline styles 或 component 常量实现，增加统一替换成本。


## 三、样式冲突与技术债风险（现状 / 问题 / 建议）

1) 全局样式覆盖与 !important
- 现状：存在多个 !important（尤其 React Flow 辅助样式 flow-edge.css 使用大量 !important），index.css 对 #root 和部分 layout 类使用 !important。证据：
  - frontend/src/styles/flow-edge.css lines 3-36（多处 !important）
  - frontend/src/index.css lines 41-44 ( #root background: transparent !important )
- 问题：大量 !important 会阻止主题覆盖，导致后续通过 CSS 变量或主题类无法覆盖 canvas/flow 的样式。
- 建议：逐步淘汰非必要 !important，优先改为更具体的选择器或使用 CSS custom properties 与 utility classes 覆盖。

2) Inline styles 与 JS-driven styles 泛滥
- 现状：ProjectCard.tsx、Projects.tsx、KanbanBoard.tsx、reagent-formula 页面等都使用大量 inline styles（包括 backdropFilter、boxShadow、borderRadius、background 颜色）。证据：ProjectCard.tsx lines ~84-113; Projects.tsx many inline style blocks (e.g., stats, filter bar)
- 问题：inline styles 无法由外部 CSS 变量或主题类覆盖，阻碍统一视觉替换。
- 建议：将视觉样式迁移至 CSS classes 或 CSS-in-JS theme tokens（优先将 color/shadow/radius 曝露为 CSS 变量，组件改为使用 var(--token)）。短期可通过 utility class 增量替换。

3) 状态色分散（重复定义）
- 现状：状态色在多个文件重复定义：Projects.tsx 使用 STATUS_CONFIG（colors），ProjectCard.tsx 使用 STATUS_COLORS。证据：
  - frontend/src/pages/Projects.tsx lines ~12-19 (STATUS_CONFIG)
  - frontend/src/components/ProjectCard.tsx lines ~32-40 (STATUS_COLORS)
- 问题：状态色同步困难，容易出现不一致的状态视觉。
- 建议：抽离状态色到单一 source-of-truth（例如 frontend/src/styles/tokens/status-colors.css 或 frontend/src/constants/statusColors.ts），并在 CSS 变量与组件常量中均引用该源。

4) Tailwind 自定义色阶可能未集中（或在外部）
- 现状：大量使用 bg-primary-500 / primary-600 等，但仓库中未找到 tailwind.config.js。若配置不在仓库或由 CI 注入，迁移和复用会受限。证据：未找到 tailwind.config.js；但 index.css @apply 使用 bg-primary-500
- 建议：将 Tailwind 配置（colors.primary.*）纳入仓库，或改为基于 CSS variables 的自定义 color-utility（例如 .bg-primary { background: var(--primary); } 作为 fallback）。


## 四、v8 视觉方案落地建议（具体与可执行）

总体原则：将颜色/半透明玻璃/阴影/圆角等视觉属性抽象为 design tokens（CSS variables），并逐步替换 inline styles 与分散常量，分三阶段落地。

阶段 0 — 先行工程（1 周可完成的最小改造范围，Medium）
- 创建 tokens 文件： frontend/src/styles/design-tokens.css，声明语义变量：
  --color-primary-500, --color-primary-600, --color-primary-50
  --color-success, --color-warning, --color-danger
  --surface-card, --surface-modal, --surface-backdrop
  --text-primary, --text-secondary
  --radius-sm, --radius-md, --radius-lg
  --shadow-1, --shadow-2
  --spacing-xxs .. --spacing-xl
  --z-header, --z-modal, --z-tooltip
  证据定位：index.css 有基础 variables，可扩展（frontend/src/index.css lines 9-20)
- 把 index.css 中 :root 变量迁移/扩展到 design-tokens.css，并在 index.css import 新文件
- 将 .card, .btn-primary 等引用 CSS variables（改写 btn-primary background: var(--color-primary-500) 等）
- 替换最关键的三处内联依赖（ProjectCard 背景/边框/boxShadow；Layout aside 背景; CreateProjectModal / EditProjectModal 的主容器样式）让主视觉与 tokens 相连。

阶段 1 — 主题统一（后续 2~3 周）
- 抽离状态色为 single source: frontend/src/constants/statusColors.ts + CSS var mapping.
- 将 Projects.tsx 和 ProjectCard.tsx 的 STATUS_* 配置统一引用该常量
- 将大部分 Tailwind custom color classes（bg-primary-500 等）映射到 CSS variables via tailwind.config.js or utility CSS classes.

阶段 2 — 深度清理（长期）
- 逐步替换内联样式为 className，并重构复杂组件的样式实现（Kanban columns、Cards、FilterBar）
- 移除/重写大量 !important（flow-edge.css 特例：保留必要交互样式但尝试范围缩小）
- 提供暗色主题切换（通过 body[data-theme='dark'] 或 .theme-dark class 切换 tokens）


## 五、状态色与卡片/标签策略（建议）

1) 状态色（单一源）
- 建议创建 status-colors.ts（或 status-colors.css）导出所有状态的颜色 token，例如：
  --status-planning: #9ca3af; --status-planning-bg: rgba(...)
  --status-active: #3b82f6; --status-active-bg: rgba(...)
  --status-processing: #f59e0b; ...
- 组件使用 semantic token names（而非直接 hex）：background: var(--status-<key>-bg); color: var(--status-<key>);

2) 卡片左边线 / 标签颜色策略
- 对于卡片左侧色条（用于快速识别状态）：使用 var(--status-<key>-accent) 作为 4px 左边线。
- 标签/Badge：使用 token --status-<key>-bg / --status-<key>-text / border: var(--status-<key>-border)

3) 玻璃效果保留
- 将玻璃 effect 做为 token：
  --glass-backdrop: backdrop-filter: blur(40px) saturate(200%); --glass-bg: rgba(255,255,255,0.4)
- 组件引用时使用 utility class .glass { background: var(--glass-bg); backdrop-filter: var(--glass-backdrop); }


## 六、推荐新增 Design Tokens（命名建议）

- Colors
  --color-primary-50 / --color-primary-100 / --color-primary-200 / --color-primary-500 / --color-primary-600
  --color-success / --color-warning / --color-danger
  --color-surface-card / --color-surface-modal / --color-surface-backdrop
  --color-text-primary / --color-text-secondary / --color-muted

- Radius
  --radius-0 / --radius-sm / --radius-md / --radius-lg / --radius-pill

- Shadow
  --shadow-1 / --shadow-2 / --shadow-3

- Spacing
  --space-1 / --space-2 / --space-3 / --space-4 / --space-6

- Z-index
  --z-header / --z-sidebar / --z-modal / --z-tooltip

- Glass tokens
  --glass-bg / --glass-backdrop / --glass-accent


## 七、落地工作量评估

- 完整 v8 视觉方案（覆盖所有内联样式、统一状态色、替换重复 token、移除大量 !important）: Large (L) — 4~8 周，视团队规模和后端支持情况

- 1 周内可完成的最小改造（目标：让后续迁移可控并立刻收益）：Medium (M)
  - 任务清单（1 周可交付）：
    1. 创建 design-tokens.css 并扩展 index.css 的 :root（把现有变量迁入并补全）
    2. 替换 .btn-primary / .card / .input 等基础 class 的核心颜色/圆角/阴影为 tokens（frontend/src/index.css 修改）
    3. 把 ProjectCard 最关键的视觉属性（background/glass/borderRadius/boxShadow）改为使用 tokens（只更改样式来源，不变改业务逻辑）
    4. 抽取状态色常量文件 status-colors.ts 并在 Projects.tsx 与 ProjectCard.tsx 中做一次替换（保持行为不变）
  - 交付价值：立即可调整主题变量改变整体视觉；减少后续大规模改动阻力；使状态色同步更容易。


## 八、结论摘要（5 条要点）

1. 当前已有基础 tokens（index.css :root），但 tokens 覆盖面有限且 Tailwind 自定义 color 未在仓库中集中，存在不确定性。证据: frontend/src/index.css lines 9-20，未找到 tailwind.config.js
2. 可复用组件存在（card/button/modal/table），但大量 inline 样式与分散的状态色常量会显著增加 v8 迁移成本。证据: ProjectCard.tsx inline styles; Projects.tsx STATUS_CONFIG vs ProjectCard STATUS_COLORS
3. 风险点：大量 !important（flow-edge.css）和 inline 样式导致主题覆盖困难。证据: frontend/src/styles/flow-edge.css 和多处 inline backdropFilter
4. 建议优先建立 design-tokens.css 与 status-colors 单一路径，并在 1 周内完成基础 token 接入与 3 个关键组件的 token 化（Medium）。
5. 完整替换与统一（移除内联、重写复杂组件）为大规模工程（Large）。

---

需要我现在开始：
- (A) 创建 design-tokens.css 并把 index.css 的 :root 迁移到该文件（自动替换 .btn/.card 使用 tokens），或
- (B) 先抽取 status-colors 常量并替换 Projects.tsx / ProjectCard.tsx 的重复定义，作为低风险先行项。

请选择 A 或 B 或都不做。