# CLOSE-03 回滚说明（人工撤销，不执行）

- 本轮新增的封存文件（payload-manifest / final-integrity / post-seal-readback）与其生成脚本可整体删除。
- 两份 registry 中本轮**新增**的 entry 可删除，旧 entry 一律保持原样（不得回写旧条目“让它通过”）。
- 其余四个受控记录文件中本轮追加的 continuation/末节可删除。
- 不涉及业务源码；不执行 git 回退；不覆盖未知旧差异。
