// The sky behind the page. One WebGL shader draws the air (a gradient lit by
// where the sun is), the sun's glare, the moon, stars and two decks of
// clouds: fractal noise projected onto a ceiling so they shrink toward the
// horizon, each lit from the sun's side. A 2D canvas over it draws what
// falls (rain leaning with the wind, snow) and lightning. `set()` gives a
// target; every value eases toward it, so a new hour morphs into place.

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
const KEYS = ["sun", "arc", "cover", "rain", "snow", "fog", "storm", "wind"] as const;
const MAX_DROPS = 480;

const clamp = (x: number, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const smooth = (a: number, b: number, x: number) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const mix = (a: Rgb, b: Rgb, k: number): Rgb => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];

/** The air at the top, the middle and the horizon, by sun height: night, blue hour, sunset, golden hour, day. */
const CLEAR: [number, Rgb, Rgb, Rgb][] = [
  [-1, [3, 6, 20], [8, 14, 40], [20, 30, 66]],
  [-0.2, [8, 12, 40], [26, 30, 82], [70, 56, 118]],
  [-0.03, [26, 36, 96], [118, 82, 150], [255, 128, 92]],
  [0.12, [38, 86, 178], [120, 150, 214], [255, 196, 142]],
  [0.4, [22, 98, 214], [70, 150, 236], [168, 212, 248]],
  [1, [14, 86, 214], [52, 140, 240], [146, 202, 252]],
];
const OVERCAST: [number, Rgb, Rgb, Rgb][] = [
  [-1, [8, 10, 16], [16, 19, 27], [28, 32, 42]],
  [-0.03, [40, 42, 58], [66, 66, 82], [104, 94, 104]],
  [0.25, [84, 96, 116], [122, 132, 150], [160, 168, 182]],
  [1, [98, 112, 134], [140, 152, 170], [182, 190, 202]],
];
function band(table: [number, Rgb, Rgb, Rgb][], sun: number): Rgb[] {
  const i = table.findIndex(([at]) => at >= sun);
  if (i <= 0) return table[i === 0 ? 0 : table.length - 1].slice(1) as Rgb[];
  const [a, b] = [table[i - 1], table[i]], k = smooth(0, 1, (sun - a[0]) / (b[0] - a[0]));
  return [1, 2, 3].map((j) => mix(a[j] as Rgb, b[j] as Rgb, k));
}

