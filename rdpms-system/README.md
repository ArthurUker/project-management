# 研发项目管理系统 (R&D PMS)

基于 Local-First 架构的研发项目管理系统，支持离线使用，专为 Windows Server 环境优化。

## 技术栈

### 后端
- **框架**: Node.js + Hono.js
- **数据库**: SQLite + Prisma ORM
- **认证**: JWT

### 前端
- **框架**: React 18 + TypeScript
- **构建**: Vite
- **状态管理**: Zustand
- **样式**: Tailwind CSS + shadcn/ui
- **离线支持**: IndexedDB (Dexie.js)

## 快速启动

### 1. 安装依赖

```bash
# 后端
cd backend
npm install

# 前端
cd frontend
npm install
```

### 2. 初始化数据库

```bash
cd backend
npx prisma db push        # 创建数据库表
node prisma/seed.js        # 初始化示例数据
```

### 3. 启动服务

```bash
# 终端1: 后端 API (http://localhost:3000)
cd backend
npm run dev

# 终端2: 前端 (http://localhost:5173)
cd frontend
npm run dev
```

### 4. 访问系统

打开浏览器访问 **http://localhost:5173**

## 默认账户

| 用户名 | 密码 | 角色 |
|--------|------|------|
| admin | admin123 | 管理员 |
| gll | 123456 | 成员（谷磊磊） |
| lyq | 123456 | 成员（李应钦） |
| zyx | 123456 | 成员（章烨鑫） |

## 功能模块

### 仪表盘
- 项目统计概览
- 待办任务
- 最近活动

### 项目管理
- 5种项目类型：平台项目、定制项目、合作项目、测试项目、应用项目
- 项目详情与进展追踪
- 成员分配

### 汇报管理
- 月度汇报填报（对应 Excel 模板结构）
- 历史版本查看
- 草稿/已提交/已通过/已驳回状态

### 任务看板
- Kanban 视图
- 任务分配与状态流转

### 成员管理（管理员）
- 用户 CRUD
- 角色权限控制

## 项目结构

```
rdpms-system/
├── backend/
│   ├── src/
│   │   ├── index.js          # 入口
│   │   └── routes/           # API 路由
│   │       ├── auth.js       # 认证
│   │       ├── users.js      # 用户管理
│   │       ├── projects.js   # 项目管理
│   │       ├── reports.js    # 汇报管理
│   │       ├── tasks.js      # 任务管理
│   │       └── sync.js       # 数据同步
│   ├── prisma/
│   │   ├── schema.prisma     # 数据模型
│   │   └── seed.js           # 初始化数据
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── App.tsx           # 主应用
│   │   ├── api/client.ts     # API 客户端
│   │   ├── store/            # Zustand 状态
│   │   ├── components/       # 组件
│   │   └── pages/            # 页面
│   └── package.json
└── README.md
```

## Windows Server 部署

详见 [技术设计文档](./specs/rpm-system/technical-design.md)

### 基本步骤

1. 安装 Node.js (LTS)
2. 安装 Nginx for Windows
3. 配置 Nginx 反向代理
4. 使用 PM2 管理进程
5. 设置定时备份

## License

MIT
