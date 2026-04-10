# 研发项目管理系统（R&D PMS）- 完整技术方案

> **版本：** v4.0
> **架构：** Local-First（本地优先）+ SQLite
> **部署：** 腾讯云 Windows Server 2022

---

## 一、架构总览

```
┌─────────────────────────────────────────────────────────────────┐
│                         用户浏览器                               │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  React 18 + TypeScript + Zustand + IndexedDB (PWA)     │    │
│  │  承担 95% 工作：UI渲染、图表计算、离线缓存、历史版本     │    │
│  └─────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
                              │ HTTP/HTTPS
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Windows Server 2022                          │
│                        (2核4G / 3Mbps)                          │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                    Nginx (端口80)                        │    │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐ │    │
│  │  │ 前端静态资源  │  │  API反向代理  │  │ 附件静态映射  │ │    │
│  │  │  (D盘)       │  │  → :3000     │  │  (D盘)       │ │    │
│  │  └──────────────┘  └──────────────┘  └──────────────┘ │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                 Node.js + Hono.js (端口3000)            │    │
│  │              承担 5% 工作：身份校验、数据持久化          │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │              D:\RDPMS_Data\                            │    │
│  │  ├── database\rdpms.db          # SQLite数据库          │    │
│  │  ├── uploads\                    # 附件存储             │    │
│  │  └── frontend_dist\              # 前端打包文件          │    │
│  └─────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
```

---

## 二、目录结构

```
D:\RDPMS_Data\
├── database\
│   └── rdpms.db                 # SQLite数据库文件
├── uploads\
│   ├── reports\                 # 汇报附件
│   └── avatars\                 # 用户头像
└── frontend_dist\               # 前端打包文件

C:\RDPMS_Code\                   # 代码目录
├── backend\                     # 后端代码
│   ├── src/
│   │   ├── index.js            # 入口文件
│   │   ├── routes/             # 路由
│   │   ├── middleware/         # 中间件
│   │   └── db/                 # Prisma配置
│   ├── prisma/
│   │   └── schema.prisma       # 数据模型
│   └── package.json
└── frontend\                    # 前端代码（可选，本地开发用）
    ├── src/
    └── dist/                   # 打包输出
```

---

## 三、数据库设计（SQLite + Prisma）

### 3.1 数据模型

