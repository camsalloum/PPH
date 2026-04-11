import React from 'react';
import { Badge, Empty, Spin, Typography } from 'antd';
import { DragDropContext, Droppable, Draggable } from 'react-beautiful-dnd';
import InquiryCard from './InquiryCard';

const { Text } = Typography;

export default function InquiryKanbanBoard({
  loading,
  onDragEnd,
  columns,
  byStatus,
  navigate,
  inquiryBase,
  handleStatusChange,
  handleDelete,
  showRepOnCards,
}) {
  if (loading) {
    return (
      <div className="psi-loading">
        <Spin size="large" tip="Loading inquiries...">
          <div style={{ minHeight: 80 }} />
        </Spin>
      </div>
    );
  }

  return (
    <DragDropContext onDragEnd={onDragEnd}>
      <div className="psi-kanban">
        {columns.map((column) => (
          <div
            key={column.key}
            className="psi-column"
            style={{ '--col-color': column.color, '--col-bg': column.bg }}
          >
            <div className="psi-col-header">
              <span className="psi-col-title" style={{ color: column.color }}>
                {column.label}
              </span>
              <Badge
                count={byStatus[column.key]?.length || 0}
                style={{ backgroundColor: column.color }}
                showZero
                overflowCount={99}
              />
            </div>

            <Droppable droppableId={column.key}>
              {(provided, snapshot) => (
                <div
                  className="psi-col-body"
                  ref={provided.innerRef}
                  {...provided.droppableProps}
                  style={{
                    background: snapshot.isDraggingOver ? `${column.bg}` : undefined,
                    transition: 'background 0.2s ease',
                    minHeight: 60,
                  }}
                >
                  {byStatus[column.key]?.length === 0 ? (
                    <div className="psi-col-empty">
                      <Empty
                        image={Empty.PRESENTED_IMAGE_SIMPLE}
                        description={<Text type="secondary" style={{ fontSize: 12 }}>No inquiries</Text>}
                      />
                    </div>
                  ) : (
                    byStatus[column.key]
                      .slice()
                      .sort((a, b) => (a.kanban_position || 0) - (b.kanban_position || 0))
                      .map((inquiry, index) => (
                        <Draggable key={inquiry.id} draggableId={String(inquiry.id)} index={index}>
                          {(dragProvided, dragSnapshot) => (
                            <div
                              ref={dragProvided.innerRef}
                              {...dragProvided.draggableProps}
                              {...dragProvided.dragHandleProps}
                              style={{
                                ...dragProvided.draggableProps.style,
                                opacity: dragSnapshot.isDragging ? 0.85 : 1,
                                boxShadow: dragSnapshot.isDragging
                                  ? '0 8px 24px rgba(0,0,0,0.18)'
                                  : undefined,
                              }}
                            >
                              <InquiryCard
                                inq={inquiry}
                                navigate={navigate}
                                inquiryBase={inquiryBase}
                                handleStatusChange={handleStatusChange}
                                handleDelete={handleDelete}
                                showRep={showRepOnCards}
                              />
                            </div>
                          )}
                        </Draggable>
                      ))
                  )}
                  {provided.placeholder}
                </div>
              )}
            </Droppable>
          </div>
        ))}
      </div>
    </DragDropContext>
  );
}
