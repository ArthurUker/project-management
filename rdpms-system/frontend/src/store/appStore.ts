import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import Dexie from 'dexie';
import { syncAPI, authAPI } from '../api/client';

// 本地数据库
class RDPDatabase extends Dexie {
  projects: any;
  reports: any;
  tasks: any;
  milestones: any;
  monthlyProgress: any;
  syncMeta: any;

  constructor() {
    super('RDPDatabase');
    this.version(1).stores({
      projects: 'id, code, type, status, managerId, updatedAt',
      reports: 'id, userId, projectId, month, status, updatedAt',
      tasks: 'id, projectId, assigneeId, status, updatedAt',
      milestones: 'id, projectId, date, status',
      monthlyProgress: 'id, projectId, month',
      syncMeta: 'key'
    });
  }
}

export const db = new RDPDatabase();

export interface User {
  id: string;
  username: string;
  name: string;
  position: string;
  department: string;
  role: string;
  avatar?: string;
  status: string;
  permissions?: string[];
}

export interface Project {
  id: string;
  code: string;
  name: string;
  type: string;
  subtype?: string;
  status: string;
  position?: string;
  managerId: string;
  manager?: { id: string; name: string };
  members?: any[];
  startDate?: string;
  endDate?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Report {
  id: string;
  userId: string;
  projectId: string;
  month: string;
  content: string;
  status: string;
  submittedAt?: string;
  approvedBy?: string;
  approvedAt?: string;
  user?: { id: string; name: string; position: string };
  project?: { id: string; name: string; code: string };
  updatedAt: string;
}

export interface Task {
  id: string;
  projectId: string;
  title: string;
  description?: string;
  assigneeId?: string;
  status: string;
  priority: string;
  dueDate?: string;
  completedAt?: string;
  project?: { id: string; name: string; code: string };
  assignee?: { id: string; name: string; avatar?: string };
  updatedAt: string;
}

interface AppState {
  user: User | null;
  token: string | null;
  projects: Project[];
  reports: Report[];
  tasks: Task[];
  lastSync: string | null;
  isOnline: boolean;
  isSyncing: boolean;
  
  setUser: (user: User | null) => void;
  setToken: (token: string | null) => void;
  setProjects: (projects: Project[]) => void;
  setReports: (reports: Report[]) => void;
  setTasks: (tasks: Task[]) => void;
  setSyncing: (syncing: boolean) => void;
  saveReportLocal: (report: Report) => Promise<void>;
  saveTaskLocal: (task: Task) => Promise<void>;
  sync: () => Promise<void>;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  init: () => Promise<void>;
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      user: null,
      token: null,
      projects: [],
      reports: [],
      tasks: [],
      lastSync: null,
      isOnline: navigator.onLine,
      isSyncing: false,
      
      setUser: (user) => set({ user }),
      setToken: (token) => set({ token }),
      setProjects: (projects) => set({ projects }),
      setReports: (reports) => set({ reports }),
      setTasks: (tasks) => set({ tasks }),
      setSyncing: (isSyncing) => set({ isSyncing }),
      
      saveReportLocal: async (report) => {
        await db.reports.put(report);
        set((state) => ({
          reports: [...state.reports.filter(r => r.id !== report.id), report]
        }));
      },
      
      saveTaskLocal: async (task) => {
        await db.tasks.put(task);
        set((state) => ({
          tasks: [...state.tasks.filter(t => t.id !== task.id), task]
        }));
      },
      
      sync: async () => {
        const { isSyncing, lastSync } = get();
        if (isSyncing) return;
        set({ isSyncing: true });
        
        try {
          const res = await syncAPI.init(lastSync || undefined);
          // res may be ApiResponse or { data: ApiResponse }
          const data = (res as any).data ? (res as any).data : res;
          
          await db.transaction('rw', [db.projects, db.reports, db.tasks], async () => {
            if (data.projects?.length) await db.projects.bulkPut(data.projects);
            if (data.reports?.length) await db.reports.bulkPut(data.reports);
            if (data.tasks?.length) await db.tasks.bulkPut(data.tasks);
          });
          
          set({
            projects: data.projects || [],
            reports: data.reports || [],
            tasks: data.tasks || [],
            lastSync: data.syncTime || (res as any).syncTime || lastSync
          });
        } finally {
          set({ isSyncing: false });
        }
      },
      
      login: async (username, password) => {
        const res = await authAPI.login(username, password);
        const token = (res as any).token || (res as any).data?.token;
        const user = (res as any).user || (res as any).data?.user;
        
        if (token) localStorage.setItem('rdpms_token', token);
        if (user) localStorage.setItem('rdpms_user', JSON.stringify(user));
        
        set({ token, user });
        await get().sync();
      },
      
      logout: async () => {
        try { await authAPI.logout(); } catch {}
        
        localStorage.removeItem('rdpms_token');
        localStorage.removeItem('rdpms_user');
        
        set({ user: null, token: null, projects: [], reports: [], tasks: [], lastSync: null });
        await db.delete();
      },
      
      init: async () => {
        window.addEventListener('online', () => set({ isOnline: true }));
        window.addEventListener('offline', () => set({ isOnline: false }));
        
        const token = localStorage.getItem('rdpms_token');
        const userStr = localStorage.getItem('rdpms_user');
        
        if (token && userStr) {
          try {
            await authAPI.verify();
            const user = JSON.parse(userStr);
            set({ token, user });
            
            const [projects, reports, tasks] = await Promise.all([
              db.projects.toArray(), db.reports.toArray(), db.tasks.toArray()
            ]);
            
            set({ projects, reports, tasks });
            get().sync();
          } catch {
            localStorage.removeItem('rdpms_token');
            localStorage.removeItem('rdpms_user');
          }
        }
      }
    }),
    {
      name: 'rdpms-storage',
      partialize: (state) => ({ lastSync: state.lastSync })
    }
  )
);
