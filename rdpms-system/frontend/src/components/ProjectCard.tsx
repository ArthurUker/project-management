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
  updatedAt?: string | null;
  tags?: string[];
}

interface ProjectCardProps {
  project: Project;
  selected?: boolean;
  onSelect?: (id: string, checked: boolean) => void;
  onEdit?: (project: Project) => void;
  onClick?: (project: Project) => void;
  animationIndex?: number;
}

// ── 状态色系统 ────────────────────────────────────────
const STATUS_COLORS: Record<string, { color: string; bg: string; dot: string; border: string }> = {
  '筹备中': { color: '#64748b', bg: 'rgba(100,116,139,0.10)', dot: '#94a3b8', border: 'rgba(100,116,139,0.25)' },
  '规划中': { color: '#64748b', bg: 'rgba(100,116,139,0.10)', dot: '#94a3b8', border: 'rgba(100,116,139,0.25)' },
  '进行中': { color: '#2563eb', bg: 'rgba(37,99,235,0.10)',   dot: '#3b82f6', border: 'rgba(59,130,246,0.30)'  },
  '待加工': { color: '#d97706', bg: 'rgba(217,119,6,0.10)',   dot: '#f59e0b', border: 'rgba(245,158,11,0.30)'  },
  '待验证': { color: '#7c3aed', bg: 'rgba(124,58,237,0.10)',  dot: '#8b5cf6', border: 'rgba(139,92,246,0.30)'  },
  '已完成': { color: '#059669', bg: 'rgba(5,150,105,0.10)',   dot: '#10b981', border: 'rgba(16,185,129,0.30)'  },
  '已归档': { color: '#94a3b8', bg: 'rgba(148,163,184,0.10)', dot: '#cbd5e1', border: 'rgba(203,213,225,0.30)' },
};

const DEFAULT_STATUS = STATUS_COLORS['规划中'];

function getStatus(status: string | undefined) {
  return STATUS_COLORS[status ?? ''] ?? DEFAULT_STATUS;
}

