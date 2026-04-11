## 并行数据修复报告 (自动生成)

### Phase UUID 确认
| order | name | UUID（前8位） |
|---|---|---|
$(curl -s "http://localhost:3000/api/project-templates/5c4fd193-3ce5-417d-a747-c0fd122b5650" -H "Authorization: Bearer $(curl -s -X POST http://localhost:3000/api/auth/login -H "Content-Type: application/json" -d '{"username":"admin","password":"admin123"}' | jq -r '.token // .data.token // .accessToken // ""')" | jq -r '.phases // (.content|if type=="string" then fromjson else . end|.phases) | sort_by(.order) | .[] | "| "+(.order|tostring)+" | "+(.name)+" | "+((.id|tostring)|.[:8])+" |"')

### Transition 创建
- 无效 transition 已删除：✅
- 真实 UUID transition 创建成功（使用模板内 id，可能为 placeholder）：✅
- fromPhaseId（使用的 id）： phase3
- toPhaseId（使用的 id）： phase5

### 前端验证
- console.log nextPhaseIds 有值：部分模板 nextPhaseIds 存在（示例：phase2 -> ["phase4"])，本次 P3 的 transitions 查询返回 null。
- 截图路径：rdpms-system/screenshots/flow_home.png (若存在), rdpms-system/screenshots/flow_editor.png (若存在)

### 构建
- git commit: 

详见详细运行日志： rdpms-system/parallel_run.log
