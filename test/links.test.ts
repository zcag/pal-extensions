// The links the extensions here declare (pal's docs/design/links.md), over
// the wire through pal's host: quicklinks, snippets, window-management,
// system, clipboard and timer, each route as a link reaches it. pal's own
// host/test/links.test.ts holds every manifest's links block to its code.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { Host, stored } from "../.pal/host/test/harness.ts";

describe("bundled extensions", () => {
  describe("over the wire", () => {
    let host: Host;
    const calls: string[] = [];
    beforeAll(async () => {
      stored.set("quicklinks\0links", [{ id: "q1", name: "GitHub search", url: "https://github.com/search?q={query}", keywords: ["gh"] }, { id: "q2", name: "Docs", url: "https://pal.cagdas.io/docs" }]);
      stored.set("expansion\0snippets", [{ id: "s1", name: "Signature", keyword: "sig", text: "Best,\nAda" }]);
      // The timer CLI pointed at nothing: a real `timer` on PATH would start one on this machine.
      host = await Host.bundled({ settings: { timer: { settings: { command: "/nonexistent/pal-test-timer" } } }, core: { "system.run": ({ id }: { id: string }) => { calls.push(`run ${id}`); return null; }, "clipboard.copy": ({ id }: { id: number }) => { calls.push(`copy ${id}`); return null; } } });
    });
    afterAll(async () => { await host.close(); });
    const link = (extension: string, route: string, params: Record<string, unknown> = {}) => host.request<Record<string, unknown>>("link", { extension, route, params });

    test("these declare links", () => {
      expect(host.loaded().filter((l) => l.manifest.links).map((l) => l.extension)).toEqual(expect.arrayContaining(["clipboard", "quicklinks", "snippets", "system", "timer", "window-management"]));
    });

    test("quicklinks/open: by name or keyword; a {query} link opens filled or pushes the drill-in", async () => {
      expect(await link("quicklinks", "open", { name: "docs" })).toEqual({ open: "https://pal.cagdas.io/docs" });
      expect(await link("quicklinks", "open", { name: "gh", query: "pal launcher" })).toEqual({ open: "https://github.com/search?q=pal%20launcher" });
      expect(await link("quicklinks", "open", { name: "GitHub search" })).toEqual({ push: { extension: "quicklinks", palette: "quicklinks", args: { link: "q1" } } });
      await expect(link("quicklinks", "open", { name: "nope" })).rejects.toThrow('no quicklink "nope"');
      await expect(link("quicklinks", "open", {})).rejects.toThrow("quicklinks/open: name is required");
    });
    test("snippets/paste: by name or keyword, placeholders filled; copy=1 copies", async () => {
      expect(await link("snippets", "paste", { name: "sig" })).toEqual({ paste: { text: "Best,\nAda" } });
      expect(await link("snippets", "paste", { name: "signature", copy: "true" })).toEqual({ copy: "Best,\nAda" });
      await expect(link("snippets", "paste", { name: "x" })).rejects.toThrow('no snippet "x"');
    });
    test("window-management/layout answers the layout effect for the focused window", async () => {
      expect(await link("window-management", "layout", { name: "left_half" })).toMatchObject({ layout: { name: "left_half" } });
      await expect(link("window-management", "layout", { name: "sideways" })).rejects.toThrow(/no layout "sideways"; one of left_half/);
    });
    test("system/run runs an available command by id, refuses an unknown one", async () => {
      expect(await link("system", "run", { id: "sleep" })).toEqual({});
      expect(calls).toContain("run sleep");
      await expect(link("system", "run", { id: "dnd" })).rejects.toThrow('no system command "dnd" on this machine');
    });
    test("clipboard/copy puts the nth newest entry back; out of range names the count", async () => {
      expect(await link("clipboard", "copy", { index: "1" })).toEqual({ hud: "Copied" });
      expect(calls).toContain("copy 2");
      expect(await link("clipboard", "copy", {})).toEqual({ hud: "Copied" });
      expect(calls).toContain("copy 1");
      await expect(link("clipboard", "copy", { index: "99" })).rejects.toThrow(/no history entry 99/);
      await expect(link("clipboard", "copy", { index: "x" })).rejects.toThrow("clipboard/copy: index must be a number");
    });
    test("timer/start without the CLI installed says so", async () => {
      await expect(link("timer", "start", { duration: "1m", name: "t" })).rejects.toThrow("/nonexistent/pal-test-timer is not installed");
    });
  });
});
