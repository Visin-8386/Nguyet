// scripts/sync-assets.mjs
//
// Đồng bộ ảnh nguồn (ASSET_SRC) → public/assets (đã nén webp) + public/assets/manifest.json
//
// Quy tắc ghép cặp: chỉ con vật có ĐỦ cả `xxx` (ảnh con vật) và `xxx_2` (ảnh giới thiệu)
// mới được đưa vào pool quay số. Con thiếu một trong hai ảnh sẽ bị bỏ qua + in cảnh báo.
// Người dùng thêm cặp `yyy` + `yyy_2` vào thư mục rồi chạy lại là web tự nhận (không sửa code).
//
// Hỗ trợ đuôi: .png .jpg .jpeg .webp (không phân biệt hoa thường).
// Ảnh bị thu nhỏ về cạnh dài tối đa 1280px rồi lưu webp (giữ tỉ lệ, không cắt).
//
// Nếu ASSET_SRC không tồn tại (ví dụ trên CI): bỏ qua êm, giữ nguyên public/assets có sẵn.

import { mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

// Mặc định: thư mục "hoang" ngay trong repo. Đổi được bằng biến môi trường ASSET_SRC.
const ASSET_SRC = process.env.ASSET_SRC ? resolve(process.env.ASSET_SRC) : join(root, "hoang");
const ASSET_DEST = join(root, "public", "assets");
const MANIFEST_FILE = join(ASSET_DEST, "manifest.json");

const MAX_SIDE = 1280;
const WEBP_QUALITY = 82;
const VALID_EXT = new Set([".png", ".jpg", ".jpeg", ".webp"]);

async function exists(path) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  if (!(await exists(ASSET_SRC))) {
    console.log(
      `[sync-assets] Không thấy thư mục ảnh nguồn "${ASSET_SRC}" → bỏ qua, dùng public/assets có sẵn.`,
    );
    return;
  }

  const labels = JSON.parse(await readFile(join(root, "shared", "animal-labels.json"), "utf8"));

  // Quét toàn bộ file hợp lệ, gom theo tên (không phân biệt hoa thường).
  const files = await readdir(ASSET_SRC);
  const byName = new Map(); // "bonong" -> đường dẫn file
  const skipped = [];
  for (const file of files.sort()) {
    const ext = extname(file).toLowerCase();
    if (!VALID_EXT.has(ext)) {
      skipped.push(`${file} (đuôi không hỗ trợ)`);
      continue;
    }
    const base = file.slice(0, -ext.length);
    const key = base.toLowerCase();
    if (!byName.has(key)) byName.set(key, join(ASSET_SRC, file));
  }

  // Ghép cặp xxx + xxx_2
  const pairs = [];
  const singles = [];
  for (const key of [...byName.keys()].sort()) {
    if (!key.endsWith("_2")) continue;
    const id = key.slice(0, -2);
    if (byName.has(id)) {
      pairs.push({ id, animal: byName.get(id), intro: byName.get(key) });
    } else {
      singles.push(`${key} (thiếu ảnh con vật "${id}")`);
    }
  }
  const orphanAnimals = [...byName.keys()]
    .filter((k) => !k.endsWith("_2") && !byName.has(`${k}_2`))
    .map((k) => `${k} (thiếu ảnh giới thiệu "${k}_2")`);

  await rm(ASSET_DEST, { recursive: true, force: true });
  await mkdir(ASSET_DEST, { recursive: true });

  const manifest = [];
  for (const { id, animal, intro } of pairs) {
    const out = {
      id,
      label: labels[id] ?? id,
      animal: `assets/${id}.webp`,
      intro: `assets/${id}_2.webp`,
    };
    for (const [src, name] of [
      [animal, `${id}.webp`],
      [intro, `${id}_2.webp`],
    ]) {
      const meta = await sharp(src, { failOn: "warning" }).metadata();
      const longest = Math.max(meta.width ?? 0, meta.height ?? 0);
      if (!longest) throw new Error(`Không đọc được kích thước ảnh: ${src}`);
      let pipeline = sharp(src, { failOn: "warning" }).rotate(); // tự xoay theo EXIF
      if (longest > MAX_SIDE) {
        pipeline = pipeline.resize({
          width: (meta.width ?? 0) >= (meta.height ?? 0) ? MAX_SIDE : null,
          height: (meta.height ?? 0) > (meta.width ?? 0) ? MAX_SIDE : null,
          fit: "inside",
          withoutEnlargement: true,
        });
      }
      await pipeline.webp({ quality: WEBP_QUALITY, effort: 4 }).toFile(join(ASSET_DEST, name));
    }
    manifest.push(out);
    console.log(`[sync-assets] ✓ ${id} → ${out.animal}, ${out.intro}`);
  }

  await writeFile(MANIFEST_FILE, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

  console.log(
    `[sync-assets] Pool có ${manifest.length} con: ${manifest.map((m) => m.id).join(", ") || "(rỗng)"}`,
  );
  if (singles.length)
    console.warn(`[sync-assets] Bỏ qua (thiếu ảnh con vật): ${singles.join("; ")}`);
  if (orphanAnimals.length)
    console.warn(`[sync-assets] Bỏ qua (thiếu ảnh giới thiệu): ${orphanAnimals.join("; ")}`);
  if (skipped.length) console.warn(`[sync-assets] Bỏ qua file không hợp lệ: ${skipped.join("; ")}`);
  if (manifest.length === 0) {
    console.warn(
      "[sync-assets] CẢNH BÁO: pool rỗng! Hãy đặt ảnh vào ASSET_SRC theo cặp xxx + xxx_2.",
    );
  }
}

main().catch((error) => {
  console.error(`[sync-assets] LỖI: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
