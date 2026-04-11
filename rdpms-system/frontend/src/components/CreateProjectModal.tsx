import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { projectAPI, projectTemplatesAPI, userAPI } from '../api/client';
import { useAppStore } from '../store/appStore';

const PROJECT_TYPES = ['platform', '定制', '合作', '测试', '应用'];
const CATEGORY_LABELS: Record<string, string> = {
  reagent_chip: '试剂/芯片开发',
  device: '设备开发',
};
const CATEGORY_COLORS: Record<string, string> = {
  reagent_chip: 'bg-blue-100 text-blue-700',
  device: 'bg-purple-100 text-purple-700',
};

interface Props {
  onClose: () => void;
}

export default function CreateProjectModal({ onClose }: Props) {
  const navigate = useNavigate();
  const { user } = useAppStore();
  const [step, setStep] = useState(1);

  // Step 1 form state
  const [name, setName] = useState('');
  const [type, setType] = useState('定制');
  const [subtype, setSubtype] = useState('');
  const [position, setPosition] = useState('');
  const [managerId, setManagerId] = useState(user?.id || '');
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [endDate, setEndDate] = useState('');
  const [users, setUsers] = useState<any[]>([]);

  // Step 2 state
  const [templates, setTemplates] = useState<any[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<any>(null); // null = blank
  const [blankSelected, setBlankSelected] = useState(false);
  const [tmplKeyword, setTmplKeyword] = useState('');
  const [tmplCategory, setTmplCategory] = useState('');
  const [loadingTemplates, setLoadingTemplates] = useState(false);

  const [creating, setCreating] = useState(false);

  useEffect(() => {
    userAPI.list({ pageSize: 200 }).then((res: any) => {
      setUsers(res.list || []);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (step === 2) loadTemplates();
  }, [step]);

  async function loadTemplates() {
    setLoadingTemplates(true);
    try {
      const params: any = { pageSize: 200, status: 'active' };
      if (tmplCategory) params.category = tmplCategory;
      const res = await projectTemplatesAPI.list(params);
      setTemplates((res as any).list || []);
    } catch { /* noop */ } finally {
      setLoadingTemplates(false);
    }
  }

  useEffect(() => {
    if (step === 2) loadTemplates();
  }, [tmplCategory]);

  function validateStep1() {
    if (!name.trim()) { alert('请输入项目名称'); return false; }
    if (!managerId) { alert('请选择项目负责人'); return false; }
    return true;
  }

  async function handleCreate() {
    if (!validateStep1()) return;
    if (step === 1) { setStep(2); return; }

    // Finalize either via template or blank
    setCreating(true);
    try {
      let payload: any = {
        name,
        type,
        subtype: subtype || undefined,
        position: position || undefined,
        managerId,
        startDate: startDate ? new Date(startDate).toISOString() : undefined,
        endDate: endDate ? new Date(endDate).toISOString() : undefined,
        tasks: [],
        milestones: [],
      };

      if (selectedTemplate && !blankSelected) {
        // Apply template to get tasks/milestones
        const applyRes = await projectTemplatesAPI.apply(selectedTemplate.id, {
          startDate: startDate ? new Date(startDate).toISOString() : new Date().toISOString(),
        });
        const applyData = (applyRes as any).payload;
        payload.templateId = selectedTemplate.id;
        payload.tasks = applyData.tasks || [];
        payload.milestones = applyData.milestones || [];
      }

      const newProject = await projectAPI.create(payload);
      navigate(`/projects/${(newProject as any).id}`);
    } catch (err: any) {
      alert(err?.error || '创建失败');
    } finally {
      setCreating(false);
    }
  }

  const filteredTemplates = tmplKeyword
    ? templates.filter(t => t.name.includes(tmplKeyword) || t.description?.includes(tmplKeyword))
    : templates;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">新建项目</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              第 {step}/2 步 · {step === 1 ? '填写基本信息' : '选择项目模版'}
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">✕</button>
        </div>

        {/* Step indicator */}
        <div className="px-6 py-3 border-b border-gray-50 flex items-center gap-3">
          {[1, 2].map(s => (
            <div key={s} className="flex items-center gap-2">
              {s > 1 && <div className="h-px w-8 bg-gray-200" />}
              <div className={`flex items-center gap-1.5 ${step >= s ? 'text-primary-600' : 'text-gray-400'}`}>
                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                  step > s ? 'bg-green-500 text-white' : step === s ? 'bg-primary-600 text-white' : 'bg-gray-200 text-gray-500'
                }`}>
                  {step > s ? '✓' : s}
                </div>
                <span className="text-xs font-medium">{s === 1 ? '基本信息' : '选择模版'}</span>
              </div>
            </div>
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          {step === 1 && (
            <div className="p-6 grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">项目名称 *</label>
                <input
                  className="input w-full"
                  placeholder="输入项目名称"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">项目类型</label>
                <select className="input w-full" value={type} onChange={e => setType(e.target.value)}>
                  {PROJECT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">子类型</label>
                <input
                  className="input w-full"
                  placeholder="如：2.0C / 海南大学"
                  value={subtype}
                  onChange={e => setSubtype(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">项目负责人 *</label>
                <select className="input w-full" value={managerId} onChange={e => setManagerId(e.target.value)}>
                  {users.map(u => <option key={u.id} value={u.id}>{u.name} ({u.position || u.role})</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">开始日期</label>
                <input
                  type="date"
                  className="input w-full"
                  value={startDate}
                  onChange={e => setStartDate(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">计划结束日期</label>
                <input
                  type="date"
                  className="input w-full"
                  value={endDate}
                  onChange={e => setEndDate(e.target.value)}
                />
              </div>
              <div className="col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">项目定位/描述</label>
                <textarea
                  className="input w-full resize-none"
                  rows={3}
                  placeholder="简述项目目标和背景"
                  value={position}
                  onChange={e => setPosition(e.target.value)}
                />
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="p-6">
              {/* Filter bar */}
              <div className="flex items-center gap-3 mb-4">
                <input
                  className="input flex-1"
                  placeholder="搜索模版..."
                  value={tmplKeyword}
                  onChange={e => setTmplKeyword(e.target.value)}
                />
                <select className="input w-44" value={tmplCategory} onChange={e => setTmplCategory(e.target.value)}>
                  <option value="">全部类别</option>
                  <option value="reagent_chip">试剂/芯片开发</option>
                  <option value="device">设备开发</option>
                </select>
              </div>

              {/* Blank option */}
              <div
                className={`border-2 rounded-xl p-4 cursor-pointer mb-4 flex items-center gap-3 transition-all ${
                  blankSelected ? 'border-primary-500 bg-primary-50' : 'border-gray-200 hover:border-gray-300'
                }`}
                onClick={() => { setBlankSelected(true); setSelectedTemplate(null); }}
              >
                <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center text-xl">📝</div>
                <div>
                  <div className="font-medium text-gray-900 text-sm">空白项目</div>
                  <div className="text-xs text-gray-400">不使用模版，手动添加任务和里程碑</div>
                </div>
                {blankSelected && <div className="ml-auto w-5 h-5 rounded-full bg-primary-500 flex items-center justify-center text-white text-xs">✓</div>}
              </div>

              {/* Template cards */}
              {loadingTemplates ? (
                <div className="grid grid-cols-2 gap-3">
                  {[1,2,3,4].map(i => <div key={i} className="card p-4 animate-pulse h-24" />)}
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  {filteredTemplates.map(tpl => {
                    const isSelected = selectedTemplate?.id === tpl.id && !blankSelected;
                    const catLabel = CATEGORY_LABELS[tpl.category] || tpl.category;
                    const catColor = CATEGORY_COLORS[tpl.category] || 'bg-gray-100 text-gray-600';
                    return (
                      <div
                        key={tpl.id}
                        className={`border-2 rounded-xl p-4 cursor-pointer transition-all ${
                          isSelected ? 'border-primary-500 bg-primary-50' : 'border-gray-200 hover:border-gray-300'
                        }`}
                        onClick={() => { setSelectedTemplate(tpl); setBlankSelected(false); }}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <span className="font-medium text-gray-900 text-sm leading-tight">{tpl.name}</span>
                          {isSelected && <div className="shrink-0 w-5 h-5 rounded-full bg-primary-500 flex items-center justify-center text-white text-xs">✓</div>}
                        </div>
                        <div className="flex items-center gap-2 mt-1.5">
                          {catLabel && <span className={`px-1.5 py-0.5 text-xs rounded ${catColor}`}>{catLabel}</span>}
                          {tpl.isMaster && <span className="text-xs text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded">母版</span>}
                        </div>
                        <div className="flex gap-3 mt-2 text-xs text-gray-400">
                          <span>{tpl.phaseCount ?? 0} 阶段</span>
                          <span>{tpl.taskCount ?? 0} 任务</span>
                        </div>
                        {tpl.description && (
                          <p className="text-xs text-gray-400 mt-1 line-clamp-1">{tpl.description}</p>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
              {filteredTemplates.length === 0 && !loadingTemplates && (
                <p className="text-sm text-gray-400 text-center py-6">暂无可用模版</p>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100">
          <button
            onClick={() => step === 1 ? onClose() : setStep(1)}
            className="btn btn-secondary"
          >
            {step === 1 ? '取消' : '上一步'}
          </button>
          <button
            onClick={handleCreate}
            disabled={creating || (step === 2 && !blankSelected && !selectedTemplate)}
            className="btn btn-primary"
          >
            {creating ? '创建中...' : step === 1 ? '下一步：选择模版' : '创建项目'}
          </button>
        </div>
      </div>
    </div>
  );
}
