# 回退（PREPARATION_ONLY）

本窗口未改动任何业务源码、schema、配置、共享台账或其他窗口。唯一新增文件均位于：

```
docs/remediation/2026-10-01-rdpms/execution/supplements/parallel-lr7-2026-10-04-p01/window-f-cache/
```

## 回退方式

- 删除上述 `window-f-cache/` 目录即可完全撤销本窗口产物。
- 不影响任何 `.git` 已跟踪文件（本目录为新增、未提交）。
- 无数据库、无服务、无队列、无构建产物需要清理。

## 不应回退的关联物

- `RP13-T02` 的既有 barrier 证据（被复用，不属于本窗口写入范围）。
- 其他窗口 A–E 的并行目录（只读，不得改动）。

## 重做约定

如需返工，由新 attempt / 新会话登记新目录或新轮次，不能悄悄改变已冻结字节；若 integrator 已聚合，则在新窗口重新准备。
