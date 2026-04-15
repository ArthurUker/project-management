# PM API & Data Model Map

Generated: 2026-04-15T02:31:57.203Z

Scope: all REST API endpoints and their usage in the frontend related to the "Project Management" module (projects, project templates, tasks/board, project members, progress). Source of truth: frontend/src/api/client.ts and calling code under frontend/src/pages and frontend/src/components.

---

## 1. API endpoints (surface list)

Note: methods & URL taken from frontend/src/api/client.ts. For each endpoint: method, URL, request params, inferred response fields, and where used in UI.

A. projectAPI

1) projectAPI.list(params?)
- Method / URL: GET /projects
- Request params: any filter/pagination object; code uses { page, pageSize, status, type, managerId, keyword } in callers (inferred).
- Response: ApiResponse containing either .projects or .list or .flat or .data or raw array. Each item is a Project DTO (see model below).
- Response fields (per item, inferred): id, code, name, type, subtype, status, position, managerId, manager (object), members (array), memberCount, taskCount, taskDoneCount, startDate, endDate, createdAt, updatedAt, tags, templateId, template, tasks, milestones
- UI usage (callers):
  - frontend/src/pages/Projects.tsx (loadProjects -> list)
  - frontend/src/components/KanbanBoard.tsx (project list for dropdown)
  - frontend/src/pages/ReportEdit.tsx (projects for association)
  - frontend/src/pages/Dashboard.tsx (summary tiles)
- Source lines: frontend/src/api/client.ts (projectAPI.list) and callers listed above.

2) projectAPI.get(id)
- Method / URL: GET /projects/:id
- Request params: none beyond path id
- Response: ApiResponse or Project object (detailed), may include tasks, members, template, progress etc.
- UI usage: frontend/src/pages/ProjectDetail.tsx (loadProject uses projectAPI.get)
- Inferred response fields used: id, name, code, type, subtype, status, position, manager, members, tasks, templateId, template, startDate, endDate, createdAt, updatedAt
- Source: frontend/src/api/client.ts

3) projectAPI.create(data)
- Method / URL: POST /projects
- Request body fields used in callers: name, type, subtype, position, managerId, startDate (ISO), endDate (ISO), tasks, milestones, templateId (optional)
- Response: created Project object (with id). Caller expects newProject.id
- UI usage: frontend/src/components/CreateProjectModal.tsx

4) projectAPI.update(id, data)
- Method / URL: PUT /projects/:id
- Request body (EditProjectModal): name, type, subtype, status, position, managerId, startDate (nullable or ISO), endDate
- Response: updated Project
- UI usage: frontend/src/components/EditProjectModal.tsx

5) projectAPI.delete(id)
- Method / URL: DELETE /projects/:id
- Request: id path
- Response: success flag
- UI usage: invoked indirectly in batch delete or individual delete flows; frontend/src/pages/Projects.tsx uses projectAPI.batchDelete; single delete used elsewhere (not prominent)

6) projectAPI.batchDelete(ids)
- Method / URL: POST /projects/batch-delete
- Request body: { ids: string[] }
- Response: success
- UI usage: frontend/src/pages/Projects.tsx handleBatchDelete

7) projectAPI.batchUpdateStatus(ids, status)
- Method / URL: POST /projects/batch-update-status
- Request body: { ids: string[], status: string }
- Response: success
- UI usage: frontend/src/pages/Projects.tsx handleBatchStatus

8) projectAPI.members(id)
- Method / URL: GET /projects/:id/members
- Request params: none
- Response: list of member objects (id, userId, role, user {id,name,position})
- UI usage: possibly in ProjectDetail or member management; client exposes endpoint but it is not widely used in current code (search shows existence in client.ts)

9) projectAPI.addMember(id, userId, role?)
- Method / URL: POST /projects/:id/members
- Request body: { userId, role }
- Response: member object
- UI usage: not found in pages (available for future use)

10) projectAPI.removeMember(id, userId)
- Method / URL: DELETE /projects/:id/members/:userId
- UI usage: not directly found

11) projectAPI.applyTemplate(id, data)
- Method / URL: POST /projects/:id/apply-template
- Request body: { templateId?, startDate? }
- Response: payload used to apply a template to a project — not heavily used (client exposes method but CreateProjectModal uses projectTemplatesAPI.apply instead)

B. projectTemplatesAPI

