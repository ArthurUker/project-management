# 窗口B：LR7-02路径合同订正

先读COMMON_RULES和清单。唯一可写：`S/window-b-paths/`。不等待A，不读取A～F正在变化的产物。

## 任务与读序

仅处理冻结旧交付的路径合同和严格解析器，不做batch最终封存/根history追加。
读取O/evidence/payload-manifest.json、final-integrity.json、make-post-seal-readback.py，根history最新entry（只读）和R/evidence/seal-readback.json、record-append-check.json。

## 固定实现

1. 在自己的目录编写strict resolver：按声明base直接拼接relative path，检查存在、目录边界及完整SHA256；不根据前缀猜base、不静默fallback。
2. 交付corrections-map.json/corrected-frozen-payload.json：把旧519个会话文件的PLAN相对键明确改为PLAN基准，或改成真正SESSION相对键；引用旧文件，不复制519份。
3. runner/control/seal及两个旧history entry中的同类路径也列明确订正映射，引用旧entry下标/唯一ID/规范化hash。只写新映射，不改旧entry、旧manifest或旧读回。
4. 旧manifest四个受控根记录属于会变化的记录，不能在并行输出中声称是汇总后的最终hash。可将当前四记录复制到自己的historical-record-snapshots并核对与旧seal记录hash一致，再用明确snapshot引用和START_OF_THIS_BATCH_SNAPSHOT_MATCHING_OLD_SEAL层次；汇总后的四记录由唯一汇总者另封存。禁止把历史摘要假称未来当前摘要。
5. 真实旧519文件、四个repository引用与需要的历史快照均严格解析/逐文件读回；新映射给清晰source/correctedRef/pathBase/relativePath/SHA256，不制造循环history摘要。

## 验证

自己的新目录允许合成文件控制：合法base/路径/hash通过；错误base、缺文件、错误hash、路径越界明确失败。旧错误合同须被严格拒绝，订正后的全部引用通过。
这是文件/元数据验证，不是DB/业务验收。不启动build、DB或正式套件。

## 交付/停止

交付严格resolver、订正映射、逐文件读回、合成控制、共同七类及WORKER_MANIFEST/READY。说明本窗口只封存自己的结果，不封存A的runner、不更新共享state/handoff/history。
A～F冻结后由汇总者构建batch总manifest与唯一订正entry；你不得提前完成该步骤。
