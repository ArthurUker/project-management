import { useState, useRef } from 'react';
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
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';

export interface FlowNode {
  id: string;
  order: number;
  name: string;
  desc: string;
  type: 'phase' | 'decision' | 'start' | 'end';
  x?: number;
  y?: number;
  tasks?: any[];
}

interface FlowEditorProps {
  nodes: FlowNode[];
  editable?: boolean;
  onNodesChange?: (nodes: FlowNode[]) => void;
  onNodeSelect?: (node: FlowNode) => void;
}

export default function FlowEditor({
  nodes,
  editable = false,
  onNodesChange,
  onNodeSelect,
}: FlowEditorProps) {
  const [items, setItems] = useState(nodes);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor)
  );

  // 添加新节点
  function addNode() {
    const newNode: FlowNode = {
      id: `node-${Date.now()}`,
      order: items.length + 1,
      name: '新阶段',
      desc: '点击编辑描述',
      type: 'phase',
      tasks: [],
    };
    const newItems = [...items, newNode];
    setItems(newItems);
    onNodesChange?.(newItems);
  }

  // 删除节点
  function deleteNode(id: string) {
    const newItems = items.filter((n) => n.id !== id);
    // 重新编号
    const reordered = newItems.map((n, idx) => ({
      ...n,
      order: idx + 1,
    }));
    setItems(reordered);
    onNodesChange?.(reordered);
  }

  // 更新节点
  function updateNode(id: string, updates: Partial<FlowNode>) {
    const newItems = items.map((n) => (n.id === id ? { ...n, ...updates } : n));
    setItems(newItems);
    onNodesChange?.(newItems);
  }

  // 重新排序
  function handleDragEnd(event: any) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = items.findIndex((n) => n.id === active.id);
    const newIndex = items.findIndex((n) => n.id === over.id);

    const newItems = arrayMove(items, oldIndex, newIndex);
    const reordered = newItems.map((n, idx) => ({
      ...n,
      order: idx + 1,
    }));
    setItems(reordered);
    onNodesChange?.(reordered);
  }

  // 获取节点样式
  function getNodeStyle(node: FlowNode) {
    const styles: Record<string, any> = {
      phase: {
        background: '#e3f2fd',
        border: '2px solid #1976d2',
        borderRadius: '4px',
      },
      decision: {
        background: '#fff3e0',
        border: '2px solid #f57c00',
        borderRadius: '0',
        transform: 'rotate(45deg)',
      },
      start: {
        background: '#e8f5e9',
        border: '2px solid #388e3c',
        borderRadius: '20px',
      },
      end: {
        background: '#f3e5f5',
        border: '2px solid #7b1fa2',
        borderRadius: '20px',
      },
    };
    return styles[node.type] || styles.phase;
  }

  return (
    <div className="flow-editor">
      {/* 工具栏 */}
      {editable && (
        <div className="editor-toolbar">
          <button onClick={addNode} className="btn btn-primary">
            + 添加节点
          </button>
          <span className="toolbar-info">{items.length} 个节点</span>
        </div>
      )}

      {/* 画布 */}
      <div ref={canvasRef} className="editor-canvas">
        {editable ? (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={items.map((n) => n.id)}
              strategy={verticalListSortingStrategy}
            >
              <div className="nodes-container">
                {items.map((node, idx) => (
                  <div key={node.id} className="node-wrapper">
                    {/* 连接线 */}
                    {idx < items.length - 1 && (
                      <div className="connector">
                        <svg width="100%" height="30">
                          <line
                            x1="50%"
                            y1="0"
                            x2="50%"
                            y2="30"
                            stroke="#999"
                            strokeWidth="2"
                          />
                          <polygon
                            points="50%,25 45%,18 55%,18"
                            fill="#999"
                          />
                        </svg>
                      </div>
                    )}

                    {/* 节点卡片 */}
                    <div
                      className={`flow-node ${
                        selectedNode === node.id ? 'selected' : ''
                      }`}
                      style={getNodeStyle(node)}
                      onClick={() => setSelectedNode(node.id)}
                    >
                      <div className="node-header">
                        <span className="node-order">{node.order}</span>
                        <input
                          type="text"
                          value={node.name}
                          onChange={(e) =>
                            updateNode(node.id, { name: e.target.value })
                          }
                          className="node-name-input"
                          placeholder="节点名称"
                          onClick={(e) => e.stopPropagation()}
                        />
                        {editable && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              deleteNode(node.id);
                            }}
                            className="btn-delete"
                            title="删除节点"
                          >
                            ✕
                          </button>
                        )}
                      </div>

                      <textarea
                        value={node.desc}
                        onChange={(e) =>
                          updateNode(node.id, { desc: e.target.value })
                        }
                        className="node-desc-input"
                        placeholder="节点描述"
                        rows={3}
                        onClick={(e) => e.stopPropagation()}
                      />

                      {node.tasks && node.tasks.length > 0 && (
                        <div className="node-tasks">
                          <small>
                            📋 {node.tasks.length} 个任务
                          </small>
                        </div>
                      )}

                      {editable && (
                        <div className="node-type-selector">
                          <select
                            value={node.type}
                            onChange={(e) =>
                              updateNode(node.id, {
                                type: e.target.value as any,
                              })
                            }
                            className="type-select"
                          >
                            <option value="phase">阶段</option>
                            <option value="decision">判断</option>
                            <option value="start">开始</option>
                            <option value="end">结束</option>
                          </select>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </SortableContext>
          </DndContext>
        ) : (
          // 预览模式
          <div className="preview-container">
            {items.map((node, idx) => (
              <div key={node.id} className="preview-item">
                {idx > 0 && <div className="preview-connector" />}
                <div
                  className="preview-node"
                  onClick={() => onNodeSelect?.(node)}
                >
                  <div className="preview-header">
                    <span className="preview-order">{node.order}</span>
                    <span className="preview-name">{node.name}</span>
                  </div>
                  <p className="preview-desc">{node.desc}</p>
                  {node.tasks && node.tasks.length > 0 && (
                    <small className="preview-tasks">
                      📋 {node.tasks.length} 个任务
                    </small>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* @ts-ignore */}
      <style jsx>{`
        .flow-editor {
          width: 100%;
          height: 100%;
          display: flex;
          flex-direction: column;
          background: #f9f9f9;
          border-radius: 8px;
          overflow: hidden;
        }

        .editor-toolbar {
          padding: 12px 16px;
          background: #fff;
          border-bottom: 1px solid #e0e0e0;
          display: flex;
          gap: 12px;
          align-items: center;
        }

        .toolbar-info {
          font-size: 12px;
          color: #999;
          margin-left: auto;
        }

        .editor-canvas {
          flex: 1;
          overflow-y: auto;
          padding: 20px;
        }

        .nodes-container {
          max-width: 600px;
          margin: 0 auto;
        }

        .node-wrapper {
          margin: 12px 0;
        }

        .connector {
          height: 30px;
          display: flex;
          justify-content: center;
        }

        .flow-node {
          padding: 16px;
          margin: 8px 0;
          background: #e3f2fd;
          border: 2px solid #1976d2;
          border-radius: 4px;
          cursor: pointer;
          transition: all 0.2s;
          position: relative;
        }

        .flow-node.selected {
          box-shadow: 0 0 0 3px rgba(25, 118, 210, 0.2);
          background: #bbdefb;
        }

        .node-header {
          display: flex;
          gap: 8px;
          align-items: center;
          margin-bottom: 8px;
        }

        .node-order {
          background: #1976d2;
          color: white;
          width: 28px;
          height: 28px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: bold;
          font-size: 12px;
          flex-shrink: 0;
        }

        .node-name-input {
          flex: 1;
          border: 1px solid #ccc;
          padding: 6px 8px;
          border-radius: 3px;
          font-size: 14px;
          font-weight: 600;
        }

        .btn-delete {
          background: #f44336;
          color: white;
          border: none;
          width: 24px;
          height: 24px;
          border-radius: 50%;
          cursor: pointer;
          font-size: 12px;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .btn-delete:hover {
          background: #d32f2f;
        }

        .node-desc-input {
          width: 100%;
          border: 1px solid #ccc;
          padding: 8px;
          border-radius: 3px;
          font-family: inherit;
          font-size: 13px;
          resize: vertical;
          margin: 8px 0;
        }

        .node-tasks {
          font-size: 12px;
          color: #666;
          margin-top: 8px;
        }

        .node-type-selector {
          margin-top: 8px;
        }

        .type-select {
          width: 100%;
          padding: 6px;
          border: 1px solid #ccc;
          border-radius: 3px;
          font-size: 12px;
        }

        /* 预览模式样式 */
        .preview-container {
          max-width: 600px;
          margin: 0 auto;
        }

        .preview-item {
          margin: 12px 0;
        }

        .preview-connector {
          height: 20px;
          border-left: 2px solid #999;
          margin-left: 15px;
        }

        .preview-node {
          background: #fff;
          border: 2px solid #1976d2;
          border-radius: 4px;
          padding: 12px;
          cursor: pointer;
          transition: all 0.2s;
        }

        .preview-node:hover {
          box-shadow: 0 2px 8px rgba(25, 118, 210, 0.2);
        }

        .preview-header {
          display: flex;
          gap: 8px;
          align-items: center;
          margin-bottom: 6px;
        }

        .preview-order {
          background: #1976d2;
          color: white;
          width: 24px;
          height: 24px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: bold;
          font-size: 11px;
        }

        .preview-name {
          font-weight: 600;
          color: #333;
        }

        .preview-desc {
          margin: 6px 0 0 0;
          color: #666;
          font-size: 12px;
          line-height: 1.4;
        }

        .preview-tasks {
          display: block;
          margin-top: 6px;
          color: #999;
        }

        .btn {
          padding: 8px 16px;
          border: none;
          border-radius: 4px;
          cursor: pointer;
          font-size: 13px;
          font-weight: 500;
        }

        .btn-primary {
          background: #1976d2;
          color: white;
        }

        .btn-primary:hover {
          background: #1565c0;
        }
      `}</style>
    </div>
  );
}
