# 🐾 Bắt con vật bằng cử chỉ tay

Trò chơi web **chạy hoàn toàn trong trình duyệt**: bạn xòe tay để quay số, nắm tay để “bắt” con vật, vuốt tay để xem poster giới thiệu. Webcam được xử lý ngay trên máy bằng MediaPipe — **video không bao giờ rời khỏi thiết bị của bạn**.

- Không có backend, không tài khoản, không analytics.
- Ảnh, model và wasm đều nằm trong repo → sau khi tải trang không có request ra ngoài. Mọi `fetch` khác origin đều bị chặn ngay trong app (kể cả telemetry ẩn của MediaPipe).
- Có chế độ **không cần camera**: bàn phím trên máy tính, 3 nút cảm ứng + vuốt trên điện thoại.
- Tự thích ứng hiệu năng: giảm tần suất suy luận, hạ độ phân giải, tắt skeleton/confetti khi máy yếu.

---

## 1. Chạy nhanh trên máy

Yêu cầu: **Node.js ≥ 20.19** (khuyến nghị LTS), npm, một webcam.

```bash
npm install
npm run setup     # tải model + copy wasm (chỉ lần đầu, sau đó bỏ qua)
npm run dev
```

Mở `https://localhost:5173/` (dev server dùng HTTPS tự ký để webcam hoạt động). `npm run dev` tự chạy `setup` và `sync-assets` trước khi khởi động (nhờ `predev`), nên trên máy đã có đủ tài nguyên bạn chỉ cần `npm install && npm run dev`.

Lệnh hữu ích:

| Lệnh                  | Việc làm                                                    |
| --------------------- | ----------------------------------------------------------- |
| `npm run dev`         | Chạy dev server HTTPS + in địa chỉ LAN/QR                   |
| `npm run setup`       | Tải `gesture_recognizer.task`, copy wasm đúng phiên bản npm |
| `npm run sync-assets` | Đồng bộ ảnh nguồn → `public/assets` + `manifest.json`       |
| `npm run lint`        | ESLint (0 warning được phép)                                |
| `npm test`            | Unit test bằng Vitest                                       |
| `npm run e2e`         | E2E bằng Playwright (Chromium, camera giả)                  |
| `npm run build`       | Typecheck + build production vào `dist/`                    |
| `npm run preview`     | Xem thử bản build                                           |

---

## 2. Chơi trên điện thoại trong cùng mạng LAN

1. Chạy `npm run dev` trên máy tính.
2. Terminal in ra địa chỉ dạng `https://192.168.x.x:5173/` kèm **mã QR**.
3. Quét QR bằng điện thoại (cùng Wi-Fi).
4. Chứng chỉ là **self-signed** → trình duyệt sẽ cảnh báo. Chọn “Nâng cao” → “Tiếp tục truy cập” (iOS: “Show Details” → “visit this website”).
5. Nếu không mở được: kiểm tra Windows Firewall đang cho phép Node.js, và điện thoại không dùng mạng 4G/VPN khác mạng máy tính.

> Webcam chỉ hoạt động trên **HTTPS** hoặc `localhost`. Đó là lý do dev server dùng `@vitejs/plugin-basic-ssl`. Khi deploy GitHub Pages, HTTPS đã có sẵn.

---

## 3. Cách chơi

### Bằng webcam (cử chỉ)

| Trạng thái      | Cử chỉ              | Kết quả                         |
| --------------- | ------------------- | ------------------------------- |
| Đang chờ        | 🖐 Xòe 5 ngón       | Bắt đầu quay số                 |
| Đang quay       | ✊ Nắm tay          | Chốt con vật (chỉ hiện hộp `?`) |
| Đã bắt          | 🖐 Xòe tay          | Lật thẻ, hiện tên + confetti    |
| Đã lật thẻ      | 👉 Vuốt trái → phải | Mở poster giới thiệu            |
| Đang giới thiệu | 👈 Vuốt phải → trái | Quay lại thẻ con vật            |

