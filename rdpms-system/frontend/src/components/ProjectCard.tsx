import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

// ─── 类型定义（与 Prisma Schema 严格对齐）───
export interface Project {
  id: string;
  code: string;
  name: string;
  type: string;       // platform / 定制 / 合作 / 测试 / 应用
  subtype?: string;   // 2.0C / 3.0 / 海南大学 / 黑马 等
  status: string;     // 规划中 / 进行中 / 待加工 / 待验证 / 已完成 / 已归档
  position?: string;
  startDate?: string;
  endDate?: string;
  manager?: { id: string; name: string };
  memberCount?: number;
  taskCount?: number;
}

interface ProjectCardProps {
  project: Project;
  selected: boolean;
  onSelect: (id: string) => void;
  onEdit: (project: Project) => void;
  onDelete: (id: string) => void;
}

// ─── 状态样式映射 ───
const STATUS_STYLE: Record<string, { bg: string; text: string; dot: string }> = {
  '进行中': { bg: 'bg-blue-50',   text: 'text-blue-600',  dot: 'bg-blue-500'  },
  '规划中': { bg: 'bg-gray-100',  text: 'text-gray-500',  dot: 'bg-gray-400'  },
  '待加工': { bg: 'bg-orange-50', text: 'text-orange-600',dot: 'bg-orange-400'},
  '待验证': { bg: 'bg-yellow-50', text: 'text-yellow-600',dot: 'bg-yellow-400'},
  '已完成': { bg: 'bg-green-50',  text: 'text-green-600', dot: 'bg-green-500' },
  '已归档': { bg: 'bg-gray-50',   text: 'text-gray-400',  dot: 'bg-gray-300'  },
};

// ─── 类型颜色映射 ───
const TYPE_COLOR: Record<string, string> = {
  'platform': 'from-orange-400 to-orange-500',
  '定制':     'from-blue-400 to-blue-600',
  '合作':     'from-purple-400 to-purple-600',
  '测试':     'from-teal-400 to-teal-600',
  '应用':     'from-green-400 to-green-600',
};

const TYPE_BADGE: Record<string, string> = {
  'platform': 'bg-orange-100 text-orange-600',
  '定制':     'bg-blue-100 text-blue-600',
  '合作':     'bg-purple-100 text-purple-600',
  '测试':     'bg-teal-100 text-teal-600',
  '应用':     'bg-green-100 text-green-600',
};

