import type { ID, Timestamps } from './common';

/** 文件元数据。二进制永不入库，只存 storageKey */
export interface FileObject extends Timestamps {
  id: ID;
  /** 服务端生成的存储键，前端不可拼接路径 */
  storageKey: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  checksum: string;
  ownerId: ID;
  resourceType: string | null;
  resourceId: ID | null;
  deletedAt: string | null;
}

/** 业务实体与文件的关联 */
export interface Attachment extends Timestamps {
  id: ID;
  fileObjectId: ID;
  file?: FileObject;
  resourceType: string;
  resourceId: ID;
  displayName?: string | null;
  sortOrder?: number;
}