1) projectTemplatesAPI.list(params?)
- Method / URL: GET /project-templates
- Request params: page, pageSize, status, category, keyword
- Response: ApiResponse with list of templates (id, name, category, description, phaseCount, taskCount, isMaster, content, etc.)
- UI usage: frontend/src/components/CreateProjectModal.tsx, frontend/src/pages/TemplateLibrary.tsx

2) projectTemplatesAPI.get(id)
- Method / URL: GET /project-templates/:id
- Response: template object (detailed content)
- Usage: TemplateEditor.tsx

3) projectTemplatesAPI.apply(id, data)
- Method / URL: POST /project-templates/:id/apply
- Request body: { startDate? }
- Response: typically returns apply payload containing tasks[] and milestones[] to be used for creating new project with template
- UI usage: CreateProjectModal.tsx uses apply to fetch tasks/milestones before creating project

C. taskAPI (relevant endpoints)

1) taskAPI.list(params?) — GET /tasks
- Usage: various pages not exhaustively covered

2) taskAPI.board(projectId)
- Method / URL: GET /tasks/board/:projectId
- Response: board structure (statuses -> tasks) used by KanbanBoard
- UI usage: KanbanBoard.tsx may use taskAPI.board or use tasks from store; client exposes endpoint

D. progressAPI

1) progressAPI.get(projectId, months?)
- Method / URL: GET /progress/project/:projectId?months=N
- Response: list of monthly progress objects: { id, month, completion, actualWork, nextPlan, ... }
- UI usage: frontend/src/pages/ProjectDetail.tsx (loadProject uses progressAPI.get)

E. userAPI

1) userAPI.list(params?) — GET /users
- Used by EditProjectModal.tsx and CreateProjectModal.tsx to populate manager dropdown

F. authAPI / syncAPI / statsAPI
- authAPI.verify/login used elsewhere (not central to project model)
- syncAPI.init used by useAppStore.sync to populate projects from backend
- statsAPI.projects used in dashboard for counts

---

## 2. Project entity — gathered field set

Combined from API responses, store types, and UI usage across files. This is the union of all fields observed or referenced.

Project DTO fields (union):
- id: string  — primary identifier. (UI used: everywhere)
- code: string — project code/short id (UI used: Projects, ProjectCard, Dashboard)
- name: string — project display name (UI used)
- type: string — project type ("platform", "定制", "合作", "测试", "应用") (UI used)
- subtype: string | null — optional sub-type (UI used)
- status: string — current status (UI used; enums listed later)
- position: string | null — project positioning/description (UI used in ProjectDetail and Edit modal)
- managerId: string | null — id of manager (used in forms)
- manager: { id: string; name: string; position?: string } | null — manager object (used in UI display)
- members: array of { id, userId, role, user?: { id,name,position } } — membership list (used in ProjectDetail)
- memberCount: number | null — cached count (used in UI in bak files)
- taskCount: number | null — number of tasks (used in Progress display, ProjectCard)
- taskDoneCount: number | null — completed tasks (used to calculate progress)
- tasks: array — optional detailed tasks list included in project detail or template apply
- milestones: array — optional milestones list
- templateId: string | null — applied template reference
- template: object | null — embedded template object (used in ProjectDetail to render PhaseProgressBar)
- tags: string[] | null — tags (used in ProjectCard)
- startDate: string | null — ISO date string in many callers; UI uses new Date(startDate) and slicing to YYYY-MM-DD in edit form
- endDate: string | null — same as above
- createdAt: string | null — created timestamp (UI not heavily used)
- updatedAt: string | null — updated timestamp (used in ProjectCard timeAgo)
- extra: any — other fields may exist depending on API

Source references:
- types in frontend/src/store/appStore.ts (Project interface)
- ProjectCard.tsx and Projects.tsx usage


### Status enum (values observed)

STATUS_OPTIONS (source: frontend/src/pages/Projects.tsx):
- '规划中' (Planning)  — label: 规划中
- '进行中' (In progress)
- '待加工' (Awaiting processing)
- '待验证' (Awaiting verification)
- '已完成' (Completed)
- '已归档' (Archived)

These values are used directly as strings across UI and API usage.

---

## 3. Field usage checklist (where used in UI)

(We mark YES if used in UI code found by grep)