- Chỉ nhận **một bàn tay**. Đưa tay cách camera khoảng 40–80 cm, lòng bàn tay hướng về camera, đủ sáng.
- Cử chỉ phải giữ ổn định ít nhất ~120 ms. Nếu tay mất khỏi khung hình quá ~400 ms khi đang quay số, game trở về trạng thái chờ.
- Không có tay quá 8 giây (trừ màn hình giới thiệu: 60 giây) → tự về trạng thái chờ.
- Nút **“Chơi lại”** luôn có tác dụng.

### Không cần camera

Bấm **“Chơi không cần camera”** ở màn hình bắt đầu, hoặc chọn khi gặp lỗi camera.

| Thao tác         | Phím    | Nút cảm ứng                              |
| ---------------- | ------- | ---------------------------------------- |
| Xòe tay          | `Space` | **Xòe**                                  |
| Nắm tay          | `F`     | **Nắm**                                  |
| Vuốt trái → phải | `→`     | **Vuốt** (tự chọn hướng theo trạng thái) |
| Vuốt phải → trái | `←`     | **Vuốt** (ở màn hình giới thiệu)         |

Trên điện thoại còn có thể **vuốt ngón tay** trực tiếp trên màn hình.

### Phím / nút khác

- 🔊 Tắt/bật tiếng (âm thanh tổng hợp bằng WebAudio, không cần file).
- 🖐 Bật/tắt skeleton bàn tay.
- ⛶ Toàn màn hình (ẩn trên iPhone Safari vì trình duyệt không hỗ trợ).
- 📊 Bảng debug: FPS, thời gian suy luận, trạng thái, cử chỉ, độ tin cậy, tay, chế độ, mức hiệu năng, delegate GPU/CPU.
- ⟳ Đổi camera trước/sau — **chỉ hiện khi máy có nhiều hơn 1 camera**. Camera trước được lật gương, camera sau thì không.

---

## 4. Thêm / thay ảnh con vật

### Quy tắc đặt tên

Trong thư mục nguồn (mặc định `<repo>/hoang`, đổi bằng biến môi trường `ASSET_SRC`):

```
bonong.png      ← ảnh con vật (thẻ)
bonong_2.png    ← poster giới thiệu
casau.jpg
casau_2.jpg
...
```

- Chỉ những cặp **đủ cả `xxx` và `xxx_2`** mới vào pool. Thiếu một ảnh → bỏ qua + in cảnh báo, không làm hỏng game.
- Hỗ trợ `.png`, `.jpg`, `.jpeg`, `.webp`, **không phân biệt hoa thường**.
- Ảnh được thu nhỏ về cạnh dài tối đa **1280 px**, giữ tỉ lệ, xuất **WebP quality 82** vào `public/assets/`.
- Tên hiển thị lấy từ `shared/animal-labels.json`; id không có trong file này sẽ hiển thị chính tên file.

```json
{
  "bonong": "Bồ nông",
  "casau": "Cá sấu hoa cà",
  "ho": "Hổ Đông Dương",
  "mi": "Mi Langbian"
}
```

Thêm nhãn mới vào file trên rồi chạy:

```bash
npm run sync-assets
```

`public/assets/` và `manifest.json` **được commit** để GitHub Pages/CI không cần thư mục ảnh gốc. Nếu `ASSET_SRC` không tồn tại (ví dụ trên CI), script bỏ qua và giữ nguyên ảnh đã commit.

Pool hiện tại: **4 con** (bonong, casau, ho, mi). 9 file chỉ có một ảnh bị bỏ qua kèm cảnh báo. Nếu pool rỗng, game hiện thông báo rõ ràng thay vì màn hình trắng.

---

## 5. Tinh chỉnh độ nhạy

Toàn bộ ngưỡng nằm trong **`src/config.ts`** — không cần sửa logic.

