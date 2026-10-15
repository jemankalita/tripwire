"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Width of an element, kept current with ResizeObserver. Uses a callback ref so
 * it also works when the element mounts later than the component (after loading).
 */
export function useElementWidth<T extends HTMLElement>(initial = 800): [(node: T | null) => void, number] {
  const [node, setNode] = useState<T | null>(null);
  const [width, setWidth] = useState(initial);
  const ref = useCallback((el: T | null) => setNode(el), []);

  useEffect(() => {
    if (!node) return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(node);
    return () => observer.disconnect();
  }, [node]);

  return [ref, width];
}
