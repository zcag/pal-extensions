// A Flash SharedObject (.sol, as Ruffle keeps it: base64 in localStorage)
// read into plain values: AMF0 for ActionScript 2, AMF3 for 3. Read only;
// enough to find a score in a save.

export type Sol = { name: string; amf: 0 | 3; data: Record<string, unknown> };

const utf8 = new TextDecoder();

class Reader {
  p = 0;
  view: DataView;
  constructor(readonly b: Uint8Array) {
    this.view = new DataView(b.buffer, b.byteOffset, b.byteLength);
  }
  get done() { return this.p >= this.b.length; }
  u8() { return this.b[this.p++]; }
  u16() { const v = this.view.getUint16(this.p); this.p += 2; return v; }
  u32() { const v = this.view.getUint32(this.p); this.p += 4; return v; }
  f64() { const v = this.view.getFloat64(this.p); this.p += 8; return v; }
  str(n: number) { const s = utf8.decode(this.b.subarray(this.p, this.p + n)); this.p += n; return s; }
  u29() {
    let v = 0;
    for (let i = 0; i < 3; i++) {
      const c = this.u8();
      if (c < 0x80) return (v << 7) | c;
      v = (v << 7) | (c & 0x7f);
    }
    return (v << 8) | this.u8();
  }
}

export function readSol(base64: string): Sol {
  const r = new Reader(Uint8Array.from(atob(base64), (c) => c.charCodeAt(0)));
  if (r.u16() !== 0x00bf) throw new Error("not a SharedObject");
  r.u32();
  if (r.str(4) !== "TCSO") throw new Error("not a SharedObject");
  r.p += 6;
  const name = r.str(r.u16());
  const amf = r.u32() === 3 ? 3 : 0;
  const data: Record<string, unknown> = {};
  if (amf === 3) {
    const a3 = new Amf3(r);
    while (!r.done) { const k = a3.string(); data[k] = a3.value(); r.p++; }
  } else {
    const a0 = new Amf0(r);
    while (!r.done) { const k = r.str(r.u16()); data[k] = a0.value(); r.p++; }
  }
  return { name, amf, data };
}

class Amf0 {
  refs: unknown[] = [];
  constructor(readonly r: Reader) {}
  props(into: Record<string, unknown>) {
    for (;;) {
      const k = this.r.str(this.r.u16());
      if (!k && this.r.b[this.r.p] === 9) { this.r.p++; return into; }
      into[k] = this.value();
    }
  }
  value(): unknown {
    const r = this.r;
    switch (r.u8()) {
      case 0: return r.f64();
      case 1: return r.u8() !== 0;
      case 2: return r.str(r.u16());
      case 3: { const o = {}; this.refs.push(o); return this.props(o); }
      case 5: return null;
      case 6: return undefined;
      case 7: return this.refs[r.u16()];
      case 8: { r.u32(); const o = {}; this.refs.push(o); return this.props(o); }
      case 10: { const a: unknown[] = []; this.refs.push(a); for (let n = r.u32(); n > 0; n--) a.push(this.value()); return a; }
      case 11: { const d = new Date(r.f64()); r.p += 2; return d; }
      case 12: case 15: return r.str(r.u32());
      case 16: { r.str(r.u16()); const o = {}; this.refs.push(o); return this.props(o); }
      case 17: return new Amf3(r).value();
      default: throw new Error(`AMF0 type ${r.b[r.p - 1]} at ${r.p - 1}`);
    }
  }
}

type Traits = { dynamic: boolean; external: boolean; names: string[] };

class Amf3 {
  strings: string[] = [];
  objects: unknown[] = [];
  traits: Traits[] = [];
  constructor(readonly r: Reader) {}
  string(): string {
    const h = this.r.u29();
    if (!(h & 1)) return this.strings[h >> 1];
    const s = this.r.str(h >> 1);
    if (s) this.strings.push(s);
    return s;
  }
  value(): unknown {
    const r = this.r;
    const t = r.u8();
    switch (t) {
      case 0: return undefined;
      case 1: return null;
      case 2: return false;
      case 3: return true;
      case 4: { const v = r.u29(); return v & 0x10000000 ? v - 0x20000000 : v; }
      case 5: return r.f64();
      case 6: return this.string();
      case 7: case 11: { const h = r.u29(); if (!(h & 1)) return this.objects[h >> 1]; const s = r.str(h >> 1); this.objects.push(s); return s; }
      case 8: { const h = r.u29(); if (!(h & 1)) return this.objects[h >> 1]; const d = new Date(r.f64()); this.objects.push(d); return d; }
      case 9: {
        const h = r.u29();
        if (!(h & 1)) return this.objects[h >> 1];
        const named: Record<string, unknown> = {};
        const dense: unknown[] = [];
        const i = this.objects.push(dense) - 1;
        for (let k = this.string(); k; k = this.string()) named[k] = this.value();
        for (let n = h >> 1; n > 0; n--) dense.push(this.value());
        return Object.keys(named).length ? (this.objects[i] = Object.assign(Object.fromEntries(dense.entries()), named)) : dense;
      }
      case 10: {
        const h = r.u29();
        if (!(h & 1)) return this.objects[h >> 1];
        let tr: Traits;
        if (!(h & 2)) tr = this.traits[h >> 2];
        else if (h & 4) { tr = { dynamic: false, external: true, names: [] }; this.string(); this.traits.push(tr); }
        else {
          this.string();
          tr = { dynamic: !!(h & 8), external: false, names: [] };
          for (let n = h >> 4; n > 0; n--) tr.names.push(this.string());
          this.traits.push(tr);
        }
        const o: Record<string, unknown> = {};
        this.objects.push(o);
        if (tr.external) throw new Error("AMF3 externalizable object");
        for (const k of tr.names) o[k] = this.value();
        if (tr.dynamic) for (let k = this.string(); k; k = this.string()) o[k] = this.value();
        return o;
      }
      case 12: { const h = r.u29(); if (!(h & 1)) return this.objects[h >> 1]; const b = r.b.slice(r.p, r.p + (h >> 1)); r.p += h >> 1; this.objects.push(b); return b; }
      case 13: case 14: case 15: case 16: {
        const h = r.u29();
        if (!(h & 1)) return this.objects[h >> 1];
        r.u8();
        if (t === 16) this.string();
        const a: unknown[] = [];
        this.objects.push(a);
        for (let n = h >> 1; n > 0; n--) {
          if (t === 13) { a.push(r.view.getInt32(r.p)); r.p += 4; }
          else if (t === 14) { a.push(r.u32()); }
          else if (t === 15) a.push(r.f64());
          else a.push(this.value());
        }
        return a;
      }
      case 17: {
        const h = r.u29();
        if (!(h & 1)) return this.objects[h >> 1];
        r.u8();
        const m = new Map<unknown, unknown>();
        this.objects.push(m);
        for (let n = h >> 1; n > 0; n--) m.set(this.value(), this.value());
        return m;
      }
      default: throw new Error(`AMF3 type ${t} at ${r.p - 1}`);
    }
  }
}

/** The value at `path` (`a.b.0`) in a SharedObject's data. */
export function at(data: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((o, k) => (o instanceof Map ? o.get(k) : o && typeof o === "object" ? (o as Record<string, unknown>)[k] : undefined), data);
}
