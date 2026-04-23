# RDPMS 系统部署指南

> 腾讯云服务器（Windows Server 2022 · 2C4G · 3Mbps）生产部署执行计划

---

## 一、环境概述

| 项目 | 规格 |
|------|------|
| 操作系统 | Windows Server 2022 |
| CPU / 内存 | 2 核 / 4GB（系统占用约 1.5~2GB，剩余 ~2GB） |
| 公网带宽 | 3 Mbps ≈ 375 KB/s 下行 |
| 后端框架 | **Hono** (`@hono/node-server ^1.8.0`) |
| 数据库 | **SQLite**（文件 `prisma/rdpms.db`） |
| 认证 | **JWT 无状态**（不依赖 Redis） |
| 前端 | React 18 + Vite 5（静态文件，Nginx 托管） |

**内存评估**：Hono + SQLite 常驻约 100~200MB，4GB 内存完全充裕，不存在 OOM 风险。  
**带宽瓶颈**：3Mbps 是最大短板，必须通过 Gzip 压缩 + 强缓存将传输体积压缩 60% 以上。

---

## 二、前置准备

### 2.1 安装 Node.js（服务器端）

推荐 Node.js **LTS 20.x**，下载地址：https://nodejs.org/

```powershell
# 验证安装
node -v   # v20.x.x
npm -v    # 10.x.x
```

### 2.2 安装 PM2（进程守护）

```powershell
npm install -g pm2
npm install -g pm2-windows-startup
pm2-startup install
pm2 -v
```

> ⚠️ Windows 环境中，`pm2 startup`（Linux systemd）不适用，需使用 `pm2-windows-startup`。

### 2.3 安装 Nginx（静态文件 + 反向代理）

下载 Windows 版 Nginx：http://nginx.org/en/download.html  
解压到 `C:\nginx\`

> ⚠️ Windows 下 Nginx 默认不是系统服务。若仅用命令行启动，关闭窗口或重启后会停止。  
> 建议使用 **WinSW** 或 **NSSM** 将 Nginx 注册为 Windows 服务。

---

## 三、后端部署

### 3.1 上传代码

将 `rdpms-system/backend/` 目录上传至服务器，例如 `C:\rdpms\backend\`

> ⚠️ **注意**：上传前确认不包含 `node_modules/` 和 `prisma/rdpms.db`（数据库初始化另做）

### 3.2 安装依赖

```powershell
cd C:\rdpms\backend
npm install --production
npx prisma generate
```

> `prisma generate` 会在服务器上生成当前平台（Windows）的 Prisma 引擎二进制文件。

### 3.3 配置环境变量

编辑 `C:\rdpms\backend\.env`：

```env
# 限制连接池并设置超时，降低 SQLite 在 Windows 下出现 database is locked 的概率
DATABASE_URL="file:./prisma/rdpms.db?connection_limit=1&socket_timeout=10"
JWT_SECRET="【替换为随机强密钥，至少64位】"
PORT=3000
```

> ⚠️ **安全要求**：生产环境必须替换 JWT_SECRET，可用以下命令生成：
> ```powershell
> node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
> ```

### 3.4 初始化数据库

```powershell
# 应用所有迁移（生产环境使用 migrate deploy，不使用 migrate dev）
npx prisma migrate deploy

# 可选：导入初始数据
node prisma/seed.js
```

### 3.5 用 PM2 启动后端

```powershell
cd C:\rdpms\backend
pm2 start src/index.js --name rdpms-backend --interpreter node
pm2 save
```

> 已在 2.2 节安装 `pm2-windows-startup` 并执行 `pm2-startup install`，可确保重启后拉起 PM2 进程列表。

### 3.6 验证后端

```powershell
# 检查进程状态
pm2 status

# 测试 API
curl http://localhost:3000/api/health
```

---

## 四、前端部署

### 4.1 本地打包（在开发机执行）

```bash
cd rdpms-system/frontend

# 生产环境变量（建议）
echo "VITE_API_URL=/api" > .env.production
# 兼容变量名（可选）
# echo "VITE_API_BASE=/api" >> .env.production

# 安装依赖
npm install

# 生产打包
npm run build
# 输出至 dist/ 目录
```

打包完成后将 `dist/` 目录上传至服务器 `C:\rdpms\frontend\dist\`

### 4.2 打包体积优化

`vite.config.ts` 中已建议添加手动分包，减少单文件大小：

```ts
// vite.config.ts
build: {
  rollupOptions: {
    output: {
      manualChunks: {
        vendor: ['react', 'react-dom', 'react-router-dom'],
        ui: ['lucide-react'],
        store: ['zustand', 'dexie'],
      }
    }
  }
}
```

目标：Gzip 后首屏 JS 控制在 **150KB 以内**（3Mbps 带宽下 < 0.5s）。

---

## 五、Nginx 配置

编辑 `C:\nginx\conf\nginx.conf`（完整配置）：

```nginx
worker_processes  1;

events {
    worker_connections  1024;
}

