import basicSsl from "@vitejs/plugin-basic-ssl";
import { networkInterfaces } from "node:os";
import qrcode from "qrcode-terminal";
import { defineConfig } from "vite";

/**
 * base cho GitHub Pages: mặc định "/", khi build trên CI đặt VITE_BASE=/<tên-repo>/
 * Mọi đường dẫn trong app (ảnh, model, wasm, manifest) đều dùng import.meta.env.BASE_URL.
 */
const base = process.env.VITE_BASE ?? "/";

/** In địa chỉ LAN dạng HTTPS + mã QR để mở nhanh trên điện thoại (chạy dev). */
function lanQrPlugin(): import("vite").Plugin {
  return {
    name: "lan-qr",
    configureServer(server) {
      server.httpServer?.once("listening", () => {
        const port = server.config.server.port || 5173;
        const ips = Object.values(networkInterfaces())
          .flat()
          .filter((i) => i && i.family === "IPv4" && !i.internal)
          .map((i) => i!.address);
        for (const ip of ips) {
          const url = `https://${ip}:${port}/`;
          server.config.logger.info(`\n  ⮞ Mở trên điện thoại: ${url}`);
          qrcode.generate(url, { small: true }, (art) => server.config.logger.info(`\n${art}`));
        }
        server.config.logger.info("\n  (Chấp nhận cảnh báo chứng chỉ tự ký trong trình duyệt)\n");
      });
    },
  };
}

export default defineConfig({
  base,
  plugins: [basicSsl(), lanQrPlugin()],
  server: {
    host: true,
    port: 5173,
    strictPort: false,
  },
  build: {
    target: "es2022",
    chunkSizeWarningLimit: 4000,
  },
});
