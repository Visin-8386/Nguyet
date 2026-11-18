/**
 * State machine của trò chơi — bảng chuyển trạng thái TƯỜNG MINH.
 * Mọi sự kiện cử chỉ (từ camera hoặc bàn phím/cảm ứng) đều đi qua đây;
 * sự kiện không có trong bảng thì bị bỏ qua (giữ nguyên trạng thái).
 *
 *   WAITING --OPEN--> SPINNING
 *   SPINNING --FIST--> CAUGHT
 *   SPINNING --HAND_LOST/TIMEOUT--> WAITING
 *   CAUGHT --OPEN--> REVEAL
 *   REVEAL --SWIPE_LR--> INTRO
 *   REVEAL --FIST--> SPINNING
 *   INTRO --SWIPE_RL--> REVEAL
 *   INTRO --FIST--> SPINNING
 *   (mọi trạng thái trừ INTRO) --TIMEOUT--> WAITING
 *   INTRO --LONG_IDLE--> WAITING
 *   (mọi trạng thái) --RESTART--> SPINNING
 */

export const STATES = ["WAITING", "SPINNING", "CAUGHT", "REVEAL", "INTRO"] as const;
export type GameState = (typeof STATES)[number];

export type GameEvent =
  | "OPEN"
  | "FIST"
  | "SWIPE_LR"
  | "SWIPE_RL"
  | "HAND_LOST"
  | "HAND_FOUND"
  | "TIMEOUT"
  | "LONG_IDLE"
  | "RESTART";

export const TRANSITIONS: Record<GameState, Partial<Record<GameEvent, GameState>>> = {
  WAITING: {
    OPEN: "SPINNING",
    RESTART: "SPINNING",
    TIMEOUT: "WAITING",
  },
  SPINNING: {
    FIST: "CAUGHT",
    HAND_LOST: "WAITING",
    TIMEOUT: "WAITING",
    RESTART: "SPINNING",
  },
  CAUGHT: {
    // Ở CAUGHT tuyệt đối không lộ con vật: chỉ XÒE TAY mới mở hộp.
    OPEN: "REVEAL",
    TIMEOUT: "WAITING",
    RESTART: "SPINNING",
  },
  REVEAL: {
    SWIPE_LR: "INTRO",
    FIST: "SPINNING",
    TIMEOUT: "WAITING",
    RESTART: "SPINNING",
  },
  INTRO: {
    SWIPE_RL: "REVEAL",
    FIST: "SPINNING",
    RESTART: "SPINNING",
    LONG_IDLE: "WAITING",
  },
};

/** Trả về trạng thái kế tiếp (hoặc giữ nguyên nếu sự kiện không được xử lý ở trạng thái hiện tại). */
export function transition(state: GameState, event: GameEvent): GameState {
  return TRANSITIONS[state][event] ?? state;
}

/** True nếu sự kiện thực sự đổi trạng thái. */
export function isTransition(state: GameState, event: GameEvent): boolean {
  return transition(state, event) !== state;
}
