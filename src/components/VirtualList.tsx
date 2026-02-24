/* ─── Virtual List ─────────────────────────────────────
   A lightweight virtual scrolling component for long lists.
   Only renders items visible in the viewport + buffer.
   ────────────────────────────────────────────────────── */

import React, { useState, useRef, useEffect, useCallback } from "react";

interface VirtualListProps<T> {
  items: T[];
  itemHeight: number;
  containerHeight: number;
  bufferCount?: number;
  renderItem: (item: T, index: number) => React.ReactNode;
  className?: string;
}

function VirtualListInner<T>(
  {
    items,
    itemHeight,
    containerHeight,
    bufferCount = 5,
    renderItem,
    className,
  }: VirtualListProps<T>,
  ref: React.ForwardedRef<HTMLDivElement>,
) {
  const [scrollTop, setScrollTop] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  // Merge refs
  useEffect(() => {
    if (typeof ref === "function") {
      ref(containerRef.current);
    } else if (ref) {
      (ref as React.MutableRefObject<HTMLDivElement | null>).current =
        containerRef.current;
    }
  }, [ref]);

  const handleScroll = useCallback(() => {
    if (containerRef.current) {
      setScrollTop(containerRef.current.scrollTop);
    }
  }, []);

  const totalHeight = items.length * itemHeight;
  const startIndex = Math.max(
    0,
    Math.floor(scrollTop / itemHeight) - bufferCount,
  );
  const visibleCount = Math.ceil(containerHeight / itemHeight) + bufferCount * 2;
  const endIndex = Math.min(items.length, startIndex + visibleCount);

  const visibleItems = items.slice(startIndex, endIndex);

  return (
    <div
      ref={containerRef}
      className={className}
      onScroll={handleScroll}
      style={{
        height: containerHeight,
        overflow: "auto",
        position: "relative",
      }}
    >
      <div style={{ height: totalHeight, position: "relative" }}>
        <div
          style={{
            position: "absolute",
            top: startIndex * itemHeight,
            width: "100%",
          }}
        >
          {visibleItems.map((item, i) => (
            <div
              key={startIndex + i}
              style={{ height: itemHeight }}
            >
              {renderItem(item, startIndex + i)}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// Use React.forwardRef with generic wrapper
export const VirtualList = React.forwardRef(VirtualListInner) as <T>(
  props: VirtualListProps<T> & { ref?: React.Ref<HTMLDivElement> },
) => React.ReactElement;

export default VirtualList;