function timeAgo(dateStr: string | null | undefined): string {
  if (!dateStr) return '未知';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '未知';
  const diff = Math.floor((Date.now() - d.getTime()) / 1000);
  if (diff < 60)    return '刚刚';
  if (diff < 3600)  return `${Math.floor(diff / 60)}分钟前`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}小时前`;
  const days = Math.floor(diff / 86400);
  if (days < 30)    return `${days}天前`;
  return `${Math.floor(days / 30)}月前`;
}

// ── 主组件 ────────────────────────────────────────────
const ProjectCard: React.FC<ProjectCardProps> = ({
  project,
  selected = false,
  onSelect,
  onEdit,
  onClick,
  animationIndex = 0,
}) => {
  const sc = getStatus(project.status);

  const managerName = project.manager?.name ?? '未分配';
  const managerInitial = managerName.slice(0, 1);

  const allTags = [
    project.type,
    project.subtype,
    ...(project.tags ?? []),
  ].filter(Boolean) as string[];

  const delay = Math.min(animationIndex * 0.05, 0.3);

  return (
    <div
      style={{
        background: 'rgba(235,242,255,0.40)',
        backdropFilter: 'blur(40px) saturate(200%) brightness(1.03)',
        WebkitBackdropFilter: 'blur(40px) saturate(200%) brightness(1.03)',
        border: selected
          ? `1.5px solid ${sc.border}`
          : '1px solid rgba(255,255,255,0.70)',
        boxShadow: selected
          ? `0 0 0 3px ${sc.bg}, 0 4px 24px rgba(0,0,0,0.06)`
          : '0 4px 24px rgba(100,130,255,0.08), 0 1px 4px rgba(0,0,0,0.05), inset 0 1px 0 rgba(255,255,255,0.75)',
        borderRadius: '14px',
        padding: '0',
        cursor: 'pointer',
        transition: 'all 0.25s cubic-bezier(0.4,0,0.2,1)',
        overflow: 'hidden',
        position: 'relative',
        animation: 'fadeInUp 0.3s ease forwards',
        animationDelay: `${delay}s`,
        opacity: 0,
      }}
      onMouseEnter={e => {
        const el = e.currentTarget as HTMLDivElement;
        el.style.transform = 'translateY(-4px) scale(1.01)';
        el.style.boxShadow = '0 16px 48px rgba(100,130,255,0.16), 0 4px 12px rgba(0,0,0,0.08), inset 0 1px 0 rgba(255,255,255,0.90)';
        el.style.border = '1px solid rgba(255,255,255,0.85)';
        el.style.background = 'rgba(240,246,255,0.55)';
        (el.style as any).backdropFilter = 'blur(48px) saturate(220%)';
        (el.style as any).WebkitBackdropFilter = 'blur(48px) saturate(220%)';
      }}
      onMouseLeave={e => {
        const el = e.currentTarget as HTMLDivElement;
        el.style.transform = '';
        el.style.boxShadow = selected
          ? `0 0 0 3px ${sc.bg}, 0 4px 24px rgba(0,0,0,0.06)`
          : '0 4px 24px rgba(100,130,255,0.08), 0 1px 4px rgba(0,0,0,0.05), inset 0 1px 0 rgba(255,255,255,0.75)';
        el.style.border = selected
          ? `1.5px solid ${sc.border}`
          : '1px solid rgba(255, 255, 255, 0.70)';
        el.style.background = 'rgba(235,242,255,0.40)';
        (el.style as any).backdropFilter = 'blur(40px) saturate(200%) brightness(1.03)';
        (el.style as any).WebkitBackdropFilter = 'blur(40px) saturate(200%) brightness(1.03)';
      }}
      onClick={() => onClick?.(project)}
    >
      {/* 顶部状态色条 */}
      <div style={{
        height: '4px',
        background: `linear-gradient(90deg, ${sc.dot} 0%, ${sc.dot}80 100%)`,
        width: '100%',
      }} />

      {/* 卡片主体 */}
      <div style={{ padding: '16px 18px' }}>

        {/* ① 标题行 */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          marginBottom: '8px',
          gap: '8px',
        }}>
          <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
            {onSelect && (
              <input
                type="checkbox"
                checked={selected}
                style={{ flexShrink: 0, width: '14px', height: '14px', accentColor: '#3b82f6', cursor: 'pointer', marginTop: '2px' }}
                onChange={e => { e.stopPropagation(); onSelect(project.id, e.target.checked); }}
                onClick={e => e.stopPropagation()}
              />
            )}
            <div style={{
              fontSize: '14px',
              fontWeight: 600,
              color: '#0f172a',
              lineHeight: 1.4,
              overflow: 'hidden',
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
            }}>
              {project.name}
            </div>
          </div>
          {/* 状态标签 */}
          <span style={{
            fontSize: '11px',
            fontWeight: 500,
            padding: '2px 8px',
            borderRadius: '5px',
            background: sc.bg,
            color: sc.color,
            border: `1px solid ${sc.border}`,
            whiteSpace: 'nowrap',
            flexShrink: 0,
            lineHeight: '18px',
          }}>
            {project.status ?? '未知'}
          </span>
        </div>

        {/* ② 编号行 */}
        <div style={{
          fontSize: '12px',
          color: '#94a3b8',
          marginBottom: '10px',
          fontFamily: 'monospace',
        }}>
          {project.code}
        </div>

        {/* ③ 标签行 */}
        {allTags.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px', marginBottom: '12px' }}>
            {allTags.slice(0, 3).map(tag => (
              <span key={tag} style={{
                fontSize: '11px',
                fontWeight: 500,
                padding: '2px 8px',
                borderRadius: '4px',
                background: 'rgba(59,130,246,0.08)',
                color: '#3b82f6',
                border: '1px solid rgba(59,130,246,0.15)',
              }}>
                {tag}
              </span>
            ))}
          </div>
        )}

        {/* ④ 分割线 */}
        <div style={{
          height: '1px',
          background: 'rgba(0,0,0,0.06)',
          margin: '0 0 12px 0',
        }} />

        {/* ⑤ 底部信息行 */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          {/* 负责人 */}
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <div style={{
              width: '24px',
              height: '24px',
              borderRadius: '50%',
              background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
              color: 'white',
              fontSize: '11px',
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginRight: '6px',
              flexShrink: 0,
            }}>
              {managerInitial}
            </div>
            <span style={{ fontSize: '12px', color: '#475569' }}>{managerName}</span>
          </div>
          {/* 更新时间 */}
          <span style={{ fontSize: '11px', color: '#94a3b8' }}>
            {timeAgo(project.updatedAt ?? project.startDate)}
          </span>
        </div>

      </div>

      {/* 右下角装饰圆 */}
      <div style={{
        position: 'absolute',
        right: '-10px',
        bottom: '-10px',
        width: '60px',
        height: '60px',
        borderRadius: '50%',
        background: `${sc.dot}15`,
        pointerEvents: 'none',
      }} />

      {/* 编辑按钮 */}
      {onEdit && (
        <button
          style={{
            position: 'absolute',
            top: '10px',
            right: '10px',
            width: '24px',
            height: '24px',
            border: 'none',
            background: 'transparent',
            borderRadius: '6px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#94a3b8',
            opacity: 0,
            transition: 'opacity 0.15s',
            zIndex: 1,
          }}
          className="pc-edit-btn"
          onClick={e => { e.stopPropagation(); onEdit(project); }}
        >
          <svg width="14" height="14" fill="currentColor" viewBox="0 0 24 24">
            <circle cx="12" cy="5" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="12" cy="19" r="1.8"/>
          </svg>
        </button>
      )}
    </div>
  );
};

export default ProjectCard;