- id — UI usage: YES (Projects, ProjectDetail, navigation links)
- name — YES (display everywhere)
- code — YES (display in cards/list)
- type — YES (display & filter)
- subtype — YES
- status — YES (filter, display, status pills)
- position — YES (ProjectDetail, Edit modal)
- managerId — YES (Edit modal form value)
- manager.name — YES (display)
- members — YES (ProjectDetail members list used)
- memberCount — sometimes (bak files) — PARTIAL
- taskCount/taskDoneCount — YES (used to compute progress in cards & list)
- tasks — YES (when projectDetail includes tasks or templates apply)
- milestones — YES (templates apply, CreateProjectModal)
- templateId/template — YES (ProjectDetail PhaseProgressBar)
- tags — YES (ProjectCard shows tags)
- startDate/endDate — YES (Edit modal, ProjectCard timeAgo)
- createdAt/updatedAt — updatedAt used in timeAgo in ProjectCard

Source files: Projects.tsx, ProjectCard.tsx, EditProjectModal.tsx, CreateProjectModal.tsx, ProjectDetail.tsx, KanbanBoard.tsx, CreateProjectModal.tsx

---

## 4. Inconsistencies & observations (collection from code search)

1) Response shape normalization
- Pages attempt to normalize responses by checking multiple keys: res.projects ?? res.list ?? res.flat ?? res.data ?? res
- Impact: backend responses are inconsistent; frontend code must cope. (Observed in Projects.tsx, TemplateEditor.tsx, CreateProjectModal.tsx)

2) Project type definitions are duplicated and slightly different
- frontend/src/store/appStore.ts defines Project interface fields (id, code, name, type, subtype, status, managerId, manager, startDate, updatedAt)
- frontend/src/components/ProjectCard.tsx also exports Project interface with slightly different optional fields (memberCount, taskCount, tags). Duplication risk.

3) Date/time formats
- UI expects startDate/endDate/createdAt/updatedAt as ISO strings and converts via new Date(...), sometimes uses String(...).slice(0,10) in Edit modal.
- There is no consistent timezone handling; backend may return timestamps or ISO strings; code tolerates string/null but not numeric timestamps explicitly.

4) Pagination parameter naming
- Frontend uses page and pageSize in various callers. API wrapper accepts params but server may expect other names (uncertain). No consistent current/limit naming found.

5) Field names overlap / synonyms
- Some pages reference project.code and project.id interchangeably for short labels; no 'title' or 'projectName' found but check for synonyms in other modules. Reports refer to report.project?.name.

6) API applyTemplate vs projectTemplates.apply
- CreateProjectModal uses projectTemplatesAPI.apply to fetch tasks/milestones, while projectAPI has applyTemplate — duplication potential.

7) Member representation inconsistent
- project.members vs project.memberCount vs members endpoint shape uncertain; UI reads project.members in ProjectDetail and also uses userAPI.list for selecting manager.

8) Task counts and progress
- Some code expects taskCount/taskDoneCount on project object (ProjectCard.tsx.bak); ensure server provides these or compute on client.

9) Response wrapping and status code handling
- api.client.ts interceptors return response.data; but some server endpoints wrap data deeper into .data or .payload; frontend checks a variety of keys. This ambiguity leads to duplicated normalization code scattered across pages.

---

## 5. Field mapping table (DTO -> View usage)

Columns: DTO field | Type (inferred) | UI used (Y/N) | Files that read it | Notes / mapping

