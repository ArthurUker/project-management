import { useCallback, useEffect, useState } from 'react';
import { storageLocationsAPI } from '@/api';
import type { StorageLocation } from '@/api';
import { PERMS, useHasPerm } from '../auth/permissions';

/**
 * 库位管理（v1.1，2026-10-10）。
 * 结构：房间 → 柜/冰箱 → 层 → 盒/袋（自关联树 + 物化路径）。
 */

const TYPE_LABELS: Record<string, string> = {
  ROOM: '房间',
  CABINET: '柜',
  FRIDGE: '冰箱',
  FREEZER: '冷冻柜',
  SHELF: '层架',
  DRAWER: '抽屉',
  BOX: '盒',
  BAG: '袋',
  OTHER: '其他',
};

const TYPE_ICONS: Record<string, string> = {
  ROOM: '🏠',
  CABINET: '🗄️',
  FRIDGE: '🧊',
  FREEZER: '❄️',
  SHELF: '📚',
  DRAWER: '🗃️',
  BOX: '📦',
  BAG: '🛍️',
  OTHER: '📍',
};

interface FlatItem extends StorageLocation {
  depth: number;
}

function flattenTree(tree: StorageLocation[], depth = 0): FlatItem[] {
  const out: FlatItem[] = [];
  for (const node of tree) {
    out.push({ ...node, depth });
    if (node.children && node.children.length > 0) {
      out.push(...flattenTree(node.children, depth + 1));
    }
  }
  return out;
}

export default function StorageLocations() {
  const canManage = useHasPerm(PERMS.STORAGE_LOCATIONS_MANAGE);

  const [items, setItems] = useState<FlatItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [keyword, setKeyword] = useState('');

  const [editing, setEditing] = useState<StorageLocation | null>(null);
  const [parentForNew, setParentForNew] = useState<StorageLocation | null | undefined>(undefined);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', type: 'SHELF', notes: '' });
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<StorageLocation | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await storageLocationsAPI.tree();
      const flat = flattenTree(res.tree || []);
      setItems(flat);
      // 默认展开前两层
      setExpanded((prev) => {
        if (prev.size > 0) return prev;
        const init = new Set<string>();
        flat.forEach((n) => {
          if (n.depth < 2) init.add(n.id);
        });
        return init;
      });
    } catch (e) {
      console.error('加载库位失败', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const openNew = (parent: StorageLocation | null) => {
    setEditing(null);
    setParentForNew(parent);
    setForm({ name: '', type: parent ? 'SHELF' : 'ROOM', notes: '' });
    setShowForm(true);
  };

  const openEdit = (node: StorageLocation) => {
    setEditing(node);
    setParentForNew(undefined);
    setForm({ name: node.name, type: node.type, notes: node.notes ?? '' });
    setShowForm(true);
  };

  const save = async () => {
    if (!form.name.trim()) {
      alert('库位名称必填');
      return;
    }
    setSaving(true);
    try {
      if (editing) {
        await storageLocationsAPI.update(editing.id, { name: form.name.trim(), type: form.type, notes: form.notes || null });
      } else {
        await storageLocationsAPI.create({
          name: form.name.trim(),
          type: form.type,
          parentId: parentForNew ? parentForNew.id : null,
          notes: form.notes || null,
        });
      }
      setShowForm(false);
      await load();
    } catch (e) {
      console.error('保存库位失败', e);
      alert('保存失败：' + (e instanceof Error ? e.message : String(e)));
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!deleting) return;
    try {
      await storageLocationsAPI.remove(deleting.id);
      setDeleting(null);
      await load();
    } catch (e) {
      console.error('删除库位失败', e);
      alert('删除失败：' + (e instanceof Error ? e.message : String(e)));
    }
  };

  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const visible = keyword.trim()
    ? items.filter((n) => `${n.name} ${n.path} ${n.code}`.toLowerCase().includes(keyword.trim().toLowerCase()))
    : items.filter((n) => {
        // 折叠逻辑：显示所有祖先已展开的节点
        let cur = n;
        while (cur.parentId) {
          const parent = items.find((x) => x.id === cur.parentId);
          if (!parent || !expanded.has(parent.id)) return false;
          cur = parent;
        }
        return true;
      });

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-slate-200/80 bg-white px-4 py-3 shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-lg font-semibold text-gray-900">库位管理</h2>
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">共 {items.length} 个库位</span>
          <div className="ml-auto flex items-center gap-2">
            <input className="input w-56" placeholder="搜索 名称 / 路径 / 编码" value={keyword} onChange={(e) => setKeyword(e.target.value)} />
            {canManage && (
              <button onClick={() => openNew(null)} className="rounded-lg bg-primary-600 px-3 py-2 text-sm font-medium text-white hover:bg-primary-700">
                新增根库位
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200/80 bg-white shadow-sm">
        {loading ? (
          <div className="px-4 py-10 text-center text-sm text-slate-400">加载中…</div>
        ) : visible.length === 0 ? (
          <div className="px-4 py-10 text-center text-sm text-slate-400">暂无库位数据</div>
        ) : (
          <ul className="divide-y divide-slate-50">
            {visible.map((node) => {
              const hasChildren = items.some((x) => x.parentId === node.id);
              return (
                <li key={node.id} className="flex items-center gap-2 px-4 py-2 hover:bg-slate-50/60" style={{ paddingLeft: `${16 + node.depth * 24}px` }}>
                  {hasChildren ? (
                    <button className="w-5 text-xs text-slate-400 hover:text-slate-700" onClick={() => toggleExpand(node.id)}>
                      {expanded.has(node.id) ? '▾' : '▸'}
                    </button>
                  ) : (
                    <span className="w-5 text-center text-[10px] text-slate-300">·</span>
                  )}
                  <span>{TYPE_ICONS[node.type] || '📍'}</span>
                  <span className="font-medium text-gray-800">{node.name}</span>
                  <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500">{TYPE_LABELS[node.type] || node.type}</span>
                  <span className="font-mono text-[10px] text-slate-400">{node.code}</span>
                  <span className="ml-2 hidden flex-1 truncate text-xs text-slate-400 md:block" title={node.path}>
                    {node.path}
                  </span>
                  {canManage && (
                    <span className="ml-auto flex items-center gap-2">
                      <button className="text-xs text-primary-600 hover:underline" onClick={() => openNew(node)}>
                        加子级
                      </button>
                      <button className="text-xs text-slate-600 hover:underline" onClick={() => openEdit(node)}>
                        编辑
                      </button>
                      <button className="text-xs text-rose-600 hover:underline" onClick={() => setDeleting(node)}>
                        删除
                      </button>
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <h3 className="mb-4 text-base font-semibold text-gray-900">
              {editing ? `编辑库位：${editing.name}` : parentForNew ? `在「${parentForNew.name}」下新增子库位` : '新增根库位'}
            </h3>
            <div className="space-y-3">
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-gray-600">名称 *</span>
                <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="如 -20℃第1层 / 盒7" />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-gray-600">类型</span>
                <select className="input bg-white" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                  {Object.entries(TYPE_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-gray-600">备注</span>
                <textarea className="input min-h-[60px]" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
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
            <h3 className="text-base font-semibold text-gray-900">确认删除库位？</h3>
            <p className="mt-2 text-sm text-slate-600">
              将删除 <span className="font-medium">{deleting.name}</span>（{deleting.path}）。存在子库位或批次引用时会被拒绝。
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
