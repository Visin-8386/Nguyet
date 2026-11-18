/**
 * Tải manifest + preload toàn bộ ảnh (img.decode) trước khi vào game,
 * kèm thanh tiến trình. Ảnh được sync từ thư mục nguồn bởi scripts/sync-assets.mjs.
 */

import { MANIFEST_URL } from "./config";

const BASE: string = import.meta.env.BASE_URL.endsWith("/")
  ? import.meta.env.BASE_URL
  : `${import.meta.env.BASE_URL}/`;

export interface AnimalAsset {
  id: string;
  label: string;
  /** URL đầy đủ (đã ghép BASE_URL) tới ảnh con vật. */
  animal: string;
  /** URL đầy đủ tới poster giới thiệu "BÁO ĐỘNG". */
  intro: string;
}

interface RawManifestEntry {
  id?: unknown;
  label?: unknown;
  animal?: unknown;
  intro?: unknown;
}

function withBase(path: string): string {
  // Manifest ghi đường dẫn tương đối "assets/xxx.webp" → ghép BASE_URL, không hard-code "/".
  return `${BASE}${path.replace(/^\/+/, "")}`;
}

export async function fetchAnimals(): Promise<AnimalAsset[]> {
  let response: Response;
  try {
    response = await fetch(MANIFEST_URL, { cache: "no-cache" });
  } catch (error) {
    throw new Error(
      `Không tải được manifest ảnh (${MANIFEST_URL}). ${
        error instanceof Error ? error.message : ""
      }`,
      { cause: error },
    );
  }
  if (!response.ok) {
    throw new Error(`Không tải được manifest ảnh: HTTP ${response.status}`);
  }
  const raw: unknown = await response.json();
  if (!Array.isArray(raw)) throw new Error("manifest.json không hợp lệ (không phải mảng).");

  const animals: AnimalAsset[] = [];
  for (const entry of raw as RawManifestEntry[]) {
    if (
      !entry ||
      typeof entry.id !== "string" ||
      typeof entry.animal !== "string" ||
      typeof entry.intro !== "string"
    ) {
      console.warn("[assets] Bỏ qua mục manifest không hợp lệ:", entry);
      continue;
    }
    animals.push({
      id: entry.id,
      label: typeof entry.label === "string" && entry.label ? entry.label : entry.id,
      animal: withBase(entry.animal),
      intro: withBase(entry.intro),
    });
  }
  return animals;
}

/** Preload + decode song song; onProgress nhận giá trị 0..1. */
export async function preloadAnimals(
  animals: AnimalAsset[],
  onProgress?: (progress: number) => void,
): Promise<void> {
  const urls = animals.flatMap((a) => [a.animal, a.intro]);
  if (urls.length === 0) {
    onProgress?.(1);
    return;
  }
  let finished = 0;
  const tick = () => {
    finished += 1;
    onProgress?.(finished / urls.length);
  };
  await Promise.all(
    urls.map(async (url) => {
      const img = new Image();
      img.src = url;
      try {
        if (typeof img.decode === "function") {
          await img.decode();
        } else {
          await new Promise<void>((resolve, reject) => {
            img.onload = () => resolve();
            img.onerror = () => reject(new Error(`Không tải được ảnh: ${url}`));
          });
        }
      } catch {
        // decode() có thể reject vì lý do lạ (Safari cũ) — kiểm tra ảnh thực sự đã tải chưa.
        if (img.naturalWidth > 0) {
          // Ảnh đã có kích thước → coi như tải xong, bỏ qua lỗi decode không quan trọng.
        } else if (img.complete) {
          throw new Error(`Không tải được ảnh: ${url}`);
        } else {
          await new Promise<void>((resolve, reject) => {
            img.onload = () => resolve();
            img.onerror = () => reject(new Error(`Không tải được ảnh: ${url}`));
          });
        }
      }
      tick();
    }),
  );
}
