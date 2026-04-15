# Source Index — Project Management Audit

Generated: 2026-04-15T02:50:05.331Z

Top 30 files most relevant to the Project Management module (sorted by importance). For each file: path, short key snippet (≤20 lines), and one-line reason why it matters.

1) frontend/src/pages/Projects.tsx
- Snippet:
  import React, { useEffect, useState, useMemo, useCallback, useRef } from 'react';
  import { useNavigate } from 'react-router-dom';
  import ProjectCard from '../components/ProjectCard';
  import type { Project } from '../components/ProjectCard';
  import EditProjectModal from '../components/EditProjectModal';
  import { projectAPI } from '../api/client';
  const STATUS_OPTIONS = ['规划中', '进行中', '待加工', '待验证', '已完成', '已归档'];
  const loadProjects = useCallback(async () => { const res = await projectAPI.list(); const data = res.projects ?? res.list ?? res.flat ?? res.data ?? res; setProjects(Array.isArray(data) ? data : []); }, []);
- Why important: The central Projects page controlling view modes, filters, scrolling behavior, and bulk operations.

2) frontend/src/components/ProjectCard.tsx
- Snippet:
  export interface Project { id: string; name: string; code: string; type?: string; subtype?: string; status?: string; ... }
  const STATUS_COLORS: Record<string, { color: string; bg: string; dot: string; border: string }> = { '规划中': {...}, '进行中': {...}, ... };
  return (<div style={{ background: 'rgba(235,242,255,0.40)', backdropFilter: 'blur(40px) ...', animation: 'fadeInUp 0.3s ease forwards', opacity: 0 }}>
- Why important: Renders each project card; visual/animation issues here caused invisible cards and glass styling concerns.

3) frontend/src/components/KanbanBoard.tsx
- Snippet:
  import { useState, useRef, useEffect } from 'react';
  import { useAppStore } from '../store/appStore';
  import { taskAPI, projectAPI } from '../api/client';
  // defines columns: ['待开始','进行中','已完成','已阻塞']
  const handleDrop = async (e, newStatus) => { const task = dragItem.current; await saveTaskLocal(updatedTask); await taskAPI.updateStatus(task.id, newStatus); };
- Why important: Implements kanban rendering, drag/drop and task state updates (affects scroll policy and task status flows).

4) frontend/src/components/EditProjectModal.tsx
- Snippet:
  const STATUS_OPTIONS  = ['规划中', '进行中', '待加工', '待验证', '已完成', '已归档'];
  const handleSubmit = async (e) => { const payload = { name: form.name, status: form.status || undefined, ... }; await projectAPI.update(project.id, payload); }
- Why important: UI for changing project fields including status — direct state transition trigger.

5) frontend/src/api/client.ts
- Snippet:
  const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';
  api.interceptors.request.use((config) => { const token = localStorage.getItem('rdpms_token'); if (token) (config.headers as any).Authorization = `Bearer ${token}`; return config; });
  export const projectAPI = { list: (params) => get('/projects', { params }), update: (id,data) => put(`/projects/${id}`, data), batchUpdateStatus: (ids,status) => post('/projects/batch-update-status',{ids,status}), ... }
- Why important: Central API wrapper — where backend contract and auth handling occur.

6) frontend/src/store/appStore.ts
- Snippet:
  export interface Project { id: string; code: string; name: string; type: string; status: string; managerId: string; ... }
  export const useAppStore = create<AppState>()(persist((set,get) => ({ user: null, token: null, projects: [], sync: async () => { const res = await syncAPI.init(lastSync); ... }, login: async (username,password) => { const res = await authAPI.login(username,password); set({ token, user }); await get().sync(); } })))
- Why important: Global state (user, projects, tasks) and persistence logic used by many components.

7) frontend/src/pages/ProjectDetail.tsx
- Snippet:
  const loadProject = async () => { const [projectData, progressData] = await Promise.all([projectAPI.get(id), progressAPI.get(id, 6)]); setProject(proj); setProgress(...); }
  <button className="btn btn-secondary">编辑</button>
- Why important: Project detail view; shows actions allowed and uses project API and progress data.

8) frontend/src/index.css
- Snippet:
  :root { --primary: #0A84FF; --primary-hover: #0070e0; --accent: #FF9500; --success: #30D158; --warning: #FFD60A; --danger: #FF453A; }
  .card { @apply bg-white rounded-lg shadow-sm border border-gray-100; }
  .btn-primary { @apply bg-primary-500 text-white hover:bg-primary-600; }
- Why important: Global tokens, base component classes and scrollbar/animation rules used across the app.

9) frontend/src/components/Layout.tsx
- Snippet:
  export default function Layout() { const { user, logout } = useAppStore(); const isAdmin = user?.role === 'admin'; return (<aside className="w-64">...</aside><main className="flex-1 overflow-hidden flex flex-col"><div className="p-6 flex-1 min-h-0 overflow-hidden flex flex-col"><Outlet/></div></main>); }
