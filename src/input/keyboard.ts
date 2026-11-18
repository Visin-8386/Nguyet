/**
 * Điều khiển bằng bàn phím (chế độ không cần camera):
 *   Space = xòe tay · F = nắm tay · → = vuốt phải · ← = vuốt trái
 * Dùng CHUNG luồng sự kiện với camera.
 */

export interface GestureInputHandlers {
  onOpen(): void;
  onFist(): void;
  onSwipe(direction: "left" | "right"): void;
}

export function attachKeyboard(handlers: GestureInputHandlers): () => void {
  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.repeat || event.altKey || event.ctrlKey || event.metaKey) return;
    const target = event.target as HTMLElement | null;
    if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;

    switch (event.code) {
      case "Space":
        event.preventDefault();
        handlers.onOpen();
        break;
      case "KeyF":
        event.preventDefault();
        handlers.onFist();
        break;
      case "ArrowRight":
        event.preventDefault();
        handlers.onSwipe("right");
        break;
      case "ArrowLeft":
        event.preventDefault();
        handlers.onSwipe("left");
        break;
      default:
        break;
    }
  };
  window.addEventListener("keydown", onKeyDown);
  return () => window.removeEventListener("keydown", onKeyDown);
}
