// Ruffle names a SharedObject `<host><local path>/<name>`, the local path
// being the SWF's URL path by default. The host and the extension's root on
// it differ between macOS (`ext://<game>/`), Windows
// (`http://ext.localhost/<game>/`) and the web, so a save is kept under the
// rest, relative to the extension's root, and synced as that.

/** `key` with `host` and the extension's `root` path (`/`, or `/<game>/` on Windows) taken off. */
export function relative(key: string, host: string, root: string): string {
  const hash = key.startsWith("#") ? "#" : "";
  const k = key.slice(hash.length);
  if (!k.startsWith(`${host}/`)) return key;
  const rest = k.slice(host.length);
  return hash + (root !== "/" && rest.startsWith(root) ? `/${rest.slice(root.length)}` : rest);
}

/** The key Ruffle asks for on this host, from a relative one. */
export function absolute(rel: string, host: string, root: string): string {
  const hash = rel.startsWith("#") ? "#" : "";
  const r = rel.slice(hash.length);
  if (!r.startsWith("/")) return rel;
  return hash + host + (r.startsWith("//") ? r : root + r.slice(1));
}

export type ScoreSource = { kind: "so"; name: string; path: string } | { kind: "ei"; fn: string };

/** `so:<SharedObject name>/<field path>` or `ei:<function name>` (game.json's `score.from`). */
export function scoreSource(from: string): ScoreSource | undefined {
  const so = /^so:([^/]+)\/(.+)$/.exec(from);
  if (so) return { kind: "so", name: so[1], path: so[2] };
  const ei = /^ei:([\w$]+)$/.exec(from);
  return ei ? { kind: "ei", fn: ei[1] } : undefined;
}

export const better = (order: "asc" | "desc", v: number, best: number | undefined) =>
  Number.isFinite(v) && (best === undefined || (order === "asc" ? v < best : v > best));