http {
    include       mime.types;
    default_type  application/octet-stream;
    sendfile      on;

    # ── Gzip 压缩（带宽瓶颈的核心对策）──
    gzip              on;
    gzip_min_length   1024;
    gzip_comp_level   6;
    gzip_vary         on;
    gzip_types
        text/plain
        text/css
        text/javascript
        application/javascript
        application/json
        application/x-javascript
        image/svg+xml;

    server {
        listen       80;
        server_name  159.75.106.179 localhost;

        root   C:/rdpms/frontend/dist;
        index  index.html;

        # ── 静态资源强缓存（Vite 打包文件名带 hash，可永久缓存）──
        location /assets/ {
            expires 1y;
            add_header Cache-Control "public, immutable";
            add_header X-Content-Type-Options nosniff;
        }

        # ── 其他常见静态资源缓存 ──
        location ~* \.(ico|png|svg|jpg|jpeg|gif|json)$ {
            expires 30d;
            add_header Cache-Control "public";
        }

        # ── HTML 禁止缓存（确保更新后立即生效）──
        location / {
            try_files $uri $uri/ /index.html;
            add_header Cache-Control "no-cache, no-store, must-revalidate";
            add_header Pragma "no-cache";
        }

        # ── API 反向代理到 Hono 后端 ──
        location /api/ {
            proxy_pass         http://127.0.0.1:3000;
            proxy_http_version 1.1;
            proxy_set_header   Host              $host;
            proxy_set_header   X-Real-IP         $remote_addr;
            proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
            proxy_read_timeout 60s;
        }
    }
}
```

启动 / 重载 Nginx：

```powershell
cd C:\nginx
nginx.exe              # 首次启动
nginx.exe -s reload    # 修改配置后重载
nginx.exe -t           # 配置语法检查
```

> 建议将 Nginx 以 Windows 服务方式运行，避免 RDP 断开或系统重启后进程消失。

---

## 六、网络放通（致命检查）

### 6.1 腾讯云安全组

在腾讯云控制台中进入该实例对应安全组，添加入站规则：

- 协议：TCP
- 端口：80
- 来源：按需设置（建议先 `0.0.0.0/0` 验证，再收敛）
- 备注：Nginx HTTP

### 6.2 Windows Defender 防火墙

在服务器内执行：高级安全 Windows Defender 防火墙 -> 入站规则 -> 新建规则 -> 端口 -> TCP 80 -> 允许连接。

> 如需 HTTPS，还需同时放通 TCP 443。

---

## 七、HTTPS 配置（可选但推荐）

如有域名，使用 [Certbot for Windows](https://certbot.eff.org/) 申请 Let's Encrypt 免费证书，  
或在腾讯云控制台申请免费 SSL 证书后，修改 Nginx：

```nginx
listen 443 ssl;
ssl_certificate     C:/rdpms/ssl/fullchain.pem;
ssl_certificate_key C:/rdpms/ssl/privkey.pem;
ssl_protocols       TLSv1.2 TLSv1.3;
```

---

## 八、数据库备份策略

SQLite 备份极简，定时复制文件即可：

```powershell
# 创建 backup.ps1 并设置 Windows 计划任务每天执行
$date = Get-Date -Format "yyyyMMdd"
Copy-Item "C:\rdpms\backend\prisma\rdpms.db" "C:\rdpms\backup\rdpms_$date.db"

# 保留最近 30 天
Get-ChildItem "C:\rdpms\backup\*.db" | 
    Sort-Object CreationTime -Descending | 
    Select-Object -Skip 30 | 
    Remove-Item
```

---

## 九、部署检查清单

### 部署前
- [ ] `.env` 中 `JWT_SECRET` 已替换为强随机密钥
- [ ] `.env` 中 `DATABASE_URL` 已包含 `connection_limit=1&socket_timeout=10`
- [ ] 前端 `npm run build` 构建无报错
- [ ] `prisma generate` 执行成功
- [ ] `prisma migrate deploy` 执行成功
- [ ] Nginx 配置语法检查通过（`nginx -t`）
- [ ] 腾讯云安全组已放通 TCP 80（HTTPS 场景再放通 443）
- [ ] Windows 防火墙已放通 TCP 80（HTTPS 场景再放通 443）

### 部署后验证
- [ ] `http://服务器IP/` 可访问前端页面
- [ ] `http://服务器IP/api/health` 返回正常
- [ ] 登录功能正常（admin / 初始密码）
- [ ] PM2 进程状态为 `online`（`pm2 status`）
- [ ] 浏览器 DevTools → Network，确认静态资源有 `Content-Encoding: gzip`

---

## 十、常用运维命令

```powershell
# 查看后端日志
pm2 logs rdpms-backend

# 重启后端
pm2 restart rdpms-backend

# 查看后端状态
pm2 status

# Nginx 重载配置（不停服）
C:\nginx\nginx.exe -s reload

# 查看 Nginx 错误日志
type C:\nginx\logs\error.log
```

---

## 十一、预期性能

| 指标 | 目标值 |
|------|--------|
| 后端内存占用 | < 200MB |
| 前端首屏 JS（Gzip 后） | < 150KB |
| 首次加载时间（3Mbps） | < 2 秒 |
| API 响应时间（本机） | < 50ms |
| 数据库文件初始大小 | < 5MB |
