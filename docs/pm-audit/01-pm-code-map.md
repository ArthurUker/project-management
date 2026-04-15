# PM Code Map — Project Management Module

Generated: 2026-04-15T02:25:34.560Z

This document maps code related to the "Project Management" feature found under rdpms-system/frontend/src. It lists pages, components, store, APIs, types and relationships, followed by a text-based flow and reusable assets. Each section ends with concise refactor/scope suggestions.

---

## 1. Page entry points (routes / views)

1. frontend/src/pages/Projects.tsx
- 职责: 项目管理主页面；提供三种视图（卡片/列表/看板）、筛选、批量操作与新建/编辑入口。
- 对外导出: default Projects (React.FC)
- 主要引用者: App.tsx route (frontend/src/App.tsx imports Projects)
- 引用了: ../components/ProjectCard, ../components/EditProjectModal, ../api/client.projectAPI, react-router navigate, local state
- 改造建议:
  1. 将布局与滚动职责抽象为小型布局 helper，以避免在页面中混入大量 inline style。
  2. 明确 contentRef 的滚动职责（文档已做多次尝试）；保留 API 调用点但将渲染逻辑拆小。
  3. 将 STATUS_OPTIONS/TYPE_OPTIONS 提取到 constants 文件以便复用。

2. frontend/src/pages/ProjectDetail.tsx
- 职责: 单个项目详情页，展示项目基本信息、成员、近期任务与阶段进度；包含看板视图切换。
- 对外导出: default ProjectDetail (React.FC)
- 主要引用者: App.tsx route (/projects/:id)
- 引用了: projectAPI.get, progressAPI.get, useAppStore, components: KanbanBoard, PhaseProgressBar
- 改造建议:
  1. 将 data-loading 与 rendering 解耦（hook: useProject(id)）。
  2. Kanban 容器高度计算不要使用固定 calc 值，切换为父 flex 填充策略。
  3. 把进度数据请求封装（progressAPI already exists）并添加 error handling wrapper。

3. frontend/src/pages/ProjectTemplates.tsx
- 职责: 项目模版管理/浏览（涉及创建项目模板的管理）。
- 对外导出: default ProjectTemplates
- 引用了: useAppStore (role check), api.projectTemplatesAPI 等
- 改造建议: 模板相关 API 与 CreateProjectModal 的模板选择逻辑可以共享。

(Other pages that touch projects indirectly: ReportEdit.tsx uses projects for report association.)

---

## 2. Components (frontend/src/components)

Listed are components that participate in project management rendering/interaction.

1. frontend/src/components/ProjectCard.tsx
- 职责: 渲染单个项目卡片（卡片视图）、提供点击/选择/编辑回调。
- 导出: default ProjectCard; also exports Project interface (export interface Project)
- 被谁引用: frontend/src/pages/Projects.tsx (card/grid & kanban), elsewhere where project previews are needed
- 引用了: none external beyond React; uses inline style and animation name 'fadeInUp' (note: global CSS contains fadeIn but not fadeInUp)
- 改造建议:
  1. 将 animation 与初始 opacity 逻辑修正（add @keyframes fadeInUp or set opacity:1 if animation omitted）。
  2. 把布局样式转为 Tailwind classes or a small CSS module to reduce inline style duplication.
  3. Consider splitting the card into smaller sub-elements (Header/Meta/Footer) for reuse.

2. frontend/src/components/KanbanBoard.tsx
- 职责: 提供按 projectId 的任务看板；渲染列 (KanbanColumn)、处理拖拽逻辑（@dnd-kit）和 column-level filtering。
- 导出: default KanbanBoard(props: { projectId?: string })
- 被谁引用: frontend/src/pages/ProjectDetail.tsx, frontend/src/pages/Tasks.tsx
- 引用了: useAppStore (tasks, projects), taskAPI.board / projectAPI.list (loads projects for dropdown), @dnd-kit modules, ProjectCard for card rendering inside columns
- 改造建议:
  1. 明确滚动职责：实现 KanbanViewport + KanbanTrack + KanbanColumn（每列独立滚动或如需统一由 contentRef 控制）。
  2. 抽象 DnD related logic into a small hook (useKanbanDrag) to simplify component.
  3. Ensure board doesn't use viewport-based heights like 100vh; rely on flex.

