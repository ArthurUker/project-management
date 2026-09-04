import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './auth/AuthProvider';
import { AuthGuard } from './routes/AuthGuard';
import { RoleGuard } from './routes/RoleGuard';
import { PERMS } from './auth/permissions';

import Layout from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Projects from './pages/Projects';
import ProjectDetail from './pages/ProjectDetail';
import Reports from './pages/Reports';
import ReportEdit from './pages/ReportEdit';
import ReportReview from './pages/ReportReview';
import Tasks from './pages/Tasks';
import Users from './pages/Users';
import Settings from './pages/Settings';
import Docs from './pages/Docs';
import KnowledgeDetail from './pages/KnowledgeDetail';
import FormulaList from './pages/reagent-formula/index';
import FormulaEditor from './pages/reagent-formula/FormulaEditor';
import PrepCalculator from './pages/reagent-formula/PrepCalculator';
import TemplateLibrary from './pages/TemplateLibrary';
import TemplateEditor from './pages/TemplateEditor';
import TaskTemplateLibrary from './pages/knowledge/TaskTemplateLibrary';
import RegistrationProjects from './pages/RegistrationProjects';
import RegistrationProjectDetail from './pages/RegistrationProjectDetail';
import Forbidden from './pages/Forbidden';
import NotFound from './pages/NotFound';
import ChangePassword from './pages/ChangePassword';
import AuditLogs from './pages/AuditLogs';
import SystemLogs from './pages/SystemLogs';
import Roles from './pages/Roles';

/**
 * 路由表
 *
 * 约定：
 *   - /login 公开；其余全部受 AuthGuard 保护（默认拒绝，不逐个页面加守卫）
 *   - 需要权限的页面在路由层用 RoleGuard 声明，无权限 → /403（不跳登录）
 *   - 备份恢复入口已下线（应用层 restore 已移除，备份改由运维 pg_dump 负责）
 */
function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />

      <Route
        element={
          <AuthGuard>
            <Layout />
          </AuthGuard>
        }
      >
        <Route index element={<Dashboard />} />

        <Route path="projects" element={<Projects />} />
        <Route path="projects/new" element={<Projects />} />
        <Route path="projects/:id" element={<ProjectDetail />} />

        <Route
          path="registrations"
          element={
            <RoleGuard perm={PERMS.REGISTRATIONS_VIEW}>
              <RegistrationProjects />
            </RoleGuard>
          }
        />
        <Route
          path="registrations/:id"
          element={
            <RoleGuard perm={PERMS.REGISTRATIONS_VIEW}>
              <RegistrationProjectDetail />
            </RoleGuard>
          }
        />

        {/* 旧链接兼容：法规文档已并入知识库模块 */}
        <Route
          path="regulatory-documents"
          element={<Navigate to="/knowledge?module=regulatory" replace />}
        />

        <Route path="project-templates" element={<TemplateLibrary />} />
        <Route path="project-templates/:id/edit" element={<TemplateEditor />} />
        <Route path="task-templates" element={<TaskTemplateLibrary />} />

        <Route
          path="reports"
          element={
            <RoleGuard perm={PERMS.REPORTS_VIEW}>
              <Reports />
            </RoleGuard>
          }
        />
        <Route path="reports/:id" element={<ReportEdit />} />
        <Route path="reports/:id/review" element={<ReportReview />} />

        <Route path="knowledge" element={<Docs />} />
        <Route path="knowledge/:id" element={<KnowledgeDetail />} />
        <Route path="docs" element={<Docs />} />

        <Route path="reagent-formula" element={<FormulaList />} />
        <Route path="reagent-formula/new" element={<FormulaEditor />} />
        <Route path="reagent-formula/:id/edit" element={<FormulaEditor />} />
        <Route path="reagent-formula/calculator" element={<PrepCalculator />} />

        <Route path="tasks" element={<Tasks />} />

        <Route
          path="users"
          element={
            <RoleGuard perm={PERMS.USERS_VIEW}>
              <Users />
            </RoleGuard>
          }
        />

        <Route
          path="audit-logs"
          element={
            <RoleGuard perm={PERMS.AUDIT_VIEW}>
              <AuditLogs />
            </RoleGuard>
          }
        />

        <Route
          path="system-logs"
          element={
            <RoleGuard perm={PERMS.SYSTEM_LOGS_VIEW}>
              <SystemLogs />
            </RoleGuard>
          }
        />

        <Route
          path="roles"
          element={
            <RoleGuard perm={PERMS.ROLES_VIEW}>
              <Roles />
            </RoleGuard>
          }
        />

        <Route
          path="settings"
          element={
            <RoleGuard perm={PERMS.SETTINGS_VIEW}>
              <Settings />
            </RoleGuard>
          }
        />

        <Route path="change-password" element={<ChangePassword />} />
        <Route path="403" element={<Forbidden />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter
      future={{
        v7_startTransition: true,
        v7_relativeSplatPath: true,
      }}
    >
      {/* AuthProvider 必须在 Router 内：跳转由它统一发起 */}
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}