| Hằng số                                | Mặc định   | Ý nghĩa / khi nào chỉnh                         |
| -------------------------------------- | ---------- | ----------------------------------------------- |
| `GESTURE.openScore` / `fistScore`      | 0.6        | Tăng nếu nhận nhầm, giảm nếu khó nhận cử chỉ    |
| `GESTURE.exitScore`                    | 0.45       | Ngưỡng giữ cử chỉ (hysteresis), chống nhấp nháy |
| `GESTURE.stableMs`                     | 120 ms     | Thời gian cử chỉ phải ổn định                   |
| `GESTURE.handLostMs`                   | 400 ms     | Mất tay bao lâu thì coi là không có tay         |
| `SWIPE.minHandSizeRatio`               | 1.5        | Quãng vuốt tối thiểu theo kích thước bàn tay    |
| `SWIPE.minFrameRatio`                  | 0.1        | Quãng vuốt tối thiểu theo chiều rộng khung hình |
| `SWIPE.windowMs`                       | 500 ms     | Cửa sổ thời gian của một cú vuốt                |
| `SWIPE.dyRatioMax`                     | 0.5        | Vuốt phải gần như ngang (`                      | dy  | ≤ 0.5 | dx  | `)  |
| `SWIPE.cooldownMs`                     | 900 ms     | Nghỉ giữa hai cú vuốt                           |
| `GAME.noHandTimeoutMs`                 | 8000 ms    | Không thấy tay → về trạng thái chờ              |
| `GAME.introIdleTimeoutMs`              | 60000 ms   | Đứng ở poster quá lâu → về trạng thái chờ       |
| `GAME.slotMs`                          | 90 ms      | Tốc độ quay số                                  |
| `PERF.slowInferMs` / `verySlowInferMs` | 24 / 45 ms | Ngưỡng tự hạ chất lượng                         |
| `CAMERA.width` / `height`              | 640 × 480  | Độ phân giải yêu cầu (ideal)                    |

Mẹo: tăng `stableMs` nếu tay run; giảm `minHandSizeRatio` nếu người chơi đứng xa; tăng `cooldownMs` nếu một cú vuốt bị tính hai lần.

---

## 6. Kiến trúc

```
index.html
src/
  main.ts          Khởi động, luồng màn hình bắt đầu / tải / lỗi, sao chép link
  privacy.ts       Chặn mọi fetch ra ngoài origin (telemetry ẩn của MediaPipe)
  config.ts        TOÀN BỘ ngưỡng + đường dẫn theo BASE_URL
  camera.ts        getUserMedia, đổi camera, object-fit cover mapping
  gestureEngine.ts MediaPipe GestureRecognizer → sự kiện open/fist/swipe/hand
  swipeDetector.ts Nhận cú vuốt ngang, One Euro + cửa sổ thời gian
  oneEuroFilter.ts Làm mượt toạ độ
  stateMachine.ts  Bảng chuyển trạng thái tường minh
  assets.ts        Tải manifest, preload + decode ảnh, tiến trình
  game.ts          Điều phối game, vòng lặp, adaptive perf, wake lock
  input/           keyboard.ts, touch.ts
  ui/              render.ts, overlay.ts, effects.ts, audio.ts, errors.ts
scripts/
  setup-models.mjs Tải model + copy wasm
  sync-assets.mjs  Ghép cặp ảnh → WebP + manifest
tests/
  unit/            Vitest: state machine, swipe, filter, landmark, cover
  e2e/             Playwright: luồng chơi + camera giả
public/
  models/          gesture_recognizer.task (float16)
  wasm/            wasm khớp @mediapipe/tasks-vision 1.2.3
  assets/          ảnh WebP + manifest.json (commit)
shared/
  animal-labels.json
```

Luồng dữ liệu:

```
webcam → GestureEngine (landmark + phân loại)
       → sự kiện ổn định (open / fist / swipe / hand-lost)
       → stateMachine
       → GameView + âm thanh + confetti
```

