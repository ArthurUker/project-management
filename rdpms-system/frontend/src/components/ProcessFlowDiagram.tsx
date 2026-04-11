import { useState } from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

interface Phase {
  order: number;
  name: string;
  desc: string;
  source?: 'inherit' | 'new';
  disabled?: boolean;
  tasks?: any[];
}

interface ProcessFlowDiagramProps {
  phases: Phase[];
  editable?: boolean;
  onPhasesChange?: (phases: Phase[]) => void;
  onPhaseSelect?: (phase: Phase) => void;
}

// 可排序的阶段卡片
function DraggablePhaseCard({
  phase,
  editable,
  isOver,
  onSelect,
}: {
  phase: Phase;
  editable: boolean;
  isOver: boolean;
  onSelect: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: phase.order.toString() });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const getSourceIcon = () => {
    if (phase.disabled) return '✂️';
    if (phase.source === 'new') return '➕';
    return '🔒';
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      onClick={onSelect}
      className={`phase-card ${phase.disabled ? 'disabled' : ''} ${
        isOver ? 'hover' : ''
      }`}
      {...(editable ? { ...attributes, ...listeners } : {})}
    >
      {/* 连接线（不是最后一个） */}
      {phase.order < 12 && (
        <div className="phase-connector">
          <svg width="100%" height="40" style={{ position: 'absolute', top: '100%' }}>
            <line x1="50%" y1="0" x2="50%" y2="40" stroke="#c7d2fe" strokeWidth="2" />
            <polygon
              points="50%,35 45%,25 55%,25"
              fill="#c7d2fe"
            />
          </svg>
        </div>
      )}

      {/* 卡片内容 */}
      <div className="phase-content">
        <div className="phase-header">
          <div className="phase-number">
            <span>{phase.order}</span>
          </div>
          <div className="phase-title">
            <h4>{phase.name}</h4>
            <span className="source-badge">{getSourceIcon()}</span>
          </div>
          {editable && <div className="phase-handle" style={{ cursor: 'grab' }}>⋮⋮</div>}
        </div>

        <p className="phase-desc">{phase.desc}</p>

        {phase.tasks && phase.tasks.length > 0 && (
          <div className="phase-tasks">
            <small>📋 {phase.tasks.length} 个任务</small>
          </div>
        )}

        {phase.disabled && (
          <div className="phase-disabled-badge">禁用</div>
        )}
      </div>

      {/* @ts-ignore */}
      <style jsx>{`
        .phase-card {
          background: ${phase.disabled ? '#f5f5f5' : '#fff'};
          border: 2px solid ${phase.disabled ? '#e0e0e0' : '#c7d2fe'};
          border-radius: 8px;
          padding: 16px;
          margin: 12px 0;
          cursor: ${editable ? 'grab' : 'pointer'};
          transition: all 0.2s;
          opacity: ${phase.disabled ? 0.7 : 1};
          position: relative;
        }

        .phase-card:hover {
          border-color: ${phase.disabled ? '#d0d0d0' : '#4f46e5'};
          box-shadow: 0 2px 8px rgba(79, 70, 229, 0.1);
          transform: ${!phase.disabled ? 'translateY(-2px)' : 'none'};
        }

        .phase-card.hover {
          background: #f0f4ff;
        }

        .phase-connector {
          position: relative;
          height: 40px;
          margin: 0 -16px -8px -16px;
        }

        .phase-content {
          z-index: 2;
          position: relative;
        }

        .phase-header {
          display: flex;
          align-items: flex-start;
          gap: 12px;
          margin-bottom: 8px;
        }

        .phase-number {
          background: #4f46e5;
          color: white;
          width: 32px;
          height: 32px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: bold;
          flex-shrink: 0;
        }

        .phase-title {
          flex: 1;
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .phase-title h4 {
          margin: 0;
          font-size: 16px;
          font-weight: 600;
          color: #333;
        }

        .source-badge {
          font-size: 14px;
        }

        .phase-handle {
          color: #ccc;
          font-size: 18px;
          padding: 4px 8px;
        }

        .phase-desc {
          margin: 8px 0 0 44px;
          color: #666;
          font-size: 13px;
          line-height: 1.5;
        }

        .phase-tasks {
          margin-top: 8px;
          margin-left: 44px;
          font-size: 12px;
          color: #999;
        }

        .phase-disabled-badge {
          position: absolute;
          top: 8px;
          right: 8px;
          background: #fbb6ce;
          color: #c2185b;
          padding: 2px 8px;
          border-radius: 3px;
          font-size: 11px;
          font-weight: 600;
        }
      `}</style>
    </div>
  );
}

export default function ProcessFlowDiagram({
  phases,
  editable = false,
  onPhasesChange,
  onPhaseSelect,
}: ProcessFlowDiagramProps) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [items, setItems] = useState(phases);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  function handleDragStart(event: any) {
    setActiveId(event.active.id);
  }

  function handleDragEnd(event: any) {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      setItems((items) => {
        const oldIndex = items.findIndex(
          (item) => item.order.toString() === active.id
        );
        const newIndex = items.findIndex(
          (item) => item.order.toString() === over.id
        );

        const newItems = arrayMove(items, oldIndex, newIndex);
        // 更新order字段
        const reorderedItems = newItems.map((item, idx) => ({
          ...item,
          order: idx + 1,
        }));

        if (onPhasesChange) {
          onPhasesChange(reorderedItems);
        }

        return reorderedItems;
      });
    }

    setActiveId(null);
  }

  if (!phases || phases.length === 0) {
    return (
      <div style={{ textAlign: 'center', color: '#999', padding: '40px' }}>
        📭 未定义阶段
      </div>
    );
  }

  return (
    <div className="process-flow">
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={items.map((p) => p.order.toString())}
          strategy={verticalListSortingStrategy}
          disabled={!editable}
        >
          <div className="phases-container">
            {items.map((phase) => (
              <DraggablePhaseCard
                key={phase.order}
                phase={phase}
                editable={editable}
                isOver={activeId === phase.order.toString()}
                onSelect={() => onPhaseSelect?.(phase)}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>

      {/* @ts-ignore */}
      <style jsx>{`
        .process-flow {
          width: 100%;
          padding: 20px;
        }

        .phases-container {
          max-width: 600px;
          margin: 0 auto;
        }
      `}</style>
    </div>
  );
}
