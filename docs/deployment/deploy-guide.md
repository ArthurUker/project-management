# RDPMS 系统部署指南

> 新服务器（Ubuntu 22.04.5 LTS · x86_64 · systemd）生产部署执行计划
>
> 架构决策：**PostgreSQL + 原生 systemd + Nginx + 公网 IP/HTTP（先跑通）+ 全新 seed**

---

## 一、环境概述

| 项目 | 规格 |
|------|------|
| 服务器 | 腾讯云 CVM，公网 IP `111.231.166.161`，内网 `172.17.0.9` |
| 操作系统 | Ubuntu 22.04.5 LTS（x86_64，systemd） |
| 后端框架 | **Hono**（`@hono/node-server ^1.8.0`），无状态 JWT 鉴权 |
| 数据库 | **PostgreSQL 14**（Ubuntu 22.04 默认源） |
| 进程守护 | **原生 systemd**（不依赖 PM2） |
| 前端 | React 18 + Vite 5（静态文件，Nginx 托管） |
| 访问方式 | 公网 IP + HTTP（80），暂未配置域名/HTTPS |
| 数据 | **全新初始化**（重新 `db push` + seed） |

> ⚠️ 当前分支 `tencent_CVM/rdpm` 的 `schema.prisma` 仍指向 **SQLite**（`provider = "sqlite"`），本方案在服务器副本上将其切换为 PostgreSQL（见 §3.3）。**本地开发机仍使用 SQLite，不受影响**。

---

## 二、前置准备（在服务器执行）

### 2.1 系统更新与基础工具

```bash
sudo apt update && sudo apt -y upgrade
sudo apt -y install curl git unzip build-essential
```

### 2.2 安装 Node.js 20 LTS

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt -y install nodejs
node -v   # v20.x.x
npm -v    # 10.x.x
```

### 2.3 安装 PostgreSQL 14

```bash
sudo apt -y install postgresql postgresql-contrib
sudo systemctl enable --now postgresql
sudo systemctl status postgresql   # 应为 active (running)
```

### 2.4 安装 Nginx

```bash
sudo apt -y install nginx
sudo systemctl enable --now nginx
sudo systemctl status nginx         # 应为 active (running)
```

### 2.5 防火墙（ufw）

只放通 22（SSH）、80（HTTP），**不要**放通后端 3000 端口（仅 Nginx 本机反代可达）：

```bash
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp   # 为后续 HTTPS 预留
sudo ufw enable
sudo ufw status
```

> 🔴 **必须由你在腾讯云控制台操作**：将实例安全组的 **TCP 80** 入站放通（HTTPS 阶段再放 **443**）。
> 当前未确认是否已放通——未放通则公网无法访问。端口 3000 切勿对公网开放。

---

## 三、数据库部署（PostgreSQL）

### 3.1 创建专用角色与数据库

```bash
sudo -u postgres psql <<'SQL'
-- 专用数据库角色（请替换强密码）
CREATE ROLE rdpms WITH LOGIN PASSWORD '【替换为强密码，建议 32 位以上】';
-- 专用数据库，归属 rdpms
CREATE DATABASE rdpms OWNER rdpms;
-- 赋予建表等权限
GRANT ALL PRIVILEGES ON DATABASE rdpms TO rdpms;
\c rdpms
GRANT ALL ON SCHEMA public TO rdpms;
ALTER SCHEMA public OWNER TO rdpms;
SQL
```

记录连接串（后续写入后端 `.env`）：

```
postgresql://rdpms:【上面设置的密码】@localhost:5432/rdpms?schema=public
```

### 3.2 拉取代码

```bash
sudo mkdir -p /opt/rdpms
sudo chown -R $USER:$USER /opt/rdpms
git clone -b tencent_CVM/rdpm <你的仓库地址> /opt/rdpms
# 或：将本地 rdpms-system/ 上传至 /opt/rdpms
```

代码目录约定：

```
/opt/rdpms/
├── backend/        # Hono 后端
└── frontend/       # React 前端
```

---

## 四、后端部署

### 4.1 切换 Prisma 数据源为 PostgreSQL（服务器副本）

编辑 `/opt/rdpms/backend/prisma/schema.prisma`，将 datasource 改为：

```prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}
```

> ⚠️ 仅修改 `provider`，不要改动任何 model 字段。已核查：当前 schema 全部为 `String`/`Int`/`Float`/`Boolean`/`DateTime`，**无 SQLite 专有类型**，迁移 PostgreSQL 标量完全兼容，无需改表结构。

### 4.2 安装依赖并生成 Prisma 客户端

```bash
cd /opt/rdpms/backend
npm install --omit=dev      # 生产依赖
npx prisma generate          # 依据 postgresql provider 生成本地引擎
```

### 4.3 配置环境变量

编辑 `/opt/rdpms/backend/.env`（替换示例值）：

```env
# PostgreSQL 连接串（来自 §3.1）
DATABASE_URL="postgresql://rdpms:【强密码】@localhost:5432/rdpms?schema=public"

