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

  const DRAG_THRESHOLD = 5; // 最小拖曳距離（像素）

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      console.log('❌ Container not found');
      return;
    }

    console.log('✅ DragSelect hook initialized');

    const handleMouseDown = (e: MouseEvent) => {
      console.log('🖱️ MouseDown:', {
        button: e.button,
        clientX: e.clientX,
        clientY: e.clientY,
        targetTagName: (e.target as HTMLElement).tagName,
        targetClassName: (e.target as HTMLElement).className
      });

      // 只在左鍵點擊時開始
      if (e.button !== 0) {
        console.log('⏭️ Not left button, ignoring');
        return;
      }
      
      const target = e.target as HTMLElement;

      // 檢查是否點擊在按鈕、輸入框等互動元素上
      if (target.closest('button, input, textarea, a, select')) {
        console.log('⏭️ Clicked on interactive element, ignoring');
        return;
      }

      const x = e.clientX;
      const y = e.clientY;

      console.log('🎯 Preparing for possible drag at:', { x, y });
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

      console.log('📍 Mouse moving:', {
        currentX: e.clientX,
        currentY: e.clientY,
        startX: startPos.current.x,
        startY: startPos.current.y
      });

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
        console.log('✋ Mouse up:', {
          hasMoved: hasMoved.current,
          clickTarget: clickTarget.current?.className
        });

        // 如果沒有移動（純點擊），並且點擊的不是卡片相關元素
        if (!hasMoved.current && clickTarget.current) {
          const clickedCard = clickTarget.current.closest('[data-note-card], .note-card, [class*="Note"], [class*="Card"]');
          if (!clickedCard) {
            console.log('🧹 Clicked empty area, should clear selection');
            setShouldClearSelection(true);
            // 重置標記，以便下次能再次觸發
            setTimeout(() => setShouldClearSelection(false), 100);
          }
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
    shouldClearSelection, // 新增：通知頁面是否應該清除選取
  };
}