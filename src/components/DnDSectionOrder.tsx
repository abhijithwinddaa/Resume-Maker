import React, { useState, useRef, useEffect } from "react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { SectionKey } from "../types/resume";
import { DEFAULT_SECTION_ORDER, DEFAULT_SECTION_LABELS } from "../types/resume";
import { GripVertical, Trash2, Pencil, Check, Plus } from "lucide-react";
import "./DnDSectionOrder.css";

interface SortableItemProps {
  id: SectionKey;
  label: string;
  isEditing: boolean;
  editValue: string;
  onDelete: (id: SectionKey) => void;
  onEditStart: (id: SectionKey) => void;
  onEditChange: (value: string) => void;
  onEditConfirm: () => void;
}

function SortableItem({
  id,
  label,
  isEditing,
  editValue,
  onDelete,
  onEditStart,
  onEditChange,
  onEditConfirm,
}: SortableItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") onEditConfirm();
    if (e.key === "Escape") onEditConfirm();
  };

  return (
    <div ref={setNodeRef} style={style} className="dnd-item" {...attributes}>
      <button className="dnd-grip" {...listeners} aria-label={`Drag ${label}`}>
        <GripVertical size={16} />
      </button>

      {isEditing ? (
        <input
          ref={inputRef}
          className="dnd-edit-input"
          value={editValue}
          onChange={(e) => onEditChange(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={onEditConfirm}
          aria-label={`Rename ${label}`}
        />
      ) : (
        <span className="dnd-label" onDoubleClick={() => onEditStart(id)}>
          {label}
        </span>
      )}

      <div className="dnd-actions">
        {isEditing ? (
          <button
            className="dnd-action-btn dnd-confirm-btn"
            onClick={onEditConfirm}
            aria-label={`Confirm rename ${label}`}
            title="Confirm"
          >
            <Check size={14} />
          </button>
        ) : (
          <button
            className="dnd-action-btn dnd-edit-btn"
            onClick={() => onEditStart(id)}
            aria-label={`Rename ${label}`}
            title="Rename section"
          >
            <Pencil size={14} />
          </button>
        )}
        <button
          className="dnd-action-btn dnd-delete-btn"
          onClick={() => onDelete(id)}
          aria-label={`Remove ${label} section`}
          title="Remove section"
        >
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  );
}

interface DnDSectionOrderProps {
  sectionOrder: SectionKey[];
  onChange: (order: SectionKey[]) => void;
  sectionLabels?: Partial<Record<SectionKey, string>>;
  onLabelChange?: (key: SectionKey, label: string) => void;
  onDelete?: (key: SectionKey) => void;
}

const DnDSectionOrder: React.FC<DnDSectionOrderProps> = ({
  sectionOrder,
  onChange,
  sectionLabels,
  onLabelChange,
  onDelete,
}) => {
  const [editingKey, setEditingKey] = useState<SectionKey | null>(null);
  const [editValue, setEditValue] = useState("");

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const getLabel = (key: SectionKey) =>
    sectionLabels?.[key] || DEFAULT_SECTION_LABELS[key];

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = sectionOrder.indexOf(active.id as SectionKey);
      const newIndex = sectionOrder.indexOf(over.id as SectionKey);
      onChange(arrayMove(sectionOrder, oldIndex, newIndex));
    }
  };

  const handleEditStart = (key: SectionKey) => {
    setEditingKey(key);
    setEditValue(getLabel(key));
  };

  const handleEditConfirm = () => {
    if (editingKey && editValue.trim() && onLabelChange) {
      onLabelChange(editingKey, editValue.trim());
    }
    setEditingKey(null);
    setEditValue("");
  };

  const handleDelete = (key: SectionKey) => {
    if (onDelete) onDelete(key);
  };

  // Sections that have been removed (available to re-add)
  const removedSections = DEFAULT_SECTION_ORDER.filter(
    (key) => !sectionOrder.includes(key),
  );

  const handleRestore = (key: SectionKey) => {
    onChange([...sectionOrder, key]);
  };

  return (
    <div className="dnd-container">
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={sectionOrder}
          strategy={verticalListSortingStrategy}
        >
          {sectionOrder.map((key) => (
            <SortableItem
              key={key}
              id={key}
              label={getLabel(key)}
              isEditing={editingKey === key}
              editValue={editValue}
              onDelete={handleDelete}
              onEditStart={handleEditStart}
              onEditChange={setEditValue}
              onEditConfirm={handleEditConfirm}
            />
          ))}
        </SortableContext>
      </DndContext>

      {removedSections.length > 0 && (
        <div className="dnd-removed">
          <span className="dnd-removed-label">Removed sections:</span>
          <div className="dnd-removed-list">
            {removedSections.map((key) => (
              <button
                key={key}
                className="dnd-restore-btn"
                onClick={() => handleRestore(key)}
                aria-label={`Re-add ${getLabel(key)} section`}
                title={`Re-add ${getLabel(key)}`}
              >
                <Plus size={12} />
                {getLabel(key)}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default DnDSectionOrder;