id | string | Y | Projects.tsx, ProjectDetail.tsx, ProjectCard.tsx, Dashboard.tsx | primary key, navigation
code | string | Y | Projects.tsx, ProjectCard.tsx, Dashboard.tsx | short identifier
name | string | Y | Projects.tsx, ProjectCard.tsx, ProjectDetail.tsx | display
type | string | Y | Projects.tsx filters, Create/Edit modals | enumerated values
subtype | string? | Y | Projects.tsx, ProjectCard.tsx | optional
status | string | Y | Projects.tsx, ProjectCard.tsx, ProjectDetail.tsx | values: see STATUS_OPTIONS
position | string? | Y | ProjectDetail.tsx, EditProjectModal.tsx | project description
managerId | string? | Y | EditProjectModal.tsx, CreateProjectModal.tsx | used as select value
manager | object? ({id,name,position}) | Y | ProjectCard.tsx, ProjectDetail.tsx | display manager.name
members | array? | Y | ProjectDetail.tsx | member list
memberCount | number? | P | Used in some bak files | cached count; may be absent
taskCount | number? | Y | ProjectCard.tsx.bak, Projects.tsx progress calc | may come from server or computed
taskDoneCount | number? | Y | ProjectCard.tsx.bak | used to compute progress
tasks | array? | Y | ProjectDetail.tsx, CreateProjectModal.tsx apply payload | task list included in template apply or get detail
milestones | array? | Y | CreateProjectModal.tsx, ProjectDetail | template apply
templateId | string? | Y | ProjectDetail.tsx | reference to applied template
template | object? | Y | ProjectDetail.tsx | used by PhaseProgressBar
tags | string[]? | Y | ProjectCard.tsx | optional tags
startDate | string? (ISO) | Y | EditProjectModal.tsx, ProjectCard.tsx | formatting: slice(0,10) or new Date(...)
endDate | string? (ISO) | Y | EditProjectModal.tsx, ProjectCard.tsx | same
createdAt | string? | P | less used | timestamps
updatedAt | string? | Y | ProjectCard.tsx timeAgo | used for relative time

(P = partial or only in some code paths)

---

## 6. Frontend ViewModel suggestion

Provide a canonical ProjectViewModel TypeScript interface and mapping rules from DTOs.

Suggested ProjectViewModel (frontend/src/types/viewModels.ts)

```ts
export interface ProjectViewModel {
  id: string;
  code: string;
  name: string;
  type: string;
  subtype?: string | null;
  status: '规划中' | '进行中' | '待加工' | '待验证' | '已完成' | '已归档' | string;
  position?: string | null;
  managerId?: string | null;
  managerName?: string | null; // flatten manager.name for easy binding
  memberCount: number; // computed if absent
  taskCount: number; // computed if absent
  taskDoneCount: number; // computed if absent
  startDate?: string | null; // ISO date
  endDate?: string | null;   // ISO date
  createdAt?: string | null;
  updatedAt?: string | null;
  tags?: string[];
  templateId?: string | null;
  template?: any;
  raw?: any; // keep original DTO for advanced cases
}
```

Mapping rules (DTO -> ViewModel):
- id, code, name, type, subtype, status, position, templateId, template, tags, createdAt, updatedAt: map directly from DTO if present.
- managerName: map from dto.manager?.name || lookup from users store if only managerId is present.
- managerId: copy from dto.managerId if present.
- memberCount: if dto.memberCount present use it; else if dto.members is array use dto.members.length; else 0.
- taskCount: if dto.taskCount present use it; else if dto.tasks is array use dto.tasks.length; else 0.
- taskDoneCount: if dto.taskDoneCount present use it; else if dto.tasks is array count tasks with status === '已完成'; else 0.
- startDate/endDate: normalize to ISO string (new Date(value).toISOString() if numeric timestamp; if empty/null keep null). Store always as ISO string or null.
- updatedAt/createdAt: normalize similarly.
- raw: store the original DTO for fields not mapped.

Example mapper function (pseudo):

```ts
function mapProjectDto(dto: any): ProjectViewModel {
  const tasks = Array.isArray(dto.tasks) ? dto.tasks : [];
  const members = Array.isArray(dto.members) ? dto.members : [];
  return {
    id: String(dto.id),
    code: dto.code ?? '',
    name: dto.name ?? '',
    type: dto.type ?? '',
    subtype: dto.subtype ?? null,
    status: dto.status ?? '规划中',
    position: dto.position ?? null,
    managerId: dto.managerId ?? dto.manager?.id ?? null,
    managerName: dto.manager?.name ?? null,
    memberCount: typeof dto.memberCount === 'number' ? dto.memberCount : members.length,
    taskCount: typeof dto.taskCount === 'number' ? dto.taskCount : tasks.length,
    taskDoneCount: typeof dto.taskDoneCount === 'number' ? dto.taskDoneCount : tasks.filter((t:any) => t.status === '已完成').length,
    startDate: normalizeDate(dto.startDate),
    endDate: normalizeDate(dto.endDate),
    createdAt: normalizeDate(dto.createdAt),
    updatedAt: normalizeDate(dto.updatedAt),
    tags: Array.isArray(dto.tags) ? dto.tags : [],
    templateId: dto.templateId ?? null,
    template: dto.template ?? null,
    raw: dto,
  };
}

function normalizeDate(v:any) { if (!v) return null; if (typeof v === 'number') return new Date(v).toISOString(); if (typeof v === 'string') return new Date(v).toISOString(); return null; }
```


