import React from 'react';

export interface Project {
  id: string;
  name: string;
  code: string;
  type?: string;
  subtype?: string;
  status?: string;
  position?: string;
  managerId?: string;
  manager?: { id: string; name: string };
  memberCount?: number;
  taskCount?: number;
  taskDoneCount?: number;
  startDate?: string | null;
  endDate?: string | null;
  tags?: string[];
}

interface ProjectCardProps {
  project: Project;
  selected?: boolean;
  onSelect?: (id: string, checked: boolean) => void;
  onEdit?: (project: Project) => void;
  onClick?: (project: Project) => void;
}

// ── 状态配置 ──────────────────────────────────────────
const STATUS_CONFIG: Record<string, { label: string; bg: string; text: string; dot: string }> = {
  '规划中': { label: '规划中', bg: '#f3f4f6', text: '#6b7280', dot: '#9ca3af' },
  '进行中': { label: '进行中', bg: '#dbeafe', text: '#1d4ed8', dot: '#3b82f6' },
  '待加工': { label: '待加工', bg: '#ffedd5', text: '#ea580c', dot: '#f97316' },
  '待验证': { label: '待验证', bg: '#ede9fe', text: '#7c3aed', dot: '#8b5cf6' },
  '已完成': { label: '已完成', bg: '#dcfce7', text: '#15803d', dot: '#22c55e' },
  '已归档': { label: '已归档', bg: '#f3f4f6', text: '#9ca3af', dot: '#d1d5db' },
};

// ── 根据项目 code/type 生成渐变色 ─────────────────────
const COLOR_PALETTES = [
  { bar: 'linear-gradient(90deg,#3b82f6,#60a5fa)', avatar: 'linear-gradient(135deg,#3b82f6,#1d4ed8)' },
  { bar: 'linear-gradient(90deg,#10b981,#34d399)', avatar: 'linear-gradient(135deg,#10b981,#059669)' },
  { bar: 'linear-gradient(90deg,#f59e0b,#fbbf24)', avatar: 'linear-gradient(135deg,#f59e0b,#d97706)' },
  { bar: 'linear-gradient(90deg,#6366f1,#818cf8)', avatar: 'linear-gradient(135deg,#6366f1,#4f46e5)' },
  { bar: 'linear-gradient(90deg,#8b5cf6,#a78bfa)', avatar: 'linear-gradient(135deg,#8b5cf6,#6d28d9)' },
  { bar: 'linear-gradient(90deg,#ec4899,#f472b6)', avatar: 'linear-gradient(135deg,#ec4899,#be185d)' },
  { bar: 'linear-gradient(90deg,#14b8a6,#2dd4bf)', avatar: 'linear-gradient(135deg,#14b8a6,#0f766e)' },
  { bar: 'linear-gradient(90deg,#374151,#6b7280)', avatar: 'linear-gradient(135deg,#374151,#111827)' },
];

function getColorPalette(seed: string) {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = seed.charCodeAt(i) + ((hash << 5) - hash);
  }
  return COLOR_PALETTES[Math.abs(hash) % COLOR_PALETTES.length];
}

function getAvatarLabel(code: string) {
  if (!code) return '??';
  // 取前4个字符，去掉连字符和数字前缀
  const clean = code.replace(/^(PRJ|APP|TEST|COOP|PLATFORM)-?/i, '');
  return clean.slice(0, 4).toUpperCase() || code.slice(0, 3).toUpperCase();
}

