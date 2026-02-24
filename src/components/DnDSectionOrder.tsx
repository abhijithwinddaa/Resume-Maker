import React from "react";
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
import { GripVertical } from "lucide-react";
import "./DnDSectionOrder.css";

const SECTION_LABELS: Record<SectionKey, string> = {
  summary: "Summary",
  education: "Education",
  experience: "Experience",
  projects: "Projects",
  skills: "Skills",
  achievements: "Achievements",
  certificates: "Certificates",
};

interface SortableItemProps {
  id: SectionKey;
}

function SortableItem({ id }: SortableItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} className="dnd-item" {...attributes}>
      <button
        className="dnd-grip"
        {...listeners}
        aria-label={`Drag ${SECTION_LABELS[id]}`}
      >
        <GripVertical size={16} />
      </button>
      <span className="dnd-label">{SECTION_LABELS[id]}</span>
    </div>
  );
}

interface DnDSectionOrderProps {
  sectionOrder: SectionKey[];
  onChange: (order: SectionKey[]) => void;
}

const DnDSectionOrder: React.FC<DnDSectionOrderProps> = ({
  sectionOrder,
  onChange,
}) => {
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = sectionOrder.indexOf(active.id as SectionKey);
      const newIndex = sectionOrder.indexOf(over.id as SectionKey);
      onChange(arrayMove(sectionOrder, oldIndex, newIndex));
    }
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
            <SortableItem key={key} id={key} />
          ))}
        </SortableContext>
      </DndContext>
    </div>
  );
};

export default DnDSectionOrder;