const VERT = `attribute vec2 p; void main(){ gl_Position = vec4(p, 0., 1.); }`;
const FRAG = `precision highp float;
uniform vec2 uRes; uniform float uTime;
uniform vec3 uTop, uMid, uLow;
uniform vec2 uSun;
uniform float uNight, uCover, uGloom, uFog, uWarm, uSeen, uFlash, uDrift, uBody;
float hash(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float noise(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3. - 2. * f);
  return mix(mix(hash(i), hash(i + vec2(1., 0.)), u.x), mix(hash(i + vec2(0., 1.)), hash(i + vec2(1., 1.)), u.x), u.y); }
float fbm(vec2 p){ float v = 0., a = .5; mat2 m = mat2(1.6, 1.2, -1.2, 1.6); for (int i = 0; i < 6; i++){ v += a * noise(p); p = m * p; a *= .5; } return v; }
float clouds(vec2 p){ vec2 q = vec2(fbm(p * .55 + vec2(0., uTime * .006)), fbm(p * .55 + vec2(5.2, 1.3))); return fbm(p + q * .9); }
void main(){
  vec2 uv = gl_FragCoord.xy / uRes;
  float aspect = uRes.x / uRes.y;
  vec3 col = uv.y > .5 ? mix(uMid, uTop, smoothstep(.5, 1., uv.y)) : mix(uLow, uMid, smoothstep(.08, .5, uv.y));
  vec2 d = (uv - uSun) * vec2(aspect, 1.);
  float r = length(d);
  vec3 sunCol = mix(vec3(1., .96, .88), vec3(1., .56, .28), uWarm);
  float day = 1. - uNight;
  col += sunCol * (exp(-r * 2.4) * .42 + exp(-r * 9.) * .45) * uSeen * day;
  col = mix(col, mix(vec3(1., .98, .94), vec3(1., .62, .36), uWarm), smoothstep(.052, .044, r) * smoothstep(.4, .8, uSeen) * day * uBody);
  vec2 g = uv * vec2(aspect, 1.) * 70.; vec2 id = floor(g); float h = hash(id);
  float star = step(.982, h) * smoothstep(.16, 0., length(fract(g) - .5 - (hash(id + 3.) - .5) * .5)) * (.55 + .45 * sin(uTime * (.7 + h * 2.5) + h * 60.));
  col += vec3(1., .96, .88) * star * uNight * (1. - uCover) * smoothstep(.12, .55, uv.y) * 1.4;
  float moon = smoothstep(.05, .044, r) * uNight * smoothstep(.25, .55, uSeen) * uBody;
  float craters = fbm(d * 60. + 3.) * .22;
  col += vec3(.78, .82, 1.) * exp(-r * 6.) * .22 * uNight * uSeen;
  col = mix(col, vec3(.96, .94, .86) - craters * .5, moon);
  float y = max(uv.y + .22, .06);
  vec2 cp = vec2((uv.x - .5) * aspect / sqrt(y), 1. / y);
  cp.x += uDrift;
  vec2 far = cp * .9 + vec2(uDrift * .6, 7.);
  float thr = mix(.7, .3, uCover);
  vec2 toSun = normalize((uSun - uv) * vec2(aspect, 1.) + 1e-4) * .09;
  float n = clouds(cp * 1.7);
  float lit = clamp((n - clouds(cp * 1.7 + toSun)) * 5. + .55, 0., 1.);
  float dens = smoothstep(thr, thr + .18, n) * smoothstep(-.05, .3, uv.y + .12);
  float nf = clouds(far * 2.6);
  float densFar = smoothstep(thr + .06, thr + .34, nf) * .7;
  vec3 light = mix(vec3(1.), mix(vec3(1., .82, .78), sunCol, .6), uWarm) * mix(1., .28, uNight);
  vec3 shade = mix(vec3(.66, .7, .78), vec3(.24, .27, .33), uGloom) * mix(1., .32, uNight);
  vec3 far3 = mix(shade, light, .55 * (1. - uGloom * .5));
  col = mix(col, far3, densFar * (1. - dens));
  vec3 cc = mix(shade, light, lit * (1. - uGloom * .55));
  cc += sunCol * exp(-r * 4.) * .35 * uSeen * day * (1. - dens * .5);
  col = mix(col, cc, dens);
  vec3 fogc = mix(vec3(.8, .83, .87), vec3(.22, .24, .3), uNight);
  col = mix(col, fogc, uFog * (.3 + .5 * smoothstep(.9, .05, uv.y) * (.8 + .2 * noise(vec2(uv.x * 3. + uTime * .05, uv.y * 8.)))));
  col += vec3(.82, .88, 1.) * uFlash * .7;
  col += (hash(gl_FragCoord.xy + uTime) - .5) / 255.;
  gl_FragColor = vec4(col, 1.);
}`;

export class Sky {
  private gl: WebGLRenderingContext;
  private u: Record<string, WebGLUniformLocation | null> = {};
  private fx: CanvasRenderingContext2D;
  private now: SkyTarget = { sun: 0.5, arc: 0.5, cover: 0.3, rain: 0, snow: 0, fog: 0, storm: 0, wind: 10 };
  private target: SkyTarget = { ...this.now };
  private w = 1; private h = 1;
  private drops: Drop[] = [];
  private flakes: Drop[] = [];
  private bolt: { pts: [number, number][]; branch: [number, number][]; age: number } | undefined;
  private flash = 0;
  private nextBolt = 2;
  private t = 0;
  private drift = 0;
  private last = 0;
  private frame = 0;
  private seed = 7;
  /** Whether the sky draws the sun's and the moon's discs, or leaves them to a picture on the page. */
  bodies = true;