// ── 主组件 ────────────────────────────────────────────
const ProjectCard: React.FC<ProjectCardProps> = ({
  project,
  selected = false,
  onSelect,
  onEdit,
  onClick,
}) => {
  const palette   = getColorPalette(project.code || project.id);
  const statusCfg = STATUS_CONFIG[project.status ?? ''] ?? STATUS_CONFIG['规划中'];
  const avatarLabel = getAvatarLabel(project.code);

  const total    = project.taskCount     ?? 0;
  const done     = project.taskDoneCount ?? 0;
  const progress = total > 0 ? Math.round((done / total) * 100) : 0;

  const managerName = project.manager?.name ?? '未分配';
  const managerInitial = managerName.slice(0, 1);

  const allTags = [
    project.type,
    project.subtype,
    ...(project.tags ?? []),
  ].filter(Boolean) as string[];

  return (
    <div
      style={{
        background: '#fff',
        borderRadius: '14px',
        border: selected ? '1.5px solid #3b82f6' : '1px solid #e5e7eb',
        overflow: 'hidden',
        cursor: 'pointer',
        transition: 'all .2s cubic-bezier(.4,0,.2,1)',
        boxShadow: selected ? '0 0 0 3px rgba(59,130,246,.15)' : 'none',
        position: 'relative',
      }}
      className="project-card"
      onMouseEnter={e => {
        if (!selected) {
          (e.currentTarget as HTMLDivElement).style.transform = 'translateY(-3px)';
          (e.currentTarget as HTMLDivElement).style.boxShadow = '0 12px 32px rgba(0,0,0,.10)';
        }
      }}
      onMouseLeave={e => {
        if (!selected) {
          (e.currentTarget as HTMLDivElement).style.transform = '';
          (e.currentTarget as HTMLDivElement).style.boxShadow = 'none';
        }
      }}
      onClick={() => onClick?.(project)}
    >
      {/* 顶部渐变色线 */}
      <div style={{ height: '4px', background: palette.bar }} />

      <div style={{ padding: '16px' }}>

        {/* ── 标题行 ── */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, minWidth: 0 }}>

            {/* 复选框（hover 显示） */}
            {onSelect && (
              <input
                type="checkbox"
                checked={selected}
                style={{ flexShrink: 0, width: '14px', height: '14px', accentColor: '#3b82f6', cursor: 'pointer' }}
                onChange={e => { e.stopPropagation(); onSelect(project.id, e.target.checked); }}
                onClick={e => e.stopPropagation()}
              />
            )}

            {/* 项目头像 */}
            <div style={{
              width: '36px', height: '36px', borderRadius: '10px',
              background: palette.avatar,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#fff', fontSize: '9px', fontWeight: 800, flexShrink: 0,
              letterSpacing: '-0.5px',
            }}>
              {avatarLabel}
            </div>

            {/* 名称 + 编号 */}
            <div style={{ minWidth: 0 }}>
              <div style={{
                fontSize: '14px', fontWeight: 600, color: '#111827',
                lineHeight: 1.3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              }}>
                {project.name}
              </div>
              <div style={{ fontSize: '11px', color: '#9ca3af', fontFamily: 'monospace', marginTop: '1px' }}>
                {project.code}
              </div>
            </div>
          </div>

          {/* 三点菜单 */}
          <button
            className="menu-btn"
            style={{
              width: '26px', height: '26px', border: 'none', background: 'transparent',
              borderRadius: '6px', cursor: 'pointer', display: 'flex',
              alignItems: 'center', justifyContent: 'center', color: '#9ca3af',
              flexShrink: 0, opacity: 0, transition: 'opacity .15s',
            }}
            onClick={e => { e.stopPropagation(); onEdit?.(project); }}
          >
            <svg width="14" height="14" fill="currentColor" viewBox="0 0 24 24">
              <circle cx="12" cy="5" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="12" cy="19" r="1.8"/>
            </svg>
          </button>
        </div>

        {/* ── 标签行 ── */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px', marginBottom: '12px' }}>
          {allTags.slice(0, 3).map(tag => (
            <span key={tag} style={{
              display: 'inline-flex', alignItems: 'center',
              padding: '2px 8px', borderRadius: '5px',
              fontSize: '11px', fontWeight: 500,
              background: '#f3f4f6', color: '#4b5563',
            }}>
              {tag}
            </span>
          ))}
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: '3px',
            padding: '2px 8px', borderRadius: '5px',
            fontSize: '11px', fontWeight: 500,
            background: statusCfg.bg, color: statusCfg.text,
          }}>
            <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: statusCfg.dot, display: 'inline-block' }} />
            {statusCfg.label}
          </span>
        </div>

        {/* ── 任务进度 ── */}
        <div style={{ marginBottom: '12px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#9ca3af', marginBottom: '5px' }}>
            <span>任务进度</span>
            <span style={{ fontWeight: 600, color: '#6b7280' }}>{done}/{total}</span>
          </div>
          <div style={{ height: '5px', borderRadius: '3px', background: '#f3f4f6', overflow: 'hidden' }}>
            <div style={{
              height: '100%', borderRadius: '3px',
              background: palette.bar,
              width: `${progress}%`,
              transition: 'width .3s ease',
            }} />
          </div>
        </div>

        {/* ── 底部：成员数 + 负责人 ── */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          paddingTop: '10px', borderTop: '1px solid #f3f4f6',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', color: '#9ca3af' }}>
            <svg width="13" height="13" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
              <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/>
              <circle cx="9" cy="7" r="4"/>
              <path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/>
            </svg>
            {project.memberCount ?? 0}人
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <div style={{
              width: '24px', height: '24px', borderRadius: '50%',
              background: palette.avatar,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#fff', fontSize: '10px', fontWeight: 700,
            }}>
              {managerInitial}
            </div>
            <span style={{ fontSize: '12px', color: '#6b7280', fontWeight: 500 }}>
              {managerName}
            </span>
          </div>
        </div>

      </div>
    </div>
  );
};

export default ProjectCard;
