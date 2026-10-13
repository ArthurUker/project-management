/**
 * 部署产物一致性 —— 防止「原地部署」改造漏改类事故复发（2026-10-12 补）
 *
 * 为什么放在 backend 单测里：仓库没有独立的 deploy 测试入口，`npm run test:unit`
 * 是唯一会被例行执行的检查；本文件只读 `rdpms-system/deploy/` 下的文本文件，
 * 不连库、不起 HTTP、不读宿主环境（不碰 /etc、/usr/local/bin），因此在本机与 CI 都成立。
 *
 * 背景（真实事故，2026-10-12 清理）：2026-10-08 的原地部署改造把旧布局
 * `/opt/rdpms/current`、`releases/<ts>` 整体删除，但这批文件没跟着改：
 *   - caddy 站点片段静态根失效（仓库副本；线上副本已同步）
 *   - `init-postgres.sh` 的 `MIG_DIR` 恒不存在 → gen_random_uuid 检测静默“未命中”，
 *     并打印“符合裁定”
 *   - staging 单元 WorkingDirectory 不存在、ExecStart 指向已被 TypeScript 取代的
 *     `src/index.js`（build 产物入口应为 `dist/index.js`）
 *   - 同一文件在 `deploy/` 与 `deploy/systemd/` 各有一份副本，只改一处即漂移
 * 本文件把这些教训固化为断言：旧路径不得复活、成对副本不得漂移。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

// tests/unit/ → tests/ → backend/ → rdpms-system/ → deploy/
const DEPLOY = path.resolve(import.meta.dirname, '../../../deploy');
const APP_ROOT = '/opt/rdpms/app';
const LEGACY_ROOT = '/opt/rdpms/current';

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'dist') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

const files = walk(DEPLOY).map((f) => ({ rel: path.relative(DEPLOY, f), text: fs.readFileSync(f, 'utf8') }));

test('deploy/ 下不得再出现已删除的旧布局路径', () => {
  const hits = files.filter((x) => x.text.includes(LEGACY_ROOT)).map((x) => x.rel);
  assert.deepEqual(hits, [], `以下文件仍指向已删除的 ${LEGACY_ROOT}：${hits.join(', ')}`);
});

test('成对副本逐字节一致：deploy/rdpms-api.service 与 deploy/systemd/rdpms-api.service', () => {
  const authority = fs.readFileSync(path.join(DEPLOY, 'rdpms-api.service'), 'utf8');
  const copy = fs.readFileSync(path.join(DEPLOY, 'systemd/rdpms-api.service'), 'utf8');
  assert.equal(copy, authority, '两份 api 单元已漂移：权威副本是 deploy/rdpms-api.service，安装以它为准');
});

test('caddy 站点片段的静态根为原地部署路径', () => {
  const text = fs.readFileSync(path.join(DEPLOY, 'caddy/rdpms.caddy'), 'utf8');
  assert.ok(
    text.includes(`root * ${APP_ROOT}/rdpms-system/frontend/dist`),
    `静态根应为 ${APP_ROOT}/rdpms-system/frontend/dist`,
  );
});

test('api 单元的运行目录与启动入口为原地部署口径', () => {
  const text = fs.readFileSync(path.join(DEPLOY, 'rdpms-api.service'), 'utf8');
  assert.ok(text.includes(`WorkingDirectory=${APP_ROOT}/rdpms-system/backend`), 'WorkingDirectory 必须指向原地部署目录');
  assert.ok(text.includes('ExecStart=/usr/local/bin/rdpms-start.sh'), '启动入口应为 dist-only 的 rdpms-start.sh');
});

test('运维脚本的默认路径不得回退到旧布局', () => {
  const expectations = [
    ['scripts/init-postgres.sh', 'MIG_DIR'],
    ['scripts/rdpms-env', 'APP_DIR'],
    ['scripts/rdpms-start.sh', 'APP_DIR'],
    ['scripts/rdpms-deploy.sh', 'APP'],
  ];
  for (const [rel, varName] of expectations) {
    const line = fs
      .readFileSync(path.join(DEPLOY, rel), 'utf8')
      .split('\n')
      .find((l) => l.startsWith(`${varName}=`));
    assert.ok(line, `${rel} 未找到 ${varName}= 默认值定义`);
    assert.ok(line.includes(APP_ROOT), `${rel} 的 ${varName} 默认值未指向 ${APP_ROOT}：${line}`);
  }
});