MediaPipe trả toạ độ theo ảnh gốc chưa lật; engine quy đổi sang **toạ độ hiển thị** (`displayX = 1 - x` khi camera trước) ngay khi nhận, nên skeleton, hướng vuốt và hướng vuốt cảm ứng luôn khớp với những gì người chơi nhìn thấy.

### Trạng thái

`WAITING → SPINNING → CAUGHT → REVEAL → INTRO`

- `CAUGHT` tuyệt đối **không** gắn `src` ảnh hay tên con vật — chỉ có hộp `?`.
- `SPINNING` đổi ảnh mỗi 90 ms bằng `crypto.getRandomValues`, không lặp cùng con hai lần liền.
- Mọi sự kiện không có trong bảng chuyển trạng thái đều bị bỏ qua.
- Có unit test cho **toàn bộ bảng** chuyển trạng thái.

---

## 7. Kiểm thử

```bash
npm run lint
npm test
npm run e2e
npm run build
```

Kết quả chạy thực tế trên máy phát triển (Windows, Node 24.22.2, Chrome for Testing 159 qua Playwright):

| Hạng mục                   | Kết quả                                                        |
| -------------------------- | -------------------------------------------------------------- |
| ESLint                     | ✅ 0 lỗi, 0 cảnh báo                                           |
| Unit test (Vitest)         | ✅ 6 file, **37 test** pass                                    |
| E2E (Playwright, Chromium) | ✅ **4 test** pass (~44 giây)                                  |
| Typecheck + build          | ✅ pass, bundle JS ~198 KB (~60 KB gzip) + model/wasm/ảnh tĩnh |

E2E đã kiểm tra:

1. `WAITING → SPINNING → CAUGHT → REVEAL → INTRO → REVEAL → SPINNING` bằng bàn phím, xác nhận **CAUGHT không lộ ảnh/tên**, poster `_2` hiện đúng, “Chơi lại” hoạt động, **không có console error**.
2. Ba nút cảm ứng (Xòe / Nắm / Vuốt) điều khiển đúng hướng ở `REVEAL` và `INTRO`.
3. Mở **camera giả** của Chromium, video có kích thước và đang phát, vào game không lỗi, **không có request ra ngoài origin**.
4. Chặn `fetch` tới endpoint telemetry ẩn của MediaPipe (`odml.pa.googleapis.com`) trong khi `fetch` cùng origin vẫn hoạt động.

Unit test bao phủ: bảng chuyển trạng thái đầy đủ, vuốt đúng/ngược/chéo/đứng yên/rung/tay gần–xa/cooldown, One Euro Filter, kiểm tra landmark xòe–nắm, phép chiếu `object-fit: cover`, và bộ chặn request ra ngoài origin.

**Chưa kiểm thử tự động:** webcam thật, điện thoại thật (iOS/Android), độ chính xác cử chỉ với nhiều người/dưới ánh sáng khác nhau, FPS thực tế, wake lock/fullscreen thực tế, và deploy GitHub Pages thật (repo chưa được đẩy lên). Các mục này cần bạn chạy thử trên thiết bị.

---

## 8. Deploy miễn phí lên GitHub Pages

Workflow đã có sẵn tại `.github/workflows/deploy.yml`, chạy khi push lên `main` hoặc bấm **Run workflow**.

1. Tạo repository trên GitHub, ví dụ `bat-con-vat`.
2. Đẩy code lên nhánh `main`:
   ```bash
   git init
   git add .
   git commit -m "Trò chơi bắt con vật bằng cử chỉ tay"
   git branch -M main
   git remote add origin https://github.com/<user>/<repo>.git
   git push -u origin main
   ```
3. Vào **Settings → Pages → Build and deployment → Source: GitHub Actions**.
4. Chờ workflow xanh; URL dạng `https://<user>.github.io/<repo>/`.

Workflow tự chạy `npm ci → lint → test → build` với:

