import { useCallback, useEffect, useState } from 'react';
import { reagentLotsAPI, storageLocationsAPI } from '@/api';
import type { ReagentLot, StorageLocation } from '@/api';
import { PERMS, useHasPerm } from '../auth/permissions';

/**
 * 库存批次台账（v1.1，2026-10-10）。
 * 展示导入的 3272 条批次/库存数据（批号、规格、数量、库位、开封状态…），支持就地编辑。
 */

const LOT_STATUS_LABELS: Record<string, string> = {
  AVAILABLE: '可用',
  RESERVED: '已预留',
  DEPLETED: '已用完',
  EXPIRED: '已过期',
  QUARANTINED: '隔离中',
  DISPOSED: '已销毁',
};

const OPENED_LABELS: Record<string, string> = { SEALED: '未开封', OPENED: '已开封' };

interface EditForm {
  quantity: string;
  unit: string;
  spec: string;
  containerCount: string;
  openedStatus: string;
  form: string;
  locationId: string;
  notes: string;
  status: string;
}

export default function Inventory() {
  const canUpdate = useHasPerm(PERMS.REAGENTS_UPDATE);

  const [list, setList] = useState<ReagentLot[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(50);
  const [keyword, setKeyword] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [loading, setLoading] = useState(false);

  const [locations, setLocations] = useState<StorageLocation[]>([]);
  const [editing, setEditing] = useState<ReagentLot | null>(null);
  const [form, setForm] = useState<EditForm | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await reagentLotsAPI.list({
        page,
        pageSize,
        keyword: keyword || undefined,
        status: statusFilter === 'all' ? undefined : statusFilter,
      });
      setList(res.items || []);
      setTotal(res.total || 0);
    } catch (e) {
      console.error('加载批次失败', e);
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, keyword, statusFilter]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    storageLocationsAPI
      .list()
      .then((res) => setLocations(res.list || []))
      .catch(() => undefined);
  }, []);

  const openEdit = (row: ReagentLot) => {
    setEditing(row);
    setForm({
      quantity: String(row.quantity ?? ''),
      unit: row.unit || '',
      spec: row.spec || '',
      containerCount: row.containerCount != null ? String(row.containerCount) : '',
      openedStatus: row.openedStatus || '',
      form: row.form || '',
      locationId: row.locationId || '',
      notes: row.notes || '',
      status: row.status || 'AVAILABLE',
    });
  };

  const save = async () => {
    if (!editing || !form) return;
    setSaving(true);
    try {
      await reagentLotsAPI.update(editing.id, {
        quantity: form.quantity,
        unit: form.unit || '未标注',
        spec: form.spec || null,
        containerCount: form.containerCount === '' ? null : form.containerCount,
        openedStatus: form.openedStatus === '' ? null : (form.openedStatus as 'SEALED' | 'OPENED'),
        form: form.form || null,
        locationId: form.locationId || null,
        notes: form.notes || null,
        status: form.status,
      });
      setEditing(null);
      setForm(null);
      await load();
    } catch (e) {
      console.error('保存批次失败', e);
      alert('保存失败：' + (e instanceof Error ? e.message : String(e)));
    } finally {
      setSaving(false);
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-slate-200/80 bg-white px-4 py-3 shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-lg font-semibold text-gray-900">库存批次台账</h2>
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">共 {total} 条批次</span>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <input
              className="input w-56"
              placeholder="搜索 批号 / 物料"
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
              {Object.entries(LOT_STATUS_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-slate-200/80 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-slate-100 text-sm">
          <thead className="bg-slate-50/80 text-xs text-slate-500">
            <tr>
              <th className="px-3 py-3 text-left">物料</th>
              <th className="px-3 py-3 text-left">批号</th>
              <th className="px-3 py-3 text-left">规格</th>
              <th className="px-3 py-3 text-right">数量</th>
              <th className="px-3 py-3 text-center">管数</th>
              <th className="px-3 py-3 text-center">开封</th>
              <th className="px-3 py-3 text-left">形态</th>
              <th className="px-3 py-3 text-left">库位</th>
              <th className="px-3 py-3 text-left">收到</th>
              <th className="px-3 py-3 text-center">状态</th>
              {canUpdate && <th className="px-3 py-3 text-center">操作</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {loading ? (
              <tr>
                <td colSpan={canUpdate ? 11 : 10} className="px-4 py-10 text-center text-slate-400">
                  加载中…
                </td>
              </tr>
            ) : list.length === 0 ? (
              <tr>
                <td colSpan={canUpdate ? 11 : 10} className="px-4 py-10 text-center text-slate-400">
                  暂无批次数据
                </td>
              </tr>
            ) : (
              list.map((row) => (
                <tr key={row.id} className="hover:bg-slate-50/60">
                  <td className="max-w-[220px] px-3 py-2">
                    <div className="truncate font-medium text-gray-800" title={row.material?.commonName || ''}>
                      {row.material?.commonName || '-'}
                    </div>
                    <div className="font-mono text-[10px] text-slate-400">{row.material?.code}</div>
                  </td>
                  <td className="max-w-[140px] truncate px-3 py-2 text-slate-600" title={row.lotNo}>
                    {row.lotNo}
                  </td>
                  <td className="max-w-[160px] truncate px-3 py-2 text-slate-600" title={row.spec || ''}>
                    {row.spec || '-'}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-right text-slate-700">
                    {String(row.quantity)}
                    <span className="ml-1 text-xs text-slate-400">{row.unit}</span>
                  </td>
                  <td className="px-3 py-2 text-center text-slate-600">{row.containerCount != null ? String(row.containerCount) : '-'}</td>
                  <td className="px-3 py-2 text-center text-xs text-slate-600">{row.openedStatus ? OPENED_LABELS[row.openedStatus] : '-'}</td>
                  <td className="max-w-[100px] truncate px-3 py-2 text-slate-600" title={row.form || ''}>
                    {row.form || '-'}
                  </td>
                  <td className="max-w-[220px] truncate px-3 py-2 text-xs text-slate-500" title={row.storage?.path || row.location || ''}>
                    {row.storage?.path || row.location || '-'}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-xs text-slate-500">{row.receivedAt ? String(row.receivedAt).slice(0, 10) : '-'}</td>
                  <td className="px-3 py-2 text-center">
                    <span className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] text-slate-600">
                      {LOT_STATUS_LABELS[row.status || 'AVAILABLE'] || row.status}
                    </span>
                  </td>
                  {canUpdate && (
                    <td className="px-3 py-2 text-center">
                      <button className="text-xs text-primary-600 hover:underline" onClick={() => openEdit(row)}>
                        编辑
                      </button>
                    </td>
                  )}
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

      {editing && form && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
            <h3 className="mb-1 text-base font-semibold text-gray-900">编辑批次</h3>
            <p className="mb-4 text-xs text-slate-500">
              {editing.material?.commonName} / {editing.lotNo}
            </p>
            <div className="grid gap-3 md:grid-cols-2">
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-gray-600">数量</span>
                <input className="input" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-gray-600">单位</span>
                <input className="input" value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} placeholder="µL / 管 / g …" />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-gray-600">包装规格</span>
                <input className="input" value={form.spec} onChange={(e) => setForm({ ...form, spec: e.target.value })} placeholder='如 "2OD,100µM"' />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-gray-600">管数</span>
                <input className="input" value={form.containerCount} onChange={(e) => setForm({ ...form, containerCount: e.target.value })} />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-gray-600">开封状态</span>
                <select className="input bg-white" value={form.openedStatus} onChange={(e) => setForm({ ...form, openedStatus: e.target.value })}>
                  <option value="">未标注</option>
                  <option value="SEALED">未开封</option>
                  <option value="OPENED">已开封</option>
                </select>
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-gray-600">形态</span>
                <input className="input" value={form.form} onChange={(e) => setForm({ ...form, form: e.target.value })} placeholder="干粉 / 已复溶液体 …" />
              </label>
              <label className="md:col-span-2 block">
                <span className="mb-1 block text-xs font-medium text-gray-600">库位</span>
                <select className="input bg-white" value={form.locationId} onChange={(e) => setForm({ ...form, locationId: e.target.value })}>
                  <option value="">未关联（保留原始位置文本）</option>
                  {locations.map((loc) => (
                    <option key={loc.id} value={loc.id}>
                      {loc.path}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-gray-600">状态</span>
                <select className="input bg-white" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                  {Object.entries(LOT_STATUS_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </label>
              <label className="md:col-span-2 block">
                <span className="mb-1 block text-xs font-medium text-gray-600">备注</span>
                <textarea className="input min-h-[70px]" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
              </label>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50" onClick={() => { setEditing(null); setForm(null); }}>
                取消
              </button>
              <button className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50" disabled={saving} onClick={save}>
                {saving ? '保存中…' : '保存'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
