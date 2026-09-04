import { http } from './http';
import { MAX_UPLOAD_MB } from '../config/env';
import { ApiError, ERR } from './error';
import { del, get, post } from './request';
import type { ErrorResponse } from './types';
import type { FileObject } from '../types/file';

/**
 * files.ts — 统一文件上传 / 下载
 *
 * 规则：
 *   1. 一律 multipart/form-data，禁止 base64-in-JSON
 *   2. 字段名固定为 file
 *   3. 下载走 blob + Authorization 请求头，禁止 window.open 鉴权 URL
 *   4. 前端大小校验只是友好提示，真实边界在后端与 Nginx
 */

export interface UploadOptions {
  resourceType: string;
  resourceId?: string;
  onProgress?: (percent: number) => void;
  signal?: AbortSignal;
}

export async function uploadFile(file: File, opts: UploadOptions): Promise<FileObject> {
  const maxBytes = MAX_UPLOAD_MB * 1024 * 1024;
  if (file.size > maxBytes) {
    throw new ApiError(413, {
      code: ERR.PAYLOAD_TOO_LARGE,
      message: `文件不能超过 ${MAX_UPLOAD_MB}MB`,
    });
  }

  const form = new FormData();
  form.append('file', file);
  form.append('resourceType', opts.resourceType);
  if (opts.resourceId) form.append('resourceId', opts.resourceId);

  return post<FileObject>('/files', form, {
    signal: opts.signal,
    // Content-Type 交给浏览器自动带 boundary
    headers: { 'Content-Type': 'multipart/form-data' },
    onUploadProgress: (e: { loaded: number; total?: number }) => {
      if (!opts.onProgress || !e.total) return;
      opts.onProgress(Math.round((e.loaded * 100) / e.total));
    },
  } as never);
}

/** 下载为 blob 并触发浏览器保存。全程带 Authorization，不透出 URL */
export async function downloadFile(
  id: string,
  fileName: string,
  opts?: { signal?: AbortSignal },
): Promise<void> {
  const res = await http.get(`/files/${id}`, {
    responseType: 'blob',
    signal: opts?.signal,
  } as never);

  const contentType = String(res.headers?.['content-type'] ?? '');

  // 后端即便在 blob 响应下也可能返回 JSON 错误体，需要嗅探
  if (contentType.includes('application/json')) {
    const text = await (res.data as Blob).text();
    let body: ErrorResponse | undefined;
    try {
      body = JSON.parse(text) as ErrorResponse;
    } catch {
      /* 非 JSON，按成功处理 */
    }
    if (body?.success === false) {
      throw new ApiError(res.status, body.error);
    }
  }

  const url = URL.createObjectURL(res.data as Blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** 需要内联预览时用（如 <img src>），用完必须 revoke */
export async function getFileBlobUrl(id: string): Promise<string> {
  const res = await http.get(`/files/${id}`, { responseType: 'blob' } as never);
  return URL.createObjectURL(res.data as Blob);
}

export const fileAPI = {
  metadata: (id: string) => get<FileObject>(`/files/${id}/metadata`),
  remove: (id: string) => del<{ id: string }>(`/files/${id}`),
  restore: (id: string) => post<FileObject>(`/files/${id}/restore`),
  upload: uploadFile,
  download: downloadFile,
};
