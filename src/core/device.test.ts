import { describe, expect, it } from "vitest";
import { detectDeviceCapabilities, DeviceInputBroker } from "./device";

describe("Device/Input capability detection", () => {
  it("reports only the capabilities exposed by the target", () => {
    const capabilities = detectDeviceCapabilities({
      navigator: { clipboard: {} as Navigator["clipboard"], share: async () => undefined, mediaDevices: { getUserMedia: async () => new MediaStream() } as MediaDevices, geolocation: {} as Geolocation, serviceWorker: {} as ServiceWorkerContainer },
      window: { showOpenFilePicker: async () => [] },
      storage: { getDirectory: async () => ({}) }
    });
    expect(capabilities).toEqual({ file: true, clipboard: true, share: true, camera: true, microphone: true, geolocation: true, opfs: true, serviceWorker: true });
  });

  it("retains manual file fallback when richer APIs are absent", () => {
    expect(detectDeviceCapabilities({ navigator: {}, window: {}, storage: {} }).file).toBe(false);
  });

  it("keeps file, clipboard, share, and location access explicit", async () => {
    const broker = new DeviceInputBroker({ navigator: { clipboard: { readText: async () => "clipboard" }, share: async () => undefined, geolocation: { getCurrentPosition: (success) => success({} as GeolocationPosition) } as Geolocation } });
    await expect(broker.readFileText(new Blob(["hello"]))).resolves.toBe("hello");
    await expect(broker.readClipboardText()).resolves.toBe("clipboard");
    await expect(broker.readLocation()).resolves.toBeDefined();
    await expect(new DeviceInputBroker({ navigator: {} }).readFileText(new Blob(["hello"]))).resolves.toBe("hello");
  });
});
