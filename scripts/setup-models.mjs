// scripts/setup-models.mjs
//
// Chuẩn bị tài nguyên MediaPipe để chạy OFFLINE (không phụ thuộc CDN):
//   1. Tải model gesture_recognizer.task (float16) về public/models/ nếu chưa có.
//   2. Copy thư mục wasm từ node_modules/@mediapipe/tasks-vision/wasm sang public/wasm/
//      => luôn KHỚP đúng phiên bản npm đã cài (ghi trong package.json).
//
// Chạy: npm run setup   (tự chạy qua predev/prebuild)

import { cp, mkdir, readFile, rm, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/1/gesture_recognizer.task";
const MODEL_DIR = join(root, "public", "models");
const MODEL_FILE = join(MODEL_DIR, "gesture_recognizer.task");

const WASM_SRC = join(root, "node_modules", "@mediapipe", "tasks-vision", "wasm");
const WASM_DEST = join(root, "public", "wasm");

async function exists(path) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function ensureModel() {
  if (await exists(MODEL_FILE)) {
    const { size } = await stat(MODEL_FILE);
    console.log(
      `[setup] Đã có model gesture_recognizer.task (${Math.round(size / 1024)} KB), bỏ qua tải.`,
    );
    return;
  }
  console.log("[setup] Đang tải model gesture_recognizer.task …");
  await mkdir(MODEL_DIR, { recursive: true });
  const res = await fetch(MODEL_URL, { redirect: "follow" });
  if (!res.ok) {
    throw new Error(`Không tải được model (HTTP ${res.status} ${res.statusText}) từ ${MODEL_URL}`);
  }
  const buffer = Buffer.from(await res.arrayBuffer());
  if (buffer.byteLength < 1024 * 1024) {
    throw new Error(`Model tải về quá nhỏ (${buffer.byteLength} byte) – có thể file lỗi.`);
  }
  await rm(MODEL_FILE, { force: true });
  const { writeFile } = await import("node:fs/promises");
  await writeFile(MODEL_FILE, buffer);
  console.log(`[setup] Đã tải model (${Math.round(buffer.byteLength / 1024)} KB) → public/models/`);
}

async function ensureWasm() {
  if (!(await exists(WASM_SRC))) {
    throw new Error(
      "Không thấy node_modules/@mediapipe/tasks-vision/wasm. Hãy chạy `npm install` trước `npm run setup`.",
    );
  }
  await mkdir(WASM_DEST, { recursive: true });
  // Xoá wasm cũ để tránh lẫn file của phiên bản khác, rồi copy mới nhất.
  await rm(WASM_DEST, { recursive: true, force: true });
  await cp(WASM_SRC, WASM_DEST, { recursive: true });
  const files = await readFile(join(WASM_SRC, "vision_wasm_internal.wasm"))
    .then((b) => `vision_wasm_internal.wasm (${Math.round(b.byteLength / 1024)} KB)`)
    .catch(() => "(không đọc được thông tin file)");
  console.log(
    `[setup] Đã copy wasm khớp phiên bản @mediapipe/tasks-vision → public/wasm/: ${files}`,
  );
}

async function main() {
  await ensureModel();
  await ensureWasm();
  console.log("[setup] Xong. Model + wasm sẵn sàng chạy offline.");
}

main().catch((error) => {
  console.error(`[setup] LỖI: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