# JWT 强密钥：用以下命令生成后粘贴（>=64 位十六进制）
JWT_SECRET="【node -e "console.log(require('crypto').randomBytes(64).toString('hex'))" 的输出】"

# 监听端口（Nginx 本机反代）
PORT=3000

# CORS 白名单：公网 IP（同域 /api 经 Nginx，已同源；此处兜底放行）
CORS_ORIGINS="http://111.231.166.161"
```

生成 JWT_SECRET：

```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

### 4.4 全新初始化数据库并写入种子数据

```bash
cd /opt/rdpms/backend
# 按 schema 创建全表（全新库，--accept-data-loss 安全）
npx prisma db push --accept-data-loss
# 写入初始数据：admin/admin123、成员 gll/lyq/zyx(123456)、模板、示例项目、法规文件
node prisma/seed.js
```

> 初始管理员账号：**admin / admin123**（首次登录后请立即修改密码）。

### 4.5 配置 systemd 服务

创建专用运行用户（降权，提升安全性）：

```bash
sudo useradd --system --shell /usr/sbin/nologin --home /opt/rdpms rdpms
sudo chown -R rdpms:rdpms /opt/rdpms
```

写入 `/etc/systemd/system/rdpms-backend.service`：

```ini
[Unit]
Description=RDPMS Backend (Hono)
After=network.target postgresql.service
Wants=postgresql.service

[Service]
Type=simple
User=rdpms
Group=rdpms
WorkingDirectory=/opt/rdpms/backend
EnvironmentFile=/opt/rdpms/backend/.env
ExecStart=/usr/bin/node /opt/rdpms/backend/src/index.js
Restart=on-failure
RestartSec=3
# 限制资源，避免异常占用
MemoryMax=512M
StandardOutput=journal
StandardError=journal
SyslogIdentifier=rdpms-backend

[Install]
WantedBy=multi-user.target
```

启用并启动：

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now rdpms-backend
sudo systemctl status rdpms-backend   # active (running)
journalctl -u rdpms-backend -n 50 --no-pager
```

### 4.6 验证后端

```bash
curl http://localhost:3000/api/health    # 期望 {"status":"ok"}
curl http://localhost:3000/health         # 期望 {"status":"ok"}
```

---

## 五、前端部署

### 5.1 在服务器打包（Node 已具备）

前端 `API_BASE` 默认即为 `/api`，配合 Nginx 同域反代，**无需**设置 `VITE_API_URL`：

```bash
cd /opt/rdpms/frontend
npm install
npm run build      # tsc -b 类型检查 + vite build，输出至 dist/
```

> ⚠️ `npm run build` 含 `tsc -b` 类型门禁。若有类型错误会中断打包，需先修复。

### 5.2 Nginx 站点配置

写入 `/etc/nginx/sites-available/rdpms`：

```nginx
server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name _;

    root /opt/rdpms/frontend/dist;
    index index.html;

    # Gzip 压缩（降低传输体积）
    gzip on;
    gzip_min_length 1024;
    gzip_comp_level 6;
    gzip_vary on;
    gzip_types
        text/plain text/css text/javascript
        application/javascript application/json
        application/x-javascript image/svg+xml;

    # 带 hash 的静态资源：长期强缓存
    location /assets/ {
        expires 1y;
        add_header Cache-Control "public, immutable";
        add_header X-Content-Type-Options nosniff;
    }

    location ~* \.(ico|png|svg|jpg|jpeg|gif|json|woff2?)$ {
        expires 30d;
        add_header Cache-Control "public";
    }

    # HTML 不缓存，保证发版即时生效
    location / {
        try_files $uri $uri/ /index.html;
        add_header Cache-Control "no-cache, no-store, must-revalidate";
    }

    # API 反向代理到本机 Hono 后端（端口 3000 仅本机可达）
    location /api/ {
        proxy_pass         http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header   Host              $host;
        proxy_set_header   X-Real-IP         $remote_addr;
        proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
        proxy_read_timeout 60s;
    }
}
```

启用站点并校验：

```bash
sudo rm -f /etc/nginx/sites-enabled/default
sudo ln -s /etc/nginx/sites-available/rdpms /etc/nginx/sites-enabled/rdpms
sudo nginx -t          # 语法检查，应 syntax is OK
sudo systemctl reload nginx
```

---

## 六、网络放通（致命检查）

### 6.1 腾讯云安全组（需你手动操作）

进入实例对应安全组，添加入站规则：

| 协议 | 端口 | 来源 | 备注 |
|------|------|------|------|
| TCP | 80 | `0.0.0.0/0`（验证后建议收敛） | Nginx HTTP |
| TCP | 443 | `0.0.0.0/0`（HTTPS 阶段） | Nginx HTTPS |
| TCP | 22 | 你的办公 IP | SSH（勿对全网开放） |

> 🔴 **端口 3000 切勿对公网开放**：后端只经 Nginx 本机反代，公网暴露 3000 会绕过 Nginx 与 CORS。

### 6.2 服务器防火墙（已用 ufw 完成，见 §2.5）

确认只放行 22/80/443，3000 被拒绝。

---

## 七、部署后验证

```bash
# 1) 前端页面可访问
curl -I http://111.231.166.161/          # 期望 200，且含 Content-Encoding: gzip

