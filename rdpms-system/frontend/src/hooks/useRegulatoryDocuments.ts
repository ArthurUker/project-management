import { useEffect, useState } from 'react';
import { regulatoryDocumentsAPI } from '../api/client';
import type { RegulatoryDocument } from '../types/regulatory';

interface UseRegulatoryDocumentsParams {
  applicability?: string;
  priorityLevel?: string;
}

export function useRegulatoryDocuments(params?: UseRegulatoryDocumentsParams) {
  const [documents, setDocuments] = useState<RegulatoryDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchDocuments = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await regulatoryDocumentsAPI.list(params);
      const list = (res as any).list || (res as any).data?.list || [];
      setDocuments(Array.isArray(list) ? (list as RegulatoryDocument[]) : []);
    } catch (e: any) {
      setError(e?.error || e?.message || '加载法规文件失败');
      setDocuments([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDocuments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params?.applicability, params?.priorityLevel]);

  return {
    documents,
    loading,
    error,
    refetch: fetchDocuments,
  };
}
