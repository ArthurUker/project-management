import { useState } from 'react';
import { useAppStore } from '../store/appStore';
import DocReference from './DocReference';

// ==================== 下拉选项（整合自Excel） ====================
export const DROPDOWN_OPTIONS = {
  yesNo: ['是', '否'],
  yesNoPartial: ['是', '否', '部分完成', '待确认'],
  experimentTypes: ['样本前处理', '试剂配制', '方法验证', '配方优化', '稳定性研究', '性能测试', '联合实验'],
  reagentStatus: ['正常可用', '基本可用', '待优化', '不可用', '新配制', '复配', '验证'],
  outputType: ['可上芯片样本', '提取产物', '试剂', '配方液', '对照品', '其他'],
  resultAchieved: ['达到', '部分达到', '未达到'],
  abnormalTypes: ['样本异常', '试剂异常', '配方异常', '污染风险', '操作偏差', '设备问题', '数据异常', '进度延迟', '其他'],
  impactTypes: ['无影响', '轻微影响', '严重影响', '待评估'],
  pendingClosed: ['是', '否', '部分完成']
};

// ==================== 类型定义 ====================
interface ExperimentRecord {
  id: string; experimentNo: string; experimentTitle: string; experimentType: string;
  personnel: string; startTime: string; endTime: string;
  samples: Array<{ id: string; name: string; source: string; concentration: string; dosage: string; note: string }>;
  reagents: Array<{ id: string; name: string; manufacturer: string; batchNo: string; dosage: string; note: string }>;
  steps: Array<{ stepNo: number; plannedStep: string; actualRecord: string; time: string; operator: string; deviation: string }>;
  keyParams: Array<{ paramName: string; setValue: string; actualValue: string; unit: string; isAbnormal: string; note: string }>;
  observation: { visual: string; color: string; abnormal: string; imageNo: string };
  result: { mainResult: string; achieved: string; conclusion: string; nextPlan: string };
}

export interface ReagentDailyReport {
  id: string; date: string; fillPerson: string; projectName: string;
  experimentLocation: string; totalExperiments: string; dataPath: string; relatedSop: string;
  mainContent: string; experimentTypes: string[]; completedAsPlanned: string; uncompletedReason: string;
  experiments: ExperimentRecord[];
  formula: { reagentName: string; formulaNo: string; version: string; totalAmount: string; storageCondition: string; components: Array<{ name: string; concentration: string; amount: string; batchNo: string; note: string }> };
  hasOutput: string; outputType: string; outputName: string; outputNo: string; outputAmount: string;
  hasHandOver: string; receiver: string; handoverTime: string; handoverNo: string;
  hasAbnormal: string; abnormalType: string; abnormalDesc: string; causeAnalysis: string; measuresTaken: string; impactOnChip: string; needSupport: string; supportItems: string;
  tomorrowPlan: string; priorityItems: string; needChipCooperation: string; cooperationItems: string; hasPendingItems: string; pendingItems: string;
  docRefs: Array<{ id: string; code: string; title: string; docType: string; version: string; category?: { name: string } }>;
}

function createEmptyExperiment(date: string, index: number): ExperimentRecord {
  const dateStr = date.replace(/-/g, '');
  return {
    id: `exp-${Date.now()}-${index}`, experimentNo: `RD-RG-${dateStr}-${String(index + 1).padStart(2, '0')}`,
    experimentTitle: '', experimentType: '', personnel: '', startTime: '', endTime: '',
    samples: [], reagents: [], steps: [], keyParams: [],
    observation: { visual: '', color: '', abnormal: '', imageNo: '' },
    result: { mainResult: '', achieved: '', conclusion: '', nextPlan: '' }
  };
}

function createEmptyReport(date: string, userName: string): ReagentDailyReport {
  return {
    id: `report-${Date.now()}`, date, fillPerson: userName, projectName: '',
    experimentLocation: '', totalExperiments: '', dataPath: '', relatedSop: '',
    mainContent: '', experimentTypes: [], completedAsPlanned: '', uncompletedReason: '',
    experiments: [createEmptyExperiment(date, 0)],
    formula: { reagentName: '', formulaNo: '', version: '', totalAmount: '', storageCondition: '', components: [] },
    hasOutput: '否', outputType: '', outputName: '', outputNo: '', outputAmount: '',
    hasHandOver: '否', receiver: '', handoverTime: '', handoverNo: '',
    hasAbnormal: '否', abnormalType: '', abnormalDesc: '', causeAnalysis: '', measuresTaken: '', impactOnChip: '', needSupport: '否', supportItems: '',
    tomorrowPlan: '', priorityItems: '', needChipCooperation: '否', cooperationItems: '', hasPendingItems: '否', pendingItems: '',
    docRefs: []
  };
}

function getWeekday(dateStr: string) {
  const weekdays = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
  return weekdays[new Date(dateStr).getDay()];
}

function SelectInput({ options, value, onChange, placeholder = '请选择' }: { options: string[]; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <select className="input" value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">{placeholder}</option>
      {options.map(opt => <option key={opt} value={opt}>{opt}</option>)}
    </select>
  );
}