```prisma
// prisma/schema.prisma

generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "sqlite"
  url      = "file:./rdpms.db"
}

model User {
  id          String   @id @default(uuid())
  username    String   @unique
  password    String   // 加密存储
  name        String
  position    String   // 职位
  department  String   // 部门
  role        String   @default("member") // admin/manager/member
  avatar      String?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  
  reports     Report[]
  tasks       Task[]   @relation("assignee")
  projects    ProjectMember[]
}

model Project {
  id          String   @id @default(uuid())
  code        String   @unique  // 项目编号 PRJ-2026-001
  name        String
  type        String   // platform/定制/合作/测试/应用
  subtype     String?  // 2.0C/3.0/海南大学/黑马等
  status      String   @default("进行中")
  position    String   // 项目定位/描述
  managerId   String
  startDate   DateTime
  endDate     DateTime?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  
  manager     User     @relation(fields: [managerId], references: [id])
  members     ProjectMember[]
  reports     Report[]
  tasks       Task[]
  milestones  Milestone[]
  progress    MonthlyProgress[]
}

model ProjectMember {
  id        String   @id @default(uuid())
  projectId String
  userId    String
  role      String   @default("member") // manager/member/viewer
  
  project   Project  @relation(fields: [projectId], references: [id])
  user      User     @relation(fields: [userId], references: [id])
  
  @@unique([projectId, userId])
}

// 主表：始终保存最新状态
model Report {
  id          String   @id @default(uuid())
  userId      String
  projectId   String
  month       String   // 2026-03
  content     String   // JSON格式的汇报内容
  status      String   @default("草稿") // 草稿/已提交/已通过/已驳回
  submittedAt DateTime?
  approvedBy  String?
  approvedAt  DateTime?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  
  user        User     @relation(fields: [userId], references: [id])
  project     Project  @relation(fields: [projectId], references: [id])
  versions    ReportVersion[]
  
  @@unique([userId, projectId, month])
}

// 历史表：仅保存历史版本
model ReportVersion {
  id          String   @id @default(uuid())
  reportId    String
  version     Int
  content     String   // 该版本的内容
  createdAt   DateTime @default(now())
  
  report      Report   @relation(fields: [reportId], references: [id])
  
  @@unique([reportId, version])
}

model Task {
  id          String   @id @default(uuid())
  projectId   String
  title       String
  description String?
  assigneeId  String?
  status      String   @default("待开始") // 待开始/进行中/已完成/已阻塞
  priority    String   @default("中") // 高/中/低
  dueDate     DateTime?
  completedAt DateTime?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  
  project     Project  @relation(fields: [projectId], references: [id])
  assignee    User?    @relation("assignee", fields: [assigneeId], references: [id])
}

model Milestone {
  id          String   @id @default(uuid())
  projectId   String
  name        String   // 里程碑名称
  date        DateTime // 计划日期
  status      String   @default("待完成") // 待完成/已完成/已延期
  completedAt DateTime?
  createdAt   DateTime @default(now())
  
  project     Project  @relation(fields: [projectId], references: [id])
}

// 月度进展（项目维度）
model MonthlyProgress {
  id            String   @id @default(uuid())
  projectId     String
  month         String   // 2026-03
  actualWork    String   // 本月实际工作
  completion    Int      @default(0) // 完成度百分比
  nextPlan      String   // 下月计划
  risks         String?  // 风险问题
  projectStatus String?  // 项目综合判断
  submittedBy   String
  submittedAt   DateTime @default(now())
  
  project       Project  @relation(fields: [projectId], references: [id])
  
  @@unique([projectId, month])
}

model SystemLog {
  id          String   @id @default(uuid())
  action      String   // login/report_submit/report_approve等
  userId      String
  targetId    String?
  detail      String?
  ip          String?
  createdAt   DateTime @default(now())
}
```

### 3.2 数据库初始化SQL

```sql
-- SQLite数据库初始化（Prisma会自动生成，也可手动执行）

-- 用户表
CREATE TABLE IF NOT EXISTS User (
  id TEXT PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  name TEXT NOT NULL,
  position TEXT,
  department TEXT,
  role TEXT DEFAULT 'member',
  avatar TEXT,
  createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 项目表
CREATE TABLE IF NOT EXISTS Project (
  id TEXT PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  subtype TEXT,
  status TEXT DEFAULT '进行中',
  position TEXT,
  managerId TEXT,
  startDate DATETIME,
  endDate DATETIME,
  createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (managerId) REFERENCES User(id)
);

-- 汇报主表
CREATE TABLE IF NOT EXISTS Report (
  id TEXT PRIMARY KEY,
  userId TEXT NOT NULL,
  projectId TEXT NOT NULL,
  month TEXT NOT NULL,
  content TEXT NOT NULL,
  status TEXT DEFAULT '草稿',
  submittedAt DATETIME,
  approvedBy TEXT,
  approvedAt DATETIME,
  createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (userId) REFERENCES User(id),
  FOREIGN KEY (projectId) REFERENCES Project(id),
  UNIQUE(userId, projectId, month)
);

-- 汇报历史表
CREATE TABLE IF NOT EXISTS ReportVersion (
  id TEXT PRIMARY KEY,
  reportId TEXT NOT NULL,
  version INTEGER NOT NULL,
  content TEXT NOT NULL,
  createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (reportId) REFERENCES Report(id),
  UNIQUE(reportId, version)
);

-- 月度进展表（项目维度）
CREATE TABLE IF NOT EXISTS MonthlyProgress (
  id TEXT PRIMARY KEY,
  projectId TEXT NOT NULL,
  month TEXT NOT NULL,
  actualWork TEXT,
  completion INTEGER DEFAULT 0,
  nextPlan TEXT,
  risks TEXT,
  projectStatus TEXT,
  submittedBy TEXT,
  submittedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (projectId) REFERENCES Project(id),
  UNIQUE(projectId, month)
);

-- 任务表
CREATE TABLE IF NOT EXISTS Task (
  id TEXT PRIMARY KEY,
  projectId TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  assigneeId TEXT,
  status TEXT DEFAULT '待开始',
  priority TEXT DEFAULT '中',
  dueDate DATETIME,
  completedAt DATETIME,
  createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (projectId) REFERENCES Project(id),
  FOREIGN KEY (assigneeId) REFERENCES User(id)
);

-- 里程碑表
CREATE TABLE IF NOT EXISTS Milestone (
  id TEXT PRIMARY KEY,
  projectId TEXT NOT NULL,
  name TEXT NOT NULL,
  date DATETIME NOT NULL,
  status TEXT DEFAULT '待完成',
  completedAt DATETIME,
  createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (projectId) REFERENCES Project(id)
);
```

