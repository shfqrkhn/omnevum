import "./styles.css";
import { CommandBus } from "./core/commands";
import { CanonicalStore } from "./core/storage";
import { mountApp } from "./ui/app";

const root = document.querySelector<HTMLElement>("#app");
if (!root) throw new Error("Omnevum app root is missing");

const store = new CanonicalStore();
await store.open();
const commands = new CommandBus(store);
await mountApp(root, store, commands);

if ("serviceWorker" in navigator) {
  void navigator.serviceWorker.register("./sw.js", { scope: "./" });
}

