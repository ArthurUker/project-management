import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '../store/appStore';

// ── 模块定义 ─────────────────────────────────────────────────────────────────

interface BackupModule {
  id: string;
  label: string;
  desc: string;
  tables: string[]; // 仅用于 UI 说明
}

const BACKUP_MODULES: BackupModule[] = [
  {
    id: 'users',
    label: '用户账号',
    desc: '所有用户的账号、角色和部门信息（含加密密码，恢复后无需重置密码）',
    tables: ['User'],
  },
  {
    id: 'projects',
    label: '项目数据',
    desc: '项目基本信息、成员、任务、任务依赖关系及里程碑',
    tables: ['Project', 'ProjectMember', 'Task', 'TaskDependency', 'Milestone'],
  },
  {
    id: 'reports',
    label: '汇报与进展',
    desc: '日报/周报/月报全部记录、历史版本及月度进展数据',
    tables: ['Report', 'ReportVersion', 'MonthlyProgress'],
  },
  {
    id: 'docs',
    label: '知识库文档',
    desc: '文档分类、SOP 文档内容及所有历史版本',
    tables: ['DocCategory', 'DocDocument', 'DocVersion'],
  },
  {
    id: 'projectTemplates',
    label: '项目模版',
    desc: '项目流程模版、阶段配置及流转关系',
    tables: ['ProjectTemplate', 'PhaseTransition'],
  },
  {
    id: 'taskTemplates',
    label: '任务模版库',
    desc: '可复用的任务模版定义及步骤配置',
    tables: ['TaskTemplate', 'TaskTemplateStep'],
  },
  {
    id: 'reagents',
    label: '试剂与配方',
    desc: '试剂原料库、配方定义、配方组分及配制记录',
    tables: ['Reagent', 'ReagentMaterial', 'ReagentFormula', 'FormulaComponent', 'PrepRecord'],
  },
  {
    id: 'primers',
    label: '引物探针库',
    desc: '引物及探针序列、修饰信息等设计数据',
    tables: ['Primer'],
  },
  {
    id: 'systemLogs',
    label: '系统操作日志',
    desc: '用户登录、操作等系统行为日志',
    tables: ['SystemLog'],
  },
];

// ── 工具函数 ─────────────────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString('zh-CN');
  } catch {
    return iso;
  }
}

// ── 主组件 ────────────────────────────────────────────────────────────────────

