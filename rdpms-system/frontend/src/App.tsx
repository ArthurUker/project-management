import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAppStore } from './store/appStore';
import Layout from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Projects from './pages/Projects';
import ProjectDetail from './pages/ProjectDetail';
import Reports from './pages/Reports';
import ReportEdit from './pages/ReportEdit';
import Tasks from './pages/Tasks';
import Users from './pages/Users';
import Settings from './pages/Settings';
import Docs from './pages/Docs';
import FormulaList from './pages/reagent-formula/index';
import FormulaEditor from './pages/reagent-formula/FormulaEditor';
import PrepCalculator from './pages/reagent-formula/PrepCalculator';
import TemplateLibrary from './pages/TemplateLibrary';
import TemplateEditor from './pages/TemplateEditor';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user } = useAppStore();
  
  if (!user) {
    return <Navigate to="/login" replace />;
  }
  
  return <>{children}</>;
}

function App() {
  const { init, isOnline } = useAppStore();
  
  useEffect(() => {
    init();
  }, []);
  
  return (
    <BrowserRouter
      future={{
        v7_startTransition: true,
        v7_relativeSplatPath: true,
      }}
    >
      {/* 离线提示 */}
      {!isOnline && (
        <div className="fixed top-0 left-0 right-0 bg-warning-500 text-black px-4 py-2 text-center text-sm z-50">
          当前处于离线模式，部分功能可能受限
        </div>
      )}
      
      <Routes>
        <Route path="/login" element={<Login />} />
        
        <Route path="/" element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }>
          <Route index element={<Dashboard />} />
          <Route path="projects" element={<Projects />} />
          <Route path="projects/new" element={<Projects />} />
          <Route path="projects/:id" element={<ProjectDetail />} />
          <Route path="project-templates" element={<TemplateLibrary />} />
          <Route path="project-templates/:id/edit" element={<TemplateEditor />} />
          <Route path="reports" element={<Reports />} />
          <Route path="reports/:id" element={<ReportEdit />} />
          <Route path="knowledge" element={<Docs />} />
          <Route path="docs" element={<Docs />} />
          <Route path="reagent-formula" element={<FormulaList />} />
          <Route path="reagent-formula/new" element={<FormulaEditor />} />
          <Route path="reagent-formula/:id/edit" element={<FormulaEditor />} />
          <Route path="reagent-formula/calculator" element={<PrepCalculator />} />
          <Route path="tasks" element={<Tasks />} />
          <Route path="users" element={<Users />} />
          <Route path="settings" element={<Settings />} />
        </Route>
        
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;