function MultiSelect({ options, value, onChange, placeholder }: { options: string[]; value: string[]; onChange: (v: string[]) => void; placeholder: string }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const filtered = options.filter(o => o.toLowerCase().includes(search.toLowerCase()));
  const toggle = (opt: string) => value.includes(opt) ? onChange(value.filter(v => v !== opt)) : onChange([...value, opt]);
  return (
    <div className="relative">
      <div className="input min-h-[38px] cursor-pointer flex flex-wrap gap-1" onClick={() => setOpen(!open)}>
        {value.length > 0 ? value.map(v => (
          <span key={v} className="inline-flex items-center px-2 py-0.5 bg-blue-100 text-blue-700 text-xs rounded">
            {v}<button type="button" className="ml-1 hover:text-blue-900" onClick={(e) => { e.stopPropagation(); toggle(v); }}>×</button>
          </span>
        )) : <span className="text-gray-400">{placeholder}</span>}
      </div>
      {open && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg">
          <div className="p-2 border-b border-gray-100">
            <input type="text" className="w-full px-2 py-1 text-sm border border-gray-200 rounded" placeholder="搜索..." value={search} onChange={(e) => setSearch(e.target.value)} autoFocus />
          </div>
          <div className="max-h-48 overflow-y-auto">
            {filtered.map(opt => (
              <div key={opt} className={`px-3 py-2 cursor-pointer hover:bg-blue-50 ${value.includes(opt) ? 'bg-blue-50 text-blue-700' : ''}`} onClick={() => toggle(opt)}>
                <input type="checkbox" checked={value.includes(opt)} onChange={() => toggle(opt)} className="mr-2" />{opt}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function SectionTitle({ number, title, color }: { number: number; title: string; color: string }) {
  const colors: Record<string, string> = { blue: 'bg-blue-500', green: 'bg-green-500', yellow: 'bg-yellow-500', red: 'bg-red-500', purple: 'bg-purple-500', indigo: 'bg-indigo-500', teal: 'bg-teal-500', orange: 'bg-orange-500', cyan: 'bg-cyan-500', rose: 'bg-rose-500', amber: 'bg-amber-500', sky: 'bg-sky-500', fuchsia: 'bg-fuchsia-500' };
  return <h4 className="font-semibold text-gray-800 mb-3 flex items-center gap-2"><span className={`w-5 h-5 ${colors[color]} text-white rounded text-xs flex items-center justify-center`}>{number}</span>{title}</h4>;
}

function ExperimentBlock({ experiment, index, onUpdate, onRemove, canRemove }: { experiment: ExperimentRecord; index: number; onUpdate: (exp: ExperimentRecord) => void; onRemove: () => void; canRemove: boolean }) {
  const [expanded, setExpanded] = useState(index === 0);
  const update = (field: string, value: any) => onUpdate({ ...experiment, [field]: value });
  return (
    <div className="border border-purple-200 rounded-lg overflow-hidden bg-white">
      <div className="bg-gradient-to-r from-purple-50 to-pink-50 px-4 py-3 flex items-center justify-between cursor-pointer hover:from-purple-100 hover:to-pink-100" onClick={() => setExpanded(!expanded)}>
        <div className="flex items-center gap-3">
          <span className="w-8 h-8 bg-purple-600 text-white rounded-full flex items-center justify-center text-sm font-bold">{index + 1}</span>
          <span className="font-semibold text-gray-800">{experiment.experimentTitle || `实验 ${index + 1}`}</span>
          {experiment.experimentNo && <span className="text-xs text-purple-600 bg-purple-100 px-2 py-0.5 rounded">{experiment.experimentNo}</span>}
        </div>
        <div className="flex items-center gap-2">
          {experiment.experimentType && <span className="text-sm text-gray-500">{experiment.experimentType}</span>}
          <svg className={`w-5 h-5 text-gray-400 transition-transform ${expanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
        </div>
      </div>
      {expanded && (
        <div className="p-4 space-y-4">
          <div className="grid grid-cols-4 gap-3">
            <div className="col-span-2"><label className="label text-xs">实验标题</label><input className="input text-sm" placeholder="简述实验内容" value={experiment.experimentTitle} onChange={(e) => update('experimentTitle', e.target.value)} /></div>
            <div><label className="label text-xs">实验类型</label><select className="input text-sm" value={experiment.experimentType} onChange={(e) => update('experimentType', e.target.value)}><option value="">选择</option>{DROPDOWN_OPTIONS.experimentTypes.map(t => <option key={t} value={t}>{t}</option>)}</select></div>
            <div><label className="label text-xs">实验人员</label><input className="input text-sm" placeholder="参与人员" value={experiment.personnel} onChange={(e) => update('personnel', e.target.value)} /></div>
            <div className="flex gap-2"><div className="flex-1"><label className="label text-xs">开始</label><input type="time" className="input text-sm" value={experiment.startTime} onChange={(e) => update('startTime', e.target.value)} /></div><div className="flex-1"><label className="label text-xs">结束</label><input type="time" className="input text-sm" value={experiment.endTime} onChange={(e) => update('endTime', e.target.value)} /></div></div>
          </div>
          <div className="bg-emerald-50 rounded-lg p-3 border border-emerald-200">
            <div className="flex items-center justify-between mb-2">
              <h5 className="text-sm font-medium text-emerald-800 flex items-center gap-2"><span className="w-4 h-4 bg-emerald-500 text-white rounded text-xs flex items-center justify-center">S</span>样本信息</h5>
              <button type="button" onClick={() => update('samples', [...experiment.samples, { id: `s-${Date.now()}`, name: '', source: '', concentration: '', dosage: '', note: '' }])} className="text-xs text-emerald-600 hover:text-emerald-800">+ 添加</button>
            </div>
            {experiment.samples.length > 0 ? (
              <table className="w-full text-xs">
                <thead className="bg-emerald-100"><tr><th className="px-2 py-1 text-left">名称</th><th className="px-2 py-1 text-left">来源</th><th className="px-2 py-1 text-left">浓度</th><th className="px-2 py-1 text-left">用量</th><th className="px-2 py-1 text-left">备注</th><th className="w-8"></th></tr></thead>
                <tbody>{experiment.samples.map((s, si) => (
                  <tr key={s.id} className="border-b border-emerald-100">
                    <td className="px-2 py-1"><input className="w-full bg-transparent border-none" value={s.name} onChange={(e) => { const ns = [...experiment.samples]; ns[si] = {...ns[si], name: e.target.value}; update('samples', ns); }} /></td>
                    <td className="px-2 py-1"><input className="w-full bg-transparent border-none" value={s.source} onChange={(e) => { const ns = [...experiment.samples]; ns[si] = {...ns[si], source: e.target.value}; update('samples', ns); }} /></td>
                    <td className="px-2 py-1"><input className="w-full bg-transparent border-none" value={s.concentration} onChange={(e) => { const ns = [...experiment.samples]; ns[si] = {...ns[si], concentration: e.target.value}; update('samples', ns); }} /></td>
                    <td className="px-2 py-1"><input className="w-full bg-transparent border-none" value={s.dosage} onChange={(e) => { const ns = [...experiment.samples]; ns[si] = {...ns[si], dosage: e.target.value}; update('samples', ns); }} /></td>
                    <td className="px-2 py-1"><input className="w-full bg-transparent border-none" value={s.note} onChange={(e) => { const ns = [...experiment.samples]; ns[si] = {...ns[si], note: e.target.value}; update('samples', ns); }} /></td>
                    <td className="px-2 py-1"><button type="button" onClick={() => update('samples', experiment.samples.filter((_, i) => i !== si))} className="text-red-500 hover:text-red-700">×</button></td>
                  </tr>
                ))}</tbody>
              </table>
            ) : <p className="text-xs text-gray-500 italic">暂无样本</p>}
          </div>
          <div className="bg-rose-50 rounded-lg p-3 border border-rose-200">
            <div className="flex items-center justify-between mb-2">
              <h5 className="text-sm font-medium text-rose-800 flex items-center gap-2"><span className="w-4 h-4 bg-rose-500 text-white rounded text-xs flex items-center justify-center">R</span>试剂信息</h5>
              <button type="button" onClick={() => update('reagents', [...experiment.reagents, { id: `r-${Date.now()}`, name: '', manufacturer: '', batchNo: '', dosage: '', note: '' }])} className="text-xs text-rose-600 hover:text-rose-800">+ 添加</button>
            </div>
            {experiment.reagents.length > 0 ? (
              <table className="w-full text-xs">
                <thead className="bg-rose-100"><tr><th className="px-2 py-1 text-left">名称</th><th className="px-2 py-1 text-left">厂家/自配</th><th className="px-2 py-1 text-left">批号</th><th className="px-2 py-1 text-left">用量</th><th className="px-2 py-1 text-left">备注</th><th className="w-8"></th></tr></thead>
                <tbody>{experiment.reagents.map((r, ri) => (
                  <tr key={ri} className="border-b border-rose-100">
                    <td className="px-2 py-1"><input className="w-full bg-transparent border-none" value={r.name} onChange={(e) => { const nr = [...experiment.reagents]; nr[ri] = {...nr[ri], name: e.target.value}; update('reagents', nr); }} /></td>
                    <td className="px-2 py-1"><input className="w-full bg-transparent border-none" value={r.manufacturer} onChange={(e) => { const nr = [...experiment.reagents]; nr[ri] = {...nr[ri], manufacturer: e.target.value}; update('reagents', nr); }} /></td>
                    <td className="px-2 py-1"><input className="w-full bg-transparent border-none" value={r.batchNo} onChange={(e) => { const nr = [...experiment.reagents]; nr[ri] = {...nr[ri], batchNo: e.target.value}; update('reagents', nr); }} /></td>
                    <td className="px-2 py-1"><input className="w-full bg-transparent border-none" value={r.dosage} onChange={(e) => { const nr = [...experiment.reagents]; nr[ri] = {...nr[ri], dosage: e.target.value}; update('reagents', nr); }} /></td>
                    <td className="px-2 py-1"><input className="w-full bg-transparent border-none" value={r.note} onChange={(e) => { const nr = [...experiment.reagents]; nr[ri] = {...nr[ri], note: e.target.value}; update('reagents', nr); }} /></td>
                    <td className="px-2 py-1"><button type="button" onClick={() => update('reagents', experiment.reagents.filter((_, i) => i !== ri))} className="text-red-500 hover:text-red-700">×</button></td>
                  </tr>
                ))}</tbody>
              </table>
            ) : <p className="text-xs text-gray-500 italic">暂无试剂</p>}
          </div>
          <div className="bg-orange-50 rounded-lg p-3 border border-orange-200">
            <div className="flex items-center justify-between mb-2">
              <h5 className="text-sm font-medium text-orange-800 flex items-center gap-2"><span className="w-4 h-4 bg-orange-500 text-white rounded text-xs flex items-center justify-center">O</span>操作步骤</h5>
              <button type="button" onClick={() => update('steps', [...experiment.steps, { stepNo: experiment.steps.length + 1, plannedStep: '', actualRecord: '', time: '', operator: '', deviation: '' }])} className="text-xs text-orange-600 hover:text-orange-800">+ 添加</button>
            </div>
            {experiment.steps.length > 0 ? (
              <table className="w-full text-xs">
                <thead className="bg-orange-100"><tr><th className="px-2 py-1 w-8">#</th><th className="px-2 py-1">计划步骤</th><th className="px-2 py-1">实际记录</th><th className="px-2 py-1 w-16">时间</th><th className="px-2 py-1">偏差</th><th className="w-8"></th></tr></thead>
                <tbody>{experiment.steps.map((s, si) => (
                  <tr key={si} className="border-b border-orange-100">
                    <td className="px-2 py-1 text-center">{si + 1}</td>
                    <td className="px-2 py-1"><textarea className="w-full bg-transparent border-none resize-none h-8" value={s.plannedStep} onChange={(e) => { const ns = [...experiment.steps]; ns[si] = {...ns[si], plannedStep: e.target.value}; update('steps', ns); }} /></td>
                    <td className="px-2 py-1"><textarea className="w-full bg-transparent border-none resize-none h-8" value={s.actualRecord} onChange={(e) => { const ns = [...experiment.steps]; ns[si] = {...ns[si], actualRecord: e.target.value}; update('steps', ns); }} /></td>
                    <td className="px-2 py-1"><input type="time" className="w-full bg-transparent border-none" value={s.time} onChange={(e) => { const ns = [...experiment.steps]; ns[si] = {...ns[si], time: e.target.value}; update('steps', ns); }} /></td>
                    <td className="px-2 py-1"><input className="w-full bg-transparent border-none" value={s.deviation} onChange={(e) => { const ns = [...experiment.steps]; ns[si] = {...ns[si], deviation: e.target.value}; update('steps', ns); }} /></td>
                    <td className="px-2 py-1"><button type="button" onClick={() => update('steps', experiment.steps.filter((_, i) => i !== si))} className="text-red-500 hover:text-red-700">×</button></td>
                  </tr>
                ))}</tbody>
              </table>
            ) : <p className="text-xs text-gray-500 italic">暂无步骤</p>}
          </div>
          <div className="bg-cyan-50 rounded-lg p-3 border border-cyan-200">
            <div className="flex items-center justify-between mb-2">
              <h5 className="text-sm font-medium text-cyan-800 flex items-center gap-2"><span className="w-4 h-4 bg-cyan-500 text-white rounded text-xs flex items-center justify-center">P</span>关键参数</h5>
              <button type="button" onClick={() => update('keyParams', [...experiment.keyParams, { paramName: '', setValue: '', actualValue: '', unit: '', isAbnormal: '', note: '' }])} className="text-xs text-cyan-600 hover:text-cyan-800">+ 添加</button>
            </div>
            {experiment.keyParams.length > 0 ? (
              <table className="w-full text-xs">
                <thead className="bg-cyan-100"><tr><th className="px-2 py-1 text-left">参数</th><th className="px-2 py-1 w-16">设定值</th><th className="px-2 py-1 w-16">实际值</th><th className="px-2 py-1 w-12">单位</th><th className="px-2 py-1 w-14">异常</th><th className="px-2 py-1 text-left">备注</th><th className="w-8"></th></tr></thead>
                <tbody>{experiment.keyParams.map((p, pi) => (
                  <tr key={pi} className="border-b border-cyan-100">
                    <td className="px-2 py-1"><input className="w-full bg-transparent border-none" value={p.paramName} onChange={(e) => { const np = [...experiment.keyParams]; np[pi] = {...np[pi], paramName: e.target.value}; update('keyParams', np); }} /></td>
                    <td className="px-2 py-1"><input className="w-full bg-transparent border-none text-right" value={p.setValue} onChange={(e) => { const np = [...experiment.keyParams]; np[pi] = {...np[pi], setValue: e.target.value}; update('keyParams', np); }} /></td>
                    <td className="px-2 py-1"><input className="w-full bg-transparent border-none text-right" value={p.actualValue} onChange={(e) => { const np = [...experiment.keyParams]; np[pi] = {...np[pi], actualValue: e.target.value}; update('keyParams', np); }} /></td>
                    <td className="px-2 py-1"><input className="w-full bg-transparent border-none" value={p.unit} onChange={(e) => { const np = [...experiment.keyParams]; np[pi] = {...np[pi], unit: e.target.value}; update('keyParams', np); }} /></td>
                    <td className="px-2 py-1"><select className="w-full bg-transparent border-none" value={p.isAbnormal} onChange={(e) => { const np = [...experiment.keyParams]; np[pi] = {...np[pi], isAbnormal: e.target.value}; update('keyParams', np); }}><option value="">-</option><option value="是">是</option><option value="否">否</option></select></td>
                    <td className="px-2 py-1"><input className="w-full bg-transparent border-none" value={p.note} onChange={(e) => { const np = [...experiment.keyParams]; np[pi] = {...np[pi], note: e.target.value}; update('keyParams', np); }} /></td>
                    <td className="px-2 py-1"><button type="button" onClick={() => update('keyParams', experiment.keyParams.filter((_, i) => i !== pi))} className="text-red-500 hover:text-red-700">×</button></td>
                  </tr>
                ))}</tbody>
              </table>
            ) : <p className="text-xs text-gray-500 italic">暂无参数</p>}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-lime-50 rounded-lg p-3 border border-lime-200">
              <h5 className="text-sm font-medium text-lime-800 mb-2 flex items-center gap-2"><span className="w-4 h-4 bg-lime-500 text-white rounded text-xs flex items-center justify-center">!</span>现象记录</h5>
              <div className="space-y-2">
                <div><label className="label text-xs">肉眼观察/颜色</label><input className="input text-xs" placeholder="描述..." value={experiment.observation.visual} onChange={(e) => update('observation', {...experiment.observation, visual: e.target.value})} /></div>
                <div><label className="label text-xs">异常/图片编号</label><input className="input text-xs" placeholder="如异常或 IMG-001" value={experiment.observation.abnormal} onChange={(e) => update('observation', {...experiment.observation, abnormal: e.target.value})} /></div>
              </div>
            </div>
            <div className="bg-yellow-50 rounded-lg p-3 border border-yellow-200">
              <h5 className="text-sm font-medium text-yellow-800 mb-2 flex items-center gap-2"><span className="w-4 h-4 bg-yellow-500 text-white rounded text-xs flex items-center justify-center">✓</span>实验结果</h5>
              <div className="space-y-2">
                <div><label className="label text-xs">主要结果</label><textarea className="input h-8 text-xs" placeholder="描述..." value={experiment.result.mainResult} onChange={(e) => update('result', {...experiment.result, mainResult: e.target.value})} /></div>
                <div className="flex gap-2">
                  <div className="flex-1"><label className="label text-xs">是否达标</label><select className="input text-xs" value={experiment.result.achieved} onChange={(e) => update('result', {...experiment.result, achieved: e.target.value})}><option value="">-</option>{DROPDOWN_OPTIONS.resultAchieved.map(a => <option key={a} value={a}>{a}</option>)}</select></div>
                  <div className="flex-1"><label className="label text-xs">结论</label><input className="input text-xs" placeholder="结论" value={experiment.result.conclusion} onChange={(e) => update('result', {...experiment.result, conclusion: e.target.value})} /></div>
                </div>
              </div>
            </div>
          </div>
          {canRemove && <div className="flex justify-end"><button type="button" onClick={onRemove} className="text-red-500 hover:text-red-700 text-sm">删除此实验</button></div>}
        </div>
      )}
    </div>
  );
}

interface ReagentDailyReportProps {
  date: string;
  value: ReagentDailyReport[];
  onChange: (reports: ReagentDailyReport[]) => void;
}

export default function ReagentDailyReport({ date, value, onChange }: ReagentDailyReportProps) {
  const { user, projects } = useAppStore();
  const initialReports = value.length > 0 ? value : [createEmptyReport(date, user?.name || '')];
  const [reports, setReports] = useState<ReagentDailyReport[]>(initialReports);
  
  const updateReport = (index: number, field: string, newValue: any) => {
    const newReports = [...reports];
    (newReports[index] as any)[field] = newValue;
    setReports(newReports);
    onChange(newReports);
  };
  
  const addExperiment = (reportIndex: number) => {
    const report = reports[reportIndex];
    updateReport(reportIndex, 'experiments', [...report.experiments, createEmptyExperiment(date, report.experiments.length)]);
  };
  
  const updateExperiment = (reportIndex: number, expIndex: number, exp: ExperimentRecord) => {
    const newReports = [...reports];
    newReports[reportIndex].experiments[expIndex] = exp;
    setReports(newReports);
    onChange(newReports);
  };
  
  const removeExperiment = (reportIndex: number, expIndex: number) => {
    const report = reports[reportIndex];
    if (report.experiments.length <= 1) return;
    updateReport(reportIndex, 'experiments', report.experiments.filter((_, i) => i !== expIndex));
  };

  return (
    <div className="space-y-4">
      <div className="bg-gradient-to-r from-indigo-50 to-purple-50 rounded-lg p-4 border border-indigo-100">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-xl">🧪</span>
          <h3 className="text-lg font-semibold text-indigo-900">试剂组日报</h3>
          <span className="px-2 py-0.5 bg-indigo-100 text-indigo-700 text-xs rounded-full">综合模板</span>
        </div>
        <div className="grid grid-cols-4 gap-4 text-sm">
          <div className="bg-white/60 rounded px-3 py-2"><span className="text-gray-500">日期：</span><span className="font-medium">{date} {getWeekday(date)}</span></div>
          <div className="bg-white/60 rounded px-3 py-2"><span className="text-gray-500">填写人：</span><span className="font-medium">{user?.name || '未登录'}</span></div>
          <div className="bg-white/60 rounded px-3 py-2"><span className="text-gray-500">小组：</span><span className="font-medium text-indigo-700">试剂组</span></div>
          <div className="bg-white/60 rounded px-3 py-2"><span className="text-gray-500">实验数：</span><span className="font-medium">{reports.reduce((sum, r) => sum + r.experiments.length, 0)} 个</span></div>
        </div>
      </div>
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800">
        💡 <strong>填写说明：</strong>本模板综合了详细实验记录与工作汇总。带下拉字段请优先选择预设选项；长文本请简明、专业、可追溯。如无对应内容可填写"无"或"不涉及"。
      </div>
      {reports.map((report, rIndex) => (
        <div key={report.id} className="border border-gray-200 rounded-lg overflow-hidden bg-white">
          <div className="bg-gradient-to-r from-gray-50 to-gray-100 px-4 py-3 border-b border-gray-200 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="w-8 h-8 bg-indigo-600 text-white rounded-full flex items-center justify-center text-sm font-bold">{rIndex + 1}</span>
              <span className="font-semibold text-gray-800">工作日报 #{rIndex + 1}</span>
              {report.projectName && <span className="text-xs text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded">{report.projectName}</span>}
            </div>
          </div>
          <div className="p-4 space-y-6">
            <div className="bg-sky-50 rounded-lg p-4 border border-sky-200">
              <SectionTitle number={1} title="基础信息与工作概况" color="sky" />
              <div className="grid grid-cols-4 gap-4">
                <div className="col-span-2"><label className="label">所属项目</label><select className="input" value={report.projectName} onChange={(e) => updateReport(rIndex, 'projectName', e.target.value)}><option value="">选择项目</option>{projects.map(p => <option key={p.id} value={p.name}>{p.name}</option>)}</select></div>
                <div><label className="label">实验地点</label><input className="input" placeholder="如 横琴实验室" value={report.experimentLocation} onChange={(e) => updateReport(rIndex, 'experimentLocation', e.target.value)} /></div>
                <div><label className="label">实验总数</label><input className="input" placeholder="如 3" value={report.totalExperiments} onChange={(e) => updateReport(rIndex, 'totalExperiments', e.target.value)} /></div>
                <div className="col-span-2"><label className="label">今日主要工作内容</label><textarea className="input h-12" placeholder="简述..." value={report.mainContent} onChange={(e) => updateReport(rIndex, 'mainContent', e.target.value)} /></div>
                <div className="col-span-2"><label className="label">涉及实验类型</label><MultiSelect options={DROPDOWN_OPTIONS.experimentTypes} value={report.experimentTypes} onChange={(v) => updateReport(rIndex, 'experimentTypes', v)} placeholder="选择类型（可多选）" /></div>
                <div><label className="label">关联SOP</label><input className="input" placeholder="如 SOP-RT-012" value={report.relatedSop} onChange={(e) => updateReport(rIndex, 'relatedSop', e.target.value)} /></div>
                <div><label className="label">数据路径</label><input className="input" placeholder="如 D:/LabData/" value={report.dataPath} onChange={(e) => updateReport(rIndex, 'dataPath', e.target.value)} /></div>
                <div><label className="label">是否按计划完成</label><SelectInput options={DROPDOWN_OPTIONS.yesNoPartial} value={report.completedAsPlanned} onChange={(v) => updateReport(rIndex, 'completedAsPlanned', v)} /></div>
                {report.completedAsPlanned && report.completedAsPlanned !== '是' && <div><label className="label">未完成原因</label><input className="input" placeholder="偏差说明" value={report.uncompletedReason} onChange={(e) => updateReport(rIndex, 'uncompletedReason', e.target.value)} /></div>}
              </div>
            </div>
            <div>
              <div className="flex items-center justify-between mb-3">
                <h4 className="font-semibold text-gray-800 flex items-center gap-2"><span className="w-5 h-5 bg-purple-500 text-white rounded text-xs flex items-center justify-center">2</span>实验记录 <span className="text-sm font-normal text-gray-500">（{report.experiments.length} 个）</span></h4>
                <button type="button" onClick={() => addExperiment(rIndex)} className="text-sm text-purple-600 hover:text-purple-800">+ 添加实验</button>
              </div>
              <div className="space-y-3">{report.experiments.map((exp, eIndex) => (
                <ExperimentBlock key={exp.id} experiment={exp} index={eIndex} onUpdate={(e) => updateExperiment(rIndex, eIndex, e)} onRemove={() => removeExperiment(rIndex, eIndex)} canRemove={report.experiments.length > 1} />
              ))}</div>
            </div>
            <div className="bg-fuchsia-50 rounded-lg p-4 border border-fuchsia-200">
              <SectionTitle number={3} title="配方工作（可选）" color="fuchsia" />
              <div className="grid grid-cols-6 gap-3 mb-4">
                <div><label className="label text-xs">试剂名称</label><input className="input text-sm" placeholder="如 LAMP 缓冲液" value={report.formula.reagentName} onChange={(e) => updateReport(rIndex, 'formula', {...report.formula, reagentName: e.target.value})} /></div>
                <div><label className="label text-xs">配方编号</label><input className="input text-sm" placeholder="如 RF-HBV-V1" value={report.formula.formulaNo} onChange={(e) => updateReport(rIndex, 'formula', {...report.formula, formulaNo: e.target.value})} /></div>
                <div><label className="label text-xs">版本</label><input className="input text-sm" placeholder="如 V1.0" value={report.formula.version} onChange={(e) => updateReport(rIndex, 'formula', {...report.formula, version: e.target.value})} /></div>
                <div><label className="label text-xs">配制总量</label><input className="input text-sm" placeholder="如 10 mL" value={report.formula.totalAmount} onChange={(e) => updateReport(rIndex, 'formula', {...report.formula, totalAmount: e.target.value})} /></div>
                <div><label className="label text-xs">保存条件</label><input className="input text-sm" placeholder="如 2-8°C" value={report.formula.storageCondition} onChange={(e) => updateReport(rIndex, 'formula', {...report.formula, storageCondition: e.target.value})} /></div>
                <div><label className="label text-xs">状态</label><SelectInput options={DROPDOWN_OPTIONS.reagentStatus} value="" onChange={() => {}} /></div>
              </div>
              <div className="flex items-center justify-between mb-2">
                <h5 className="text-sm font-medium text-fuchsia-700">配方组成</h5>
                <button type="button" onClick={() => updateReport(rIndex, 'formula', {...report.formula, components: [...report.formula.components, { name: '', concentration: '', amount: '', batchNo: '', note: '' }]})} className="text-xs text-fuchsia-600 hover:text-fuchsia-800">+ 添加组分</button>
              </div>
              {report.formula.components.length > 0 && (
                <table className="w-full text-xs">
                  <thead className="bg-fuchsia-100"><tr><th className="px-2 py-1 text-left">组分</th><th className="px-2 py-1 w-20">浓度</th><th className="px-2 py-1 w-20">加入量</th><th className="px-2 py-1 w-20">批号</th><th className="px-2 py-1 text-left">备注</th><th className="w-8"></th></tr></thead>
                  <tbody>{report.formula.components.map((c, ci) => (
                    <tr key={ci} className="border-b border-fuchsia-100">
                      <td className="px-2 py-1"><input className="w-full bg-transparent border-none" value={c.name} onChange={(e) => { const nc = [...report.formula.components]; nc[ci] = {...nc[ci], name: e.target.value}; updateReport(rIndex, 'formula', {...report.formula, components: nc}); }} /></td>
                      <td className="px-2 py-1"><input className="w-full bg-transparent border-none text-right" value={c.concentration} onChange={(e) => { const nc = [...report.formula.components]; nc[ci] = {...nc[ci], concentration: e.target.value}; updateReport(rIndex, 'formula', {...report.formula, components: nc}); }} /></td>
                      <td className="px-2 py-1"><input className="w-full bg-transparent border-none text-right" value={c.amount} onChange={(e) => { const nc = [...report.formula.components]; nc[ci] = {...nc[ci], amount: e.target.value}; updateReport(rIndex, 'formula', {...report.formula, components: nc}); }} /></td>
                      <td className="px-2 py-1"><input className="w-full bg-transparent border-none" value={c.batchNo} onChange={(e) => { const nc = [...report.formula.components]; nc[ci] = {...nc[ci], batchNo: e.target.value}; updateReport(rIndex, 'formula', {...report.formula, components: nc}); }} /></td>
                      <td className="px-2 py-1"><input className="w-full bg-transparent border-none" value={c.note} onChange={(e) => { const nc = [...report.formula.components]; nc[ci] = {...nc[ci], note: e.target.value}; updateReport(rIndex, 'formula', {...report.formula, components: nc}); }} /></td>
                      <td className="px-2 py-1"><button type="button" onClick={() => updateReport(rIndex, 'formula', {...report.formula, components: report.formula.components.filter((_, i) => i !== ci)})} className="text-red-500 hover:text-red-700">×</button></td>
                    </tr>
                  ))}</tbody>
                </table>
              )}
            </div>
            <div className="bg-amber-50 rounded-lg p-4 border border-amber-200">
              <SectionTitle number={4} title="产出与交接" color="amber" />
              <div className="grid grid-cols-4 gap-4">
                <div><label className="label">是否有产出</label><SelectInput options={DROPDOWN_OPTIONS.yesNo} value={report.hasOutput} onChange={(v) => updateReport(rIndex, 'hasOutput', v)} /></div>
                {report.hasOutput === '是' && <>
                  <div><label className="label">产出类型</label><SelectInput options={DROPDOWN_OPTIONS.outputType} value={report.outputType} onChange={(v) => updateReport(rIndex, 'outputType', v)} /></div>
                  <div><label className="label">产出名称</label><input className="input" placeholder="如 上样液" value={report.outputName} onChange={(e) => updateReport(rIndex, 'outputName', e.target.value)} /></div>
                  <div><label className="label">编号/数量</label><input className="input" placeholder="如 OUT-001 / 400μL" value={report.outputNo} onChange={(e) => updateReport(rIndex, 'outputNo', e.target.value)} /></div>
                </>}
                <div><label className="label">是否已交接</label><SelectInput options={DROPDOWN_OPTIONS.yesNo} value={report.hasHandOver} onChange={(v) => updateReport(rIndex, 'hasHandOver', v)} /></div>
                {report.hasHandOver === '是' && <>
                  <div><label className="label">接收人</label><input className="input" placeholder="如 李四" value={report.receiver} onChange={(e) => updateReport(rIndex, 'receiver', e.target.value)} /></div>
                  <div><label className="label">交接时间</label><input className="input" placeholder="如 16:30" value={report.handoverTime} onChange={(e) => updateReport(rIndex, 'handoverTime', e.target.value)} /></div>
                  <div><label className="label">交接单编号</label><input className="input" placeholder="如 HO-20260408-01" value={report.handoverNo} onChange={(e) => updateReport(rIndex, 'handoverNo', e.target.value)} /></div>
                </>}
              </div>
            </div>
            <div className="bg-red-50 rounded-lg p-4 border border-red-200">
              <SectionTitle number={5} title="异常与风险评估" color="red" />
              <div className="grid grid-cols-4 gap-4">
                <div><label className="label">是否存在异常</label><SelectInput options={DROPDOWN_OPTIONS.yesNo} value={report.hasAbnormal} onChange={(v) => updateReport(rIndex, 'hasAbnormal', v)} /></div>
                {report.hasAbnormal === '是' && <>
                  <div><label className="label">异常类型</label><SelectInput options={DROPDOWN_OPTIONS.abnormalTypes} value={report.abnormalType} onChange={(v) => updateReport(rIndex, 'abnormalType', v)} /></div>
                  <div className="col-span-2"><label className="label">异常描述</label><input className="input" placeholder="详细描述" value={report.abnormalDesc} onChange={(e) => updateReport(rIndex, 'abnormalDesc', e.target.value)} /></div>
                  <div><label className="label">原因分析</label><input className="input" placeholder="初步分析" value={report.causeAnalysis} onChange={(e) => updateReport(rIndex, 'causeAnalysis', e.target.value)} /></div>
                  <div><label className="label">已采取措施</label><input className="input" placeholder="应对措施" value={report.measuresTaken} onChange={(e) => updateReport(rIndex, 'measuresTaken', e.target.value)} /></div>
                  <div><label className="label">对芯片影响</label><SelectInput options={DROPDOWN_OPTIONS.impactTypes} value={report.impactOnChip} onChange={(v) => updateReport(rIndex, 'impactOnChip', v)} /></div>
                  <div><label className="label">需协调支持</label><SelectInput options={DROPDOWN_OPTIONS.yesNo} value={report.needSupport} onChange={(v) => updateReport(rIndex, 'needSupport', v)} /></div>
                  {report.needSupport === '是' && <div className="col-span-2"><label className="label">协调事项</label><input className="input" placeholder="需要哪些协调" value={report.supportItems} onChange={(e) => updateReport(rIndex, 'supportItems', e.target.value)} /></div>}
                </>}
              </div>
            </div>
            <div className="bg-teal-50 rounded-lg p-4 border border-teal-200">
              <SectionTitle number={6} title="明日计划" color="teal" />
              <div className="grid grid-cols-4 gap-4">
                <div className="col-span-2"><label className="label">明日计划</label><textarea className="input h-16" placeholder="描述明日工作计划..." value={report.tomorrowPlan} onChange={(e) => updateReport(rIndex, 'tomorrowPlan', e.target.value)} /></div>
                <div><label className="label">优先事项</label><input className="input" placeholder="重点任务" value={report.priorityItems} onChange={(e) => updateReport(rIndex, 'priorityItems', e.target.value)} /></div>
                <div><label className="label">需芯片组配合</label><SelectInput options={DROPDOWN_OPTIONS.yesNo} value={report.needChipCooperation} onChange={(v) => updateReport(rIndex, 'needChipCooperation', v)} /></div>
                {report.needChipCooperation === '是' && <div className="col-span-2"><label className="label">配合事项</label><input className="input" placeholder="需要配合的内容" value={report.cooperationItems} onChange={(e) => updateReport(rIndex, 'cooperationItems', e.target.value)} /></div>}
                <div><label className="label">待闭环事项</label><SelectInput options={DROPDOWN_OPTIONS.pendingClosed} value={report.hasPendingItems} onChange={(v) => updateReport(rIndex, 'hasPendingItems', v)} /></div>
                {report.hasPendingItems !== '否' && <div className="col-span-2"><label className="label">待闭环说明</label><input className="input" placeholder="待闭环的具体事项" value={report.pendingItems} onChange={(e) => updateReport(rIndex, 'pendingItems', e.target.value)} /></div>}
              </div>
            </div>
            <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
              <label className="label flex items-center gap-2 mb-3">
                <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                引用文档
              </label>
              <DocReference value={report.docRefs || []} onChange={(refs) => updateReport(rIndex, 'docRefs', refs)} placeholder="搜索 SOP、模板、指南..." maxItems={5} />
            </div>
          </div>
        </div>
      ))}
      <button type="button" onClick={() => { const newReport = createEmptyReport(date, user?.name || ''); setReports([...reports, newReport]); onChange([...reports, newReport]); }}
        className="w-full py-4 border-2 border-dashed border-indigo-300 rounded-lg text-indigo-600 hover:border-indigo-500 hover:bg-indigo-50 transition-colors flex items-center justify-center gap-2">
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
        添加工作日报
      </button>
    </div>
  );
}