---

## 四、API设计（Hono.js）

### 4.1 路由结构

```
/api/
├── auth/
│   ├── POST   /login          # 登录
│   ├── POST   /verify         # 验证Token
│   ├── POST   /logout         # 登出
│   └── GET    /profile        # 获取当前用户信息
│
├── users/
│   ├── GET    /               # 用户列表
│   ├── GET    /:id            # 用户详情
│   ├── POST   /               # 创建用户（管理员）
│   ├── PUT    /:id            # 更新用户
│   └── DELETE /:id            # 删除用户（管理员）
│
├── projects/
│   ├── GET    /               # 项目列表
│   ├── GET    /:id            # 项目详情
│   ├── POST   /               # 创建项目
│   ├── PUT    /:id            # 更新项目
│   ├── DELETE /:id            # 删除项目
│   ├── GET    /:id/members    # 项目成员
│   ├── POST   /:id/members    # 添加成员
│   └── DELETE /:id/members/:userId  # 移除成员
│
├── reports/
│   ├── GET    /               # 汇报列表（支持筛选）
│   ├── GET    /:id            # 汇报详情
│   ├── POST   /               # 创建/更新汇报
│   ├── POST   /:id/submit     # 提交汇报
│   ├── POST   /:id/approve    # 审批通过
│   ├── POST   /:id/reject     # 驳回
│   ├── GET    /:id/versions   # 历史版本
│   └── GET    /export/:month  # 导出月度汇报
│
├── progress/
│   ├── GET    /project/:id    # 项目月度进展
│   ├── POST   /project/:id    # 填写月度进展
│   └── GET    /export/:month  # 导出月度进展报告
│
├── tasks/
│   ├── GET    /               # 任务列表
│   ├── GET    /:id            # 任务详情
│   ├── POST   /               # 创建任务
│   ├── PUT    /:id            # 更新任务
│   ├── PATCH  /:id/status     # 更新状态（Kanban拖拽）
│   └── DELETE /:id            # 删除任务
│
├── milestones/
│   ├── GET    /project/:id    # 项目里程碑
│   ├── POST   /               # 创建里程碑
│   ├── PUT    /:id            # 更新里程碑
│   └── DELETE /:id            # 删除里程碑
│
├── sync/
│   └── GET    /init           # 增量同步（Local-First核心）
│
└── stats/
    ├── GET    /dashboard      # 仪表盘统计
    ├── GET    /projects       # 项目统计
    └── GET    /users/:id/workload  # 个人工作量
```

### 4.2 核心API示例

