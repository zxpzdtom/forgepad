import { useSortable } from "@dnd-kit/sortable";
import { TabItem, type TabItemProps } from "./TabItem";

type SortableTabItemProps = TabItemProps & { id: string };

export function SortableTabItem({ id, ...props }: SortableTabItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  // Lock to horizontal axis only and strip scale so the tab never
  // changes size or drifts vertically while being dragged.
  const style: React.CSSProperties = {
    transform: transform ? `translate3d(${transform.x}px, 0, 0)` : undefined,
    transition: transition ?? undefined,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 50 : undefined,
  };

  return (
    <TabItem
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      {...props}
    />
  );
}
