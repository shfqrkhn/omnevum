export type DeviceCapability = "file" | "clipboard" | "share" | "camera" | "microphone" | "geolocation" | "opfs" | "serviceWorker";
export const MAX_DEVICE_TEXT_BYTES = 5 * 1024 * 1024;

export interface DeviceCapabilities {
  file: boolean;
  clipboard: boolean;
  share: boolean;
  camera: boolean;
  microphone: boolean;
  geolocation: boolean;
  opfs: boolean;
  serviceWorker: boolean;
}

type NavigatorSurface = {
  clipboard?: Pick<Clipboard, "readText">;
  share?: (data: ShareData) => Promise<void>;
  mediaDevices?: Pick<MediaDevices, "getUserMedia">;
  geolocation?: Geolocation;
  serviceWorker?: ServiceWorkerContainer;
};

type WindowSurface = { showOpenFilePicker?: (...arguments_: never[]) => Promise<unknown> };
type StorageSurface = { getDirectory?: () => Promise<unknown> };
export interface DeviceEnvironment {
  navigator?: NavigatorSurface;
  window?: WindowSurface;
  storage?: StorageSurface;
}

export function detectDeviceCapabilities(environment: DeviceEnvironment = {}): DeviceCapabilities {
  const runtimeNavigator: NavigatorSurface | undefined = typeof globalThis.navigator === "undefined" ? undefined : globalThis.navigator;
  const runtimeWindow: WindowSurface | undefined = typeof globalThis.window === "undefined" ? undefined : globalThis.window as WindowSurface;
  const navigatorValue = environment.navigator ?? runtimeNavigator;
  const windowValue = environment.window ?? runtimeWindow;
  const storageValue = environment.storage ?? (typeof globalThis.navigator === "undefined" ? undefined : globalThis.navigator.storage as StorageSurface);
  return {
    file: typeof File !== "undefined" && (typeof windowValue?.showOpenFilePicker === "function" || typeof FileReader !== "undefined"),
    clipboard: Boolean(navigatorValue?.clipboard),
    share: typeof navigatorValue?.share === "function",
    camera: Boolean(navigatorValue?.mediaDevices?.getUserMedia),
    microphone: Boolean(navigatorValue?.mediaDevices?.getUserMedia),
    geolocation: Boolean(navigatorValue?.geolocation),
    opfs: typeof storageValue?.getDirectory === "function",
    serviceWorker: Boolean(navigatorValue?.serviceWorker)
  };
}

export class DeviceInputBroker {
  public constructor(private readonly environment: DeviceEnvironment = {}) {}

  public capabilities(): DeviceCapabilities {
    return detectDeviceCapabilities(this.environment);
  }

  public async readClipboardText(): Promise<string> {
    const runtimeNavigator: NavigatorSurface | undefined = typeof globalThis.navigator === "undefined" ? undefined : globalThis.navigator;
    const clipboard = this.environment.navigator ? this.environment.navigator.clipboard : runtimeNavigator?.clipboard;
    const readText = clipboard?.readText;
    if (!clipboard || typeof readText !== "function") throw new Error("Clipboard input is unavailable on this target");
    const text = await readText.call(clipboard);
    if (new TextEncoder().encode(text).byteLength > MAX_DEVICE_TEXT_BYTES) throw new Error("Clipboard text exceeds the bounded 5 MiB limit");
    return text;
  }

  public readFile(file: Blob): Blob {
    if (file.size > MAX_DEVICE_TEXT_BYTES) throw new Error("File input exceeds the bounded 5 MiB limit");
    return file;
  }

  public async readFileText(file: Blob): Promise<string> {
    return this.readFile(file).text();
  }

  public async shareText(text: string, url?: string): Promise<void> {
    const runtimeNavigator: NavigatorSurface | undefined = typeof globalThis.navigator === "undefined" ? undefined : globalThis.navigator;
    const share: ((data: ShareData) => Promise<void>) | undefined = this.environment.navigator ? this.environment.navigator.share : runtimeNavigator?.share;
    if (!share) throw new Error("Share input is unavailable on this target");
    await share({ text, ...(url ? { url } : {}) });
  }

  public async requestMedia(kind: "camera" | "microphone"): Promise<MediaStream> {
    const runtimeNavigator: NavigatorSurface | undefined = typeof globalThis.navigator === "undefined" ? undefined : globalThis.navigator;
    const mediaDevices = this.environment.navigator ? this.environment.navigator.mediaDevices : runtimeNavigator?.mediaDevices;
    if (!mediaDevices || typeof mediaDevices.getUserMedia !== "function") throw new Error(`${kind} input is unavailable on this target`);
    return mediaDevices.getUserMedia(kind === "camera" ? { video: true, audio: false } : { video: false, audio: true });
  }

  public releaseMedia(stream: MediaStream): void {
    stream.getTracks().forEach((track) => track.stop());
  }

  public async readLocation(): Promise<GeolocationPosition> {
    const runtimeNavigator: NavigatorSurface | undefined = typeof globalThis.navigator === "undefined" ? undefined : globalThis.navigator;
    const geolocation = this.environment.navigator ? this.environment.navigator.geolocation : runtimeNavigator?.geolocation;
    if (!geolocation) throw new Error("Location input is unavailable on this target");
    return new Promise((resolve, reject) => geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: false, maximumAge: 300_000, timeout: 10_000 }));
  }
}
