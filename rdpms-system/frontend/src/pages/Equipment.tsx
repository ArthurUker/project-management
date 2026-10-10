import { useCallback, useEffect, useMemo, useState } from 'react';
import { equipmentAPI, dictAPI } from '@/api';
import type { Equipment as EquipmentRow, EquipmentInput } from '@/api';
import { PERMS, useHasPerm } from '../auth/permissions';

/**
 * 设备/仪器台账（v1.1，2026-10-10）。
 * 数据来源：研发二楼设备清单（79 台盘点数据）。
 */

const STATUS_LABELS: Record<string, string> = {
  IN_USE: '在用',
  IDLE: '闲置',
  REPAIRING: '维修中',
  SCRAPPED: '已报废',
  DISPOSED: '已处置',
};

const STATUS_COLORS: Record<string, string> = {
  IN_USE: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  IDLE: 'bg-slate-100 text-slate-600 border-slate-200',
  REPAIRING: 'bg-amber-50 text-amber-700 border-amber-200',
  SCRAPPED: 'bg-rose-50 text-rose-700 border-rose-200',
  DISPOSED: 'bg-slate-100 text-slate-500 border-slate-200',
};

const EMPTY_FORM: EquipmentInput = {
  assetCode: '',
  name: '',
  category: '',
  model: '',
  manufacturer: '',
  quantity: 1,
  unit: '',
  location: '',
  custodian: '',
  startUseDate: '',
  nature: '',
  adminCode: '',
  status: 'IN_USE',
  inventoryResult: '',
  inventoryNote: '',
  notes: '',
};