```yaml
env:
  VITE_BASE: /${{ github.event.repository.name }}/
```

`VITE_BASE` bảo đảm mọi đường dẫn ảnh/model/wasm dùng đúng thư mục repo. Khi chạy local, base mặc định là `/`.

> **Lưu ý:** nếu deploy vào trang người dùng `https://<user>.github.io` (repo tên `<user>.github.io`), hãy đặt `VITE_BASE: /` thay vì `/${{ github.event.repository.name }}/`. Nếu dùng custom domain, cũng cần base `/`.

Các file `public/models/`, `public/wasm/`, `public/assets/` phải được commit — workflow không tải model từ Google ở bước build (trừ khi file bị thiếu, `setup` sẽ tải bù).

---

## 9. Quyền riêng tư

- Video camera **chỉ được xử lý trong bộ nhớ trình duyệt**. Không có `fetch`/WebSocket nào gửi hình ảnh đi.
- Không có analytics, cookie theo dõi hay tài khoản.
- MediaPipe, model, wasm và ảnh đều tải từ **cùng origin** (GitHub Pages hoặc máy dev).
- Thư viện MediaPipe có sẵn mã gửi thống kê ẩn tới `https://odml.pa.googleapis.com/v1/log` và tự gọi sau khoảng 60 giây. Trò chơi **chặn toàn bộ `fetch` ra ngoài origin** ngay khi khởi động, nên request này (và mọi request bên thứ ba khác) không bao giờ rời khỏi máy. Đã kiểm tra bằng unit test và E2E.
- Ngoại lệ duy nhất: `npm run setup` tải model từ Google Storage **một lần trên máy dev/CI**, không phải lúc chơi.
- Trang web tĩnh vẫn có thể để lại log truy cập thông thường ở nhà cung cấp hosting (GitHub Pages); log này không chứa video.

---

## 10. Mẹo để nhận cử chỉ tốt

- Đủ sáng, tránh ngược sáng mạnh; phông nền đơn giản giúp model bám tay tốt hơn.
- Đưa cả bàn tay vào khung hình, các ngón tách rõ khi xòe.
- Không để tay quá xa (bàn tay nhỏ hơn ~28 px trên khung 640 px sẽ bỏ qua kiểm tra landmark).
- Vuốt bằng cả cánh tay, nhanh và gần ngang; quãng vuốt cần ≥ 1,5 lần bàn tay trong ~0,5 giây.
- Tránh vẫy tay liên tục qua lại — game có cooldown 900 ms giữa hai cú vuốt.
- Nếu nhận nhầm nắm/xòe, tăng `stableMs` hoặc `openScore`/`fistScore`.

---

## 11. Xử lý sự cố

