import { useState, useRef, useEffect, useCallback } from 'react';

interface Position {
  x: number;
  y: number;
}

interface SelectionBox {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
}

export function useDragSelect(containerRef: React.RefObject<HTMLElement>) {
  const [isSelecting, setIsSelecting] = useState(false);
  const [selectionBox, setSelectionBox] = useState<SelectionBox | null>(null);
  const [shouldClearSelection, setShouldClearSelection] = useState(false);
  const startPos = useRef<Position | null>(null);
  const isMouseDown = useRef(false);
  const hasMoved = useRef(false); // 追蹤是否有真正移動過
  const clickTarget = useRef<HTMLElement | null>(null); // 記錄點擊目標
  const wasDragging = useRef(false); // 剛結束拖曳，用來阻擋後續的 click 事件

  const DRAG_THRESHOLD = 5; // 最小拖曳距離（像素）

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    const handleMouseDown = (e: MouseEvent) => {
      // 只在左鍵點擊時開始
      if (e.button !== 0) {
        return;
      }

      // Ctrl/Meta+click 讓原生事件通過，不攔截
      if (e.ctrlKey || e.metaKey) {
        return;
      }
      
      const target = e.target as HTMLElement;

      // 檢查是否點擊在按鈕、輸入框等互動元素上
      if (target.closest('button, input, textarea, a, select')) {
        return;
      }

      const x = e.clientX;
      const y = e.clientY;

      isMouseDown.current = true;
      hasMoved.current = false; // 重置移動標誌
      startPos.current = { x, y };
      clickTarget.current = target; // 記錄點擊目標

      // 立即阻止文字選取
      e.preventDefault();
      
      // 不立即設置選取狀態，等滑鼠真正移動後再設置
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (!isMouseDown.current || !startPos.current) return;

      // 阻止文字選取
      e.preventDefault();

      const dx = Math.abs(e.clientX - startPos.current.x);
      const dy = Math.abs(e.clientY - startPos.current.y);

      if (dx > DRAG_THRESHOLD || dy > DRAG_THRESHOLD) {
        hasMoved.current = true;
        if (!isSelecting) {
          setIsSelecting(true);
          setSelectionBox({
            startX: startPos.current.x,
            startY: startPos.current.y,
            endX: startPos.current.x,
            endY: startPos.current.y,
          });
        }
      }

      if (hasMoved.current) {
        setSelectionBox({
          startX: startPos.current.x,
          startY: startPos.current.y,
          endX: e.clientX,
          endY: e.clientY,
        });
      }
    };

    const handleMouseUp = () => {
      if (isMouseDown.current) {
        // 如果沒有移動（純點擊），並且點擊的不是卡片相關元素
        if (!hasMoved.current && clickTarget.current) {
          const clickedCard = clickTarget.current.closest('[data-note-card], .note-card, [class*="Note"], [class*="Card"]');
          if (!clickedCard) {
            setShouldClearSelection(true);
            // 重置標記，以便下次能再次觸發
            setTimeout(() => setShouldClearSelection(false), 100);
          }
        }

        // 如果有真正拖曳過，標記一下讓 click handler 可以忽略接下來的 click 事件
        if (hasMoved.current) {
          wasDragging.current = true;
          setTimeout(() => { wasDragging.current = false; }, 100);
        }

        isMouseDown.current = false;
        setIsSelecting(false);
        startPos.current = null;
        clickTarget.current = null;
        // 延遲清除選取框，讓最後一次選取生效
        setTimeout(() => {
          setSelectionBox(null);
        }, 100);
      }
    };

    // 添加事件監聽器
    container.addEventListener('mousedown', handleMouseDown);
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      container.removeEventListener('mousedown', handleMouseDown);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [containerRef]);

  // 檢查元素是否在選取框內
  const isInSelectionBox = useCallback((element: HTMLElement): boolean => {
    if (!selectionBox) return false;

    const rect = element.getBoundingClientRect();
    const box = {
      left: Math.min(selectionBox.startX, selectionBox.endX),
      right: Math.max(selectionBox.startX, selectionBox.endX),
      top: Math.min(selectionBox.startY, selectionBox.endY),
      bottom: Math.max(selectionBox.startY, selectionBox.endY),
    };

    // 檢查矩形是否相交
    return !(
      rect.right < box.left ||
      rect.left > box.right ||
      rect.bottom < box.top ||
      rect.top > box.bottom
    );
  }, [selectionBox]);

  // 獲取選取框的樣式
  const getSelectionBoxStyle = useCallback((): React.CSSProperties | null => {
    if (!selectionBox) return null;

    const left = Math.min(selectionBox.startX, selectionBox.endX);
    const top = Math.min(selectionBox.startY, selectionBox.endY);
    const width = Math.abs(selectionBox.endX - selectionBox.startX);
    const height = Math.abs(selectionBox.endY - selectionBox.startY);

    return {
      position: 'fixed',
      left: `${left}px`,
      top: `${top}px`,
      width: `${width}px`,
      height: `${height}px`,
      border: '2px dashed #3b82f6',
      backgroundColor: 'rgba(59, 130, 246, 0.1)',
      pointerEvents: 'none',
      zIndex: 9999,
    };
  }, [selectionBox]);

  return {
    isSelecting,
    selectionBox,
    isInSelectionBox,
    getSelectionBoxStyle,
    shouldClearSelection,
    wasDragging,
  };
}
