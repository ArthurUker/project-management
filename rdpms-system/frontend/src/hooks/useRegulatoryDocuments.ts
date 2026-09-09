import { useEffect, useState } from 'react';
import { regulatoryDocumentsAPI } from '@/api';
import type { RegulatoryDocument } from '../types/regulatory';

interface UseRegulatoryDocumentsParams {
  applicability?: string;
  priorityLevel?: string;
}

export function useRegulatoryDocuments(params?: UseRegulatoryDocumentsParams) {
  const [documents, setDocuments] = useState<RegulatoryDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    // A-7①（Tencent 审查修复意图，enh 重实现）：卸载/参数变化后丢弃过期响应，
    // 防止竞态覆盖新数据与卸载后 setState
    let active = true;

    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await regulatoryDocumentsAPI.list(params);
        if (!active) return;
        const list = (res as any).items || (res as any).data?.items || [];
        setDocuments(Array.isArray(list) ? (list as RegulatoryDocument[]) : []);
      } catch (e: any) {
        if (!active) return;
        setError(e?.error || e?.message || '加载法规文件失败');
        setDocuments([]);
      } finally {
        if (active) setLoading(false);
      }
    };

    load();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params?.applicability, params?.priorityLevel, reloadToken]);

  return {
    documents,
    loading,
    error,
    refetch: () => setReloadToken((n) => n + 1),
  };
}
