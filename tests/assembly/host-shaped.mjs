// A Host-shaped fixture with two borrowed inputs, two scoped modules and a root. It uses no Assembly
// constructor, so the same data builds a profile with the 0.4.0 handle API and with module entries.
import { binding, declaration, slot } from "./fixture.mjs";

export const hostShaped = () => {
  const session = declaration("host-session", ["synthetic/session"]);
  const settings = declaration("host-settings", ["synthetic/settings"]);
  const store = declaration("host-store", ["synthetic/store"], [slot("session", "synthetic/session")]);
  const service = declaration("host-service", ["synthetic/service"],
    [slot("store", "synthetic/store"), slot("settings", "synthetic/settings")]);
  const app = declaration("host-app", [], [slot("service", "synthetic/service")]);
  return {
    inputs: { session, settings },
    modules: { store, service, app },
    bindings: [
      binding("synthetic/host-store", "session", ["synthetic/host-session"]),
      binding("synthetic/host-service", "store", ["synthetic/host-store"]),
      binding("synthetic/host-service", "settings", ["synthetic/host-settings"]),
      binding("synthetic/host-app", "service", ["synthetic/host-service"]),
    ],
  };
};
