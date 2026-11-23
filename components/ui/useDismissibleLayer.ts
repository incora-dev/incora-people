"use client";

import { useEffect, useRef, type RefObject } from "react";

export function useDismissibleLayer(
  open: boolean,
  containerRef: RefObject<HTMLElement | null>,
  onDismiss: () => void,
) {
  const onDismissRef = useRef(onDismiss);

  useEffect(() => {
    onDismissRef.current = onDismiss;
  }, [onDismiss]);

  useEffect(() => {
    if (!open) return;

    function dismissOnOutsidePointer(event: PointerEvent) {
      const container = containerRef.current;
      if (container && !container.contains(event.target as Node))
        onDismissRef.current();
    }

    function dismissOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") onDismissRef.current();
    }

    document.addEventListener("pointerdown", dismissOnOutsidePointer);
    document.addEventListener("keydown", dismissOnEscape);
    return () => {
      document.removeEventListener("pointerdown", dismissOnOutsidePointer);
      document.removeEventListener("keydown", dismissOnEscape);
    };
  }, [containerRef, open]);
}
