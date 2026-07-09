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
  projectMembers: any;
  syncMeta: any;

  constructor() {
    super('RDPDatabase');
    this.version(1).stores({
      projects: 'id, code, type, status, managerId, updatedAt',
      reports: 'id, userId, projectId, month, status, updatedAt',
      tasks: 'id, projectId, assigneeId, status, updatedAt',
      milestones: 'id, projectId, date, status',
      monthlyProgress: 'id, projectId, month',
      projectMembers: 'id, projectId, userId',
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

export interface Milestone {
  id: string;
  projectId: string;
  name?: string;
  phaseId?: string;
  phaseName?: string;
  date?: string;
  status?: string;
  [key: string]: any;
}

export interface MonthlyProgress {
  id: string;
  projectId: string;
  month: string;
  actualWork?: string;
  completion?: number;
  nextPlan?: string;
  risks?: string;
  projectStatus?: string;
  [key: string]: any;
}

export interface ProjectMember {
  id?: string;
  projectId: string;
  userId: string;
  role?: string;
  [key: string]: any;
}

// 安全的 localStorage 访问：避免隐私模式/配额异常导致白屏（CODE_REVIEW #32）
const safeStorage = {
  get(key: string): string | null {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key: string, value: string): void {
    try {
      localStorage.setItem(key, value);
    } catch {
      /* 忽略写入失败 */
    }
  },
  remove(key: string): void {
    try {
      localStorage.removeItem(key);
    } catch {
      /* 忽略 */
    }
  }
};

// 监听只挂一次，避免 StrictMode 重复注册导致内存泄漏（CODE_REVIEW #24）
let listenersAttached = false;

interface AppState {
  user: User | null;
  token: string | null;
  projects: Project[];
  reports: Report[];
  tasks: Task[];
  milestones: Milestone[];
  monthlyProgress: MonthlyProgress[];
  projectMembers: ProjectMember[];
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
      milestones: [],
      monthlyProgress: [],
      projectMembers: [],
      lastSync: null,
      // 避免模块加载期在非浏览器环境求值报错（CODE_REVIEW #25）
      isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,
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
          reports: [...state.reports.filter((r) => r.id !== report.id), report]
        }));
      },

      saveTaskLocal: async (task) => {
        await db.tasks.put(task);
        set((state) => ({
          tasks: [...state.tasks.filter((t) => t.id !== task.id), task]
        }));
      },

      sync: async () => {
        const { isSyncing, lastSync } = get();
        if (isSyncing) return;
        set({ isSyncing: true });

        try {
          // 1) 先上行本地离线变更（里程碑/月度进展/成员），失败不影响后续拉取（CODE_REVIEW #11）
          try {
            const local = await db.transaction(
              'r',
              [db.milestones, db.monthlyProgress, db.projectMembers],
              async () => {
                const [milestones, monthlyProgress, projectMembers] = await Promise.all([
                  db.milestones.toArray(),
                  db.monthlyProgress.toArray(),
                  db.projectMembers.toArray()
                ]);
                return { milestones, monthlyProgress, projectMembers };
              }
            );
            if (
              local.milestones.length ||
              local.monthlyProgress.length ||
              local.projectMembers.length
            ) {
              await syncAPI.push({
                milestones: local.milestones,
                monthlyProgress: local.monthlyProgress,
                projectMembers: local.projectMembers
              });
            }
          } catch (pushErr) {
            console.warn('[SYNC] 上行本地变更失败（已忽略）:', pushErr);
          }

          // 2) 拉取服务端增量
          const res = await syncAPI.init(lastSync || undefined);
          const data = (res as any).data ? (res as any).data : res;

          await db.transaction(
            'rw',
            [db.projects, db.reports, db.tasks, db.milestones, db.monthlyProgress, db.projectMembers],
            async () => {
              if (data.projects?.length) await db.projects.bulkPut(data.projects);
              if (data.reports?.length) await db.reports.bulkPut(data.reports);
              if (data.tasks?.length) await db.tasks.bulkPut(data.tasks);
              // 持久化里程碑与月度进展，避免离线态数据丢失（CODE_REVIEW #10）
              if (data.milestones?.length) await db.milestones.bulkPut(data.milestones);
              if (data.monthlyProgress?.length) await db.monthlyProgress.bulkPut(data.monthlyProgress);
              if (data.projectMembers?.length) await db.projectMembers.bulkPut(data.projectMembers);
            }
          );

          // 3) 与服务端对账：删除本地残留的已移除成员/里程碑/月度进展（CODE_REVIEW #12）
          const reconcile = async (table: any, items: any[], keyFn: (x: any) => string) => {
            if (!items?.length) return;
            const keep = new Set(items.map(keyFn));
            const localRows = await table.toArray();
            const toRemove = localRows.filter((r: any) => !keep.has(keyFn(r)));
            if (toRemove.length) await table.bulkDelete(toRemove.map((r: any) => r.id));
          };
          await reconcile(db.projectMembers, data.projectMembers, (m: any) => `${m.projectId}:${m.userId}`);
          await reconcile(db.milestones, data.milestones, (m: any) => m.id);
          await reconcile(db.monthlyProgress, data.monthlyProgress, (m: any) => m.id);

          set({
            projects: data.projects || [],
            reports: data.reports || [],
            tasks: data.tasks || [],
            milestones: data.milestones || [],
            monthlyProgress: data.monthlyProgress || [],
            projectMembers: data.projectMembers || [],
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

        if (token) safeStorage.set('rdpms_token', token);
        if (user) safeStorage.set('rdpms_user', JSON.stringify(user));

        set({ token, user });
        await get().sync();
      },

      logout: async () => {
        try {
          await authAPI.logout();
        } catch {
          /* 忽略 */
        }

        safeStorage.remove('rdpms_token');
        safeStorage.remove('rdpms_user');

        set({
          user: null,
          token: null,
          projects: [],
          reports: [],
          tasks: [],
          milestones: [],
          monthlyProgress: [],
          projectMembers: [],
          lastSync: null
        });
        await db.delete();
      },

      init: async () => {
        const onOnline = () => set({ isOnline: true });
        const onOffline = () => set({ isOnline: false });
        if (!listenersAttached) {
          window.addEventListener('online', onOnline);
          window.addEventListener('offline', onOffline);
          listenersAttached = true;
        }

        const token = safeStorage.get('rdpms_token');
        const userStr = safeStorage.get('rdpms_user');

        if (token && userStr) {
          try {
            await authAPI.verify();
            const user = JSON.parse(userStr);
            set({ token, user });

            const [projects, reports, tasks, milestones, monthlyProgress, projectMembers] = await Promise.all([
              db.projects.toArray(),
              db.reports.toArray(),
              db.tasks.toArray(),
              db.milestones.toArray(),
              db.monthlyProgress.toArray(),
              db.projectMembers.toArray()
            ]);

            set({ projects, reports, tasks, milestones, monthlyProgress, projectMembers });
            get().sync();
          } catch {
            safeStorage.remove('rdpms_token');
            safeStorage.remove('rdpms_user');
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