3. frontend/src/components/EditProjectModal.tsx
- 职责: 编辑项目的模态弹窗，负责加载候选负责人并提交更新。
- 导出: default EditProjectModal
- 被谁引用: frontend/src/pages/Projects.tsx (editing), potentially ProjectDetail or management pages
- 引用了: projectAPI.update, userAPI.list
- 改造建议:
  1. 对表单 validation 和 API error 做更细粒度的 UX 反馈（inline errors）。
  2. 提取 user-list loading 为 useUsers() hook 以便在多个表单重用。

4. frontend/src/components/CreateProjectModal.tsx
- 职责: 多步骤新建项目模态（step: 基本信息 / 模版选择），可应用 project template。
- 导出: default CreateProjectModal
- 被谁引用: invoked by Projects page New button (navigate /projects/new) — Projects page uses navigate; CreateProjectModal may be used in other contexts.
- 引用了: projectAPI.create, projectTemplatesAPI.apply, userAPI.list, useAppStore
- 改造建议:
  1. 把模板选择 UI 与 template-fetching logic 抽为组件 + hook (useProjectTemplates)
  2. Keep modal internals but reduce inline styles; centralize buttons.

5. frontend/src/components/PhaseProgressBar.tsx
- 职责: 渲染模版/项目阶段进度条（used in ProjectDetail）。
- 导出: default PhaseProgressBar
- 被谁引用: ProjectDetail
- 改造建议: small and reusable; keep as-is but ensure props typed.

6. frontend/src/components/Layout.tsx
- 职责: 全局主布局（包含 <main> 与 <Outlet/>），影响 page-level flex behavior.
- 导出: default Layout
- 被谁引用: App.tsx wraps routes
- 改造建议: ensure main uses flex-1 min-h-0 overflow-hidden so child pages can control scrolling.

7. Other related components used by the pages
- PhaseTaskPanel.tsx, FlowEditor.tsx, ProcessFlowDiagram.tsx — occasionally used by project detail or templates. Keep as utility components.

---

## 3. Hooks / composables

Search outcome: repository has no dedicated src/hooks folder or many reusable hooks. Main places providing shared behavior:

1. frontend/src/store/appStore.ts (Zustand store)
- 作用: centralized app state (user, token, projects, tasks, reports) + local Dexie DB + sync/login/logout functions.
- 导出: useAppStore (hook)
- 被谁引用: many pages/components: Projects.tsx (via its own projectAPI in many places, but other pages also call useAppStore — e.g., ProjectDetail.tsx, CreateProjectModal.tsx, KanbanBoard.tsx, TemplateLibrary.tsx, Layout.tsx)
- 改造建议:
  1. Move project-related domain actions to a small domain service file (e.g., src/store/projects.ts) exporting useProjectsStore or useProjectsActions to narrow responsibilities.
  2. Add typed selectors/helpers to avoid components reading the whole store.

2. No dedicated custom hooks found for project module (e.g., useProjects, useProject). Many pages implement local data fetching; creating the following hooks is recommended:
- useProjects (wraps projectAPI.list, caching, loading state)
- useProject (projectAPI.get + progress fetch)
- useUsers (userAPI.list cache)

改造建议:
1. Introduce useProjects and useProject hooks (keeps UI simpler and testable).
2. Migrate repeated logic (loading state, error handling) into these hooks.
3. Keep useAppStore for global cross-cutting state but limit direct API calls in store.

---

## 4. Store / models / types

1. frontend/src/store/appStore.ts
- 职责: application state holder (user, token, projects, tasks, reports), local persistence (persist + Dexie), sync logic.
- 导出: useAppStore (hook), db (Dexie)
- 对外暴露的 types: User, Project, Report, Task interfaces
- 被谁引用: nearly all pages and many components (Projects, ProjectDetail, KanbanBoard, CreateProjectModal, Layout, TemplateLibrary etc.)
- 改造建议:
  1. Split big store into domain slices (projects, tasks, reports) to reduce bundle size and coupling.
  2. Keep sync logic here but extract project-specific helpers to src/store/projects.ts for clearer boundaries.

---

## 5. API / services / request

