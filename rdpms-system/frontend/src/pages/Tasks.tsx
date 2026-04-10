import KanbanBoard from '../components/KanbanBoard';

export default function Tasks() {
  return (
    <div className="h-full flex flex-col">
      {/* 页面标题 */}
      <div className="flex items-center justify-between mb-6 flex-shrink-0">
        <h1 className="text-2xl font-display font-bold text-gray-900">任务看板</h1>
        <div className="flex items-center space-x-2 text-sm text-gray-500">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span>拖拽任务卡片可切换状态</span>
        </div>
      </div>
      
      {/* 看板 */}
      <div className="flex-1 overflow-hidden">
        <KanbanBoard />
      </div>
    </div>
  );
}
