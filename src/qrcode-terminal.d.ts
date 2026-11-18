/**
 * Khai báo type tối thiểu cho qrcode-terminal (gói không kèm type).
 * Chỉ dùng trong vite.config.ts để in mã QR địa chỉ LAN.
 */
declare module "qrcode-terminal" {
  interface GenerateOptions {
    small?: boolean;
  }

  interface QrCodeTerminal {
    generate(text: string, options?: GenerateOptions, callback?: (qrcode: string) => void): void;
  }

  const qrcode: QrCodeTerminal;
  export default qrcode;
}
