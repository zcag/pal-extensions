// flash: the SharedObject reader on Ruffle's own test saves (AMF0 from an
// ActionScript 2 SWF, AMF3 from a 3 one; ruffle-rs/ruffle's
// tests/swfs/avm{1,2}/shared_object), the save keys that sync across
// platforms, the score sources, and the palette that adds the collection.
import { describe, expect, test } from "bun:test";
import { checkIcon, checkPalettes } from "../.pal/sdk/src/index.ts";
import { at, readSol } from "../flash/surface/amf.ts";
import { absolute, better, relative, scoreSource } from "../flash/surface/saves.ts";
import ext, { LINK } from "../flash/index.ts";
import manifest from "../flash/pal.json" with { type: "json" };

const AMF0 = "AL8AAAERVENTTwAEAAAAAAAKUnVmZmxlVGVzdAAAAAAABXNhdmVkAQEAAANudW0AQCQAAAAAAAAAAANzdHICAAVoZWxsbwAABWFycmF5CAAAAAUAATACAAVlbGVtMAABNAIABWVsZW00AARwcm9wAgAIcHJvcGVydHkAAi0xAgARZWxlbSBuZWdhdGl2ZSBvbmUAAAkAAApkZW5zZUFycmF5CAAAAAMAATAAP/AAAAAAAAAAATEAQAAAAAAAAAAAATIAQAgAAAAAAAAAAAkAAARkYXRlC0Hf////wAAAAAAAAAd0ZXN0eG1sDwAAABE8dGVzdD5UZXN0PC90ZXN0PgAAAW8DAAFiAgABYgABYQIAAWEAAAkA";
const AMF3 = "AL8AAAElVENTTwAEAAAAAAAKUnVmZmxlVGVzdAAAAAMLcHJvcHMJFQEDBgtoZWxsbwYdc29tZXRoaW5nIGVsc2UJDQEECgS////+BL////8FQbAAAAAAAAAFQbAAAAEAAAAFQbAAAAIAAAAJFwEECgS////+BL////8FQbAAAAAAAAAFQbAAAAEAAAAFQbAAAAIAAAAFwbAAAAIAAAAFwbAAAAEAAAAEwICAAATAgIABBMCAgAIFwBRmZmZmZmYJAwM0BgtlbGVtNAUtMQYjZWxlbSBuZWdhdGl2ZSBvbmUBBgtlbGVtMAkHAQQBBAIEAwkBM2FQcm9wZXJ0eVRoYXRJc05vdEFOdW1iZXIGIXN0cmFuZ2UgcHJvcGVydHkBCAFB3////8AAAAA=";
/** Cubefield's save after a round: its top score. */
const CUBEFIELD = "AL8AAAAtVENTTwAEAAAAAAAJY3ViZWZpZWxkAAAAAAAIVG9wU2NvcmUAQND1QAAAAAAA";

describe("a SharedObject read", () => {
  test("AMF0, as an ActionScript 2 game writes it: numbers, strings, a sparse array with named keys, a date, XML, an object", () => {
    const sol = readSol(AMF0);
    expect(sol.name).toBe("RuffleTest");
    expect(sol.amf).toBe(0);
    expect(sol.data).toEqual({
      saved: true, num: 10, str: "hello",
      array: { 0: "elem0", 4: "elem4", prop: "property", "-1": "elem negative one" },
      denseArray: { 0: 1, 1: 2, 2: 3 },
      date: new Date(2147483647), testxml: "<test>Test</test>", o: { a: "a", b: "b" },
    });
  });

  test("AMF3, as an ActionScript 3 game writes it: 29-bit ints at their edges, negative ints, a mixed array, a date", () => {
    const sol = readSol(AMF3);
    expect(sol.amf).toBe(3);
    const big = [10, 268435454, 268435455, 268435456, 268435457, 268435458];
    expect(sol.data.props).toEqual([
      true, "hello", "something else", big, [...big, -268435458, -268435457, -268435456, -268435455, -268435454], -5.1,
      { 0: "elem0", 4: "elem4", "-1": "elem negative one" }, [1, 2, 3], { aPropertyThatIsNotANumber: "strange property" }, new Date(2147483647),
    ]);
  });

  test("a score found by its path", () => {
    expect(at(readSol(CUBEFIELD).data, "TopScore")).toBe(17365);
    expect(at(readSol(AMF0).data, "o.a")).toBe("a");
    expect(at(readSol(AMF3).data, "props.3.1")).toBe(268435454);
    expect(at(readSol(AMF0).data, "gone.deeper")).toBeUndefined();
  });

  test("not a save", () => {
    expect(() => readSol(btoa("hello there, not a sol"))).toThrow("not a SharedObject");
  });
});

