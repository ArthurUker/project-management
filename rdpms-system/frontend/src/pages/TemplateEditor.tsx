import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { projectTemplatesAPI } from '../api/client';
import FlowEditor, { type FlowNode } from '../components/FlowEditor';

export default function TemplateEditor() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [template, setTemplate] = useState<any>(null);
  const [nodes, setNodes] = useState<FlowNode[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (id) fetchTemplate();
  }, [id]);

  async function fetchTemplate() {
    setLoading(true);
    try {
      const res = await projectTemplatesAPI.get(id!);
      setTemplate(res);
      
      // 解析content中的phases为nodes
      let content: any = {};
      if (res.content) {
        try {
          content =
            typeof res.content === 'string'
              ? JSON.parse(res.content)
              : res.content;
        } catch (e) {
          // ignore parse error
        }
      }

      const phases = content.phases || [];
      const flowNodes: FlowNode[] = phases.map((p: any) => ({
        id: `phase-${p.order}`,
        order: p.order,
        name: p.name,
        desc: p.desc,
        type: 'phase' as const,
        tasks: p.tasks || [],
      }));

      setNodes(flowNodes);
    } catch (e) {
      console.error(e);
      alert('加载模版失败');
    } finally {
      setLoading(false);
    }
  }

  async function saveTemplate() {
    if (!template) return;

    // 将nodes转换回phases
    const phases = nodes.map((node) => ({
      order: node.order,
      name: node.name,
      desc: node.desc,
      source: 'inherit',
      disabled: false,
      tasks: node.tasks || [],
    }));

    const updatedContent = {
      phases,
      milestones: (() => {
        try {
          const content =
            typeof template.content === 'string'
              ? JSON.parse(template.content)
              : template.content;
          return content.milestones || [];
        } catch {
          return [];
        }
      })(),
    };

    setSaving(true);
    try {
      await projectTemplatesAPI.update(template.id, {
        content: JSON.stringify(updatedContent),
      });
      alert('模版已保存！');
      navigate('/project-templates');
    } catch (e) {
      console.error(e);
      alert('保存失败');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div style={{ padding: '40px', textAlign: 'center' }}>加载中...</div>;
  }

  if (!template) {
    return <div style={{ padding: '40px', textAlign: 'center' }}>模版不存在</div>;
  }

  return (
    <div className="template-editor-page">
      <div className="editor-header">
        <div>
          <h2>{template.name}</h2>
          <p style={{ color: '#666', fontSize: 13, marginTop: 4 }}>
            {template.description}
          </p>
        </div>
        <div className="header-actions">
          <button
            onClick={() => navigate('/project-templates')}
            className="btn btn-secondary"
          >
            取消
          </button>
          <button
            onClick={saveTemplate}
            disabled={saving}
            className="btn btn-primary"
          >
            {saving ? '保存中...' : '保存模版'}
          </button>
        </div>
      </div>

      <div className="editor-content">
        <div className="editor-main">
          <h3>📊 流程编辑</h3>
          <FlowEditor
            nodes={nodes}
            editable={true}
            onNodesChange={setNodes}
          />
        </div>

        <div className="editor-sidebar">
          <h4>💡 编辑提示</h4>
          <ul>
            <li>点击"+ 添加节点"添加新阶段</li>
            <li>拖拽节点可重新排序</li>
            <li>点击节点右上角 ✕ 删除节点</li>
            <li>修改节点名称和描述</li>
            <li>选择节点类型（阶段/判断/开始/结束）</li>
            <li>点击"保存模版"保存所有更改</li>
          </ul>

          <div className="stats">
            <div className="stat-item">
              <span className="stat-label">总阶段数</span>
              <span className="stat-value">{nodes.length}</span>
            </div>
            <div className="stat-item">
              <span className="stat-label">总任务数</span>
              <span className="stat-value">
                {nodes.reduce((sum, n) => sum + (n.tasks?.length || 0), 0)}
              </span>
            </div>
          </div>

          <div className="template-info">
            <p style={{ fontSize: 12, color: '#666' }}>
              <strong>模版编码：</strong> {template.code}
            </p>
            <p style={{ fontSize: 12, color: '#666', marginTop: 8 }}>
              <strong>创建者：</strong> {template.creator?.name}
            </p>
            <p style={{ fontSize: 12, color: '#666', marginTop: 8 }}>
              <strong>类型：</strong> {template.isMaster ? '母版' : '子模版'}
            </p>
          </div>
        </div>
      </div>

      {/* @ts-ignore */}
      <style jsx>{`
        .template-editor-page {
          height: 100vh;
          display: flex;
          flex-direction: column;
          background: #f5f5f5;
        }

        .editor-header {
          background: white;
          padding: 20px;
          border-bottom: 1px solid #e0e0e0;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .editor-header h2 {
          margin: 0;
          font-size: 24px;
          color: #333;
        }

        .header-actions {
          display: flex;
          gap: 12px;
        }

        .editor-content {
          display: flex;
          flex: 1;
          overflow: hidden;
        }

        .editor-main {
          flex: 1;
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }

        .editor-main h3 {
          padding: 16px 20px;
          margin: 0;
          background: white;
          border-bottom: 1px solid #e0e0e0;
          font-size: 16px;
        }

        .editor-sidebar {
          width: 280px;
          background: white;
          border-left: 1px solid #e0e0e0;
          padding: 20px;
          overflow-y: auto;
        }

        .editor-sidebar h4 {
          margin: 0 0 12px 0;
          font-size: 14px;
          color: #333;
        }

        .editor-sidebar ul {
          padding-left: 20px;
          margin: 0;
          font-size: 12px;
          color: #666;
          line-height: 1.8;
        }

        .editor-sidebar li {
          margin-bottom: 6px;
        }

        .stats {
          margin-top: 20px;
          padding-top: 12px;
          border-top: 1px solid #e0e0e0;
        }

        .stat-item {
          display: flex;
          justify-content: space-between;
          margin-bottom: 8px;
          font-size: 13px;
        }

        .stat-label {
          color: #666;
        }

        .stat-value {
          font-weight: bold;
          color: #1976d2;
        }

        .template-info {
          margin-top: 20px;
          padding-top: 12px;
          border-top: 1px solid #e0e0e0;
        }

        .btn {
          padding: 8px 16px;
          border: none;
          border-radius: 4px;
          cursor: pointer;
          font-size: 13px;
          font-weight: 500;
          transition: all 0.2s;
        }

        .btn-primary {
          background: #1976d2;
          color: white;
        }

        .btn-primary:hover:not(:disabled) {
          background: #1565c0;
        }

        .btn-primary:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .btn-secondary {
          background: #e0e0e0;
          color: #333;
        }

        .btn-secondary:hover {
          background: #d0d0d0;
        }
      `}</style>
    </div>
  );
}
