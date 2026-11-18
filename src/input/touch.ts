/**
 * Điều khiển bằng cảm ứng (chế độ không cần camera):
 *   - 3 nút lớn: Xòe / Nắm / Vuốt
 *   - vuốt ngón tay trên màn hình (trái⇄phải) để thay cho cử chỉ vuốt
 * Nút "Vuốt" dùng hướng mặc định theo ngữ cảnh do game cung cấp.
 */

import type { GestureInputHandlers } from "./keyboard";

export interface TouchControlsOptions {
  openButton: HTMLButtonElement;
  fistButton: HTMLButtonElement;
  swipeButton: HTMLButtonElement;
  /** Vùng nhận thao tác vuốt tay trên màn hình. */
  swipeSurface: HTMLElement;
  /** Hướng vuốt khi bấm nút "Vuốt" (đổi theo trạng thái game). */
  defaultSwipeDirection: () => "left" | "right";
}

export function attachTouchControls(
  options: TouchControlsOptions,
  handlers: GestureInputHandlers,
): () => void {
  const disposers: Array<() => void> = [];

  const listen = <K extends keyof HTMLElementEventMap>(
    el: HTMLElement,
    type: K,
    listener: (event: HTMLElementEventMap[K]) => void,
    opts?: AddEventListenerOptions,
  ): void => {
    el.addEventListener(type, listener, opts);
    disposers.push(() => el.removeEventListener(type, listener, opts));
  };

  listen(options.openButton, "click", () => handlers.onOpen());
  listen(options.fistButton, "click", () => handlers.onFist());
  listen(options.swipeButton, "click", () => handlers.onSwipe(options.defaultSwipeDirection()));

  // Vuốt ngón tay trên màn hình: theo dõi pointer down/up, bỏ qua khi chạm nút.
  let startX = 0;
  let startY = 0;
  let tracking = false;

  const isInteractive = (target: EventTarget | null): boolean =>
    target instanceof Element &&
    !!target.closest("button, a, input, #toolbar, #touch-controls, #debug-panel, #hand-indicator");

  listen(
    options.swipeSurface,
    "pointerdown",
    (event) => {
      if (event.pointerType === "mouse" && event.button !== 0) return;
      if (isInteractive(event.target)) return;
      tracking = true;
      startX = event.clientX;
      startY = event.clientY;
    },
    { passive: true },
  );

  const finish = (clientX: number, clientY: number): void => {
    if (!tracking) return;
    tracking = false;
    const dx = clientX - startX;
    const dy = clientY - startY;
    if (Math.abs(dx) >= 60 && Math.abs(dy) <= Math.abs(dx) * 0.75) {
      handlers.onSwipe(dx > 0 ? "right" : "left");
    }
  };

  listen(options.swipeSurface, "pointerup", (event) => finish(event.clientX, event.clientY), {
    passive: true,
  });
  listen(
    options.swipeSurface,
    "pointercancel",
    () => {
      tracking = false;
    },
    { passive: true },
  );

  return () => {
    for (const dispose of disposers) dispose();
  };
}
