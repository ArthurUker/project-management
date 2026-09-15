-- RF02 幂等访问边界：持久化作用域回执
--
-- 变更性质：Additive（仅新增枚举与表，不改动任何既有列/约束），可回退（DROP TABLE 即可）。
-- 语义：回执绑定 actor + command + resourceScope + idempotencyKey，并记录请求 payloadHash；
--       与业务数据、关键审计在同一事务提交，失败整体回滚。

-- CreateEnum
CREATE TYPE "MutationReceiptStatus" AS ENUM ('COMPLETED');

-- CreateTable
CREATE TABLE "mutation_receipts" (
    "id" TEXT NOT NULL,
    "actor_id" TEXT NOT NULL,
    "command" VARCHAR(120) NOT NULL,
    "resource_scope" VARCHAR(200) NOT NULL,
    "idempotency_key" VARCHAR(200) NOT NULL,
    "payload_hash" CHAR(64) NOT NULL,
    "status" "MutationReceiptStatus" NOT NULL DEFAULT 'COMPLETED',
    "response_status" INTEGER NOT NULL,
    "response_body" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(3),

    CONSTRAINT "mutation_receipts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "mutation_receipts_expires_at_idx" ON "mutation_receipts"("expires_at");

-- CreateIndex
CREATE INDEX "mutation_receipts_actor_id_created_at_idx" ON "mutation_receipts"("actor_id", "created_at");

-- CreateIndex（幂等作用域唯一键：并发同键只有一个事务能写入）
CREATE UNIQUE INDEX "mutation_receipts_scope_key" ON "mutation_receipts"("actor_id", "command", "resource_scope", "idempotency_key");

-- AddForeignKey
ALTER TABLE "mutation_receipts" ADD CONSTRAINT "mutation_receipts_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
