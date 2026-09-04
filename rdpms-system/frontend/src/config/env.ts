/**
 * env.ts — 前端环境变量唯一入口
 *
 * 约定：
 *   - 所有 import.meta.env 的读取必须在本文件内，禁止散落页面
 *   - 生产环境只需 VITE_API_BASE_URL=/api（同域反代），无需填写域名
 */

function str(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.length > 0 ? value : fallback;
}

function int(value: unknown, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : fallback;
}

export const API_BASE_URL = str(
  import.meta.env.VITE_API_BASE_URL,
  '/api',
);

export const APP_NAME = str(import.meta.env.VITE_APP_NAME, '研发项目管理系统');

/** 仅用于上传前的前端友好提示，不是安全边界（真实限制由后端 MAX_UPLOAD_MB 与 Nginx 决定） */
export const MAX_UPLOAD_MB = int(import.meta.env.VITE_MAX_UPLOAD_MB, 50);

export const IS_DEV = import.meta.env.DEV;
