import { useEffect, useState } from 'react';
import { projectTemplatesAPI } from '../api/client';
import { useAppStore } from '../store/appStore';

export default function ProjectTemplates() {
  const { user } = useAppStore();
  const [templates, setTemplates] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadTemplates();
  }, []);

  const loadTemplates = async () => {
    setLoading(true);
    try {
      const res = await projectTemplatesAPI.list({ pageSize: 100 });
      setTemplates((res as any).list || []);
    } catch (err) {
      console.error('Load templates failed:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async () => {
    const name = prompt('请输入模版名称');
    if (!name) return;
    try {
      await projectTemplatesAPI.create({ name, description: '', content: '{}' });
      loadTemplates();
    } catch (err) {
      alert('创建失败');
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold">项目研发模版</h1>
        {user?.role === 'admin' && (
          <button onClick={handleCreate} className="btn btn-primary">新建模版</button>
        )}
      </div>

      {loading ? (
        <div className="card p-6">加载中...</div>
      ) : templates.length === 0 ? (
        <div className="card p-6">暂无模版</div>
      ) : (
        <div className="grid grid-cols-3 gap-4">
          {templates.map(t => (
            <div key={t.id} className="card p-4">
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="font-semibold text-lg">{t.name}</h3>
                  <p className="text-sm text-gray-500">{t.description}</p>
                </div>
                <div className="text-xs text-gray-400">{new Date(t.createdAt).toLocaleDateString()}</div>
              </div>
              <div className="mt-3 text-sm text-gray-600">
                <pre className="text-xs max-h-36 overflow-auto">{t.content}</pre>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
