import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { projectTemplatesAPI, projectAPI } from '../api/client';

export default function TemplateLibrary() {
  const navigate = useNavigate();
  const [list, setList] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<any>(null);
  const [expandedPhase, setExpandedPhase] = useState<string | null>(null);
  const [showApplyForm, setShowApplyForm] = useState(false);
  const [applyPayload, setApplyPayload] = useState<any>(null);
  const [formData, setFormData] = useState<any>({});

  useEffect(() => { fetchList(); }, []);

  async function fetchList() {
    setLoading(true);
    try {
      const res = await projectTemplatesAPI.list({ page: 1, pageSize: 200 });
      setList(res.list || res || []);
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

  function getSourceIcon(source?: string, disabled?: boolean): string {
    if (disabled) return '✂️ 禁用';
    if (source === 'new') return '➕ 新增';
    return '🔒 继承';
  }

  async function applyTemplate(t: any) {
    try {
      const resp = await projectTemplatesAPI.apply(t.id, {});
      const payload = resp.payload;
      setApplyPayload(payload);
      setFormData({
        code: payload.code || `PRJ-${Date.now()}`,
        name: payload.name || t.name,
        type: payload.type || t.category || 'template',
        position: payload.position || t.description || ''
      });
      setShowApplyForm(true);
    } catch (e) {
      console.error(e);
      alert('应用模版失败');
    }
  }

  async function createProjectFromTemplate() {
    if (!formData.code || !formData.name) {
      alert('项目编码和名称不能为空');
      return;
    }
    try {
      const newProject = await projectAPI.create({
        code: formData.code,
        name: formData.name,
        type: formData.type,
        position: formData.position,
        managerId: localStorage.getItem('rdpms_userId') || '', // 使用当前用户
        startDate: new Date().toISOString(),
        tasks: applyPayload.tasks || [],
        milestones: applyPayload.milestones || []
      });
      alert('项目创建成功！');
      setShowApplyForm(false);
      navigate(`/projects/${newProject.id}`);
    } catch (err) {
      console.error(err);
      alert('创建项目失败');
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
      const res = await projectTemplatesAPI.create(data);
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
                    {phases.length === 0 ? (
                      <div style={{ color: '#999', fontSize: 13 }}>未定义阶段</div>
                    ) : (
                      <div style={{ display: 'grid', gap: 8 }}>
                        {phases.map((phase: any) => (
                          <div
                            key={phase.key}
                            style={{
                              border: '1px solid #e0e0e0',
                              borderRadius: 6,
                              padding: 12,
                              background: phase.disabled ? '#f5f5f5' : '#fafafa',
                              opacity: phase.disabled ? 0.7 : 1
                            }}
                          >
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <div style={{ flex: 1 }}>
                                <div style={{ fontWeight: 600, fontSize: 14 }}>
                                  {phase.order}. {phase.name}
                                </div>
                                {phase.desc && (
                                  <div style={{ fontSize: 12, color: '#666', marginTop: 4 }}>
                                    {phase.desc}
                                  </div>
                                )}
                              </div>
                              <div style={{ fontSize: 12, color: '#4f46e5', fontWeight: 500, minWidth: 60, textAlign: 'right' }}>
                                {getSourceIcon(phase.source, phase.disabled)}
                              </div>
                            </div>

                            {phase.tasks && phase.tasks.length > 0 && (
                              <div
                                style={{
                                  marginTop: 8,
                                  paddingTop: 8,
                                  borderTop: '1px solid #e0e0e0',
                                  fontSize: 12,
                                  color: '#666'
                                }}
                              >
                                {phase.tasks.map((task: any, idx: number) => (
                                  <div key={idx} style={{ margin: '4px 0', paddingLeft: 12 }}>
                                    • {task.title}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
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