export default function Equipment() {
  const canCreate = useHasPerm(PERMS.EQUIPMENT_CREATE);
  const canUpdate = useHasPerm(PERMS.EQUIPMENT_UPDATE);
  const canDelete = useHasPerm(PERMS.EQUIPMENT_DELETE);

  const [list, setList] = useState<EquipmentRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(50);
  const [keyword, setKeyword] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [categories, setCategories] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  const [editing, setEditing] = useState<EquipmentRow | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<EquipmentInput>({ ...EMPTY_FORM });
  const [deleting, setDeleting] = useState<EquipmentRow | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await equipmentAPI.list({
        page,
        pageSize,
        keyword: keyword || undefined,
        status: statusFilter === 'all' ? undefined : statusFilter,
        category: categoryFilter === 'all' ? undefined : categoryFilter,
      });
      setList(res.items || []);
      setTotal(res.total || 0);
      const cats = Array.from(new Set((res.items || []).map((r) => r.category).filter(Boolean))) as string[];
      setCategories((prev) => Array.from(new Set([...prev, ...cats])));
    } catch (e) {
      console.error('加载设备列表失败', e);
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, keyword, statusFilter, categoryFilter]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    // 类别下拉从字典兜底（Equipment 类别为自由文本，字典无对应枚举；这里仅用列表值）
    dictAPI.all().catch(() => undefined);
  }, []);

  const openNew = () => {
    setEditing(null);
    setForm({ ...EMPTY_FORM });
    setShowForm(true);
  };

  const openEdit = (row: EquipmentRow) => {
    setEditing(row);
    setForm({
      ...EMPTY_FORM,
      assetCode: row.code,
      name: row.name,
      category: row.category ?? '',
      model: row.model ?? '',
      manufacturer: row.manufacturer ?? '',
      quantity: row.quantity ?? 1,
      unit: row.unit ?? '',
      location: row.location ?? '',
      custodian: row.custodian ?? '',
      startUseDate: row.startUseDate ? String(row.startUseDate).slice(0, 10) : '',
      nature: row.nature ?? '',
      adminCode: row.adminCode ?? '',
      status: row.status ?? 'IN_USE',
      inventoryResult: row.inventoryResult ?? '',
      inventoryNote: row.inventoryNote ?? '',
      notes: row.notes ?? '',
    });
    setShowForm(true);
  };

  const save = async () => {
    if (!form.assetCode || !String(form.assetCode).trim()) {
      alert('资产编码必填');
      return;
    }
    if (!form.name || !String(form.name).trim()) {
      alert('设备名称必填');
      return;
    }
    setSaving(true);
    try {
      const payload: EquipmentInput = {
        ...form,
        quantity: Number(form.quantity) || 1,
        startUseDate: form.startUseDate ? String(form.startUseDate) : null,
      };
      if (editing) {
        const { assetCode: _assetCode, ...rest } = payload;
        void _assetCode;
        await equipmentAPI.update(editing.id, rest);
      } else {
        await equipmentAPI.create(payload);
      }
      setShowForm(false);
      await load();
    } catch (e) {
      console.error('保存设备失败', e);
      alert('保存失败：' + (e instanceof Error ? e.message : String(e)));
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!deleting) return;
    try {
      await equipmentAPI.remove(deleting.id);
      setDeleting(null);
      await load();
    } catch (e) {
      console.error('删除设备失败', e);
      alert('删除失败：' + (e instanceof Error ? e.message : String(e)));
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const statusOptions = useMemo(() => Object.keys(STATUS_LABELS), []);

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-slate-200/80 bg-white px-4 py-3 shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-lg font-semibold text-gray-900">设备台账</h2>
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">共 {total} 台</span>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <input
              className="input w-56"
              placeholder="搜索 名称 / 编码 / 型号"
              value={keyword}
              onChange={(e) => {
                setPage(1);
                setKeyword(e.target.value);
              }}
            />
            <select
              className="input w-32 bg-white"
              value={statusFilter}
              onChange={(e) => {
                setPage(1);
                setStatusFilter(e.target.value);
              }}
            >
              <option value="all">全部状态</option>
              {statusOptions.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABELS[s]}
                </option>
              ))}
            </select>
            <select
              className="input w-36 bg-white"
              value={categoryFilter}
              onChange={(e) => {
                setPage(1);
                setCategoryFilter(e.target.value);
              }}
            >
              <option value="all">全部类别</option>
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            {canCreate && (
              <button onClick={openNew} className="rounded-lg bg-primary-600 px-3 py-2 text-sm font-medium text-white hover:bg-primary-700">
                新增设备
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-slate-200/80 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-slate-100 text-sm">
          <thead className="bg-slate-50/80 text-xs text-slate-500">
            <tr>
              <th className="px-4 py-3 text-left">资产编码</th>
              <th className="px-4 py-3 text-left">设备名称</th>
              <th className="px-4 py-3 text-left">类别</th>
              <th className="px-4 py-3 text-left">规格型号</th>
              <th className="px-4 py-3 text-left">位置</th>
              <th className="px-4 py-3 text-left">制造商</th>
              <th className="px-4 py-3 text-center">数量</th>
              <th className="px-4 py-3 text-left">开始使用</th>
              <th className="px-4 py-3 text-center">状态</th>
              <th className="px-4 py-3 text-center">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {loading ? (
              <tr>
                <td colSpan={10} className="px-4 py-10 text-center text-slate-400">
                  加载中…
                </td>
              </tr>
            ) : list.length === 0 ? (
              <tr>
                <td colSpan={10} className="px-4 py-10 text-center text-slate-400">
                  暂无设备数据
                </td>
              </tr>
            ) : (
              list.map((row) => (
                <tr key={row.id} className="hover:bg-slate-50/60">
                  <td className="px-4 py-2.5 font-mono text-xs text-slate-600">{row.code}</td>
                  <td className="px-4 py-2.5 font-medium text-gray-800">{row.name}</td>
                  <td className="px-4 py-2.5 text-slate-600">{row.category || '-'}</td>
                  <td className="max-w-[200px] truncate px-4 py-2.5 text-slate-600" title={row.model || ''}>
                    {row.model || '-'}
                  </td>
                  <td className="px-4 py-2.5 text-slate-600">{row.location || '-'}</td>
                  <td className="max-w-[180px] truncate px-4 py-2.5 text-slate-600" title={row.manufacturer || ''}>
                    {row.manufacturer || '-'}
                  </td>
                  <td className="px-4 py-2.5 text-center text-slate-600">{row.quantity ?? 1}</td>
                  <td className="px-4 py-2.5 text-slate-600">{row.startUseDate ? String(row.startUseDate).slice(0, 10) : '-'}</td>
                  <td className="px-4 py-2.5 text-center">
                    <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] ${STATUS_COLORS[row.status || 'IN_USE'] || STATUS_COLORS.IN_USE}`}>
                      {STATUS_LABELS[row.status || 'IN_USE'] || row.status}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    <div className="flex items-center justify-center gap-2">
                      {canUpdate && (
                        <button className="text-xs text-primary-600 hover:underline" onClick={() => openEdit(row)}>
                          编辑
                        </button>
                      )}
                      {canDelete && (
                        <button className="text-xs text-rose-600 hover:underline" onClick={() => setDeleting(row)}>
                          删除
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        <div className="flex items-center justify-between px-4 py-3 text-xs text-slate-500">
          <span>
            第 {page} / {totalPages} 页
          </span>
          <div className="flex gap-2">
            <button className="rounded border border-slate-200 px-2 py-1 disabled:opacity-40" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              上一页
            </button>
            <button
              className="rounded border border-slate-200 px-2 py-1 disabled:opacity-40"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              下一页
            </button>
          </div>
        </div>
      </div>

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
            <h3 className="mb-4 text-base font-semibold text-gray-900">{editing ? `编辑设备：${editing.code}` : '新增设备'}</h3>
            <div className="grid gap-3 md:grid-cols-2">
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-gray-600">资产编码 *</span>
                <input className="input" value={String(form.assetCode || '')} disabled={!!editing} onChange={(e) => setForm({ ...form, assetCode: e.target.value })} placeholder="如 DQ022003003" />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-gray-600">设备名称 *</span>
                <input className="input" value={String(form.name || '')} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-gray-600">资产类别</span>
                <input className="input" value={String(form.category || '')} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="机器设备 / 办公家具 / 电子设备" />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-gray-600">规格型号</span>
                <input className="input" value={String(form.model || '')} onChange={(e) => setForm({ ...form, model: e.target.value })} />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-gray-600">制造商</span>
                <input className="input" value={String(form.manufacturer || '')} onChange={(e) => setForm({ ...form, manufacturer: e.target.value })} />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-gray-600">存放位置</span>
                <input className="input" value={String(form.location || '')} onChange={(e) => setForm({ ...form, location: e.target.value })} placeholder="如 二楼研发实验室1" />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-gray-600">数量</span>
                <input className="input" type="number" min={1} value={String(form.quantity ?? 1)} onChange={(e) => setForm({ ...form, quantity: Number(e.target.value) })} />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-gray-600">开始使用日期</span>
                <input className="input" type="date" value={String(form.startUseDate || '')} onChange={(e) => setForm({ ...form, startUseDate: e.target.value })} />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-gray-600">状态</span>
                <select className="input bg-white" value={String(form.status || 'IN_USE')} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                  {statusOptions.map((s) => (
                    <option key={s} value={s}>
                      {STATUS_LABELS[s]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-gray-600">保管人</span>
                <input className="input" value={String(form.custodian || '')} onChange={(e) => setForm({ ...form, custodian: e.target.value })} />
              </label>
              <label className="md:col-span-2 block">
                <span className="mb-1 block text-xs font-medium text-gray-600">备注</span>
                <textarea className="input min-h-[70px]" value={String(form.notes || '')} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
              </label>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50" onClick={() => setShowForm(false)}>
                取消
              </button>
              <button className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50" disabled={saving} onClick={save}>
                {saving ? '保存中…' : '保存'}
              </button>
            </div>
          </div>
        </div>
      )}

      {deleting && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
            <h3 className="text-base font-semibold text-gray-900">确认删除？</h3>
            <p className="mt-2 text-sm text-slate-600">
              将删除设备 <span className="font-medium">{deleting.code} {deleting.name}</span>（软删除，可在审计中追溯）。
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50" onClick={() => setDeleting(null)}>
                取消
              </button>
              <button className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-medium text-white hover:bg-rose-700" onClick={remove}>
                删除
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
