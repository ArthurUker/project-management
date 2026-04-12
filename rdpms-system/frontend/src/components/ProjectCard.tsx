import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';

const STATUS_STYLE: Record<string, string> = {
  '进行中': 'bg-blue-100 text-blue-700',
  '规划中': 'bg-gray-100 text-gray-600',
  '待验证': 'bg-yellow-100 text-yellow-700',
  '已完成': 'bg-green-100 text-green-700',
  '暂停':   'bg-red-100 text-red-500',
};

const TYPE_COLOR: Record<string, string> = {
  '定制':    'bg-blue-500',
  '合作':    'bg-purple-500',
  '应用':    'bg-green-500',
  '平台':    'bg-orange-500',
  '试剂开发':'bg-teal-500',
};

interface Project {
  id: string;
  name: string;
  code?: string;
  type?: string;
  status?: string;
  memberCount?: number;
  taskCount?: number;
  ownerName?: string;
}

interface Props {
  project: Project;
  selected?: boolean;
  onSelect?: (id: string) => void;
  onEdit?: (p: Project) => void;
  onDelete?: (id: string) => void;
}

const ProjectCard: React.FC<Props> = ({ project, selected = false, onSelect = () => {}, onEdit = () => {}, onDelete = () => {} }) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const navigate = useNavigate();
  const typeColor = TYPE_COLOR[project.type as string] ?? 'bg-gray-400';
  const statusStyle = STATUS_STYLE[project.status as string] ?? 'bg-gray-100 text-gray-600';

  return (
    <div
      className={`relative bg-white rounded-xl border transition-all duration-200 cursor-pointer hover:shadow-lg hover:-translate-y-0.5 overflow-hidden ${selected ? 'border-blue-400 ring-2 ring-blue-100' : 'border-gray-200'}`}
      onClick={() => navigate(`/projects/${project.id}`)}
    >
      <div className={`h-1 w-full ${typeColor}`} />

      <div className="p-4">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              className="w-4 h-4 rounded border-gray-300 text-blue-600 cursor-pointer flex-shrink-0"
              checked={selected}
              onChange={(e) => { e.stopPropagation(); onSelect(project.id); }}
              onClick={(e) => e.stopPropagation()}
            />
            <div className={`w-9 h-9 rounded-lg flex items-center justify-center text-white text-xs font-bold flex-shrink-0 ${typeColor}`}>
              {project.code ? String(project.code).slice(-3) : String(project.name).slice(0,3)}
            </div>
          </div>

          <div className="relative" onClick={(e) => e.stopPropagation()}>
            <button
              className="w-7 h-7 flex items-center justify-center rounded-md text-gray-400 hover:text-gray-700 hover:bg-gray-100"
              onClick={() => setMenuOpen(!menuOpen)}
            >
              •••
            </button>
            {menuOpen && (
              <div className="absolute right-0 top-8 z-20 bg-white border border-gray-200 rounded-lg shadow-xl py-1 w-36 text-sm">
                <button
                  className="w-full text-left px-3 py-2 hover:bg-gray-50 flex items-center gap-2"
                  onClick={() => { setMenuOpen(false); onEdit(project); }}
                >
                  <span>✏️</span> 编辑
                </button>
                <div className="border-t border-gray-100 my-1" />
                <button
                  className="w-full text-left px-3 py-2 hover:bg-red-50 text-red-500 flex items-center gap-2"
                  onClick={() => { setMenuOpen(false); onDelete(project.id); }}
                >
                  <span>🗑️</span> 删除
                </button>
              </div>
            )}
          </div>
        </div>

        <h3 className="font-semibold text-gray-900 text-sm leading-snug mb-1 line-clamp-2 min-h-[2.5rem]">
          {project.name}
        </h3>

        <p className="text-xs text-gray-400 mb-3 truncate font-mono">{project.code}</p>

        <div className="flex items-center gap-2 mb-4 flex-wrap">
          <span className="text-xs text-gray-500 bg-gray-100 rounded-md px-2 py-0.5 truncate max-w-[80px]">{project.type}</span>
          <span className={`text-xs rounded-md px-2 py-0.5 font-medium ${statusStyle}`}>{project.status}</span>
        </div>

        <div className="border-t border-gray-100 mb-3" />

        <div className="flex items-center justify-between text-xs text-gray-500">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              {project.memberCount ?? 0}人
            </span>
            <span className="flex items-center gap-1">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
              {project.taskCount ?? 0}任务
            </span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-5 h-5 rounded-full bg-blue-500 flex items-center justify-center text-white text-[10px] font-medium">{project.ownerName?.slice(0, 1) ?? '管'}</div>
            <span className="truncate max-w-[48px]">{project.ownerName ?? '管理员'}</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProjectCard;