export default function BackupManager() {
  const { user } = useAppStore();
  const navigate = useNavigate();

  // 仅管理员可访问
  if (user?.role !== 'admin') {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-gray-400">此功能仅管理员可用</p>
      </div>
    );
  }

  // ── 导出状态 ──────────────────────────────────────────────────────────────
  const [selectedModules, setSelectedModules] = useState<Set<string>>(
    new Set(BACKUP_MODULES.map(m => m.id))
  );
  const [exporting, setExporting] = useState(false);

  const allSelected = selectedModules.size === BACKUP_MODULES.length;

  const toggleModule = (id: string) => {
    setSelectedModules(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (allSelected) setSelectedModules(new Set());
    else setSelectedModules(new Set(BACKUP_MODULES.map(m => m.id)));
  };

  const handleExport = async () => {
    if (selectedModules.size === 0) {
      alert('请至少选择一个模块');
      return;
    }
    setExporting(true);
    try {
      const token = localStorage.getItem('rdpms_token');
      const baseUrl = import.meta.env.VITE_API_URL || import.meta.env.VITE_API_BASE || '/api';
      const modulesParam = Array.from(selectedModules).join(',');
      const res = await fetch(`${baseUrl}/backup/export?modules=${encodeURIComponent(modulesParam)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as any).error || `HTTP ${res.status}`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const suffix = allSelected ? 'full' : `partial-${selectedModules.size}mod`;
      a.download = `rdpms-backup-${new Date().toISOString().slice(0, 10)}-${suffix}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err: any) {
      alert('导出失败：' + (err.message || String(err)));
    } finally {
      setExporting(false);
    }
  };

  // ── 恢复状态 ──────────────────────────────────────────────────────────────
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [parsedBackup, setParsedBackup] = useState<any>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [restoring, setRestoring] = useState(false);
  const [restoreConfirm, setRestoreConfirm] = useState(false);
  const [restoreMsg, setRestoreMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    setSelectedFile(file);
    setParsedBackup(null);
    setParseError(null);
    setRestoreConfirm(false);
    setRestoreMsg(null);
    if (!file) return;
    try {
      const text = await file.text();
      const json = JSON.parse(text);
      if (!json?.version || !json?.data) throw new Error('文件结构无效（缺少 version 或 data 字段）');
      setParsedBackup(json);
    } catch (err: any) {
      setParseError(err.message || '无法解析备份文件');
    }
  };

  const handleRestore = async () => {
    if (!parsedBackup) return;
    if (!restoreConfirm) {
      setRestoreConfirm(true);
      return;
    }
    setRestoring(true);
    setRestoreMsg(null);
    try {
      const token = localStorage.getItem('rdpms_token');
      const baseUrl = import.meta.env.VITE_API_URL || import.meta.env.VITE_API_BASE || '/api';
      const res = await fetch(`${baseUrl}/backup/restore`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(parsedBackup),
      });
      const result = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((result as any).error || `HTTP ${res.status}`);
      setRestoreMsg({ type: 'success', text: (result as any).message || '恢复成功，即将退出登录...' });
      setSelectedFile(null);
      setParsedBackup(null);
      setRestoreConfirm(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
      setTimeout(() => {
        localStorage.removeItem('rdpms_token');
        localStorage.removeItem('rdpms_user');
        window.location.href = '/login';
      }, 2500);
    } catch (err: any) {
      setRestoreMsg({ type: 'error', text: err?.error || err?.message || '恢复失败，请检查备份文件' });
    } finally {
      setRestoring(false);
    }
  };

  const cancelRestore = () => {
    setSelectedFile(null);
    setParsedBackup(null);
    setRestoreConfirm(false);
    setParseError(null);
    setRestoreMsg(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // 分析备份文件包含哪些模块
  const backupModuleInfo = parsedBackup
    ? BACKUP_MODULES.filter(m => {
        const d = parsedBackup.data;
        // 判断该模块的任何一个数据键存在且有数据
        const moduleKeys: Record<string, string[]> = {
          users: ['users'],
          projects: ['projects', 'tasks', 'milestones'],
          reports: ['reports', 'monthlyProgress'],
          docs: ['docDocuments', 'docCategories'],
          projectTemplates: ['projectTemplates'],
          taskTemplates: ['taskTemplates'],
          reagents: ['reagentFormulas', 'reagents', 'reagentMaterials'],
          primers: ['primers'],
          systemLogs: ['systemLogs'],
        };
        return (moduleKeys[m.id] || []).some(k => Array.isArray(d[k]));
      })
    : [];

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-3xl pb-10">
        <div className="flex items-center gap-3 mb-6">
          <button
            onClick={() => navigate(-1)}
            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div>
            <h1 className="text-2xl font-display font-bold text-gray-900">数据备份管理</h1>
            <p className="text-sm text-gray-500 mt-0.5">选择需要备份的模块，导出 JSON 文件保存到本地；服务器故障时可从本地文件恢复数据。</p>
          </div>
        </div>

        {/* ── 创建备份 ─────────────────────────────────────────────────────── */}
        <div className="card p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="font-semibold text-gray-900">创建备份</h2>
              <p className="text-xs text-gray-500 mt-0.5">勾选要备份的数据模块，点击导出按钮下载到本地电脑。</p>
            </div>
            <button
              onClick={toggleAll}
              className="text-sm text-primary-600 hover:text-primary-700 font-medium"
            >
              {allSelected ? '取消全选' : '全选'}
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-5">
            {BACKUP_MODULES.map(mod => (
              <label
                key={mod.id}
                className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                  selectedModules.has(mod.id)
                    ? 'border-primary-300 bg-primary-50'
                    : 'border-gray-200 hover:border-gray-300 bg-white'
                }`}
              >
                <input
                  type="checkbox"
                  className="mt-0.5 accent-primary-600"
                  checked={selectedModules.has(mod.id)}
                  onChange={() => toggleModule(mod.id)}
                />
                <div className="min-w-0">
                  <p className={`text-sm font-medium ${selectedModules.has(mod.id) ? 'text-primary-700' : 'text-gray-700'}`}>
                    {mod.label}
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5 leading-relaxed">{mod.desc}</p>
                </div>
              </label>
            ))}
          </div>

          <div className="flex items-center gap-4 pt-3 border-t border-gray-100">
            <div className="flex-1 text-sm text-gray-500">
              已选 <span className="font-medium text-gray-700">{selectedModules.size}</span> / {BACKUP_MODULES.length} 个模块
              {!allSelected && selectedModules.size > 0 && (
                <span className="ml-2 text-yellow-600 text-xs">（部分备份，恢复时未包含模块的数据将被清空）</span>
              )}
            </div>
            <button
              onClick={handleExport}
              disabled={exporting || selectedModules.size === 0}
              className="btn btn-primary disabled:opacity-50 flex items-center gap-2"
            >
              {exporting ? (
                <>
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                  </svg>
                  导出中...
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  导出备份文件
                </>
              )}
            </button>
          </div>
        </div>

        {/* ── 从备份恢复 ───────────────────────────────────────────────────── */}
        <div className="card p-6">
          <h2 className="font-semibold text-gray-900 mb-1">从备份恢复</h2>
          <p className="text-xs text-gray-500 mb-4">
            选择本地备份文件，系统将用备份中的数据替换服务器现有数据。恢复完成后需重新登录。
          </p>

          {/* 文件选择区 */}
          <input
            type="file"
            accept=".json"
            ref={fileInputRef}
            onChange={handleFileChange}
            className="hidden"
          />

          {!selectedFile ? (
            <button
              onClick={() => fileInputRef.current?.click()}
              className="w-full border-2 border-dashed border-gray-200 hover:border-primary-300 rounded-xl py-8 flex flex-col items-center gap-2 text-gray-400 hover:text-primary-500 transition-colors"
            >
              <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
              </svg>
              <span className="text-sm font-medium">点击选择备份文件</span>
              <span className="text-xs">仅支持 .json 格式</span>
            </button>
          ) : (
            <div>
              {/* 文件信息 */}
              <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg mb-4">
                <svg className="w-8 h-8 text-blue-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                    d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                </svg>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-700 truncate">{selectedFile.name}</p>
                  <p className="text-xs text-gray-400">{formatBytes(selectedFile.size)}</p>
                </div>
                <button onClick={cancelRestore} className="text-gray-400 hover:text-gray-600 p-1">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* 解析错误 */}
              {parseError && (
                <div className="mb-4 px-4 py-3 bg-red-50 text-red-600 rounded-lg text-sm">
                  ❌ {parseError}
                </div>
              )}

              {/* 备份内容摘要 */}
              {parsedBackup && (
                <div className="mb-4 p-4 bg-blue-50 rounded-lg">
                  <p className="text-sm font-medium text-blue-700 mb-2">备份文件摘要</p>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-blue-600 mb-2">
                    <span>备份时间：{formatDate(parsedBackup.exportedAt)}</span>
                    <span>文件版本：{parsedBackup.version}</span>
                  </div>
                  <p className="text-xs text-blue-600 mb-1.5">包含模块：</p>
                  <div className="flex flex-wrap gap-1.5">
                    {backupModuleInfo.length > 0
                      ? backupModuleInfo.map(m => (
                          <span key={m.id} className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded text-xs font-medium">
                            {m.label}
                          </span>
                        ))
                      : <span className="text-xs text-gray-400">未识别到有效模块数据</span>
                    }
                  </div>
                  {backupModuleInfo.length < BACKUP_MODULES.length && (
                    <p className="mt-2 text-xs text-yellow-600">
                      ⚠️ 这是部分备份，恢复后未包含模块的现有数据将被清空。
                    </p>
                  )}
                </div>
              )}

              {/* 恢复操作区 */}
              {parsedBackup && !restoreMsg && (
                <div className="border-t border-gray-100 pt-4">
                  <div className="p-3 bg-red-50 rounded-lg mb-4 text-xs text-red-600 leading-relaxed">
                    ⚠️ <strong>警告：</strong>恢复操作将清除服务器上的所有现有数据，然后用备份文件中的数据完整替换。
                    此操作<strong>不可撤销</strong>，完成后将自动退出登录。
                  </div>
                  <div className="flex items-center gap-3 flex-wrap">
                    {!restoreConfirm ? (
                      <button
                        onClick={handleRestore}
                        className="btn bg-yellow-500 hover:bg-yellow-600 text-white"
                      >
                        开始恢复数据
                      </button>
                    ) : (
                      <button
                        onClick={handleRestore}
                        disabled={restoring}
                        className="btn bg-red-600 hover:bg-red-700 text-white disabled:opacity-50 flex items-center gap-2"
                      >
                        {restoring ? (
                          <>
                            <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                            </svg>
                            恢复中，请稍候...
                          </>
                        ) : '⚠️ 确认：清空现有数据并恢复'}
                      </button>
                    )}
                    {restoreConfirm && !restoring && (
                      <button onClick={cancelRestore} className="btn btn-secondary">取消</button>
                    )}
                  </div>
                  {restoreConfirm && !restoring && (
                    <p className="mt-2 text-xs text-red-500 font-medium">请再次点击红色按钮确认，操作执行后无法撤回。</p>
                  )}
                </div>
              )}

              {/* 操作结果 */}
              {restoreMsg && (
                <div className={`mt-3 px-4 py-3 rounded-lg text-sm ${
                  restoreMsg.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'
                }`}>
                  {restoreMsg.text}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