```javascript
// src/routes/sync.js - 增量同步API
import { Hono } from 'hono';
import { PrismaClient } from '@prisma/client';

const sync = new Hono();
const prisma = new PrismaClient();

// 增量同步：只返回自lastSync之后更新的数据
sync.get('/init', async (c) => {
  const userId = c.get('userId');
  const lastSync = c.req.query('lastSync'); // ISO时间戳
  
  const since = lastSync ? new Date(lastSync) : new Date(0);
  
  // 并行查询所有更新
  const [projects, reports, tasks, user] = await Promise.all([
    prisma.project.findMany({
      where: { updatedAt: { gt: since } },
      include: { members: { include: { user: true } } }
    }),
    prisma.report.findMany({
      where: { 
        userId,
        updatedAt: { gt: since }
      }
    }),
    prisma.task.findMany({
      where: { 
        project: { members: { some: { userId } } },
        updatedAt: { gt: since }
      }
    }),
    prisma.user.findUnique({ where: { id: userId } })
  ]);
  
  return c.json({
    data: { projects, reports, tasks, user },
    syncTime: new Date().toISOString()
  });
});

export default sync;
```

```javascript
// src/routes/reports.js - 汇报API（含历史版本）
import { Hono } from 'hono';
import { PrismaClient } from '@prisma/client';

const reports = new Hono();
const prisma = new PrismaClient();

// 提交汇报（自动保存历史版本）
reports.post('/:id/submit', async (c) => {
  const id = c.params.id;
  const userId = c.get('userId');
  
  await prisma.$transaction(async (tx) => {
    // 1. 获取当前汇报
    const current = await tx.report.findUnique({ where: { id } });
    
    // 2. 查询最新版本号
    const lastVersion = await tx.reportVersion.findFirst({
      where: { reportId: id },
      orderBy: { version: 'desc' }
    });
    const newVersion = (lastVersion?.version || 0) + 1;
    
    // 3. 保存旧内容到历史表
    await tx.reportVersion.create({
      data: {
        reportId: id,
        version: newVersion,
        content: current.content
      }
    });
    
    // 4. 更新主表状态
    await tx.report.update({
      where: { id },
      data: {
        status: '已提交',
        submittedAt: new Date()
      }
    });
  });
  
  return c.json({ success: true });
});

export default reports;
```

---

## 五、前端设计（Local-First）

### 5.1 技术栈

| 模块 | 技术 | 说明 |
|------|------|------|
| 框架 | React 18 + TypeScript | 类型安全 |
| 状态管理 | Zustand | 轻量，支持持久化 |
| 本地存储 | Dexie.js (IndexedDB封装) | 简洁的IndexedDB操作 |
| HTTP | Axios + 拦截器 | 自动处理Token |
| UI组件 | Tailwind + Radix UI | 现代化组件 |
| 图表 | Recharts | 轻量图表库 |
| PWA | Vite PWA Plugin | 离线可用 |
| 路由 | React Router 6 | SPA路由 |

### 5.2 Local-First核心逻辑

```typescript
// src/store/appStore.ts - Zustand状态管理
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import Dexie from 'dexie';

// 本地数据库
const db = new Dexie('RDPMSSync');
db.version(1).stores({
  projects: 'id, code, type, status, updatedAt',
  reports: 'id, userId, projectId, month, updatedAt',
  tasks: 'id, projectId, assigneeId, status, updatedAt',
  syncMeta: 'key'
});

interface AppState {
  // 数据
  projects: Project[];
  reports: Report[];
  tasks: Task[];
  
  // 同步状态
  lastSync: string | null;
  isOnline: boolean;
  isSyncing: boolean;
  
  // 操作
  setProjects: (projects: Project[]) => void;
  saveReport: (report: Report) => Promise<void>;
  sync: () => Promise<void>;
}

// 持久化到IndexedDB
export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      projects: [],
      reports: [],
      tasks: [],
      lastSync: null,
      isOnline: navigator.onLine,
      isSyncing: false,
      
      setProjects: (projects) => {
        set({ projects });
        // 同步到IndexedDB
        db.projects.bulkPut(projects);
      },
      
      saveReport: async (report) => {
        // 1. 先保存到本地
        set((state) => ({
          reports: [...state.reports.filter(r => r.id !== report.id), report]
        }));
        await db.reports.put(report);
        
        // 2. 如果在线，异步上传到服务器
        if (navigator.onLine) {
          try {
            await api.post(`/reports/${report.id}`, report);
          } catch (e) {
            console.warn('离线保存，稍后同步');
          }
        }
      },
      
      sync: async () => {
        if (get().isSyncing) return;
        set({ isSyncing: true });
        
        try {
          const res = await api.get('/sync/init', {
            params: { lastSync: get().lastSync }
          });
          
          const { projects, reports, tasks } = res.data.data;
          
          // 合并到本地
          await db.transaction('rw', db.projects, db.reports, db.tasks, async () => {
            await db.projects.bulkPut(projects);
            await db.reports.bulkPut(reports);
            await db.tasks.bulkPut(tasks);
          });
          
          set({
            projects,
            reports,
            tasks,
            lastSync: res.data.syncTime
          });
        } finally {
          set({ isSyncing: false });
        }
      }
    }),
    {
      name: 'rdpms-storage',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ lastSync: state.lastSync })
    }
  )
);
```

