// Flash: Ruffle, the Flash Player emulator, for the Flash games. Each game
// is a package of its own that requires this one and loads its page
// runtime (surface/runtime.ts) and Ruffle from it; the games come from the
// Flash games collection, a registry behind a password. This palette
// follows that registry, then lists its games: Enter plays one, installing
// it first when it is not.
import { extensions, type Effect, type Extension, type Icon, type Item, type StoreState } from "@zcag/pal";

export const COLLECTION = "https://pal.cagdas.io/registry/flash/index.json";
/** The collection's public key, pinned when it is followed. */
export const COLLECTION_KEY = "RWSmfltmgdpajpSlhnFLhlRXXnqfQBTjmhEo4D8H3nBf+iFI6jaJXoA1";

export const LINK = `pal://registry/add?url=${encodeURIComponent(COLLECTION)}&key=${encodeURIComponent(COLLECTION_KEY)}`;

export const ADD: Item = {
  id: "collection",
  name: "Add the Flash games collection",
  subtitle: "Asks for a password",
  icon: "󱐋",
  keywords: ["flash", "games", "ruffle", "registry"],
  actions: [{ id: "add", title: "Add the collection" }],
};

/** The rows for the store's state: the add row until the collection is followed, then its games by title. */
export function rows(state: Pick<StoreState, "registries" | "available">): Item[] {
  const reg = state.registries.find((r) => r.url === COLLECTION);
  if (!reg) return [ADD];
  const games = state.available
    .filter((a) => a.registry === reg.name && (a.installed || a.installable))
    .flatMap((a) => a.listing.palettes.filter((p) => p.kind === "view").map((p) => ({ a, p })))
    .sort((x, y) => (x.p.title || x.a.listing.title).localeCompare(y.p.title || y.a.listing.title));
  if (!games.length) {
    return [{ id: "silent", name: "The Flash games collection has not answered", subtitle: reg.last_error ?? "Settings › Extensions › Registries has it", icon: "󱐋", actions: [] }];
  }
  return games.map(({ a, p }) => ({
    id: `${a.name}/${p.id}`,
    name: p.title || a.listing.title || a.name,
    subtitle: a.installed ? a.listing.tagline : `${a.listing.tagline} · not installed`,
    icon: (a.listing.icon as Icon | undefined) ?? "󱐋",
    keywords: ["flash", ...a.listing.keywords],
    actions: [{ id: "play", title: a.installed ? "Play" : "Install and play" }],
  }));
}

async function play(id: string): Promise<Effect> {
  if (id === ADD.id) return { open: LINK };
  const [extension, palette] = id.split("/") as [string, string];
  const game = (await extensions.available()).find((a) => a.name === extension);
  if (game && !game.installed) {
    const r = await extensions.install(extension, { registry: game.registry, from: "store" });
    if (!r.ok || r.loaded === false) return { toast: { title: `Could not install ${game.listing.title || extension}`, message: r.error, style: "failure" } };
  }
  return { push: { extension, palette } };
}

export default {
  palettes: {
    flash: { title: "Flash games", list: async () => rows(await extensions.state()), pick: (id: string) => play(id) },
  },
} satisfies Extension;
