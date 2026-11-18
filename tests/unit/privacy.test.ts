import { describe, expect, it, vi } from "vitest";
import { blockExternalRequests, isExternalRequest } from "../../src/privacy";

const BASE = "https://localhost:4173/game/";

describe("isExternalRequest", () => {
  it("cho phép đường dẫn tương đối và URL cùng origin", () => {
    expect(isExternalRequest("/assets/manifest.json", BASE)).toBe(false);
    expect(isExternalRequest("manifest.json", BASE)).toBe(false);
    expect(isExternalRequest("https://localhost:4173/assets/a.webp", BASE)).toBe(false);
  });

  it("chặn URL khác origin, khác cổng hoặc khác giao thức", () => {
    expect(isExternalRequest("https://odml.pa.googleapis.com/v1/log", BASE)).toBe(true);
    expect(isExternalRequest("https://example.com/", BASE)).toBe(true);
    expect(isExternalRequest("//example.com/x", BASE)).toBe(true);
    expect(isExternalRequest("http://localhost:4173/x", BASE)).toBe(true);
    expect(isExternalRequest("https://localhost:9999/x", BASE)).toBe(true);
  });

  it("không coi data: và blob: là request mạng", () => {
    expect(isExternalRequest("data:image/png;base64,AAAA", BASE)).toBe(false);
    expect(isExternalRequest("blob:https://localhost:4173/abc", BASE)).toBe(false);
  });
});

describe("blockExternalRequests", () => {
  it("chặn fetch ra ngoài mà không gọi fetch gốc", async () => {
    const originalFetch = vi.fn(async () => new Response("ok"));
    const target = {
      location: { href: "https://localhost:4173/" },
      fetch: originalFetch,
    } as unknown as Window;

    blockExternalRequests(target);

    await expect(target.fetch("https://odml.pa.googleapis.com/v1/log")).rejects.toThrow(TypeError);
    expect(originalFetch).not.toHaveBeenCalled();
  });

  it("vẫn chuyển tiếp fetch cùng origin", async () => {
    const originalFetch = vi.fn(async () => new Response("ok"));
    const target = {
      location: { href: "https://localhost:4173/" },
      fetch: originalFetch,
    } as unknown as Window;

    blockExternalRequests(target);

    const response = await target.fetch("/assets/manifest.json");
    expect(await response.text()).toBe("ok");
    expect(originalFetch).toHaveBeenCalledTimes(1);
  });
});
