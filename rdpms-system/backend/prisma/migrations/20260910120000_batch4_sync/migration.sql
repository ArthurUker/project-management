-- 批次四：离线同步 v2（设备登记 + 上行幂等键）
-- 说明：业务数据增量由各业务表 updated_at / deleted_at 派生，不建影子表。

-- CreateTable
CREATE TABLE "sync_devices" (
    "id" VARCHAR(64) NOT NULL,
    "user_id" TEXT NOT NULL,
    "label" VARCHAR(128),
    "platform" VARCHAR(64),
    "last_sync_at" TIMESTAMPTZ(3),
    "last_push_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "sync_devices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sync_mutations" (
    "id" TEXT NOT NULL,
    "client_mutation_id" VARCHAR(64) NOT NULL,
    "device_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "entity" VARCHAR(64) NOT NULL,
    "entity_id" TEXT NOT NULL,
    "op" VARCHAR(16) NOT NULL,
    "status" VARCHAR(24) NOT NULL,
    "result" JSONB,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sync_mutations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "sync_devices_user_id_last_sync_at_idx" ON "sync_devices"("user_id", "last_sync_at");

-- CreateIndex
CREATE UNIQUE INDEX "sync_mutations_client_mutation_id_key" ON "sync_mutations"("client_mutation_id");

-- CreateIndex
CREATE INDEX "sync_mutations_device_id_created_at_idx" ON "sync_mutations"("device_id", "created_at");

-- CreateIndex
CREATE INDEX "sync_mutations_user_id_created_at_idx" ON "sync_mutations"("user_id", "created_at");

-- AddForeignKey
ALTER TABLE "sync_devices" ADD CONSTRAINT "sync_devices_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sync_mutations" ADD CONSTRAINT "sync_mutations_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "sync_devices"("id") ON DELETE CASCADE ON UPDATE CASCADE;
