# 开发环境自动提交代码到 GitHub 指南

## 目标
每次修复或更新代码后，自动提交到 Git，并推送到 GitHub，并规范填写代码更新备注。

---

## 推荐操作流程

1. **保存所有代码变更**（VS Code/编辑器中保存文件）。
2. **在项目根目录打开终端**（如 VS Code 内置终端或 macOS/Linux 终端）。
3. **执行如下命令：**

```bash
# 1. 查看变更（可选，推荐）
git status

# 2. 添加所有变更到暂存区
git add .

# 3. 提交代码，填写规范备注（如：fix: 修复xxx问题 / feat: 新增xxx功能）
git commit -m "fix: 修复xxx问题"

# 4. 推送到远程仓库（GitHub）
git push origin main
```

---

## 自动化脚本（可选）

你可以在项目根目录新建一个脚本 `auto-commit.sh`，内容如下：

```bash
#!/bin/bash
# 自动提交所有变更并推送到 GitHub

if [ -z "$1" ]; then
  echo "请填写提交备注，如：./auto-commit.sh 'fix: 修复xxx问题'"
  exit 1
fi

git add .
git commit -m "$1"
git push origin main
```

**用法：**
```bash
chmod +x auto-commit.sh
./auto-commit.sh "fix: 修复xxx问题"
```

---

## 备注规范建议
- `fix:` 修复问题
- `feat:` 新增功能
- `refactor:` 重构
- `docs:` 文档
- `chore:` 其他杂项

---

## 注意事项
- 每次修复/更新后都要及时提交和推送，避免代码丢失。
- 提交备注要简明扼要，能让团队成员一眼看懂本次改动内容。
- 如多人协作，建议先 `git pull` 拉取最新代码再推送，避免冲突。

---

如需进一步自动化（如 VS Code 保存时自动提交），可结合 Git 钩子或 CI 工具，但一般建议手动确认后再提交。