### 5.3 页面结构

```
src/
├── App.tsx                    # 入口
├── pages/
│   ├── Login.tsx             # 登录页
│   ├── Dashboard.tsx         # 仪表盘
│   ├── Projects/
│   │   ├── ProjectList.tsx   # 项目列表
│   │   └── ProjectDetail.tsx # 项目详情
│   ├── Reports/
│   │   ├── ReportList.tsx    # 汇报列表
│   │   ├── ReportEdit.tsx    # 汇报编辑
│   │   └── ReportHistory.tsx # 历史版本
│   ├── Progress/
│   │   ├── ProgressList.tsx  # 进展列表
│   │   └── ProgressEdit.tsx  # 进展填报
│   ├── Tasks/
│   │   ├── TaskList.tsx      # 任务列表
│   │   └── TaskBoard.tsx     # 看板视图
│   ├── Users/
│   │   └── UserList.tsx     # 成员管理
│   └── Settings/
│       └── SystemSettings.tsx # 系统设置
├── components/
│   ├── Layout/               # 布局组件
│   ├── ProjectCard.tsx       # 项目卡片
│   ├── ReportForm.tsx        # 汇报表单
│   ├── ProgressTimeline.tsx  # 进展时间轴
│   └── KanbanBoard.tsx       # 看板组件
├── api/
│   └── client.ts             # API客户端
├── store/
│   └── appStore.ts           # Zustand状态
├── db/
│   └── local.ts              # IndexedDB配置
└── utils/
    └── helpers.ts            # 工具函数
```

---

## 六、部署指南

### 6.1 Windows Server环境准备

```powershell
# 1. 安装 Node.js 18+ LTS
# 下载地址: https://nodejs.org/

# 2. 安装 Nginx for Windows
# 下载地址: https://nginx.org/en/download.html
# 解压到 C:\nginx

# 3. 创建目录结构
New-Item -ItemType Directory -Path "D:\RDPMS_Data\database" -Force
New-Item -ItemType Directory -Path "D:\RDPMS_Data\uploads" -Force
New-Item -ItemType Directory -Path "D:\RDPMS_Data\frontend_dist" -Force
New-Item -ItemType Directory -Path "C:\RDPMS_Code\backend" -Force
```

### 6.2 后端部署

```powershell
# 进入后端目录
cd C:\RDPMS_Code\backend

# 安装依赖
npm install

# 生成Prisma客户端
npx prisma generate

# 初始化数据库（创建表）
npx prisma db push

# 全局安装PM2
npm install -g pm2

# 启动服务
pm2 start src/index.js --name "rdpms-api"

# 设置开机自启
pm2 save
pm2-startup install
```

### 6.3 Nginx配置