- Why important: App shell and main layout — main/outlet flex behavior affects page scroll patterns.

10) frontend/src/components/CreateProjectModal.tsx
- Snippet:
  <form onSubmit={handleSubmit}> ... await projectAPI.create({...}); </form>
- Why important: Project creation flow used in Projects page and templates.

11) frontend/src/components/PhaseProgressBar.tsx
- Snippet:
  const currentIdx = phases.findIndex(p => p.status === 'in_progress'); const completedCount = phases.filter(p => p.status === 'completed').length;
- Why important: Visualizes template/phase progress; references project.template and tasks arrays.

12) frontend/src/components/PhaseTaskPanel.tsx
- Snippet:
  export default function PhaseTaskPanel({ tasks }) { return (<div>{tasks.map(t => <div key={t.id}>{t.title}</div>)}</div>); }
- Why important: Displays tasks inside template phases; used by ProjectDetail and templates.

13) frontend/src/components/DocReference.tsx
- Snippet:
  <input placeholder="搜索 SOP、模板、指南..." />
- Why important: Reusable doc lookup used by task modals and phasetask components.

14) frontend/src/components/ProjectCard.tsx (already listed) — duplicate reference kept because it is critical for visual bug

15) frontend/src/components/KanbanBoard.tsx (already listed) — critical for kanban scroll behavior

16) frontend/src/pages/TemplateLibrary.tsx
- Snippet:
  const { user } = useAppStore(); if (user?.role !== 'admin') return (<div>仅管理员可创建模版</div>);
- Why important: Template management with admin-only actions; shows role-based UI gating.

17) frontend/src/pages/ProjectTemplates.tsx
- Snippet:
  {user?.role === 'admin' && (<button onClick={handleCreate}>新建模版</button>)}
- Why important: Template CRUD used by CreateProject flow.

18) frontend/src/pages/Users.tsx
- Snippet:
  const { user: currentUser } = useAppStore(); if (currentUser?.role !== 'admin') return (<div>您没有权限访问此页面</div>);
- Why important: User/role management and source of role strings used for RBAC.

19) frontend/src/components/PhaseProgressBar.tsx (duplicate noted)

20) frontend/src/components/FlowEditor.tsx
- Snippet:
  /* React Flow editor wrapper and node/edge handlers */
- Why important: Complex flow editor with custom styles (flow-edge.css) that use !important and can conflict with global theme.

21) frontend/src/styles/flow-edge.css
- Snippet:
  .react-flow__edge-interaction { stroke-width: 20 !important; stroke: transparent !important; }
  .react-flow__edge.selected .react-flow__edge-path { stroke: #3b82f6 !important; stroke-width: 2 !important; }
- Why important: Contains forced styles with !important; high risk for theme overrides.

22) frontend/src/components/ProcessFlowDiagram.tsx
- Snippet:
  /* Helper to render process diagrams; uses react-flow classes */
- Why important: Visual process diagrams referenced by templates/flows.

23) frontend/src/pages/Dashboard.tsx
- Snippet:
  statsAPI.projects used to render status tiles and links to /projects
- Why important: Shows aggregated counts and entry points into Projects module.

24) frontend/src/api/* (general) — client.ts listed earlier — repeated because many api endpoints exist

25) frontend/src/components/PhaseTaskPanel.tsx (already listed)

26) frontend/src/pages/Reports.tsx
- Snippet:
  reportAPI.list usage; displays reports and report status
- Why important: Reports reference projects and project IDs — integration surface.

27) frontend/src/pages/TemplateEditor.tsx
- Snippet:
  /* Editor for templates used by CreateProjectModal */
- Why important: Template structure shapes how projects and phases are created.

28) frontend/src/components/Task related files (Kanban task modal embedded in KanbanBoard.tsx)
- Snippet:
  taskAPI.updateStatus invoked by KanbanBoard on drop
- Why important: Task status updates and API contract impact status machine design.

29) frontend/src/store/* (db: dexie RDPDatabase) appStore.ts listed already — included for datastore and sync logic

30) frontend/src/pages/reagent-formula/index.tsx
- Snippet:
  uses sticky headers with backdropFilter and inline top positioning; shows pattern of glass header usage across app
- Why important: Example of sticky/header glass implementations (relevant to Projects header/sticky behavior)


---

Notes
- The list prioritizes pages/components that directly control project listing, creation, editing, status, and the kanban/task flows.
- Several files (ProjectCard, Projects, KanbanBoard, EditProjectModal, appStore, api/client, index.css, flow-edge.css) should be inspected first for any visual/behavioral changes.


