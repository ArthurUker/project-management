# 项目模版应用流程指南

## 功能概述

研发项目管理系统支持从预定义的项目模版快速创建新项目。该功能大幅简化项目初始化流程，自动生成项目阶段、任务和里程碑。

## 功能特性

### 1. **母版与子模版系统**
- **母版（Master Template）**：9阶段试剂/芯片、11阶段设备等完整流程模版
- **子模版（Child Template）**：基于母版定制，可禁用不需要的阶段
- **继承机制**：子模版继承父母版的结构，支持选择性启用/禁用阶段

### 2. **模版库浏览**
- 前端`/template-library`页面展示所有可用模版
- 按分类分组（试剂/芯片、设备等）
- 展示完整阶段流程、里程碑、任务列表
- 来源标记：🔒继承、✂️禁用、➕新增

### 3. **应用流程**

#### 步骤1：选择模版
```
前端 → 模版库 → 选择模版 → 点击"应用模版创建项目"
```

#### 步骤2：编辑项目信息
弹出表单编辑：
- 项目编码（自动生成或手动修改）
- 项目名称（必填）
- 项目类型（可选）
- 项目描述/定位（可选）

#### 步骤3：确认创建
- 显示模版包含的阶段数、任务数、里程碑数
- 点击"确认创建"
- 系统自动创建项目、任务、里程碑
- 自动跳转到项目详情页面

## API 接口

### 获取模版列表
```http
GET /api/project-templates?category=试剂/芯片&pageSize=50
Authorization: Bearer {token}
```

**响应：**
```json
{
  "list": [
    {
      "id": "uuid",
      "code": "TPL-RD-STD",
      "name": "试剂/芯片开发 全流程模版",
      "description": "9阶段完整流程",
      "category": "试剂/芯片",
      "isMaster": true,
      "parentId": null,
      "content": "{\"phases\": [...], \"milestones\": [...]}",
      "createdBy": "admin",
      "createdAt": "2026-04-10T..."
    }
  ]
}
```

### 应用模版（获取草稿）
```http
POST /api/project-templates/{templateId}/apply
Authorization: Bearer {token}
Content-Type: application/json

{}
```

**响应：**
```json
{
  "payload": {
    "code": "PRJ-2026-123",
    "name": "模版名称 项目草稿",
    "type": "试剂/芯片",
    "startDate": "2026-04-10T...",
    "tasks": [
      {
        "title": "立项申请",
        "description": "提交立项申请..."
      },
      {
        "title": "可行性分析",
        "description": "完成可行性分析..."
      }
    ],
    "milestones": [
      {
        "name": "立项完成",
        "date": "2026-05-01"
      }
    ]
  }
}
```

### 创建项目（应用模版）
```http
POST /api/projects
Authorization: Bearer {token}
Content-Type: application/json

{
  "code": "PRJ-2026-001",
  "name": "我的试剂开发项目",
  "type": "试剂/芯片",
  "position": "基于标准模版创建",
  "managerId": "{userId}",
  "tasks": [
    {
      "title": "立项申请",
      "description": "提交立项申请...",
      "assigneeId": "{userId}"
    }
  ],
  "milestones": [
    {
      "name": "立项完成",
      "date": "2026-05-01"
    }
  ]
}
```

**响应：**
```json
{
  "id": "{projectId}",
  "code": "PRJ-2026-001",
  "name": "我的试剂开发项目",
  "type": "试剂/芯片",
  "status": "进行中",
  "manager": {
    "id": "{userId}",
    "name": "管理员"
  }
}
```

## 模版数据结构

### Content 字段格式
```json
{
  "phases": [
    {
      "order": 1,
      "name": "立项",
      "desc": "立项申请、可行性分析、评审",
      "source": "inherit",
      "disabled": false,
      "tasks": [
        {
          "title": "立项申请",
          "description": "提交立项申请"
        }
      ]
    },
    {
      "order": 2,
      "name": "方案设计",
      "desc": "引物探针设计...",
      "source": "inherit",
      "disabled": false,
      "tasks": [...]
    }
  ],
  "milestones": [
    {
      "name": "立项完成",
      "date": "2026-05-15",
      "description": "完成立项评审"
    }
  ]
}
```

### 子模版禁用机制
子模版可通过设置 `disabled: true` 隐藏不需要的阶段：

```json
{
  "order": 3,
  "name": "样本收集",
  "disabled": true,
  "tasks": []
}
```

前端会显示为灰色、不可编辑，但数据保留，随时可恢复。

## 使用示例

### 场景1：快速开发试剂
1. 选择"快速验证型"模版
2. 禁用的阶段：样本收集（3）、片外核酸提取优化（4）
3. 理由：已有提取方案，直接做扩增验证

### 场景2：定制设备开发
1. 选择"定制开发型"模版
2. 禁用的阶段：项目调研（1）、设计方案评审（4）、设计迭代再评审（5）
3. 理由：客户需求明确，跳过调研和多轮评审

### 场景3：性能测试项目
1. 选择"性能测试型"模版
2. 禁用的阶段：大部分早期开发阶段
3. 理由：已有产品，只做测试验证

## 前端集成

### TemplateLibrary.tsx 页面功能
- **分类分组**：按 category 分组展示模版
- **模版详情**：显示所有阶段及来源标记
- **应用按钮**：触发应用流程
- **派生按钮**：从母版创建子模版

### 应用流程组件
```jsx
<div>
  <h3>📋 应用模版创建项目</h3>
  <input type="text" placeholder="项目编码" />
  <input type="text" placeholder="项目名称" />
  <input type="text" placeholder="项目类型" />
  <textarea placeholder="项目描述" />
  <button onClick={createProjectFromTemplate}>确认创建</button>
</div>
```

## 开发与测试

### 启动开发环境
```bash
bash start-dev.sh
```

### 测试 API
```bash
# 登录
TOKEN=$(curl -s -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}' | jq -r '.token')

# 获取模版
curl http://localhost:3000/api/project-templates \
  -H "Authorization: Bearer $TOKEN" | jq

# 应用模版
curl -X POST http://localhost:3000/api/project-templates/{id}/apply \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{}' | jq
```

## 常见问题

### Q: 应用模版后项目状态是什么？
A: 创建的项目状态为"进行中"，任务状态为"待开始"，里程碑状态为"待完成"。

### Q: 可以修改应用后的任务吗？
A: 可以，项目创建后所有任务都可以编辑、删除或添加新任务。

### Q: 子模版的禁用阶段可以恢复吗？
A: 当前版本中禁用后无法恢复，需要后续在编辑器中实现该功能。

### Q: 如何创建新模版？
A: 需要后端支持，当前仅支持查看和应用已创建的模版。

## 待办事项

- [ ] 子模版编辑器：支持编辑和保存模版修改
- [ ] 权限增强：限制非管理员修改模版
- [ ] 模版搜索：支持按关键字搜索模版
- [ ] 模版复制：基于现有模版创建新模版
- [ ] 版本控制：支持模版版本管理和回滚
