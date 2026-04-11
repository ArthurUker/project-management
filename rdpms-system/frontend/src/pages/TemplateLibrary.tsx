import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { projectTemplatesAPI, projectAPI } from '../api/client';
import ProcessFlowDiagram from '../components/ProcessFlowDiagram';

export default function TemplateLibrary() {
  const navigate = useNavigate();
  const [list, setList] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<any>(null);

  useEffect(() => { fetchList(); }, []);

  async function fetchList() {
    setLoading(true);
    try {
      const res = await projectTemplatesAPI.list({ page: 1, pageSize: 200 });
      setList((res as any).list || res as any || []);
    } catch (e) {
      console.error(e);
    } finally { setLoading(false); }
  }

  function grouped() {
    const map: Record<string, any[]> = {};
    for (const t of list) {
      const cat = t.category || '未分类';
      map[cat] = map[cat] || [];
      map[cat].push(t);
    }
    return map;
  }

  function parseContent(t: any) {
    if (!t.content) return {};
    try {
      return typeof t.content === 'string' ? JSON.parse(t.content) : t.content;
    } catch {
      return {};
    }
  }

  async function applyTemplate(t: any) {
    try {
      const resp = await projectTemplatesAPI.apply(t.id, {});
      const payload = (resp as any).payload;

      // 生成默认代码和名称
      const projectCode = `PRJ-${Date.now()}`;
      const projectName = `${t.name} 项目`;

      // 直接创建项目
      const newProject = await projectAPI.create({
        code: projectCode,
        name: projectName,
        type: t.category || 'template',
        position: t.description || '',
        managerId: localStorage.getItem('rdpms_userId') || '',
        startDate: new Date().toISOString(),
        tasks: payload.tasks || [],
        milestones: payload.milestones || []
      });

      alert('项目创建成功！');
      navigate(`/projects/${newProject.id}`);
    } catch (e) {
      console.error(e);
      alert('应用模版失败');
    }
  }

  async function createChild(parent: any) {
    const code = window.prompt('请输入子模版 code (例如 TPL-REAGENT-CHILD):');
    if (!code) return;
    const name = window.prompt('请输入子模版名称：', parent.name + ' 子模版');
    if (!name) return;
    try {
      const data = {
        code,
        name,
        description: (parent.description || '') + '（子模版，来自 ' + parent.code + '）',
        category: parent.category,
        parentId: parent.id,
        content: parent.content
      };
      await projectTemplatesAPI.create(data);
      alert('子模版创建成功');
      fetchList();
    } catch (err) {
      console.error(err);
      alert('创建子模版失败');
    }
  }

  const isMaster = selected && selected.isMaster;

  return (
    <div style={{ padding: 16 }}>
      <h2>📚 项目模版库</h2>
      {loading && <div>加载中...</div>}
      <div style={{ display: 'flex', gap: 24 }}>
        <div style={{ width: 280, maxHeight: '80vh', overflow: 'auto' }}>
          {Object.entries(grouped()).map(([cat, items]) => (
            <div key={cat} style={{ marginBottom: 16 }}>
              <h4 style={{ marginBottom: 8, color: '#333', fontWeight: 600 }}>{cat}</h4>
              <div style={{ paddingLeft: 12, borderLeft: '3px solid #ddd' }}>
                {items.map(i => (
                  <div
                    key={i.id}
                    style={{
                      cursor: 'pointer',
                      padding: '8px 8px',
                      background: selected?.id === i.id ? '#e0e7ff' : 'transparent',
                      borderRadius: 4,
                      marginBottom: 6,
                      border: selected?.id === i.id ? '2px solid #4f46e5' : '1px solid transparent',
                      fontSize: 13
                    }}
                    onClick={() => setSelected(i)}
                  >
                    <div>{i.isMaster ? '🔬' : '📋'} {i.name}</div>
                    <div style={{ fontSize: 11, color: '#666', marginTop: 2 }}>({i.code})</div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div style={{ flex: 1, maxHeight: '80vh', overflow: 'auto' }}>
          {selected ? (
            <div>
              <div style={{ borderBottom: '2px solid #eee', paddingBottom: 12, marginBottom: 16 }}>
                <h3 style={{ margin: '0 0 8px 0' }}>{selected.name}</h3>
                <p style={{ margin: '0 0 8px 0', color: '#666', fontSize: 13 }}>{selected.description}</p>
                <div style={{ fontSize: 12, color: '#999' }}>
                  编码：{selected.code} | 创建者：admin | {selected.isMaster ? '母版' : '子模版'}
                </div>
              </div>

              {(() => {
                const content = parseContent(selected);
                const phases = content.phases || [];
                return (
                  <div style={{ marginBottom: 20 }}>
                    <h4 style={{ marginBottom: 12 }}>📋 阶段流程</h4>
                    <ProcessFlowDiagram
                      phases={phases}
                      editable={false}
                    />
                  </div>
                );
              })()}

              {(() => {
                const content = parseContent(selected);
                const milestones = content.milestones || [];
                return (
                  milestones.length > 0 && (
                    <div style={{ marginBottom: 20 }}>
                      <h4 style={{ marginBottom: 12 }}>🎯 里程碑</h4>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                        {milestones.map((m: any, idx: number) => (
                          <div
                            key={idx}
                            style={{
                              background: '#f0f4ff',
                              border: '1px solid #c7d2fe',
                              borderRadius: 4,
                              padding: '6px 12px',
                              fontSize: 12
                            }}
                          >
                            ✓ {m.name}
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                );
              })()}

              <div style={{ display: 'flex', gap: 8, paddingTop: 12, borderTop: '1px solid #eee' }}>
                <button
                  onClick={() => applyTemplate(selected)}
                  style={{
                    padding: '8px 16px',
                    background: '#4f46e5',
                    color: '#fff',
                    border: 'none',
                    borderRadius: 4,
                    cursor: 'pointer',
                    fontSize: 13
                  }}
                >
                  📌 应用模版创建项目
                </button>
                <button
                  onClick={() => navigate(`/project-templates/${selected.id}/edit`)}
                  style={{
                    padding: '8px 16px',
                    background: '#f59e0b',
                    color: '#fff',
                    border: 'none',
                    borderRadius: 4,
                    cursor: 'pointer',
                    fontSize: 13
                  }}
                >
                  ✏️ 编辑模版
                </button>
                {isMaster && (
                  <button
                    onClick={() => createChild(selected)}
                    style={{
                      padding: '8px 16px',
                      background: '#10b981',
                      color: '#fff',
                      border: 'none',
                      borderRadius: 4,
                      cursor: 'pointer',
                      fontSize: 13
                    }}
                  >
                    🔀 派生子模版
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div style={{ color: '#999', textAlign: 'center', paddingTop: 40 }}>
              👈 请选择一个模版查看详情
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