const ProjectCard: React.FC<ProjectCardProps> = ({
  project, selected, onSelect, onEdit, onDelete,
}) => {
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const gradientClass = TYPE_COLOR[project.type] ?? 'from-gray-400 to-gray-500';
  const typeBadge     = TYPE_BADGE[project.type]  ?? 'bg-gray-100 text-gray-500';
  const statusStyle   = STATUS_STYLE[project.status] ?? STATUS_STYLE['规划中'];

  // 点击外部关闭菜单
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div
      className={`
        group relative bg-white rounded-2xl border transition-all duration-200
        cursor-pointer flex flex-col overflow-hidden
        hover:shadow-xl hover:-translate-y-1
        ${selected
          ? 'border-blue-400 shadow-md ring-2 ring-blue-100'
          : 'border-gray-200 shadow-sm hover:border-gray-300'}
      `}
      onClick={() => navigate(`/projects/${project.id}`)}
    >
      {/* ── 顶部渐变色条 ── */}
      <div className={`h-1.5 w-full bg-gradient-to-r ${gradientClass} flex-shrink-0`} />

      <div className="p-4 flex flex-col flex-1">

        {/* ── 第一行：复选框 + 头像 + 操作菜单 ── */}
        <div className="flex items-start justify-between mb-3">
          {/* 左：复选框 + 头像 */}
          <div className="flex items-center gap-2.5">
            <input
              type="checkbox"
              className="w-4 h-4 rounded border-gray-300 text-blue-600
                         cursor-pointer flex-shrink-0 accent-blue-600"
              checked={selected}
              onChange={() => onSelect(project.id)}
              onClick={(e) => e.stopPropagation()}
            />
            <div className={`
              w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0
              bg-gradient-to-br ${gradientClass} text-white font-bold text-xs
              shadow-sm
            `}>
              {project.code.split('-').pop()}
            </div>
          </div>

          {/* 右：⋯ 操作菜单 */}
          <div
            ref={menuRef}
            className="relative"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="w-7 h-7 flex items-center justify-center rounded-lg
                         text-gray-300 hover:text-gray-600 hover:bg-gray-100
                         opacity-0 group-hover:opacity-100 transition-all"
              onClick={() => setMenuOpen(!menuOpen)}
            >
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z"/>
              </svg>
            </button>

            {menuOpen && (
              <div className="absolute right-0 top-8 z-30 bg-white border border-gray-200
                              rounded-xl shadow-2xl py-1.5 w-32 text-sm animate-in
                              fade-in slide-in-from-top-2">
                <button
                  className="w-full text-left px-3.5 py-2 hover:bg-gray-50
                             text-gray-700 flex items-center gap-2.5 transition-colors"
                  onClick={() => { setMenuOpen(false); onEdit(project); }}
                >
                  <svg className="w-3.5 h-3.5 text-gray-400" fill="none"
                    stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5
                         m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/>
                  </svg>
                  编辑项目
                </button>
                <div className="mx-3 border-t border-gray-100 my-1" />
                <button
                  className="w-full text-left px-3.5 py-2 hover:bg-red-50
                             text-red-500 flex items-center gap-2.5 transition-colors"
                  onClick={() => { setMenuOpen(false); onDelete(project.id); }}
                >
                  <svg className="w-3.5 h-3.5" fill="none"
                    stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858
                         L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                  </svg>
                  删除项目
                </button>
              </div>
            )}
          </div>
        </div>

        {/* ── 项目名称（最多2行，不溢出）── */}
        <h3 className="font-semibold text-gray-900 text-sm leading-5 mb-1
                       line-clamp-2 min-h-[2.5rem]">
          {project.name}
        </h3>

        {/* ── 项目编号 ── */}
        <p className="text-[11px] text-gray-400 font-mono mb-3 truncate">
          {project.code}
        </p>

        {/* ── 类型 + 子类型 + 状态 ── */}
        <div className="flex items-center gap-1.5 mb-4 flex-wrap">
          <span className={`text-[11px] font-medium px-2 py-0.5 rounded-md ${typeBadge}`}>
            {project.type}
          </span>
          {project.subtype && (
            <span className="text-[11px] text-gray-400 bg-gray-100 px-2 py-0.5
                             rounded-md truncate max-w-[80px]">
              {project.subtype}
            </span>
          )}
          <span className={`
            text-[11px] font-medium px-2 py-0.5 rounded-md flex items-center gap-1
            ${statusStyle.bg} ${statusStyle.text}
          `}>
            <span className={`w-1.5 h-1.5 rounded-full ${statusStyle.dot}`} />
            {project.status}
          </span>
        </div>

        {/* ── 分割线 ── */}
        <div className="border-t border-gray-100 mt-auto pt-3">
          {/* ── 底部：成员数 + 任务数 + 负责人 ── */}
          <div className="flex items-center justify-between text-[11px] text-gray-400">
            <div className="flex items-center gap-3">
              {/* 成员数 */}
              <span className="flex items-center gap-1">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283
                       -.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283
                       .356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"/>
                </svg>
                {project.memberCount ?? 0} 人
              </span>
              {/* 任务数 */}
              <span className="flex items-center gap-1">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2
                       M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2
                       m-6 9l2 2 4-4"/>
                </svg>
                {project.taskCount ?? 0} 任务
              </span>
            </div>

            {/* 负责人头像 */}
            <div className="flex items-center gap-1.5">
              <div className={`
                w-5 h-5 rounded-full flex items-center justify-center
                bg-gradient-to-br ${gradientClass}
                text-white text-[10px] font-semibold flex-shrink-0
              `}>
                {(project.manager?.name ?? '管').slice(0, 1)}
              </div>
              <span className="truncate max-w-[52px]">
                {project.manager?.name ?? '管理员'}
              </span>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
};

export default ProjectCard;
