import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import type { ReactNode } from "react";

export type SortableItem = { id: string; content: ReactNode; label: string };

function Grip() {
  return (
    <svg viewBox="0 0 10 16" className="h-3.5 w-2.5" fill="currentColor" aria-hidden="true">
      {[3, 8, 13].map((y) => (
        <g key={y}>
          <circle cx="3" cy={y} r="1.3" />
          <circle cx="7" cy={y} r="1.3" />
        </g>
      ))}
    </svg>
  );
}

function Row({ item, highlight }: { item: SortableItem; highlight: boolean }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
  });
  return (
    <li
      ref={setNodeRef}
      style={{
        transform: transform ? `translate3d(0, ${transform.y}px, 0)` : undefined,
        transition,
      }}
      className={`group relative flex items-stretch rounded-lg border bg-paper transition-[box-shadow,border-color] ${
        isDragging
          ? "z-10 border-accent shadow-[0_10px_24px_-8px_rgb(15_23_42/0.3)]"
          : highlight
            ? "border-accent/50 bg-hl"
            : "border-line hover:border-[#c4c8cf]"
      }`}
    >
      <button
        type="button"
        ref={setActivatorNodeRef}
        aria-label={`Drag to reorder ${item.label}`}
        title="Drag to reorder"
        className={`flex w-7 shrink-0 cursor-grab touch-none items-center justify-center rounded-l-lg border-r transition-colors active:cursor-grabbing ${
          isDragging ? "border-accent/40 text-accent" : "border-line text-neutral-400 group-hover:text-neutral-700"
        }`}
        {...attributes}
        {...listeners}
      >
        <Grip />
      </button>
      <div className="min-w-0 flex-1">{item.content}</div>
    </li>
  );
}

/** A vertical list whose rows can be dragged (by the grip) into a new order. */
export function SortableList({
  items,
  onMove,
  highlightId,
}: {
  items: SortableItem[];
  onMove: (activeId: string, overId: string) => void;
  highlightId?: string;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 3 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  function handleDragEnd({ active, over }: DragEndEvent) {
    if (over && active.id !== over.id) onMove(String(active.id), String(over.id));
  }
  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={items.map((item) => item.id)} strategy={verticalListSortingStrategy}>
        <ul className="space-y-1.5">
          {items.map((item) => (
            <Row key={item.id} item={item} highlight={item.id === highlightId} />
          ))}
        </ul>
      </SortableContext>
    </DndContext>
  );
}