describe("save keys", () => {
  const swf = "/surface/game.swf/cubefield";
  test("the same relative key on macOS, Windows and the web", () => {
    expect(relative(`cubefield${swf}`, "cubefield", "/")).toBe(swf);
    expect(relative(`ext.localhost/cubefield${swf}`, "ext.localhost", "/cubefield/")).toBe(swf);
    expect(relative(`play.example${swf}`, "play.example", "/")).toBe(swf);
  });
  test("a SharedObject at the site root (localPath /) and a name Ruffle marks with #", () => {
    expect(relative("cubefield//scores", "cubefield", "/")).toBe("//scores");
    expect(relative("ext.localhost//scores", "ext.localhost", "/cubefield/")).toBe("//scores");
    expect(relative("#cubefield/surface/a/b", "cubefield", "/")).toBe("#/surface/a/b");
  });
  test("back to the key Ruffle asks for, on each", () => {
    for (const [host, root] of [["cubefield", "/"], ["ext.localhost", "/cubefield/"], ["play.example", "/"]]) {
      for (const key of [`${host}${root}surface/game.swf/cubefield`, `${host}//scores`, `#${host}${root}x/y`]) {
        expect(absolute(relative(key, host, root), host, root)).toBe(key);
      }
    }
  });
  test("another host's key is kept as it is", () => {
    expect(relative("elsewhere/surface/x", "cubefield", "/")).toBe("elsewhere/surface/x");
    expect(absolute("elsewhere/surface/x", "cubefield", "/")).toBe("elsewhere/surface/x");
  });
});

test("score sources and what counts as better", () => {
  expect(scoreSource("so:cubefield/TopScore")).toEqual({ kind: "so", name: "cubefield", path: "TopScore" });
  expect(scoreSource("so:save/stats.best")).toEqual({ kind: "so", name: "save", path: "stats.best" });
  expect(scoreSource("ei:palScore")).toEqual({ kind: "ei", fn: "palScore" });
  expect(scoreSource("ei:alert(1)")).toBeUndefined();
  expect(scoreSource("TopScore")).toBeUndefined();
  expect(better("desc", 5, undefined)).toBe(true);
  expect(better("desc", 5, 7)).toBe(false);
  expect(better("asc", 5, 7)).toBe(true);
  expect(better("desc", Number.NaN, undefined)).toBe(false);
});

describe("the palette", () => {
  test("its manifest and icon", () => {
    expect(checkPalettes(manifest as never, ext).warnings).toEqual([]);
    expect(checkIcon(manifest.icon, "flash")).toBeUndefined();
  });
  test("it follows the collection with its key pinned", async () => {
    expect(await ext.palettes.flash.list()).toMatchObject([{ name: "Add the Flash games collection" }]);
    expect(ext.palettes.flash.pick()).toEqual({ open: LINK });
    expect(LINK).toBe("pal://registry/add?url=https%3A%2F%2Fpal.cagdas.io%2Fregistry%2Fflash%2Findex.json&key=RWSmfltmgdpajpSlhnFLhlRXXnqfQBTjmhEo4D8H3nBf%2BiFI6jaJXoA1");
  });
});