# 2) 后端健康检查
curl http://111.231.166.161/api/health   # 期望 {"status":"ok"}

# 3) 登录冒烟（替换实际 IP）
curl -X POST http://111.231.166.161/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"admin123"}'
# 期望返回 {"success":true,"data":{...,"token":"..."}}
```

浏览器访问 `http://111.231.166.161/`，用 **admin / admin123** 登录，核对各模块（项目、汇报、试剂配方、知识库等）是否正常。

---

## 八、HTTPS 配置（后续阶段）

待绑定域名并放通 443 后：

1. 在腾讯云申请免费 SSL 证书，或使用 Certbot（Let's Encrypt）。
2. Nginx 增加 `listen 443 ssl;` 与证书路径，HTTP 80 全量 301 跳转到 HTTPS。
3. 更新后端 `CORS_ORIGINS` 为 `https://你的域名`，重启 `rdpms-backend`。
4. 首次全站切 HTTPS 后，建议用户**硬刷新浏览器**（清掉旧 Dexie 本地库）。

---

## 九、数据库备份策略

### 9.1 每日逻辑备份脚本 `/opt/rdpms/backup.sh`

```bash
#!/usr/bin/env bash
set -euo pipefail
BACKUP_DIR=/opt/rdpms/backups
DATE=$(date +%Y%m%d_%H%M%S)
mkdir -p "$BACKUP_DIR"
# pg_dump 逻辑备份（需 PG 密码，建议配合 ~/.pgpass 或连接串）
pg_dump "postgresql://rdpms:【强密码】@localhost:5432/rdpms" \
  -F c -f "$BACKUP_DIR/rdpms_$DATE.dump"
# 保留最近 14 天
find "$BACKUP_DIR" -name 'rdpms_*.dump' -mtime +14 -delete
echo "backup done: $DATE"
```

```bash
chmod +x /opt/rdpms/backup.sh
```

### 9.2 加入定时任务

```bash
sudo crontab -e
# 每天 03:15 执行
15 3 * * * /opt/rdpms/backup.sh >> /opt/rdpms/backups/cron.log 2>&1
```

> 恢复示例：`pg_restore -d rdpms -c /opt/rdpms/backups/rdpms_YYYYMMDD_HHMMSS.dump`

---

## 十、部署检查清单

### 部署前
- [ ] 服务器已 `apt update/upgrade`，安装 Node 20 / PostgreSQL 14 / Nginx
- [ ] `schema.prisma` 的 `provider` 已改为 `postgresql`（仅服务器副本）
- [ ] `npx prisma generate` 成功
- [ ] 后端 `.env`：`DATABASE_URL` 指向 PostgreSQL、`JWT_SECRET` 为强随机密钥、`CORS_ORIGINS` 含公网 IP
- [ ] `npx prisma db push --accept-data-loss` 成功
- [ ] `node prisma/seed.js` 成功（admin/admin123 已写入）
- [ ] 前端 `npm run build` 通过（tsc 类型门禁无错）
- [ ] Nginx 配置 `nginx -t` 通过
- [ ] **腾讯云安全组已放通 TCP 80**（HTTPS 阶段再放 443）
- [ ] ufw 仅放行 22/80/443，3000 未对公网开放

### 部署后验证
- [ ] `http://111.231.166.161/` 可访问且静态资源带 `gzip`
- [ ] `http://111.231.166.161/api/health` 返回正常
- [ ] admin/admin123 登录成功
- [ ] `systemctl status rdpms-backend` 为 `active (running)`
- [ ] `systemctl status nginx` 为 `active (running)`
- [ ] 已配置每日 `pg_dump` 备份（cron）

---

## 十一、常用运维命令

```bash
# 后端日志
sudo journalctl -u rdpms-backend -f

# 重启后端（改 .env / 代码后）
sudo systemctl restart rdpms-backend

# 重新加载 Nginx 配置（改站点后，不停服）
sudo systemctl reload nginx

# 查看 Nginx 错误日志
sudo tail -f /var/log/nginx/error.log

# 数据库手动备份
sudo /opt/rdpms/backup.sh

# 代码更新流程（以 git 为例）
cd /opt/rdpms && git pull
cd backend && npm install --omit=dev && npx prisma generate && node prisma/seed.js   # 仅全新初始化需 seed
sudo systemctl restart rdpms-backend
cd ../frontend && npm install && npm run build
sudo systemctl reload nginx
```

---

## 十二、预期性能

| 指标 | 目标值 |
|------|--------|
| 后端常驻内存 | < 200MB（已设 MemoryMax=512M） |
| 前端首屏 JS（Gzip 后） | < 200KB |
| API 响应时间（本机） | < 50ms |
| PostgreSQL 初始库大小 | < 10MB |
| 数据库备份体积 | 逻辑备份 < 5MB/天 |