---

## 7. Consistency checks and problems (>=8 items) with suggested fixes

1) Problem: API responses inconsistent in wrapper keys (sometimes projects/list/flat/data)
- Evidence: Projects.tsx checks res.projects ?? res.list ?? res.flat ?? res.data ?? res
- Risk: duplication and fragile parsing across pages
- Fix: agree on a single envelope (e.g., { data: { list: [...] }, meta: {...} }) or add a small normalizeApiResponse helper in frontend/src/api/normalize.ts and use it across pages.

2) Problem: Duplicate Project type definitions across appStore.ts and ProjectCard.tsx (and possibly other files)
- Risk: type drift, mismatches
- Fix: extract a canonical frontend type file (frontend/src/types/project.ts) and import everywhere.

3) Problem: Date/time format ambiguity (string vs timestamp)
- Evidence: code sometimes does String(...).slice(0,10) and sometimes new Date(...)
- Fix: normalize to ISO strings in mapping layer (mapProjectDto) and always store ISO in ViewModel.

4) Problem: Pagination param naming not standardized (page / pageSize used; some servers expect pageNo/pageSize/current)
- Fix: define and document a query param contract, and implement a small helper buildListParams({page, pageSize, sort}) to normalize.

5) Problem: member / manager representation inconsistent (managerId + manager object sometimes absent)
- Fix: ViewModel should expose managerId and managerName; mapping layer fills managerName from manager object or user store lookup.

6) Problem: task counts may be absent from DTOs
- Fix: compute taskCount/taskDoneCount on client when tasks array present; otherwise rely on server and document the expected server fields.

7) Problem: projectTemplates.apply returns payload in unpredictable field (applyRes.payload) cause different usages
- Fix: standardize apply API to return { data: { tasks, milestones } } and align clients to use normalizeApiResponse.

8) Problem: status values are free strings; no enforced enum or numeric code
- Fix: define status enum in frontend/src/constants/projects.ts and map server values to enum. Also add i18n mapping only in UI layer.

9) Problem: inconsistent usage of IDs vs codes in UI for short labels
- Fix: pick one (code for display, id for links) and ensure both are present in DTO; update any components using id for display to use code.

10) Problem: member endpoints vs project.members usage
- Fix: standardize member DTO shape, and if members are not included in project details, require /projects/:id/members to be called consistently by component or by store.

---

## 8. Recommended incremental actions (prioritized)

1. Add a small normalization layer in frontend/src/api/normalize.ts that converts ApiResponse to { list?: any[], item?: any, meta?: any } and use it in project/service hooks.
2. Create frontend/src/types/project.ts and migrate existing duplicated interfaces to import from that file.
3. Implement ProjectViewModel and mapProjectDto in frontend/src/services/projects.ts. Replace ad-hoc normalization in Projects.tsx with useProjects hook that returns view models.
4. Add one integration test asserting projectAPI.list returns list and mapping is correct given common server shapes.
5. Define and document status enum constants and a mapping table for display labels.

---

## 9. Appendices — references to code locations

- API definitions: frontend/src/api/client.ts (projectAPI, projectTemplatesAPI, taskAPI, progressAPI)
- Projects page (list/get/create/update usage): frontend/src/pages/Projects.tsx
- ProjectDetail: frontend/src/pages/ProjectDetail.tsx (uses projectAPI.get, progressAPI.get)
- CreateProjectModal: frontend/src/components/CreateProjectModal.tsx (projectTemplatesAPI.apply, projectAPI.create)
- EditProjectModal: frontend/src/components/EditProjectModal.tsx (projectAPI.update, userAPI.list)
- KanbanBoard: frontend/src/components/KanbanBoard.tsx (projectAPI.list usage for dropdown)
- Store types: frontend/src/store/appStore.ts (Project interface)

---

If you want, next step can be: implement `frontend/src/services/projects.ts` containing normalizeApiResponse, mapProjectDto, and a `useProjects` hook; I can create the files and migrate Projects.tsx to use them in a follow-up PR. Which should I implement next? (choices: add normalization + ViewModel mapper / add status enum / implement useProjects hook)
