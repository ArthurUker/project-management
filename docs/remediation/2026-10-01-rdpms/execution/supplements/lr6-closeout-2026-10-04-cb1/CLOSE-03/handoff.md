# CLOSE-03 交接（待独立审阅）

- 唯一新 version/revision ID（含 sessionId）已追加，correctsRef 精确指向旧重复 ID 条目（下标 + 旧 ID + 规范化 SHA256）。
- payload-manifest / final-integrity / post-seal-readback 三层封存互不含自身或两份 history 的最终 hash（无循环）。
- 逐文件读回：required payload 与已封存摘要一致，无占位符；旧 entry 前缀/内容保持。
- 未改旧文件、未回写旧 entry；原 54/306 轴与门禁不变。
