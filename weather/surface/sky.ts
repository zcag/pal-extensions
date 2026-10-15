// The sky behind the page, drawn every frame on one canvas: a gradient lit
// by where the sun is, the sun or the moon with its glow, stars, clouds
// drifting with the wind, rain, snow, fog and lightning. `set()` gives a
// target; every value eases toward it, so scrubbing the hours morphs one
// sky into the next instead of cutting.

export type SkyTarget = {
  /** Sun height, −1 (deep night) to 1 (noon high); 0 is the horizon. */
  sun: number;
  /** Where along its arc the sun (or the moon by night) is, 0 east to 1 west. */
  arc: number;
  cover: number;
  rain: number;
  snow: number;
  fog: number;
  storm: number;
  /** km/h. */
  wind: number;
};

type Rgb = [number, number, number];
type Drop = { x: number; y: number; v: number; l: number; s: number; p: number };
type Cloud = { x: number; y: number; s: number; depth: number; light: HTMLCanvasElement; dark: HTMLCanvasElement; w: number; h: number; at: number };

const KEYS = ["sun", "arc", "cover", "rain", "snow", "fog", "storm", "wind"] as const;
const MAX_DROPS = 520, CLOUDS = 16, STARS = 140;

function rng(seed: number) {
  return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const clamp = (x: number, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const mix = (a: Rgb, b: Rgb, k: number): Rgb => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
const css = (c: Rgb, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
const smooth = (a: number, b: number, x: number) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };

/** Sky colours at the top, the middle and the horizon, by sun height: night, twilight, golden hour, day. */
const CLEAR: [number, Rgb, Rgb, Rgb][] = [
  [-1, [4, 7, 22], [9, 14, 38], [18, 26, 60]],
  [-0.18, [10, 14, 42], [28, 32, 78], [58, 52, 104]],
  [-0.04, [30, 38, 94], [104, 76, 132], [246, 132, 92]],
  [0.1, [46, 84, 168], [126, 140, 196], [255, 186, 130]],
  [0.35, [32, 104, 206], [86, 152, 228], [170, 210, 244]],
  [1, [22, 96, 214], [64, 146, 236], [150, 204, 250]],
];
const OVERCAST: [number, Rgb, Rgb, Rgb][] = [
  [-1, [10, 12, 18], [18, 21, 30], [30, 34, 44]],
  [-0.04, [44, 46, 60], [70, 70, 84], [104, 96, 104]],
  [0.25, [92, 104, 122], [128, 138, 154], [164, 172, 184]],
  [1, [104, 118, 138], [144, 156, 172], [184, 192, 202]],
];
const STORM: Rgb[] = [[24, 28, 38], [40, 46, 58], [62, 68, 80]];
function band(table: [number, Rgb, Rgb, Rgb][], sun: number): Rgb[] {
  const i = table.findIndex(([at]) => at >= sun);
  if (i <= 0) return table[i === 0 ? 0 : table.length - 1].slice(1) as Rgb[];
  const [a, b] = [table[i - 1], table[i]], k = smooth(0, 1, (sun - a[0]) / (b[0] - a[0]));
  return [1, 2, 3].map((j) => mix(a[j] as Rgb, b[j] as Rgb, k));
}

/**
 * A cloud: soft puffs heaped into a dome inside the sprite (a puff past its
 * edge would be cut straight), its underside faded flat, drawn once white
 * and once storm-grey, so a frame draws it as two blits.
 */
function cloudSprite(r: () => number, w: number, h: number) {
  const base = h * 0.74;
  const layout = Array.from({ length: 26 + Math.floor(r() * 12) }, () => {
    const t = 0.5 + (r() + r() + r() - 1.5) * 0.36, dome = Math.pow(Math.sin(Math.PI * clamp(t)), 0.8);
    const px = w * (0.14 + 0.72 * clamp(t));
    const py = base - r() * dome * h * 0.34;
    const pr = Math.min(h * (0.12 + 0.16 * dome * (0.5 + r() * 0.5)), px - 2, w - px - 2, py - 2);
    return { px, py, pr: Math.max(4, pr) };
  });
  const make = (tone: (y: number) => Rgb) => {
    const c = document.createElement("canvas"); c.width = w; c.height = h;
    const g = c.getContext("2d")!;
    if ("filter" in g) g.filter = "blur(2.5px)";
    for (const { px, py, pr } of layout) {
      const grad = g.createRadialGradient(px - pr * 0.2, py - pr * 0.35, pr * 0.05, px, py, pr);
      const c0 = tone((py - pr) / h), c1 = tone(py / h);
      grad.addColorStop(0, css(c0, 0.95)); grad.addColorStop(0.55, css(mix(c0, c1, 0.5), 0.75)); grad.addColorStop(1, css(c1, 0));
      g.fillStyle = grad;
      g.beginPath(); g.arc(px, py, pr, 0, Math.PI * 2); g.fill();
    }
    g.filter = "none";
    g.globalCompositeOperation = "destination-in";
    const under = g.createLinearGradient(0, 0, 0, h);
    under.addColorStop(0, "rgba(0,0,0,1)"); under.addColorStop(base / h - 0.04, "rgba(0,0,0,1)"); under.addColorStop(Math.min(1, base / h + 0.1), "rgba(0,0,0,0)");
    g.fillStyle = under; g.fillRect(0, 0, w, h);
    return c;
  };
  return { light: make((y) => mix([255, 255, 255], [196, 206, 222], clamp(y * 1.2))), dark: make((y) => mix([128, 136, 150], [52, 58, 70], clamp(y * 1.2))) };
}

export class Sky {
  private g: CanvasRenderingContext2D;
  private now: SkyTarget = { sun: 0.5, arc: 0.5, cover: 0.2, rain: 0, snow: 0, fog: 0, storm: 0, wind: 8 };
  private target: SkyTarget = { ...this.now };
  private w = 0; private h = 0; private dpr = 1;
  private drops: Drop[] = [];
  private flakes: Drop[] = [];
  private stars: { x: number; y: number; r: number; p: number }[] = [];
  private clouds: Cloud[] = [];
  private bolt: { pts: [number, number][]; branch: [number, number][]; age: number } | undefined;
  private flash = 0;
  private nextBolt = 3;
  private t = 0;
  private last = 0;
  private frame = 0;
  private r = rng(7);

  constructor(private canvas: HTMLCanvasElement) {
    this.g = canvas.getContext("2d")!;
    this.resize();
    const r = this.r;
    for (let i = 0; i < STARS; i++) this.stars.push({ x: r(), y: r() * r() * 0.85, r: 0.35 + r() * r() * 1.4, p: r() * Math.PI * 2 });
    for (let i = 0; i < CLOUDS; i++) {
      const depth = 0.35 + r() * 0.65, w = 200 + r() * 200, h = w * (0.5 + r() * 0.14);
      this.clouds.push({ x: r(), y: -0.08 + r() * 0.55 * (1.15 - depth * 0.5), s: 0.55 + depth * 0.6, depth, w, h, at: 0.04 + (i / CLOUDS) * 0.92, ...cloudSprite(r, Math.round(w), Math.round(h)) });
    }
    this.clouds.sort((a, b) => a.depth - b.depth);
    for (let i = 0; i < MAX_DROPS; i++) this.drops.push(this.drop(true));
    for (let i = 0; i < MAX_DROPS / 2; i++) this.flakes.push(this.flake(true));
    new ResizeObserver(() => this.resize()).observe(canvas);
  }

  set(t: SkyTarget, instant = false) {
    this.target = { ...t };
    if (instant) this.now = { ...t };
  }

  start() { if (!this.frame) { this.last = performance.now(); this.frame = requestAnimationFrame(this.tick); } }
  stop() { cancelAnimationFrame(this.frame); this.frame = 0; }

  private resize() {
    const box = this.canvas.getBoundingClientRect();
    this.dpr = Math.min(2, devicePixelRatio || 1);
    this.w = Math.max(1, box.width); this.h = Math.max(1, box.height);
    this.canvas.width = Math.round(this.w * this.dpr); this.canvas.height = Math.round(this.h * this.dpr);
  }

  private drop(anywhere = false): Drop {
    const r = this.r;
    return { x: r() * 1.3 - 0.15, y: anywhere ? r() : -r() * 0.2, v: 0.75 + r() * 0.5, l: 0.6 + r() * 0.6, s: 0.5 + r(), p: r() };
  }
  private flake(anywhere = false): Drop {
    const r = this.r;
    return { x: r() * 1.2 - 0.1, y: anywhere ? r() : -r() * 0.1, v: 0.5 + r() * 0.8, l: 0, s: 0.6 + r() * 1.8, p: r() * Math.PI * 2 };
  }

  private tick = (ms: number) => {
    const dt = Math.min(0.05, (ms - this.last) / 1000);
    this.last = ms; this.t += dt;
    const k = 1 - Math.exp(-dt * 3.2);
    for (const key of KEYS) this.now[key] += (this.target[key] - this.now[key]) * k;
    this.draw(dt);
    this.frame = requestAnimationFrame(this.tick);
  };

  private draw(dt: number) {
    const { g, w, h, now: s } = this;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const gloom = clamp(s.cover * 0.85 + s.rain * 0.25 + s.fog * 0.3);
    let [top, mid, low] = band(CLEAR, s.sun).map((c, i) => mix(c, band(OVERCAST, s.sun)[i], gloom));
    if (s.storm > 0.01) [top, mid, low] = [top, mid, low].map((c, i) => mix(c, STORM[i], s.storm * 0.75));
    const sky = g.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, css(top)); sky.addColorStop(0.55, css(mid)); sky.addColorStop(1, css(low));
    g.fillStyle = sky; g.fillRect(0, 0, w, h);

    const night = smooth(0.06, -0.2, s.sun);
    const clear = 1 - clamp(s.cover * 1.1 + s.fog);
    if (night * clear > 0.01) {
      for (const st of this.stars) {
        const tw = 0.55 + 0.45 * Math.sin(this.t * (0.8 + st.r) + st.p);
        g.fillStyle = `rgba(255,250,235,${(night * clear * tw * (0.35 + st.r * 0.45)).toFixed(3)})`;
        g.beginPath(); g.arc(st.x * w, st.y * h, st.r, 0, Math.PI * 2); g.fill();
      }
    }

    // The body on its arc: high in the middle, low at either end, sitting on the horizon at sunrise and sunset.
    const bx = w * (0.08 + 0.84 * s.arc), alt = night > 0.35 ? 0.35 + 0.5 * Math.sin(Math.PI * s.arc) : clamp(s.sun, -0.1, 1);
    const by = h * (0.64 - 0.54 * Math.max(alt, -0.05));
    const seen = 1 - clamp(s.cover * 0.9 + s.fog * 0.6 + s.storm);
    if (night < 0.35 && seen > 0.02) {
      const warm = smooth(0.3, 0, s.sun);
      const core: Rgb = mix([255, 248, 225], [255, 180, 110], warm);
      const glow = g.createRadialGradient(bx, by, 0, bx, by, Math.max(w, h) * 0.55);
      glow.addColorStop(0, css(core, 0.55 * seen)); glow.addColorStop(0.12, css(mix(core, [255, 200, 120], 0.5), 0.22 * seen)); glow.addColorStop(1, css(core, 0));
      g.fillStyle = glow; g.fillRect(0, 0, w, h);
      const disc = smooth(0.45, 0.85, seen) * smooth(-0.06, 0.03, s.sun);
      if (disc > 0.01) { g.fillStyle = css(core, 0.95 * disc); g.beginPath(); g.arc(bx, by, 17, 0, Math.PI * 2); g.fill(); }
    } else if (night >= 0.35 && seen > 0.02) {
      const a = seen * smooth(0.35, 0.6, night);
      const glow = g.createRadialGradient(bx, by, 0, bx, by, 150);
      glow.addColorStop(0, `rgba(220,226,255,${0.28 * a})`); glow.addColorStop(1, "rgba(220,226,255,0)");
      g.fillStyle = glow; g.fillRect(0, 0, w, h);
      const disc = g.createRadialGradient(bx - 5, by - 5, 2, bx, by, 15);
      disc.addColorStop(0, `rgba(255,253,244,${a})`); disc.addColorStop(1, `rgba(226,220,200,${a})`);
      g.fillStyle = disc; g.beginPath(); g.arc(bx, by, 14, 0, Math.PI * 2); g.fill();
      g.fillStyle = `rgba(150,146,140,${0.13 * a})`;
      for (const [dx, dy, rr] of [[-4, -3, 4], [4, 2, 3], [-1, 6, 2.5], [5, -6, 2]]) { g.beginPath(); g.arc(bx + dx, by + dy, rr, 0, Math.PI * 2); g.fill(); }
    }

    // Clouds: each one fades in at its own share of the cover, so more cover is more clouds, not denser ones.
    const drift = (4 + s.wind * 0.9) / 1000;
    const darkness = clamp(0.25 * gloom + s.rain * 0.45 + s.storm * 0.6 + night * 0.55);
    const lit = 1 - night * 0.55;
    for (const c of this.clouds) {
      const a = smooth(c.at, c.at + 0.07, s.cover + s.rain * 0.3 + s.storm * 0.4);
      c.x += drift * dt * c.depth;
      if (c.x > 1.15) c.x = -0.45;
      if (a < 0.01) continue;
      const cw = c.w * c.s * Math.max(0.8, w / 720), ch = c.h * c.s * Math.max(0.8, w / 720);
      const x = c.x * (w + cw) - cw * 0.6, y = c.y * h;
      g.globalAlpha = a * (1 - darkness) * lit * (0.55 + c.depth * 0.45);
      g.drawImage(c.light, x, y, cw, ch);
      g.globalAlpha = a * darkness * (0.6 + c.depth * 0.4);
      g.drawImage(c.dark, x, y, cw, ch);
    }
    g.globalAlpha = 1;

    if (s.fog > 0.01) {
      const tone: Rgb = mix([214, 220, 228], [84, 90, 106], night);
      for (let i = 0; i < 5; i++) {
        const y = h * (0.35 + i * 0.15), x = ((this.t * (6 + i * 3) + i * 230) % (w + 600)) - 300;
        const f = g.createRadialGradient(x, y, 0, x, y, w * 0.7);
        f.addColorStop(0, css(tone, 0.5 * s.fog)); f.addColorStop(1, css(tone, 0));
        g.save(); g.translate(x, y); g.scale(1, 0.22); g.translate(-x, -y);
        g.fillStyle = f; g.fillRect(x - w, y - w, w * 2, w * 2); g.restore();
      }
      g.fillStyle = css(tone, 0.3 * s.fog); g.fillRect(0, 0, w, h);
    }

    // Rain leans with the wind; drizzle is rain shorter, slower and thinner.
    const rainCount = Math.round(MAX_DROPS * clamp(s.rain));
    if (rainCount) {
      const lean = clamp(s.wind / 70, 0, 0.6), fall = h * 1.9;
      g.lineCap = "round";
      for (let i = 0; i < rainCount; i++) {
        const d = this.drops[i];
        d.y += (d.v * fall * (0.55 + 0.45 * s.rain) * dt) / h;
        d.x += (d.v * fall * lean * dt) / w;
        if (d.y > 1.05) Object.assign(d, this.drop());
        const len = (8 + 18 * s.rain) * d.l;
        const x = d.x * w, y = d.y * h;
        g.strokeStyle = `rgba(200,220,255,${(0.18 + 0.32 * d.s / 1.5).toFixed(3)})`;
        g.lineWidth = 0.6 + d.s * 0.55;
        g.beginPath(); g.moveTo(x, y); g.lineTo(x - len * lean, y - len); g.stroke();
      }
    }
    const snowCount = Math.round((MAX_DROPS / 2) * clamp(s.snow));
    for (let i = 0; i < snowCount; i++) {
      const f = this.flakes[i];
      f.y += (f.v * 38 * dt) / h * (0.6 + f.s * 0.3);
      f.x += (Math.sin(this.t * 0.9 + f.p) * 14 + s.wind * 0.6) * dt / w;
      if (f.y > 1.03) Object.assign(f, this.flake());
      g.fillStyle = `rgba(255,255,255,${(0.45 + f.s * 0.25).toFixed(3)})`;
      g.beginPath(); g.arc(f.x * w, f.y * h, f.s, 0, Math.PI * 2); g.fill();
    }

    if (s.storm > 0.3) {
      this.nextBolt -= dt;
      if (this.nextBolt <= 0) { this.strike(); this.nextBolt = 2.5 + this.r() * 5; }
    }
    if (this.flash > 0.005) {
      g.fillStyle = `rgba(220,228,255,${(this.flash * 0.5).toFixed(3)})`; g.fillRect(0, 0, w, h);
      this.flash *= Math.exp(-dt * 9);
    }
    if (this.bolt) {
      const b = this.bolt; b.age += dt;
      const a = clamp(1 - b.age / 0.45) * (b.age < 0.08 || b.age > 0.14 ? 1 : 0.35);
      if (a <= 0) this.bolt = undefined;
      else {
        g.save(); g.shadowColor = "rgba(170,190,255,0.9)"; g.shadowBlur = 18; g.lineJoin = "round";
        for (const [pts, width] of [[b.pts, 2.4], [b.branch, 1.2]] as const) {
          g.strokeStyle = `rgba(245,248,255,${a})`; g.lineWidth = width;
          g.beginPath(); pts.forEach(([x, y], i) => i ? g.lineTo(x * w, y * h) : g.moveTo(x * w, y * h)); g.stroke();
        }
        g.restore();
      }
    }
  }

  private strike() {
    const r = this.r;
    const pts: [number, number][] = [[0.25 + r() * 0.55, 0.05]];
    while (pts[pts.length - 1][1] < 0.62 + r() * 0.2) { const [x, y] = pts[pts.length - 1]; pts.push([x + (r() - 0.5) * 0.06, y + 0.03 + r() * 0.05]); }
    const from = pts[Math.floor(pts.length / 3)];
    const branch: [number, number][] = [from];
    for (let i = 0; i < 5; i++) { const [x, y] = branch[branch.length - 1]; branch.push([x + 0.012 + r() * 0.03, y + 0.025 + r() * 0.03]); }
    this.bolt = { pts, branch, age: 0 };
    this.flash = 0.9;
  }
}