Main API wrapper: frontend/src/api/client.ts
- 职责: axios wrapper, request/response interceptors (attach token, handle 401), typed API objects (projectAPI, taskAPI, projectTemplatesAPI, reportAPI, syncAPI, statsAPI, userAPI, etc.)
- 导出: default axios api; named exports: authAPI, userAPI, projectAPI, projectTemplatesAPI, taskAPI, progressAPI, syncAPI, statsAPI, reportAPI, etc.
- 被谁引用: pages & components use these APIs directly: Projects.tsx uses projectAPI.list, ProjectDetail uses projectAPI.get & progressAPI.get, Create/Edit modals use projectAPI/userAPI/projectTemplatesAPI, KanbanBoard uses taskAPI.board / projectAPI.
- 改造建议:
  1. Keep this centralized client; add a small typed wrapper for domain calls (e.g., projectsService.ts) that returns normalized data shapes.<br> 2. Add retry/backoff or graceful error wrapper for list endpoints used in UI.

---

## 6. Types / interfaces / constants

Primary types located in appStore and ProjectCard:

- frontend/src/store/appStore.ts
  - Exports: User, Project, Report, Task interfaces
  - Used across pages for typing local state
- frontend/src/components/ProjectCard.tsx
  - Exports: Project interface (slightly different fields; used by Projects.tsx import type { Project } from '../components/ProjectCard')
- inline constants in Projects.tsx (TYPE_OPTIONS, STATUS_OPTIONS, STATUS_CONFIG)

改造建议:
1. Consolidate the Project interface in a single file (e.g., frontend/src/types/project.ts) and make all modules import that canonical type.
2. Move STATUS_OPTIONS and TYPE_OPTIONS into frontend/src/constants/projects.ts for reuse across pages/components.
3. Ensure consistent shape between API responses and store types (normalization layer in project service).

---

## 7. Permissions / guard related code

No centralized ACL/guard implementation found. Permission checks are ad-hoc by checking user.role in components/pages:

- frontend/src/store/appStore.ts: User.role exists
- frontend/src/components/Layout.tsx: const isAdmin = user?.role === 'admin' — used to conditionally show admin menu
- frontend/src/pages/TemplateLibrary.tsx and ProjectTemplates.tsx: use role checks to conditionally render admin-only actions

改造建议:
1. Introduce a small permission helper (src/utils/permission.ts) that centralizes role checks (isAdmin, isManager, canEditProject(user, project)).
2. If fine-grained ACL needed, plan for a permissions matrix and middleware check in routing.
3. Replace inline role checks with usePermission hook for testability.

---

## 8. Tests (unit / e2e)

- No unit tests (.test or .spec) or e2e directories were found under frontend/src. The repo contains nodemon/package settings referencing test ignore, but no automated tests for PM module.

改造建议:
1. Add unit tests for projectAPI wrapper and Projects page hooks (useProjects) using vitest/react-testing-library.
2. Add one E2E test (Playwright/Cypress) for Projects flow: load list, open project, open edit modal, create project via template.
3. Start with smoke tests around ProjectCard visibility and Projects scrolling behaviors.

---

## 9. Call graph / reference summary (key relations)

- App.tsx → imports Layout → renders Routes
  - Route '/projects' → Projects (frontend/src/pages/Projects.tsx)
  - Route '/projects/:id' → ProjectDetail

- Projects.tsx
  - uses projectAPI.list() to fetch data
  - renders ProjectCard for each project
  - uses Create/Edit modals: EditProjectModal component
  - triggers projectAPI.batchDelete / batchUpdateStatus
  - KanbanColumn (inside Projects) renders ProjectCard; KanbanBoard is separate in ProjectDetail

- ProjectDetail.tsx
  - calls projectAPI.get(id) and progressAPI.get(id)
  - renders KanbanBoard (tasks), PhaseProgressBar

- KanbanBoard.tsx
  - reads tasks & projects via useAppStore and taskAPI.board / projectAPI.list
  - uses ProjectCard to display tasks/projects in columns (ProjectCard reused for project preview in board)

- CreateProjectModal.tsx / EditProjectModal.tsx
  - call projectAPI.create / projectAPI.update and projectTemplatesAPI.apply
  - use userAPI.list to populate manager dropdown

- useAppStore
  - central store used across pages/components for reading/writing projects/tasks/reports
  - uses syncAPI and authAPI for login/sync

---

## 10. Existing project management page textual flow

