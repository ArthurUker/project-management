# PM Module — Pre-refactor Audit Overview

## 一、技术栈识别

- 前端框架：React 18
  - 证据文件路径：frontend/package.json (dependencies.react)

- TypeScript：^5.3.x
  - 证据文件路径：frontend/package.json (devDependencies.typescript), frontend/tsconfig.app.json

- 构建工具：Vite
  - 证据文件路径：frontend/package.json (scripts.dev = "vite"), frontend/vite.config.ts

- 包管理器：npm (package.json present; no yarn.lock / pnpm-lock detected)
  - 证据文件路径：frontend/package.json

- 状态管理：zustand
  - 证据文件路径：frontend/package.json (dependencies.zustand), frontend/src/store/appStore.ts

- 路由方案：react-router-dom v6
  - 证据文件路径：frontend/package.json (dependencies.react-router-dom), frontend/src/App.tsx (路由配置, file listed)

- UI / 样式：TailwindCSS + 自定义 CSS
  - 证据文件路径：frontend/package.json (devDependencies.tailwindcss), frontend/src/index.css

- 请求库：axios（封装在 client）
  - 证据文件路径：frontend/package.json (dependencies.axios), frontend/src/api (client.ts)

- 拖拽 / 看板：@dnd-kit
  - 证据文件路径：frontend/package.json (dependencies.@dnd-kit/*), frontend/src/components/KanbanBoard.tsx

- 其它 UI 辅助库：@radix-ui, lucide-react, @xyflow/react
  - 证据文件路径：frontend/package.json


## 二、src 目录结构（2~3 层，标注与“项目管理”相关的文件）

frontend/src/
├─ App.tsx  (入口路由)  — evidence: frontend/src/App.tsx
├─ main.tsx (若存在) — evidence: frontend/src/main.tsx
├─ index.css — evidence: frontend/src/index.css
├─ App.css — evidence: frontend/src/App.css
├─ api/
│  └─ client.ts (axios 实例) — evidence: frontend/src/api/client.ts
├─ assets/
├─ components/
│  ├─ Layout.tsx  — 主布局（影响页面整体高度/scroll）
│  ├─ KanbanBoard.tsx  — 看板组件（状态列/横向滚动）
│  ├─ ProjectCard.tsx  ← 关键（卡片渲染/动画/玻璃效果）
│  ├─ CreateProjectModal.tsx
│  ├─ EditProjectModal.tsx
│  └─ ...
│  (evidence: frontend/src/components/)
├─ pages/
│  ├─ Projects.tsx  ← 关键（当前改造目标页面，包含 contentRef、滚动逻辑）
│  ├─ ProjectDetail.tsx
│  ├─ ProjectTemplates.tsx
│  └─ ...
│  (evidence: frontend/src/pages/)
├─ store/
│  └─ appStore.ts (zustand 状态管理) — evidence: frontend/src/store/appStore.ts
└─ styles/

说明：与“项目管理”强相关的文件/目录：
- frontend/src/pages/Projects.tsx (主页面，滚动/视图切换/kanban/card/list)
- frontend/src/components/ProjectCard.tsx (项目卡片内容与样式)
- frontend/src/components/KanbanBoard.tsx (看板布局、列渲染)
- frontend/src/components/Layout.tsx (整体 main/outlet 布局)

(证据路径已在每项后标注)


## 三、运行与构建命令

- 启动开发：npm run dev  
  - 证据：frontend/package.json (scripts.dev)

- 打包构建：npm run build  (会执行 tsc -b && vite build)
  - 证据：frontend/package.json (scripts.build)

- 预览：npm run preview
  - 证据：frontend/package.json (scripts.preview)

- TypeScript config & 构建：tsconfig.app.json (被 tsc -b 使用)
  - 证据：frontend/tsconfig.app.json

- Node 版本要求：未在仓库中找到 .nvmrc 或 engines 字段 → 无显式 Node 版本限制
  - 证据：仓库根及 frontend 未发现 .nvmrc / package.json.engines


## 四、重点文件快照（证据引用）

- package.json: frontend/package.json
- vite.config.ts: frontend/vite.config.ts
- tsconfig: frontend/tsconfig.app.json
- 全局样式: frontend/src/index.css
- 页面：frontend/src/pages/Projects.tsx
- 卡片组件：frontend/src/components/ProjectCard.tsx
- 看板：frontend/src/components/KanbanBoard.tsx
- 布局：frontend/src/components/Layout.tsx

（完整路径在上方“目录结构”节中列出）


## 五、改造风险初判（5~10 条）

1. 布局冲突：页面混用 JS 动态 height (例如 calc(100vh - x)) 与 flex 布局会导致滚动职责不明确。
   - 风险等级：高
   - 证据文件路径：frontend/src/pages/Projects.tsx (存在对 contentRef 的动态 maxHeight 操作，历史改动中出现过)

2. 动画/可见性问题：组件内使用的自定义动画 keyframes 缺失或命名不一致会导致元素初始不可见（opacity:0）。
   - 风险等级：高
   - 证据文件路径：frontend/src/components/ProjectCard.tsx (使用 animation: 'fadeInUp' 且 opacity:0)， frontend/src/index.css (仅存在 @keyframes fadeIn，但无 fadeInUp)

3. 数据依赖/运行时缺失：前端显示依赖后端 /api 验证和数据接口，后端不可用时页面为空或调试困难。
   - 风险等级：中高
   - 证据文件路径：浏览器日志（console）与 frontend/src/api/client.ts; 先前监测到 POST /api/auth/verify ERR_CONNECTION_REFUSED

4. 看板滚动职责分散：如果 KanbanColumn 同时对列内设置 overflowY:auto 且外层 contentRef 也可纵向滚动，会产生滚动冲突和 UX 问题。
   - 风险等级：中
   - 证据文件路径：frontend/src/components/KanbanBoard.tsx, frontend/src/pages/Projects.tsx

5. 状态与样式耦合：颜色、glass 样式与布局耦合在组件内联样式中，改动样式容易影响布局/可见性，且难以全局统一管理。
   - 风险等级：中
   - 证据文件路径：frontend/src/components/ProjectCard.tsx (大量 inline style/backdropFilter)

6. 无 i18n 约束：文本硬编码和状态字符串散落（如状态名），改造时需要统一命名与映射以避免 regressions。
   - 风险等级：低中
   - 证据文件路径：frontend/src/components/ProjectCard.tsx (状态文字直接使用)

7. 浏览器兼容性（backdrop-filter）：iOS / Safari 与不同浏览器对 backdropFilter 支持差异，可能引发视觉差异或性能瓶颈。
   - 风险等级：中
   - 证据文件路径：frontend/src/components/ProjectCard.tsx (backdropFilter/WebkitBackdropFilter usage)

8. 缺少集中样式/动画库：目前动画/keyframes 分散或缺失，重构时需决定保留全局动画集或组件内单独管理。
   - 风险等级：中
   - 证据文件路径：frontend/src/index.css, frontend/src/components/ProjectCard.tsx

9. 测试覆盖不足：未见自动化 E2E 或视觉回归测试，视觉改造风险较高。
   - 风险等级：中
   - 证据文件路径：仓库未发现 tests 或 cypress/ 目录

10. 第三方库升级风险：依赖多（@dnd-kit, @xyflow/react, radix UI 等），改造看板/拖拽逻辑时需小心 API/行为变化。
   - 风险等级：中
   - 证据文件路径：frontend/package.json


## 六、优先级建议及短期修复清单

短期（立即）
- 修复 ProjectCard 动画/可见性：在 global css 中添加缺失 keyframes（fadeInUp）或将卡片初始 opacity 设置为 1。
  - 证据路径：frontend/src/components/ProjectCard.tsx, frontend/src/index.css

- 统一页面滚动职责：把根与 Outlet/main 设为 flex 列布局（flex:1, minHeight:0, overflow:hidden），并只允许 contentRef（项目区）承担纵向滚动；移除 JS calc 高度调整。
  - 证据路径：frontend/src/pages/Projects.tsx, frontend/src/components/Layout.tsx

中期（1-2 周）
- 将大量 inline 布局样式迁移到 Tailwind class 或模块化 CSS，减少 inline 引起的维护成本和冲突。
  - 证据路径：frontend/src/components/ProjectCard.tsx

- 针对看板实现明确层级：KanbanViewport（横向滚动）→ KanbanTrack（width:max-content）→ KanbanColumn（height:100%, 列内独立 overflowY）
  - 证据路径：frontend/src/components/KanbanBoard.tsx, frontend/src/pages/Projects.tsx

长期（风险缓解）
- 添加视觉回归或 E2E 测试来覆盖关键布局（card/list/kanban 三视图）。
- 规范状态常量与国际化准备（提取字符串）


## 七、结论摘要（10 行内）

- 项目使用 React 18 + TypeScript + Vite + Tailwind，状态由 zustand 管理，网络请求使用 axios。 (evidence: frontend/package.json)
- 当前首要问题为 ProjectCard 的动画/opacity 导致卡片不可见；其次为页面滚动职责混乱（JS 高度计算与 flex 冲突）。(evidence: frontend/src/components/ProjectCard.tsx, frontend/src/index.css, frontend/src/pages/Projects.tsx)
- 立即修复：添加/修正 missing keyframes 或移除初始 opacity:0；统一根/Outlet/contentRef 的 flex 结构，contentRef 作为唯一竖向滚动容器。
- 看板模式需明确横向/纵向滚动职责（建议 KanbanViewport + KanbanTrack + 列内滚动）。
- 避免在短期内大规模变动视觉效果，优先修复可见性和滚动逻辑，再做样式重构。


---

Audit generated by: Frontend PM Audit Assistant
Date: automated

