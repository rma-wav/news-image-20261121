import * as fs from "node:fs";
import * as path from "node:path";
import * as zlib from "node:zlib";

// The World in One Frame - 21 November 2026
// One 1024x1024 newspaper front page, drawn entirely in code.
// No network, no downloaded images, deterministic output.

const W = 1024;
const H = 1024;

type RGB = [number, number, number];

function hex(h: string): RGB {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const PAPER = hex("#f6f1e5");
const PAPER2 = hex("#efe8d3");
const INK = hex("#161513");
const INK2 = hex("#3d3a34");
const RED = hex("#b3261e");
const BLUE = hex("#1d4e89");
const GOLD = hex("#b98a1d");
const TEAL = hex("#0f6b5c");
const GREEN = hex("#2e7d32");
const ORANGE = hex("#c2571a");
const PURPLE = hex("#5b2d8e");
const GREY = hex("#8a8578");
const WHITE = hex("#ffffff");
const LIGHT = hex("#e8e2d0");

const buf = new Uint8Array(W * H * 3);
function setPx(x: number, y: number, c: RGB): void {
  const xi = Math.round(x);
  const yi = Math.round(y);
  if (xi < 0 || yi < 0 || xi >= W || yi >= H) return;
  const i = (yi * W + xi) * 3;
  buf[i] = c[0];
  buf[i + 1] = c[1];
  buf[i + 2] = c[2];
}
function fillRect(x: number, y: number, w: number, h: number, c: RGB): void {
  const x0 = Math.max(0, Math.round(x));
  const y0 = Math.max(0, Math.round(y));
  const x1 = Math.min(W, Math.round(x + w));
  const y1 = Math.min(H, Math.round(y + h));
  for (let yy = y0; yy < y1; yy++) {
    for (let xx = x0; xx < x1; xx++) {
      const i = (yy * W + xx) * 3;
      buf[i] = c[0];
      buf[i + 1] = c[1];
      buf[i + 2] = c[2];
    }
  }
}
function hline(x: number, y: number, w: number, c: RGB, t = 1): void {
  fillRect(x, y, w, t, c);
}
function vline(x: number, y: number, h: number, c: RGB, t = 1): void {
  fillRect(x, y, t, h, c);
}
function rectOutline(x: number, y: number, w: number, h: number, c: RGB, t = 1): void {
  hline(x, y, w, c, t);
  hline(x, y + h - t, w, c, t);
  vline(x, y, h, c, t);
  vline(x + w - t, y, h, c, t);
}
function drawLine(x0: number, y0: number, x1: number, y1: number, c: RGB, t = 1): void {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const steps = Math.max(Math.abs(dx), Math.abs(dy), 1);
  for (let s = 0; s <= steps; s++) {
    const x = Math.round(x0 + (dx * s) / steps);
    const y = Math.round(y0 + (dy * s) / steps);
    fillRect(x - Math.floor(t / 2), y - Math.floor(t / 2), t, t, c);
  }
}
function fillCircle(cx: number, cy: number, r: number, c: RGB): void {
  for (let y = -r; y <= r; y++) {
    for (let x = -r; x <= r; x++) {
      if (x * x + y * y <= r * r) setPx(cx + x, cy + y, c);
    }
  }
}
function ring(cx: number, cy: number, r: number, c: RGB, t = 2): void {
  for (let a = 0; a < 360; a += 2) {
    const rad = (a * Math.PI) / 180;
    for (let k = 0; k < t; k++) {
      setPx(cx + Math.round((r - k) * Math.cos(rad)), cy + Math.round((r - k) * Math.sin(rad)), c);
    }
  }
}
function fillTriangle(x0: number, y0: number, x1: number, y1: number, x2: number, y2: number, c: RGB): void {
  const minX = Math.min(x0, x1, x2);
  const maxX = Math.max(x0, x1, x2);
  const minY = Math.min(y0, y1, y2);
  const maxY = Math.max(y0, y1, y2);
  const d = (y1 - y2) * (x0 - x2) + (x2 - x1) * (y0 - y2);
  if (d === 0) return;
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const a = ((y1 - y2) * (x - x2) + (x2 - x1) * (y - y2)) / d;
      const b = ((y2 - y0) * (x - x2) + (x0 - x2) * (y - y2)) / d;
      const cc = 1 - a - b;
      if (a >= 0 && b >= 0 && cc >= 0) setPx(x, y, c);
    }
  }
}

