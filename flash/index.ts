// Flash: Ruffle, the Flash Player emulator, for the Flash games. Each game
// is a package of its own that requires this one and loads its page
// runtime (surface/runtime.ts) and Ruffle from it; the games come from the
// Flash games collection, a registry behind a password. This palette is the
// Games showcase over the Flash games (games/index.ts's shelf, inlined at
// build); until the collection is followed it offers to add it.
import { column, extensions, text, type Extension, type View } from "@zcag/pal";
import { shelfPalette } from "../games/index.ts";

export const COLLECTION = "https://pal.cagdas.io/registry/flash/index.json";
/** The collection's public key, pinned when it is followed. */
export const COLLECTION_KEY = "RWSmfltmgdpajpSlhnFLhlRXXnqfQBTjmhEo4D8H3nBf+iFI6jaJXoA1";

export const LINK = `pal://registry/add?url=${encodeURIComponent(COLLECTION)}&key=${encodeURIComponent(COLLECTION_KEY)}`;

const PALETTE = "flash";

/** The view with no Flash game to show: the add offer until the collection is followed, then why it has none. */
export function empty(registries: { url: string; last_error?: string | null }[]): View {
  const reg = registries.find((r) => r.url === COLLECTION);
  const say = (title: string, line: string) => column([text(title, { style: "title" }), text(line, { style: "muted" })], { padding: 4, grow: true, align: "center", justify: "center" });
  if (!reg) return { id: PALETTE, title: "Not added yet", tree: say("The Flash games collection", "Add it to play its games here; it asks for a password"), actions: [{ id: "add", title: "Add the collection", shortcut: "enter" }] };
  return { id: PALETTE, title: "No answer", tree: say("The collection has not answered", reg.last_error ?? "Settings › Extensions › Registries has it"), actions: [] };
}

const shelf = shelfPalette({
  palette: PALETTE,
  from: "store",
  only: (g) => g.requires.includes("flash"),
  empty: async () => empty((await extensions.state()).registries),
});

export default {
  palettes: {
    [PALETTE]: { title: "Flash games", view: shelf.view, pick: (id: string, action?: string) => (action === "add" ? { open: LINK } : shelf.pick(id, action)) },
  },
} satisfies Extension;