  constructor(private canvas: HTMLCanvasElement, private overlay: HTMLCanvasElement) {
    this.gl = canvas.getContext("webgl", { antialias: false, alpha: false, preserveDrawingBuffer: false })!;
    this.fx = overlay.getContext("2d")!;
    const gl = this.gl;
    const shader = (type: number, src: string) => { const s = gl.createShader(type)!; gl.shaderSource(s, src); gl.compileShader(s); return s; };
    const prog = gl.createProgram()!;
    gl.attachShader(prog, shader(gl.VERTEX_SHADER, VERT)); gl.attachShader(prog, shader(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog); gl.useProgram(prog);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const at = gl.getAttribLocation(prog, "p"); gl.enableVertexAttribArray(at); gl.vertexAttribPointer(at, 2, gl.FLOAT, false, 0, 0);
    for (const name of ["uRes", "uTime", "uTop", "uMid", "uLow", "uSun", "uNight", "uCover", "uGloom", "uFog", "uWarm", "uSeen", "uFlash", "uDrift", "uBody"]) this.u[name] = gl.getUniformLocation(prog, name);
    for (let i = 0; i < MAX_DROPS; i++) this.drops.push(this.drop(true));
    for (let i = 0; i < MAX_DROPS / 2; i++) this.flakes.push(this.flake(true));
    this.resize();
    new ResizeObserver(() => this.resize()).observe(canvas);
  }

  set(t: SkyTarget, instant = false) {
    this.target = { ...t };
    if (instant) this.now = { ...t };
  }
  start() { if (!this.frame) { this.last = performance.now(); this.frame = requestAnimationFrame(this.tick); } }
  stop() { cancelAnimationFrame(this.frame); this.frame = 0; }
  /** One frame now, for the first paint before the loop's first tick. */
  paint() { this.draw(0); }

  private rnd() { let s = (this.seed = (this.seed + 0x6d2b79f5) | 0); s = Math.imul(s ^ (s >>> 15), 1 | s); s = (s + Math.imul(s ^ (s >>> 7), 61 | s)) ^ s; return ((s ^ (s >>> 14)) >>> 0) / 4294967296; }
  private drop(anywhere = false): Drop { return { x: this.rnd() * 1.3 - 0.15, y: anywhere ? this.rnd() : -this.rnd() * 0.2, v: 0.75 + this.rnd() * 0.5, l: 0.6 + this.rnd() * 0.6, s: 0.5 + this.rnd(), p: this.rnd() }; }
  private flake(anywhere = false): Drop { return { x: this.rnd() * 1.2 - 0.1, y: anywhere ? this.rnd() : -this.rnd() * 0.1, v: 0.5 + this.rnd() * 0.8, l: 0, s: 0.6 + this.rnd() * 1.8, p: this.rnd() * Math.PI * 2 }; }

  private resize() {
    const box = this.canvas.getBoundingClientRect();
    this.w = Math.max(1, box.width); this.h = Math.max(1, box.height);
    // The air and the clouds are soft: drawn at one pixel per point and scaled up, a quarter of the work on a retina screen.
    this.canvas.width = Math.round(this.w); this.canvas.height = Math.round(this.h);
    const dpr = Math.min(2, devicePixelRatio || 1);
    this.overlay.width = Math.round(this.w * dpr); this.overlay.height = Math.round(this.h * dpr);
    this.fx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    this.paint();
  }

  private tick = (ms: number) => {
    const dt = Math.min(0.05, (ms - this.last) / 1000);
    this.last = ms;
    this.draw(dt);
    this.frame = requestAnimationFrame(this.tick);
  };

  private draw(dt: number) {
    this.t += dt;
    const k = 1 - Math.exp(-dt * 3);
    for (const key of KEYS) this.now[key] += (this.target[key] - this.now[key]) * k;
    const s = this.now;
    this.drift += dt * (0.004 + s.wind * 0.0009);
    this.sky(s);
    this.weather(s, dt);
  }

  private sky(s: SkyTarget) {
    const { gl, u } = this;
    const gloom = clamp(s.cover * 0.55 + s.rain * 0.35 + s.storm * 0.5 + s.fog * 0.2);
    let [top, mid, low] = band(CLEAR, s.sun).map((c, i) => mix(c, band(OVERCAST, s.sun)[i], clamp(s.cover * 0.8 + s.rain * 0.3)));
    if (s.storm > 0.01) [top, mid, low] = [[20, 24, 34], [36, 42, 54], [56, 62, 74]].map((c, i) => mix([top, mid, low][i], c as Rgb, s.storm * 0.7));
    const night = smooth(0.05, -0.18, s.sun);
    const alt = night > 0.5 ? 0.45 + 0.4 * Math.sin(Math.PI * s.arc) : clamp(s.sun, -0.1, 1);
    gl.uniform2f(u.uRes, this.canvas.width, this.canvas.height);
    gl.uniform1f(u.uTime, this.t);
    gl.uniform3f(u.uTop, ...(top.map((c) => c / 255) as Rgb));
    gl.uniform3f(u.uMid, ...(mid.map((c) => c / 255) as Rgb));
    gl.uniform3f(u.uLow, ...(low.map((c) => c / 255) as Rgb));
    gl.uniform2f(u.uSun, 0.36 + 0.46 * s.arc, 0.3 + 0.62 * Math.max(alt, -0.05));
    gl.uniform1f(u.uNight, night);
    gl.uniform1f(u.uCover, clamp(s.cover + s.rain * 0.2));
    gl.uniform1f(u.uGloom, gloom);
    gl.uniform1f(u.uFog, s.fog);
    gl.uniform1f(u.uWarm, smooth(0.32, 0, s.sun) * (1 - night));
    gl.uniform1f(u.uSeen, 1 - clamp(s.cover * 0.75 + s.fog * 0.6 + s.storm));
    gl.uniform1f(u.uFlash, this.flash);
    gl.uniform1f(u.uDrift, this.drift);
    gl.uniform1f(u.uBody, this.bodies ? 1 : 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  private weather(s: SkyTarget, dt: number) {
    const { fx: g, w, h } = this;
    g.clearRect(0, 0, w, h);
    const rainCount = Math.round(MAX_DROPS * clamp(s.rain));
    if (rainCount) {
      const lean = clamp(s.wind / 70, 0, 0.6), fall = h * 1.9;
      g.lineCap = "round";
      for (let i = 0; i < rainCount; i++) {
        const d = this.drops[i];
        d.y += (d.v * fall * (0.55 + 0.45 * s.rain) * dt) / h;
        d.x += (d.v * fall * lean * dt) / w;
        if (d.y > 1.05) Object.assign(d, this.drop());
        const len = (8 + 18 * s.rain) * d.l, x = d.x * w, y = d.y * h;
        g.strokeStyle = `rgba(205,222,255,${(0.16 + (0.3 * d.s) / 1.5).toFixed(3)})`;
        g.lineWidth = 0.6 + d.s * 0.5;
        g.beginPath(); g.moveTo(x, y); g.lineTo(x - len * lean, y - len); g.stroke();
      }
    }
    const snowCount = Math.round((MAX_DROPS / 2) * clamp(s.snow));
    for (let i = 0; i < snowCount; i++) {
      const f = this.flakes[i];
      f.y += ((f.v * 38 * dt) / h) * (0.6 + f.s * 0.3);
      f.x += ((Math.sin(this.t * 0.9 + f.p) * 14 + s.wind * 0.6) * dt) / w;
      if (f.y > 1.03) Object.assign(f, this.flake());
      g.fillStyle = `rgba(255,255,255,${(0.45 + f.s * 0.25).toFixed(3)})`;
      g.beginPath(); g.arc(f.x * w, f.y * h, f.s, 0, Math.PI * 2); g.fill();
    }
    if (s.storm > 0.3) {
      this.nextBolt -= dt;
      if (this.nextBolt <= 0) { this.strike(); this.nextBolt = 2.5 + this.rnd() * 5; }
    }
    this.flash *= Math.exp(-dt * 9);
    if (this.bolt) {
      const b = this.bolt; b.age += dt;
      const a = clamp(1 - b.age / 0.45) * (b.age < 0.08 || b.age > 0.14 ? 1 : 0.35);
      if (a <= 0) this.bolt = undefined;
      else {
        g.save(); g.shadowColor = "rgba(170,190,255,0.9)"; g.shadowBlur = 18; g.lineJoin = "round";
        for (const [pts, width] of [[b.pts, 2.4], [b.branch, 1.2]] as const) {
          g.strokeStyle = `rgba(245,248,255,${a})`; g.lineWidth = width;
          g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x * w, y * h) : g.moveTo(x * w, y * h))); g.stroke();
        }
        g.restore();
      }
    }
  }

  private strike() {
    const pts: [number, number][] = [[0.3 + this.rnd() * 0.5, 0.04]];
    while (pts[pts.length - 1][1] < 0.55 + this.rnd() * 0.15) { const [x, y] = pts[pts.length - 1]; pts.push([x + (this.rnd() - 0.5) * 0.06, y + 0.03 + this.rnd() * 0.05]); }
    const branch: [number, number][] = [pts[Math.floor(pts.length / 3)]];
    for (let i = 0; i < 5; i++) { const [x, y] = branch[branch.length - 1]; branch.push([x + 0.012 + this.rnd() * 0.03, y + 0.025 + this.rnd() * 0.03]); }
    this.bolt = { pts, branch, age: 0 };
    this.flash = 0.9;
  }
}
