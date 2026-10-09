# 部署文档核对与清理

日期：2026-10-09。基线：289d340；本轮只改文档和移除历史资料，不实施业务/部署修复，不访问服务器，不运行测试或构建，不提交/推送。

## 已确认的新形态

f8ccb06 引入 /opt/rdpms/app 原地发布、rdpms-api.service 和 dist-only 启动；旧 current/releases/manifest 不再属于当前启动要求。
README §8 基本对应现行代码，但文档自述的服务器路径、Caddy、实际耗时和运行状态未在本轮远程核验。

## 源码可确认的问题与文档修正

| 优先级 | 项目 | 证据位置 | 影响/处理 |
|---|---|---|---|
| P1 | 回退命令实际再次合入 main | rdpms-deploy.sh:56-60 / README §8.4、§12.3 | checkout 旧提交后重跑脚本不能保持指定旧版本；撤下误导命令，登记专项回退方案待办 |
| P1 | 没有自动备份、停写和失败恢复 | rdpms-deploy.sh:89-107 | migration 先于构建、依赖与产物原地变化；删除“发布流程自动调备份”描述，不声称 additive 即兼容 |
| P2 | 健康验收只检查 active | rdpms-deploy.sh:103-107 | systemd active 不能证明业务请求/UI正常；明确未做 HTTP health/ready/构建身份检查 |
| P2 | 测试补丁尚未进入正式文件 | frontend/tests/unit/offlineAccountSwitch.test.ts:64-65 | 正式文件仍使用失效全局 idb API；服务器 60/64 仅是候选副本结果 |
| P2 | 安装条件不能处理缺依赖/失败重试 | rdpms-deploy.sh:68-87 | lockfile 未变就跳过；取码后安装失败再跑也可能跳过；记录待办，未改脚本 |
| P2 | 旧工具“死代码”说法不准确 | backend/tests/integration/rp17*/rp18*/rp19* | 仍调用 candidate/deploy-control/backup-pair/drill，保留工具，需另做测试范围迁移 |

## 清理内容

移除旧 audits、remediation、pm-audit、port/evidence、publication 和作废审阅/部署材料。
原文件先归档，再对 tar 内所有文件逐一 SHA256 读回验证，成功后才删除工作树原件。
10,891 文件（包含原有未跟踪/被忽略证据），379,758,369 字节；归档 39,257,939 字节。
完整清单及哈希保存在本地 archive/FILES.json，概要见 cleanup-manifest.json。
Git 已跟踪的旧资料仍可从 289d340 及此前提交恢复；未跟踪证据依赖本地归档，不是异地备份。

保留 RBAC 合同、迁移 SQL 引用的 baseline、自有测试补丁与报告、枚举来源及法规业务文档。
当前未闭环事项继续登记，不因删除旧审阅报告而关闭原发现或宣布发布通过。

## 核对限制

未读取生产 dotenv/SSH 凭据，未运行构建/测试/DB/服务/网络命令。
文档引用核对与归档哈希验证不等于业务验收。服务器的真实安装文件、备份脚本和生产状态需后续具备相应范围时核对。

## 本轮收尾检查

README 与剩余 docs Markdown 的相对链接目标检查：0 缺失（不包括外网链接与标题 anchor）。
git diff --check 通过；跟踪改动仅限 README/docs，业务源码、正式测试、迁移、部署脚本均未改变。
删除 3,202 个 Git 跟踪历史文件；另有原本被忽略/未跟踪的历史文件一并校验归档并清理。
本轮没有 stage、commit 或 push。