| Hiện tượng                                 | Cách xử lý                                                                                                              |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| “Bạn đã từ chối quyền camera”              | Bấm ổ khoá/camera trên thanh địa chỉ → Cho phép → tải lại. iOS: Cài đặt → Safari → Camera → Cho phép/Hỏi.               |
| “Camera đang bị ứng dụng khác sử dụng”     | Đóng Zoom/Meet/Teams/OBS/Camera… rồi bấm Thử lại. Kiểm tra Cài đặt → Quyền riêng tư → Camera (Windows).                 |
| “Không tìm thấy camera”                    | Kiểm tra webcam, cáp, quyền hệ thống; thử trình duyệt khác. Trên GIGABYTE G5 KC, nhấn **Fn + F10** để bật nguồn webcam. |
| “Trang chưa chạy trên HTTPS”               | Dùng `npm run dev` (HTTPS tự ký) hoặc link GitHub Pages. Không dùng `http://<IP>`.                                      |
| Mở trong Zalo/Facebook/Messenger           | Cảnh báo hiện ở màn hình bắt đầu; bấm **Sao chép link** rồi mở bằng Chrome/Safari.                                      |
| “Không khởi động được bộ nhận diện cử chỉ” | Bật tăng tốc phần cứng/WebGL, cập nhật Chrome/Edge/Safari; hoặc chơi bằng bàn phím/cảm ứng.                             |
| Không thấy ảnh con vật                     | Chạy `npm run sync-assets`, kiểm tra cặp `xxx` + `xxx_2`, rồi tải lại. Nếu pool rỗng game báo rõ.                       |
| Trang Pages trắng / 404 asset              | Kiểm tra **Settings → Pages** đã chọn GitHub Actions; kiểm tra `VITE_BASE` khớp tên repo; chờ deploy xong.              |
| Không có nút toàn màn hình                 | iPhone Safari không hỗ trợ Fullscreen API → nút được ẩn có chủ đích.                                                    |
| Không có nút đổi camera                    | Máy chỉ có 1 camera (hoặc trình duyệt không liệt kê được) → nút ẩn.                                                     |
| Máy yếu, giật                              | Game tự hạ tần suất suy luận/độ phân giải và tắt skeleton/confetti. Có thể tắt skeleton thủ công.                       |
| `npm run setup` lỗi                        | Kiểm tra mạng, Node ≥ 20.19, chạy `npm install` trước; xoá `public/models/gesture_recognizer.task` nếu file tải dở.     |

---

## 12. Hạn chế đã biết

- Đã thử **camera thật** (Chicony USB2.0 Camera trên GIGABYTE G5 KC) bằng Chrome với bản GitHub Pages: video 640×480, model chạy, không có request ra ngoài. **Cử chỉ tay thật và điện thoại vẫn cần kiểm tra thêm**; độ chính xác, FPS và hành vi wake lock/fullscreen có thể khác trên thiết bị thật.
- Model + wasm + ảnh khá nặng (model ~8 MB, wasm ~14 MB). Lần tải đầu có thể lâu; chưa có service worker/PWA để chơi offline hoàn toàn.
- Chỉ nhận **một tay**, chỉ vuốt **ngang**, và cần đủ sáng. Góc tay/quá xa camera làm giảm độ chính xác.
- Nhận diện trình duyệt nhúng dựa trên User-Agent, có thể bỏ sót ứng dụng mới.
- Nút toàn màn hình bị ẩn trên iPhone Safari; wake lock phụ thuộc trình duyệt và có thể bị hệ điều hành thu hồi khi pin yếu.
- Pool hiện chỉ có 4 con. Thêm ảnh theo mục 4 để phong phú hơn.
- Ảnh poster `ho_2` và `mi_2` có con vật nằm ngược — đây là **thiết kế gốc** của poster (thông điệp bảo tồn), không phải lỗi hiển thị.

---

## 13. Ghi chú kỹ thuật

- `@mediapipe/tasks-vision` được **pin chính xác** `1.2.3`; wasm copy từ đúng thư mục của package, không dùng CDN.
- Model float16 `gesture_recognizer.task`, `runningMode: "VIDEO"`, `numHands: 1`, ưu tiên GPU và **tự fallback CPU** nếu WebGL lỗi.
- Vòng lặp dùng `requestVideoFrameCallback` khi có camera (fallback `requestAnimationFrame`; chế độ bàn phím luôn dùng `rAF`), suy luận tối đa 30 lần/giây.
- Canvas skeleton giới hạn `devicePixelRatio ≤ 2`, tính đúng tỉ lệ `object-fit: cover`.
- Toàn bộ hiệu ứng dùng `transform`/`opacity`; tôn trọng `prefers-reduced-motion`.
- Rời trang (`pagehide`) → dừng camera, đóng model, huỷ vòng lặp, nhả wake lock.
- Không có request bên thứ ba sau khi trang tải xong: `src/privacy.ts` thay `window.fetch` bằng bản chỉ cho phép cùng origin (MediaPipe dùng `fetch` cho telemetry, đã bị chặn; `data:`/`blob:` vẫn được phép vì xử lý cục bộ).