```nginx
# C:\nginx\conf\nginx.conf

worker_processes  1;
events {
    worker_connections  1024;
}
http {
    include       mime.types;
    default_type  application/octet-stream;
    sendfile        on;
    keepalive_timeout  65;
    
    # Gzip压缩
    gzip on;
    gzip_types text/plain application/javascript text/css application/json;
    gzip_min_length 1000;

    server {
        listen       80;
        server_name  localhost;
        
        # 前端静态文件
        location / {
            root   D:/RDPMS_Data/frontend_dist;
            index  index.html;
            try_files $uri $uri/ /index.html;
            expires 7d;
            add_header Cache-Control "public, immutable";
        }
        
        # API代理
        location /api/ {
            proxy_pass http://127.0.0.1:3000/;
            proxy_http_version 1.1;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        }
        
        # 附件映射
        location /uploads/ {
            alias D:/RDPMS_Data/uploads/;
            expires 30d;
            add_header Cache-Control "public";
        }
    }
}
```

### 6.4 一键启动脚本

```batch
@echo off
echo ========================================
echo R&D PMS 服务启动脚本
echo ========================================

echo 1. 启动 Nginx...
start "" "C:\nginx\nginx.exe"

echo 2. 启动后端API...
cd C:\RDPMS_Code\backend
pm2 start src/index.js --name "rdpms-api"

echo.
echo 启动完成！
echo 前端地址: http://localhost
echo API地址: http://localhost/api
echo.
pause
```

---

## 七、数据备份方案

### 7.1 自动备份脚本

```batch
@echo off
REM D:\RDPMS_Data\database\backup.bat
REM 每天凌晨2点执行

set BACKUP_DIR=D:\RDPMS_Backup
set DB_FILE=D:\RDPMS_Data\database\rdpms.db
set DATE=%date:~0,4%%date:~5,2%%date:~8,2%

if not exist "%BACKUP_DIR%" mkdir "%BACKUP_DIR%"

echo 正在备份数据库...
copy "%DB_FILE%" "%BACKUP_DIR%\rdpms_%DATE%.db"

echo 正在清理30天前的备份...
forfiles /p "%BACKUP_DIR%" /s /m *.db /d -30 /c "cmd /c del @path"

echo 备份完成: %BACKUP_DIR%\rdpms_%DATE%.db
```

### 7.2 Windows任务计划

```powershell
# 创建定时任务（每天凌晨2点）
$action = New-ScheduledTaskAction -Execute "D:\RDPMS_Data\database\backup.bat"
$trigger = New-ScheduledTaskTrigger -Daily -At "02:00"
Register-ScheduledTask -Action $action -Trigger $trigger -TaskName "RDPMS_Backup" -Description "R&D PMS数据库备份"
```

---

## 八、安全配置

### 8.1 腾讯云安全组

| 端口 | 协议 | 来源 | 说明 |
|------|------|------|------|
| 80 | TCP | 0.0.0.0/0 | HTTP访问 |
| 443 | TCP | 0.0.0.0/0 | HTTPS（可选） |
| 3389 | TCP | 公司IP | 远程桌面 |

### 8.2 JWT密钥配置

```bash
# 在服务器环境变量中设置
setx JWT_SECRET "your-very-long-random-secret-key-here"
```

---

## 九、开发里程碑

| 阶段 | 功能 | 预计工时 |
|------|------|----------|
| **Phase 1** | 项目基础CRUD + 用户登录 | 3天 |
| **Phase 2** | 汇报填报 + 历史版本 | 2天 |
| **Phase 3** | 项目进展填报 + 时间轴 | 2天 |
| **Phase 4** | 仪表盘 + 统计报表 | 2天 |
| **Phase 5** | 任务管理 + 看板视图 | 2天 |
| **Phase 6** | Local-First优化 + PWA | 2天 |
| **Phase 7** | 部署 + 备份方案 | 1天 |

**总计：约14个工作日**

---

## 十、确认事项

1. **是否需要移动端**（微信小程序/企业微信）？
2. **是否需要多语言支持**（中文/English）？
3. **是否需要对接现有LDAP/AD**（域账号登录）？
4. **附件存储大小限制**（建议单文件不超过50MB）？
5. **报告导出格式**（PDF/Word/Excel）？

确认后开始开发。