1. Route enter
   - User navigates to /projects (App route) → Layout renders page outlet → Projects mounted.
2. Data request
   - Projects useEffect → loadProjects() calls projectAPI.list() → result parsed (res.projects || res.list || res.flat || res.data || res)
   - Projects state set via setProjects (local useState), also some pages may rely on useAppStore for cached projects.
3. Render
   - Header (counts, view toggle) rendered
   - Combined sticky area (status pills, stats row, filter row) rendered and positioned sticky inside contentRef
   - Content rendering: if viewMode === 'card' → grid of ProjectCard components; list → table-like ListRow; kanban → columns
4. Interaction events
   - Filter inputs update local filter state → filteredProjects recomputed via useMemo → UI re-renders
   - Select / batch actions call projectAPI.batchDelete / batchUpdateStatus and then reload via loadProjects()
   - Single project edit opens EditProjectModal → onSaved triggers loadProjects() after API update
   - New project opens CreateProjectModal → on create navigate to project detail
5. Refresh / sync
   - Manual refresh triggers loadProjects(); store-level sync (useAppStore.sync) exists for global sync (e.g., after login) which populates local DB and useAppStore state

改造建议:
1. Replace ad-hoc data fetch in pages with useProjects() hook that returns {projects, loading, error, reload} and accepts cache/source preferences.
2. Centralize error handling & user notifications for API failures.
3. Keep UI-only filtering at page level, but move heavy data transforms into memoized selectors.

---

## 11. Reusable assets (candidates)

1. Components
- ProjectCard (frontend/src/components/ProjectCard.tsx) — reusable preview card for other lists/embeds.
- Edit/Create modals (frontend/src/components/EditProjectModal.tsx, CreateProjectModal.tsx) — form UIs that can be reused in other flows.
- PhaseProgressBar — reusable visualization component.
- KanbanBoard (with clear API) can be reused in ProjectDetail and Tasks pages.

2. Hooks (recommended to extract)
- useAppStore (already a hook) provides global state; consider extracting domain hooks:
  - useProjects (new)
  - useProject (new)
  - useUsers (new)

3. API wrappers
- projectAPI, projectTemplatesAPI, taskAPI, progressAPI (frontend/src/api/client.ts) — already centralized; recommend creating small service layer (frontend/src/services/projects.ts) to normalize responses.

4. Style tokens
- frontend/src/index.css : CSS vars at :root (e.g., --primary, --accent, --bg-dark, --text-primary) — reuse tokens
- Tailwind config in repo root (tailwind present) — promote usage of Tailwind tokens rather than inline colors.

改造 suggestions (max 3):
1. Create `src/hooks/useProjects.ts` and `src/services/projects.ts` to encapsulate API + state management.
2. Consolidate Project types into `src/types/project.ts` and constants into `src/constants/projects.ts`.
3. Convert inline color values to CSS variables or Tailwind classes referencing existing tokens in index.css.

---

## 12. Summary / Next steps

- The project management module is concentrated in:
  - Pages: frontend/src/pages/Projects.tsx, ProjectDetail.tsx, ProjectTemplates.tsx
  - Components: frontend/src/components/ProjectCard.tsx, KanbanBoard.tsx, CreateProjectModal.tsx, EditProjectModal.tsx
  - Store: frontend/src/store/appStore.ts
  - APIs: frontend/src/api/client.ts (projectAPI, taskAPI, projectTemplatesAPI etc.)

- Short-term actionable items (priority):
  1. Fix ProjectCard visibility (add missing keyframe or remove initial opacity) so cards render.
  2. Introduce useProjects / useProject hooks to centralize fetching/reload logic used by Projects & ProjectDetail.
  3. Consolidate Project type and options/constants for consistent typing across components.

- Longer-term:
  - Add tests for Projects page and projectAPI wrapper; add permission helper and unify scrolling/layout responsibilities in Layout and Projects.

---

If you want, next actions can be:
- I. Create useProjects and migrate Projects.tsx data fetch to it (I can implement and run tests/build). 
- II. Add missing CSS keyframes (fadeInUp) to make cards visible (quick fix).
- III. Extract STATUS_OPTIONS / TYPE_OPTIONS and Project type into central files.

Which of the above should be implemented next? (Reply with the choice number or "other" and describe.)
