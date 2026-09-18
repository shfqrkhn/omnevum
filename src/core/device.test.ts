import { describe, expect, it } from "vitest";
import { detectDeviceCapabilities, DeviceInputBroker } from "./device";

describe("Device/Input capability detection", () => {
  it("reports only the capabilities exposed by the target", () => {
    const capabilities = detectDeviceCapabilities({
      navigator: { clipboard: {} as Navigator["clipboard"], share: async () => undefined, mediaDevices: { getUserMedia: async () => new MediaStream() } as MediaDevices, geolocation: {} as Geolocation, serviceWorker: {} as ServiceWorkerContainer },
      window: { showOpenFilePicker: async () => [], BarcodeDetector: class { async detect(): Promise<never[]> { return []; } } },
      storage: { getDirectory: async () => ({}) }
    });
    expect(capabilities).toEqual({ file: true, clipboard: true, share: true, camera: true, microphone: true, geolocation: true, barcode: true, opfs: true, serviceWorker: true });
  });

  it("retains manual file fallback when richer APIs are absent", () => {
    expect(detectDeviceCapabilities({ navigator: {}, window: {}, storage: {} }).file).toBe(false);
  });

  it("keeps file, clipboard, share, and location access explicit", async () => {
    const broker = new DeviceInputBroker({ navigator: { clipboard: { readText: async () => "clipboard" }, share: async () => undefined, geolocation: { getCurrentPosition: (success) => success({} as GeolocationPosition) } as Geolocation } });
    expect(broker.readFile(new Blob(["hello"]))).toBeInstanceOf(Blob);
    await expect(broker.readFileText(new Blob(["hello"]))).resolves.toBe("hello");
    await expect(broker.readClipboardText()).resolves.toBe("clipboard");
    await expect(broker.readLocation()).resolves.toBeDefined();
    await expect(new DeviceInputBroker({ navigator: {} }).readFileText(new Blob(["hello"]))).resolves.toBe("hello");
  });

  it("bounds clipboard text at the device boundary", async () => {
    const oversized = "x".repeat(5 * 1024 * 1024 + 1);
    const broker = new DeviceInputBroker({ navigator: { clipboard: { readText: async () => oversized } } });
    await expect(broker.readClipboardText()).rejects.toThrow("5 MiB");
    expect(() => broker.readFile(new Blob(["x".repeat(5 * 1024 * 1024 + 1)]))).toThrow("5 MiB");
  });

  it("keeps media ownership scoped and exposes browser-native QR results only when available", async () => {
    let stopped = 0;
    const stream = { getTracks: () => [{ stop: () => { stopped += 1; } }] } as unknown as MediaStream;
    const broker = new DeviceInputBroker({
      navigator: { mediaDevices: { getUserMedia: async () => stream } as MediaDevices },
      window: { BarcodeDetector: class { async detect(): Promise<Array<{ rawValue: string; format: string }>> { return [{ rawValue: "https://example.test", format: "qr_code" }, { rawValue: "x".repeat(5000), format: "invalid" }]; } } }
    });
    await expect(broker.withMedia("camera", async (owned) => { expect(owned).toBe(stream); return "captured"; })).resolves.toBe("captured");
    expect(stopped).toBe(1);
    await expect(broker.scanBarcode(new Blob(["image"]))).resolves.toEqual([{ rawValue: "https://example.test", format: "qr_code" }]);
    await expect(new DeviceInputBroker({ navigator: {}, window: {} }).scanBarcode(new Blob(["image"]))).rejects.toThrow("unavailable");
  });

  it("releases media tracks when capture processing is cancelled", async () => {
    let stopped = 0;
    const stream = { getTracks: () => [{ stop: () => { stopped += 1; } }] } as unknown as MediaStream;
    const broker = new DeviceInputBroker({ navigator: { mediaDevices: { getUserMedia: async () => stream } as MediaDevices } });

    await expect(broker.withMedia("microphone", async () => { throw new Error("capture cancelled"); })).rejects.toThrow("capture cancelled");
    expect(stopped).toBe(1);
  });

  it("propagates permission denial and cancellation without retaining device authority", async () => {
    const broker = new DeviceInputBroker({
      navigator: {
        share: async () => { throw new Error("share cancelled"); },
        mediaDevices: { getUserMedia: async () => { throw new Error("NotAllowedError"); } } as unknown as MediaDevices,
        geolocation: {
          getCurrentPosition: (_success, error) => error?.({ code: 1, message: "permission denied" } as GeolocationPositionError)
        } as Geolocation
      }
    });

    await expect(broker.requestMedia("camera")).rejects.toThrow("NotAllowedError");
    await expect(broker.readLocation()).rejects.toMatchObject({ code: 1 });
    await expect(broker.shareText("local preview")).rejects.toThrow("share cancelled");
  });
});
