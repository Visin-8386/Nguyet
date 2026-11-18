import { describe, expect, it } from "vitest";
import {
  TRANSITIONS,
  STATES,
  transition,
  type GameEvent,
  type GameState,
} from "../../src/stateMachine";

/**
 * Bảng chuyển trạng thái đặc tả trong yêu cầu — dùng để đối chiếu tự động.
 * Bất kỳ thay đổi nào trong stateMachine.ts cũng phải cập nhật bảng này.
 */
const EXPECTED: Record<GameState, Partial<Record<GameEvent, GameState>>> = {
  WAITING: { OPEN: "SPINNING", RESTART: "SPINNING", TIMEOUT: "WAITING" },
  SPINNING: {
    FIST: "CAUGHT",
    HAND_LOST: "WAITING",
    TIMEOUT: "WAITING",
    RESTART: "SPINNING",
  },
  CAUGHT: { OPEN: "REVEAL", TIMEOUT: "WAITING", RESTART: "SPINNING" },
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

const ALL_EVENTS: GameEvent[] = [
  "OPEN",
  "FIST",
  "SWIPE_LR",
  "SWIPE_RL",
  "HAND_LOST",
  "HAND_FOUND",
  "TIMEOUT",
  "LONG_IDLE",
  "RESTART",
];

describe("stateMachine — bảng chuyển trạng thái", () => {
  it("khớp chính xác bảng đặc tả", () => {
    expect(TRANSITIONS).toEqual(EXPECTED);
  });

  it("mọi sự kiện đều có kết quả xác định (không bao giờ undefined)", () => {
    for (const state of STATES) {
      for (const event of ALL_EVENTS) {
        expect(TRANSITIONS[state][event] ?? state).toBeTruthy();
        expect(STATES).toContain(transition(state, event));
      }
    }
  });

  it("sự kiện không có trong bảng thì giữ nguyên trạng thái", () => {
    // FIST không có tác dụng khi đang chờ; OPEN không có tác dụng khi đang quay.
    expect(transition("WAITING", "FIST")).toBe("WAITING");
    expect(transition("SPINNING", "OPEN")).toBe("SPINNING");
    expect(transition("CAUGHT", "FIST")).toBe("CAUGHT");
    expect(transition("CAUGHT", "SWIPE_LR")).toBe("CAUGHT");
    expect(transition("REVEAL", "OPEN")).toBe("REVEAL");
    expect(transition("INTRO", "OPEN")).toBe("INTRO");
  });

  it("chuỗi chơi đầy đủ WAITING → SPINNING → CAUGHT → REVEAL → INTRO → REVEAL", () => {
    let state: GameState = "WAITING";
    const steps: Array<[GameEvent, GameState]> = [
      ["OPEN", "SPINNING"],
      ["FIST", "CAUGHT"],
      ["OPEN", "REVEAL"],
      ["SWIPE_LR", "INTRO"],
      ["SWIPE_RL", "REVEAL"],
    ];
    for (const [event, expected] of steps) {
      state = transition(state, event);
      expect(state).toBe(expected);
    }
  });

  it("mất tay khi quay số quay về WAITING; hết giờ ở mọi trạng thái về WAITING", () => {
    expect(transition("SPINNING", "HAND_LOST")).toBe("WAITING");
    for (const state of ["WAITING", "SPINNING", "CAUGHT", "REVEAL"] as const) {
      expect(transition(state, "TIMEOUT")).toBe("WAITING");
    }
    expect(transition("INTRO", "LONG_IDLE")).toBe("WAITING");
  });

  it("Chơi lại luôn đưa về SPINNING", () => {
    for (const state of STATES) {
      expect(transition(state, "RESTART")).toBe("SPINNING");
    }
  });
});
