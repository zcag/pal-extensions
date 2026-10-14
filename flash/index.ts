// Flash: Ruffle, the Flash Player emulator, for the Flash games. Each game
// is a package of its own that requires this one and loads its page
// runtime (surface/runtime.ts) and Ruffle from it; the games come from the
// Flash games collection, a registry behind a password. This palette
// follows that registry.
import type { Effect, Extension, Item } from "@zcag/pal";

export const COLLECTION = "https://pal.cagdas.io/registry/flash/index.json";
/** The collection's public key, pinned when it is followed. */
export const COLLECTION_KEY = "RWSmfltmgdpajpSlhnFLhlRXXnqfQBTjmhEo4D8H3nBf+iFI6jaJXoA1";

export const LINK = `pal://registry/add?url=${encodeURIComponent(COLLECTION)}&key=${encodeURIComponent(COLLECTION_KEY)}`;

export const ROWS: Item[] = [{
  id: "collection",
  name: "Add the Flash games collection",
  subtitle: "Asks for a password",
  icon: "󱐋",
  keywords: ["flash", "games", "ruffle", "registry"],
  actions: [{ id: "add", title: "Add the collection" }],
}];

export default {
  palettes: {
    flash: { title: "Flash games", list: () => ROWS, pick: (): Effect => ({ open: LINK }) },
  },
} satisfies Extension;