// ---- PNG encoder (own CRC32 + zlib, stdlib only) ----
const crcTable: number[] = [];
for (let n = 0; n < 256; n++) {
  let v = n;
  for (let k = 0; k < 8; k++) v = v & 1 ? 0xedb88320 ^ (v >>> 1) : v >>> 1;
  crcTable[n] = v >>> 0;
}
function crc32(data: Buffer): number {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) crc = crcTable[(crc ^ data[i]) & 255] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type: string, data: Buffer): Buffer {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, "ascii");
  data.copy(out, 8);
  const crc = crc32(Buffer.concat([Buffer.from(type, "ascii"), data]));
  out.writeUInt32BE(crc, 8 + data.length);
  return out;
}
function encodePNG(): Buffer {
  const raw = Buffer.alloc(H * (1 + W * 3));
  for (let y = 0; y < H; y++) {
    raw[y * (1 + W * 3)] = 0;
    raw.set(buf.subarray(y * W * 3, (y + 1) * W * 3), y * (1 + W * 3) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0);
  ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", idat),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// ---- 5x7 bitmap font, drawn by hand in this file ----
const FONT: Record<string, string[]> = {
  A: [".###.", "#...#", "#...#", "#####", "#...#", "#...#", "#...#"],
  B: ["####.", "#...#", "#...#", "####.", "#...#", "#...#", "####."],
  C: [".####", "#....", "#....", "#....", "#....", "#....", ".####"],
  D: ["####.", "#...#", "#...#", "#...#", "#...#", "#...#", "####."],
  E: ["#####", "#....", "#....", "####.", "#....", "#....", "#####"],
  F: ["#####", "#....", "#....", "####.", "#....", "#....", "#...."],
  G: [".####", "#....", "#....", "#.###", "#...#", "#...#", ".###."],
  H: ["#...#", "#...#", "#...#", "#####", "#...#", "#...#", "#...#"],
  I: [".###.", "..#..", "..#..", "..#..", "..#..", "..#..", ".###."],
  J: ["..###", "...#.", "...#.", "...#.", "...#.", "#..#.", ".##.."],
  K: ["#...#", "#..#.", "#.#..", "##...", "#.#..", "#..#.", "#...#"],
  L: ["#....", "#....", "#....", "#....", "#....", "#....", "#####"],
  M: ["#...#", "##.##", "#.#.#", "#.#.#", "#...#", "#...#", "#...#"],
  N: ["#...#", "##..#", "##..#", "#.#.#", "#..##", "#..##", "#...#"],
  O: [".###.", "#...#", "#...#", "#...#", "#...#", "#...#", ".###."],
  P: ["####.", "#...#", "#...#", "####.", "#....", "#....", "#...."],
  Q: [".###.", "#...#", "#...#", "#...#", "#.#.#", "#..#.", ".##.#"],
  R: ["####.", "#...#", "#...#", "####.", "#.#..", "#..#.", "#...#"],
  S: [".####", "#....", "#....", ".###.", "....#", "....#", "####."],
  T: ["#####", "..#..", "..#..", "..#..", "..#..", "..#..", "..#.."],
  U: ["#...#", "#...#", "#...#", "#...#", "#...#", "#...#", ".###."],
  V: ["#...#", "#...#", "#...#", "#...#", "#...#", ".#.#.", "..#.."],
  W: ["#...#", "#...#", "#...#", "#.#.#", "#.#.#", "##.##", "#...#"],
  X: ["#...#", "#...#", ".#.#.", "..#..", ".#.#.", "#...#", "#...#"],
  Y: ["#...#", "#...#", ".#.#.", "..#..", "..#..", "..#..", "..#.."],
  Z: ["#####", "....#", "...#.", "..#..", ".#...", "#....", "#####"],
  "0": [".###.", "#..##", "#.#.#", "#.#.#", "##..#", "#...#", ".###."],
  "1": ["..#..", ".##..", "..#..", "..#..", "..#..", "..#..", ".###."],
  "2": [".###.", "#...#", "....#", "...#.", "..#..", ".#...", "#####"],
  "3": ["####.", "....#", "....#", ".###.", "....#", "....#", "####."],
  "4": ["...#.", "..##.", ".#.#.", "#..#.", "#####", "...#.", "...#."],
  "5": ["#####", "#....", "####.", "....#", "....#", "#...#", ".###."],
  "6": [".###.", "#....", "#....", "####.", "#...#", "#...#", ".###."],
  "7": ["#####", "....#", "...#.", "...#.", "..#..", "..#..", "..#.."],
  "8": [".###.", "#...#", "#...#", ".###.", "#...#", "#...#", ".###."],
  "9": [".###.", "#...#", "#...#", ".####", "....#", "....#", ".###."],
  " ": [".....", ".....", ".....", ".....", ".....", ".....", "....."],
  ".": [".....", ".....", ".....", ".....", ".....", ".##..", ".##.."],
  ",": [".....", ".....", ".....", ".....", ".##..", ".##..", ".#..."],
  ":": [".....", ".##..", ".##..", ".....", ".##..", ".##..", "....."],
  ";": [".....", ".##..", ".##..", ".....", ".##..", ".##..", ".#..."],
  "-": [".....", ".....", ".....", "#####", ".....", ".....", "....."],
  "+": [".....", "..#..", "..#..", "#####", "..#..", "..#..", "....."],
  "%": ["##..#", "##.#.", "...#.", "..#..", ".#...", "#.##.", "#..##"],
  "/": ["....#", "...#.", "...#.", "..#..", ".#...", ".#...", "#...."],
  "(": ["...##", "..#..", ".#...", ".#...", ".#...", "..#..", "...##"],
  ")": ["##...", "..#..", "...#.", "...#.", "...#.", "..#..", "##..."],
  "'": ["..#..", "..#..", ".#...", ".....", ".....", ".....", "....."],
  "!": ["..#..", "..#..", "..#..", "..#..", "..#..", ".....", "..#.."],
  "?": [".###.", "#...#", "....#", "...#.", "..#..", ".....", "..#.."],
  $: ["..#..", ".####", "#.#..", ".###.", "..#.#", "####.", "..#.."],
  "&": [".##..", "#..#.", "#..#.", ".#...", "#.#.#", "#..#.", ".##.#"],
  "=": [".....", ".....", "#####", ".....", "#####", ".....", "....."],
  _: [".....", ".....", ".....", ".....", ".....", ".....", "#####"],
};
function drawChar(ch: string, x: number, y: number, s: number, c: RGB): void {
  const g = FONT[ch] || FONT["?"];
  for (let r = 0; r < 7; r++) {
    for (let col = 0; col < 5; col++) {
      if (g[r][col] === "#") fillRect(x + col * s, y + r * s, s, s, c);
    }
  }
}
function textWidth(t: string, s: number): number {
  return t.length * 6 * s - s;
}
function drawText(t: string, x: number, y: number, s: number, c: RGB): void {
  const up = t.toUpperCase();
  for (let i = 0; i < up.length; i++) drawChar(up[i], x + i * 6 * s, y, s, c);
}
function drawTextCentered(t: string, cx: number, y: number, s: number, c: RGB): void {
  drawText(t, cx - Math.round(textWidth(t, s) / 2), y, s, c);
}
function wrapText(t: string, s: number, maxW: number): string[] {
  const words = t.toUpperCase().split(" ");
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const test = cur ? cur + " " + w : w;
    if (textWidth(test, s) <= maxW) {
      cur = test;
    } else {
      if (cur) lines.push(cur);
      cur = w;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}
function drawBlock(t: string, x: number, y: number, s: number, maxW: number, c: RGB, lh?: number): number {
  const lines = wrapText(t, s, maxW);
  const step = lh || 9 * s;
  for (let i = 0; i < lines.length; i++) drawText(lines[i], x, y + i * step, s, c);
  return lines.length * step;
}

// ---- Dotted world map: continents as ellipses in normalised map space ----
// x and y are 0..1 across the map box, so dots on an even pixel grid form
// recognisable continent blobs instead of squashed lon/lat strips.
type Ellipse = { x: number; y: number; rx: number; ry: number };
const LAND: Ellipse[] = [
  { x: 0.2, y: 0.32, rx: 0.13, ry: 0.2 },
  { x: 0.32, y: 0.16, rx: 0.04, ry: 0.06 },
  { x: 0.28, y: 0.52, rx: 0.04, ry: 0.07 },
  { x: 0.33, y: 0.68, rx: 0.07, ry: 0.2 },
  { x: 0.54, y: 0.3, rx: 0.08, ry: 0.11 },
  { x: 0.55, y: 0.58, rx: 0.09, ry: 0.2 },
  { x: 0.62, y: 0.42, rx: 0.05, ry: 0.08 },
  { x: 0.75, y: 0.3, rx: 0.17, ry: 0.18 },
  { x: 0.68, y: 0.48, rx: 0.04, ry: 0.08 },
  { x: 0.82, y: 0.55, rx: 0.05, ry: 0.07 },
  { x: 0.86, y: 0.72, rx: 0.06, ry: 0.07 },
];
function isLand(nx: number, ny: number): boolean {
  for (const e of LAND) {
    const dx = (nx - e.x) / e.rx;
    const dy = (ny - e.y) / e.ry;
    if (dx * dx + dy * dy <= 1) return true;
  }
  return false;
}
function project(lon: number, lat: number, mx: number, my: number, mw: number, mh: number): [number, number] {
  const x = mx + ((lon + 180) / 360) * mw;
  const y = my + ((85 - lat) / 145) * mh;
  return [x, y];
}

// ---- Story pictograms, drawn with shapes only ----
function drawIcon(kind: string, x: number, y: number, s: number): void {
  const cx = x + s / 2;
  const cy = y + s / 2;
  if (kind === "summit") {
    fillRect(x + 4, y + 8, 3, s - 12, INK);
    fillRect(x + s / 2 - 1, y + 4, 3, s - 8, INK);
    fillRect(x + s - 7, y + 8, 3, s - 12, INK);
    fillTriangle(x + 7, y + 8, x + 22, y + 13, x + 7, y + 18, RED);
    fillTriangle(x + s / 2 + 2, y + 4, x + s / 2 + 17, y + 9, x + s / 2 + 2, y + 14, BLUE);
    fillTriangle(x + s - 4, y + 8, x + s - 19, y + 13, x + s - 4, y + 18, GOLD);
    fillRect(x, y + s - 6, s, 4, INK);
  } else if (kind === "hormuz") {
    fillTriangle(cx - 2, y + 2, cx + 10, y + 18, cx - 2, y + 18, ORANGE);
    fillTriangle(cx + 2, y + 8, cx + 10, y + 20, cx - 6, y + 20, RED);
    fillRect(x + 4, y + s - 18, s - 8, 10, BLUE);
    fillTriangle(x + 4, y + s - 18, x + 16, y + s - 18, x + 4, y + s - 8, BLUE);
    drawLine(x + 2, y + s - 4, x + s - 2, y + s - 4, BLUE, 2);
    drawLine(x + 6, y + s - 1, x + s - 6, y + s - 1, BLUE, 1);
  } else if (kind === "ukraine") {
    drawLine(x + 6, y + s - 8, x + 6, y + 12, INK, 3);
    drawLine(x + s - 9, y + s - 8, x + s - 9, y + 12, INK, 3);
    drawLine(x + 6, y + 16, cx, y + 6, INK, 3);
    drawLine(cx, y + 6, x + s - 9, y + 16, INK, 3);
    for (let a = 0; a < 8; a++) {
      const rad = (a * Math.PI) / 4;
      drawLine(cx, cy - 4, cx + Math.round(14 * Math.cos(rad)), cy - 4 + Math.round(14 * Math.sin(rad)), RED, 2);
    }
    fillCircle(cx, cy - 4, 4, GOLD);
  } else if (kind === "mexico") {
    fillCircle(cx, cy, s / 2 - 2, GOLD);
    ring(cx, cy, s / 2 - 2, INK, 2);
    fillTriangle(cx, cy - 10, cx + 3, cy - 2, cx - 3, cy - 2, INK);
    fillTriangle(cx, cy + 10, cx + 3, cy + 2, cx - 3, cy + 2, INK);
    fillTriangle(cx - 10, cy, cx - 2, cy - 3, cx - 2, cy + 3, INK);
    fillTriangle(cx + 10, cy, cx + 2, cy - 3, cx + 2, cy + 3, INK);
    fillCircle(cx, cy, 3, RED);
  } else if (kind === "markets") {
    drawLine(x + 6, y + s - 8, x + s - 6, y + s - 8, INK, 2);
    drawLine(x + 6, y + s - 8, x + 6, y + 6, INK, 2);
    drawLine(x + 8, y + 12, x + 18, y + 20, RED, 3);
    drawLine(x + 18, y + 20, x + 26, y + 16, RED, 3);
    drawLine(x + 26, y + 16, x + s - 8, y + s - 12, RED, 3);
    fillTriangle(x + s - 8, y + s - 12, x + s - 14, y + s - 16, x + s - 14, y + s - 6, RED);
  } else if (kind === "cop") {
    ring(cx, cy, s / 2 - 3, TEAL, 3);
    fillTriangle(cx - 2, cy - 12, cx + 12, cy - 2, cx - 2, cy + 4, GREEN);
    drawLine(cx - 2, cy + 4, cx - 8, cy + 12, GREEN, 2);
    drawLine(cx - 12, cy + 2, cx + 12, cy + 2, TEAL, 2);
  } else {
    drawLine(x + 4, y + s - 10, x + 16, y + s - 16, INK, 3);
    drawLine(x + 16, y + s - 16, x + 26, y + s - 8, INK, 3);
    drawLine(x + 26, y + s - 8, x + s - 4, y + s - 14, INK, 3);
    drawLine(cx, y + 6, cx, y + s - 16, ORANGE, 3);
    drawLine(cx - 8, y + 12, cx, y + 6, ORANGE, 3);
    drawLine(cx + 8, y + 12, cx, y + 6, ORANGE, 3);
    fillCircle(cx - 10, y + s - 22, 3, RED);
    fillCircle(cx + 10, y + s - 22, 3, RED);
  }
}

// ---- The seven stories of 21 November 2026 ----
type Story = {
  n: number;
  tag: string;
  color: RGB;
  title: string;
  body: string;
  place: string;
  lon: number;
  lat: number;
  icon: string;
};
const STORIES: Story[] = [
  {
    n: 1, tag: "SUMMIT IN SHENZHEN", color: RED,
    title: "TRUMP, XI AND PUTIN MEET",
    body: "Three leaders agree to open talks on cutting nuclear risks at the APEC summit in Shenzhen.",
    place: "SHENZHEN, CHINA", lon: 114, lat: 22, icon: "summit",
  },
  {
    n: 2, tag: "STRAIT OF HORMUZ", color: ORANGE,
    title: "IRAN STRIKE HITS BAHRAIN",
    body: "Iranian strike sets fire to a Bahrain site. Tanker attacks surge.",
    place: "BAHRAIN / GULF", lon: 50, lat: 26, icon: "hormuz",
  },
  {
    n: 3, tag: "UKRAINE WAR", color: BLUE,
    title: "MISSILE HITS KRYVYI RIH",
    body: "Russia hits Kryvyi Rih, 2 dead, 58 hurt. Ukraine hits a ship.",
    place: "UKRAINE", lon: 33, lat: 48, icon: "ukraine",
  },
  {
    n: 4, tag: "MEXICO", color: TEAL,
    title: "CARTEL BOSS CAPTURED",
    body: "FBI most-wanted boss arrested in Sinaloa. 11 killed in the raid.",
    place: "SINALOA, MEXICO", lon: -107, lat: 25, icon: "mexico",
  },
  {
    n: 5, tag: "MARKETS", color: PURPLE,
    title: "AI CRASH: STOCKS IN CORRECTION",
    body: "S+P falls 3.7 percent, Nasdaq 5.3 percent. Nvidia drops 14 percent.",
    place: "NEW YORK, USA", lon: -74, lat: 41, icon: "markets",
  },
  {
    n: 6, tag: "CLIMATE", color: GREEN,
    title: "COP31 DEADLOCK IN ANTALYA",
    body: "Talks run into overtime. Draft drops fossil fuels entirely.",
    place: "ANTALYA, TURKEY", lon: 30, lat: 37, icon: "cop",
  },
  {
    n: 7, tag: "PERU QUAKE", color: GOLD,
    title: "M6.8 SHAKES THE ANDES",
    body: "Strong quake near Junin rattles Lima. No deaths reported.",
    place: "JUNIN, PERU", lon: -76, lat: -11, icon: "quake",
  },
];

function drawPin(mx: number, my: number, mw: number, mh: number, s: Story): void {
  let [x, y] = project(s.lon, s.lat, mx, my, mw, mh);
  if (s.n === 6) {
    x += 26;
    y += 22;
  }
  fillCircle(x, y, 13, s.color);
  ring(x, y, 13, WHITE, 2);
  ring(x, y, 13, INK, 1);
  drawText(String(s.n), x - 3, y - 7, 2, WHITE);
}

function drawPanel(x: number, y: number, w: number, h: number, s: Story, hero: boolean): void {
  fillRect(x, y, w, h, WHITE);
  rectOutline(x, y, w, h, INK, 2);
  fillRect(x, y, w, 7, s.color);
  fillCircle(x + 26, y + 32, 15, s.color);
  drawText(String(s.n), x + 20, y + 25, 2, WHITE);
  drawText(s.tag, x + 48, y + 25, 2, s.color);
  const ts = hero ? 3 : 2;
  const titleY = y + 52;
  const tw = w - 32 - (hero ? 90 : 64);
  const lines = wrapText(s.title, ts, tw);
  for (let i = 0; i < lines.length; i++) drawText(lines[i], x + 16, titleY + i * (ts === 3 ? 26 : 19), ts, INK);
  const bodyY = titleY + lines.length * (ts === 3 ? 26 : 19) + 8;
  drawBlock(s.body, x + 16, bodyY, 2, w - 32, INK2, 16);
  drawText(s.place, x + 16, y + h - 24, 2, GREY);
  drawIcon(s.icon, x + w - (hero ? 78 : 58), y + 14, hero ? 56 : 44);
}

function drawPage(): void {
  fillRect(0, 0, W, H, PAPER);
  rectOutline(6, 6, W - 12, H - 12, INK, 2);
  // Masthead
  drawTextCentered("SATURDAY, 21 NOVEMBER 2026", W / 2, 26, 2, RED);
  drawTextCentered("WORLD IN ONE FRAME", W / 2, 48, 6, INK);
  drawTextCentered("SEVEN STORIES THAT DEFINED THE DAY, FROM SHENZHEN TO LIMA", W / 2, 96, 2, INK2);
  hline(24, 118, W - 48, INK, 3);
  // Map
  drawText("WHERE IT HAPPENED", 24, 128, 2, INK);
  drawText("7 PINS, 7 STORIES", 760, 128, 2, RED);
  const mx = 24;
  const my = 146;
  const mw = W - 48;
  const mh = 140;
  fillRect(mx, my, mw, mh, PAPER2);
  rectOutline(mx, my, mw, mh, INK, 2);
  for (let px = mx + 7; px < mx + mw; px += 13) {
    for (let py = my + 7; py < my + mh; py += 13) {
      if (isLand((px - mx) / mw, (py - my) / mh)) fillCircle(px, py, 3, INK2);
    }
  }
  for (const s of STORIES) drawPin(mx, my, mw, mh, s);
  // Hero + grid: taller panels so four body lines fit without overflow
  drawPanel(24, 296, W - 48, 190, STORIES[0], true);
  const cw = Math.floor((W - 48 - 24) / 3);
  drawPanel(24, 496, cw, 190, STORIES[1], false);
  drawPanel(24 + cw + 12, 496, cw, 190, STORIES[2], false);
  drawPanel(24 + 2 * (cw + 12), 496, cw, 190, STORIES[3], false);
  drawPanel(24, 696, cw, 190, STORIES[4], false);
  drawPanel(24 + cw + 12, 696, cw, 190, STORIES[5], false);
  drawPanel(24 + 2 * (cw + 12), 696, cw, 190, STORIES[6], false);
  // Market ticker: two centred lines, nothing runs off the right edge
  fillRect(24, 896, W - 48, 52, INK);
  drawTextCentered("S+P -3.7%   NASDAQ -5.3%   DOW -1.9%   NVIDIA -14%   ANTHROPIC -8.5%", W / 2, 904, 2, WHITE);
  drawTextCentered("CHINA AI STOCKS -$1.7T   OIL SHIPMENTS -15%   COP31 IN OVERTIME   PERU M6.8", W / 2, 926, 2, GOLD);
  // Footer
  drawTextCentered("SOURCES: REUTERS, AP, BBC, AL JAZEERA, NPR - DRAWN IN CODE, NO PHOTOS", W / 2, 962, 2, INK2);
  drawTextCentered("THE WORLD IN ONE FRAME - 21 NOVEMBER 2026", W / 2, 988, 2, GREY);
}

function main(): void {
  drawPage();
  const outDir = process.env.MAKEFUN_OUTPUT_DIR || "/output";
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, "entry.png"), encodePNG());
}

main();
