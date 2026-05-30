import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { readFile, unlink } from "node:fs/promises";
import { z } from "zod";
import { createCanvas, type SKRSContext2D } from "@napi-rs/canvas";

export const ReplayPointSchema = z.object({
  lat: z.number(),
  lng: z.number(),
  speedRatio: z.number().min(0).max(1).optional(),
});

export const ReplayStatSchema = z.object({
  label: z.string().max(24),
  value: z.number(),
  decimals: z.number().int().min(0).max(2).optional(),
  suffix: z.string().max(8).optional(),
  isTime: z.boolean().optional(),
});

export const ReplayRenderInputSchema = z.object({
  title: z.string().max(48).optional(),
  subtitle: z.string().max(64).optional(),
  handle: z.string().max(64).optional(),
  watermark: z.boolean().optional(),
  stats: z.array(ReplayStatSchema).max(4),
  route: z.array(ReplayPointSchema).min(2).max(2000),
});

export type ReplayRenderInput = z.infer<typeof ReplayRenderInputSchema>;

const WIDTH = 1080;
const HEIGHT = 1920;
const FPS = 30;
const INTRO_S = 0.4;
const MAIN_S = 4.6;
const OUTRO_S = 1.1;
const TOTAL_FRAMES = Math.round((INTRO_S + MAIN_S + OUTRO_S) * FPS);
const RENDER_TIMEOUT_MS = 60_000;

const ACCENT = "#FF2D2D";
const BG_TOP = "#161616";
const BG_BOTTOM = "#000000";

const ROUTE_TOP = 360;
const ROUTE_BOTTOM = 1200;
const ROUTE_PAD_X = 130;

function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}
function easeOut(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}
function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}
function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function speedColor(r: number): string {
  const c = clamp01(r);
  let cr: number, cg: number, cb: number;
  if (c < 0.5) {
    const t = c / 0.5;
    cr = lerp(0, 255, t);
    cg = lerp(230, 214, t);
    cb = lerp(118, 0, t);
  } else {
    const t = (c - 0.5) / 0.5;
    cr = lerp(255, 255, t);
    cg = lerp(214, 23, t);
    cb = lerp(0, 68, t);
  }
  return `rgb(${Math.round(cr)}, ${Math.round(cg)}, ${Math.round(cb)})`;
}

interface ProjectedPoint {
  x: number;
  y: number;
  r: number;
}

function projectRoute(route: ReplayRenderInput["route"]): ProjectedPoint[] {
  const lats = route.map((p) => p.lat);
  const lngs = route.map((p) => p.lng);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);

  const drawW = WIDTH - ROUTE_PAD_X * 2;
  const drawH = ROUTE_BOTTOM - ROUTE_TOP;
  const latRange = maxLat - minLat || 0.0001;
  const lngRange = maxLng - minLng || 0.0001;
  const latLngAspect = latRange / lngRange;
  const drawAspect = drawH / drawW;

  let scaleX: number;
  let scaleY: number;
  let offsetX = ROUTE_PAD_X;
  let offsetY = ROUTE_TOP;
  if (latLngAspect > drawAspect) {
    scaleY = drawH / latRange;
    scaleX = scaleY;
    offsetX = ROUTE_PAD_X + (drawW - lngRange * scaleX) / 2;
  } else {
    scaleX = drawW / lngRange;
    scaleY = scaleX;
    offsetY = ROUTE_TOP + (drawH - latRange * scaleY) / 2;
  }

  return route.map((p) => ({
    x: offsetX + (p.lng - minLng) * scaleX,
    y: offsetY + (maxLat - p.lat) * scaleY,
    r: clamp01(p.speedRatio ?? 0.4),
  }));
}

function cumulativeLengths(pts: ProjectedPoint[]): { cum: number[]; total: number } {
  const cum: number[] = [0];
  let total = 0;
  for (let i = 1; i < pts.length; i++) {
    const dx = pts[i].x - pts[i - 1].x;
    const dy = pts[i].y - pts[i - 1].y;
    total += Math.sqrt(dx * dx + dy * dy);
    cum.push(total);
  }
  return { cum, total };
}

function pointAtLength(
  pts: ProjectedPoint[],
  cum: number[],
  target: number,
): { x: number; y: number; r: number } {
  if (target <= 0) return pts[0];
  const total = cum[cum.length - 1];
  if (target >= total) return pts[pts.length - 1];
  let i = 1;
  while (i < cum.length && cum[i] < target) i++;
  const segLen = cum[i] - cum[i - 1] || 1;
  const t = (target - cum[i - 1]) / segLen;
  return {
    x: lerp(pts[i - 1].x, pts[i].x, t),
    y: lerp(pts[i - 1].y, pts[i].y, t),
    r: lerp(pts[i - 1].r, pts[i].r, t),
  };
}

function drawBackground(ctx: SKRSContext2D) {
  const g = ctx.createLinearGradient(0, 0, 0, HEIGHT);
  g.addColorStop(0, BG_TOP);
  g.addColorStop(1, BG_BOTTOM);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  const rg = ctx.createRadialGradient(WIDTH / 2, 760, 120, WIDTH / 2, 760, 900);
  rg.addColorStop(0, "rgba(255, 45, 45, 0.10)");
  rg.addColorStop(1, "rgba(255, 45, 45, 0)");
  ctx.fillStyle = rg;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
}

function drawHeader(ctx: SKRSContext2D) {
  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = "700 64px 'DejaVu Sans'";
  const text = "REDLINE";
  const metrics = ctx.measureText(text);
  const dotX = WIDTH / 2 - metrics.width / 2 - 34;
  ctx.fillStyle = ACCENT;
  ctx.beginPath();
  ctx.arc(dotX, 150, 13, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#FFFFFF";
  ctx.fillText(text, WIDTH / 2 + 6, 150);
  ctx.restore();
}

function drawRoute(ctx: SKRSContext2D, pts: ProjectedPoint[], cum: number[], total: number, progress: number) {
  const target = total * progress;

  ctx.save();
  ctx.lineJoin = "round";
  ctx.lineCap = "round";

  // glow base
  ctx.shadowColor = ACCENT;
  ctx.shadowBlur = 34;
  ctx.strokeStyle = "rgba(255, 45, 45, 0.28)";
  ctx.lineWidth = 26;
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) {
    if (cum[i] <= target) {
      ctx.lineTo(pts[i].x, pts[i].y);
    } else {
      const p = pointAtLength(pts, cum, target);
      ctx.lineTo(p.x, p.y);
      break;
    }
  }
  ctx.stroke();
  ctx.shadowBlur = 0;

  // colored segments
  ctx.lineWidth = 11;
  for (let i = 1; i < pts.length; i++) {
    if (cum[i - 1] >= target) break;
    const a = pts[i - 1];
    let b = pts[i];
    if (cum[i] > target) {
      const p = pointAtLength(pts, cum, target);
      b = { x: p.x, y: p.y, r: p.r };
    }
    ctx.strokeStyle = speedColor((a.r + b.r) / 2);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }

  // start dot
  ctx.fillStyle = "#FFFFFF";
  ctx.beginPath();
  ctx.arc(pts[0].x, pts[0].y, 9, 0, Math.PI * 2);
  ctx.fill();

  // moving marker
  const head = pointAtLength(pts, cum, target);
  ctx.shadowColor = ACCENT;
  ctx.shadowBlur = 28;
  ctx.fillStyle = ACCENT;
  ctx.beginPath();
  ctx.arc(head.x, head.y, 20, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.fillStyle = "#FFFFFF";
  ctx.beginPath();
  ctx.arc(head.x, head.y, 9, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function formatStat(stat: z.infer<typeof ReplayStatSchema>, cp: number): string {
  const v = stat.value * cp;
  if (stat.isTime) {
    const total = Math.round(v);
    const m = Math.floor(total / 60);
    const s = total % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  }
  return v.toFixed(stat.decimals ?? 0);
}

function roundRectPath(ctx: SKRSContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function drawStats(ctx: SKRSContext2D, stats: ReplayRenderInput["stats"], counterProgress: number) {
  const n = stats.length;
  if (n === 0) return;

  // Grid: 1 stat -> 1 col, 2 -> 2, 3 -> 3 in one row, 4 -> 2x2.
  const cols = n >= 4 ? 2 : n;
  const rows = Math.ceil(n / cols);
  const sideMargin = 64;
  const gap = 22;
  const cardH = rows === 1 ? 236 : 210;
  const gridTop = rows === 1 ? 1330 : 1280;
  const labelY = rows === 1 ? 88 : 80;
  const valueBaseline = rows === 1 ? 200 : 176;
  const usableW = WIDTH - sideMargin * 2;
  const cardW = (usableW - gap * (cols - 1)) / cols;

  ctx.save();
  stats.forEach((stat, i) => {
    const row = Math.floor(i / cols);
    const colInRow = i - row * cols;
    const itemsInRow = Math.min(cols, n - row * cols);
    const rowW = itemsInRow * cardW + (itemsInRow - 1) * gap;
    const rowStartX = (WIDTH - rowW) / 2; // center an incomplete last row
    const x = rowStartX + colInRow * (cardW + gap);
    const y = gridTop + row * (cardH + gap);
    const cx = x + cardW / 2;

    // Glass card
    roundRectPath(ctx, x, y, cardW, cardH, 30);
    ctx.fillStyle = "rgba(255,255,255,0.05)";
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = "rgba(255,255,255,0.09)";
    ctx.stroke();

    // Accent tick centered at top of the card
    roundRectPath(ctx, cx - 26, y + 28, 52, 6, 3);
    ctx.fillStyle = ACCENT;
    ctx.fill();

    // Label
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = "rgba(255,255,255,0.55)";
    ctx.font = "600 30px 'DejaVu Sans'";
    ctx.fillText(stat.label.toUpperCase(), cx, y + labelY);

    // Value (+ optional accent suffix), centered as a group and auto-fit to width
    const valueText = formatStat(stat, counterProgress);
    const suffix = stat.suffix ?? "";
    const maxW = cardW - 56;
    const measure = (vf: number) => {
      ctx.font = `700 ${vf}px 'DejaVu Sans'`;
      const vw = ctx.measureText(valueText).width;
      let sw = 0;
      if (suffix) {
        ctx.font = `700 ${Math.round(vf * 0.4)}px 'DejaVu Sans'`;
        sw = ctx.measureText(suffix).width;
      }
      return { vw, sw, gapW: suffix ? 12 : 0 };
    };

    let valueFont = rows === 1 ? 100 : 76;
    let m = measure(valueFont);
    let total = m.vw + m.gapW + m.sw;
    if (total > maxW) {
      valueFont = Math.floor(valueFont * (maxW / total));
      m = measure(valueFont);
      total = m.vw + m.gapW + m.sw;
    }

    const baseY = y + valueBaseline;
    const startX = cx - total / 2;
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = "#FFFFFF";
    ctx.font = `700 ${valueFont}px 'DejaVu Sans'`;
    ctx.fillText(valueText, startX, baseY);
    if (suffix) {
      ctx.fillStyle = ACCENT;
      ctx.font = `700 ${Math.round(valueFont * 0.4)}px 'DejaVu Sans'`;
      ctx.fillText(suffix, startX + m.vw + m.gapW, baseY);
    }
  });
  ctx.restore();
}

function drawFooter(ctx: SKRSContext2D, input: ReplayRenderInput) {
  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  if (input.title) {
    ctx.fillStyle = "#FFFFFF";
    ctx.font = "700 42px 'DejaVu Sans'";
    ctx.fillText(input.title, WIDTH / 2, 260);
  }
  let fy = 1770;
  if (input.subtitle) {
    ctx.fillStyle = "rgba(255,255,255,0.7)";
    ctx.font = "400 28px 'DejaVu Sans'";
    ctx.fillText(input.subtitle, WIDTH / 2, fy);
    fy += 42;
  }
  if (input.handle) {
    ctx.fillStyle = "rgba(255,255,255,0.7)";
    ctx.font = "400 28px 'DejaVu Sans'";
    ctx.fillText(input.handle, WIDTH / 2, fy);
  }
  ctx.restore();
}

function drawWatermark(ctx: SKRSContext2D) {
  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "rgba(255,255,255,0.42)";
  ctx.font = "700 32px 'DejaVu Sans'";
  ctx.fillText("MADE WITH REDLINE", WIDTH / 2, 1870);
  ctx.restore();
}

export async function renderReplayVideo(input: ReplayRenderInput): Promise<Buffer> {
  const pts = projectRoute(input.route);
  const { cum, total } = cumulativeLengths(pts);

  const canvas = createCanvas(WIDTH, HEIGHT);
  const ctx = canvas.getContext("2d");

  const outPath = join(tmpdir(), `replay-${randomBytes(8).toString("hex")}.mp4`);

  const ff = spawn("ffmpeg", [
    "-y",
    "-f", "rawvideo",
    "-pixel_format", "rgba",
    "-video_size", `${WIDTH}x${HEIGHT}`,
    "-framerate", String(FPS),
    "-i", "pipe:0",
    "-an",
    "-c:v", "libx264",
    "-pix_fmt", "yuv420p",
    "-preset", "veryfast",
    "-movflags", "+faststart",
    outPath,
  ]);

  let ffErr = "";
  ff.stderr.on("data", (d) => {
    ffErr += d.toString();
    if (ffErr.length > 8000) ffErr = ffErr.slice(-8000);
  });

  let exited = false;
  const ffDone = new Promise<void>((resolve, reject) => {
    ff.on("error", (err) => {
      exited = true;
      reject(err);
    });
    ff.on("close", (code) => {
      exited = true;
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exited ${code}: ${ffErr.slice(-1200)}`));
    });
  });

  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error("ffmpeg render timed out"));
    }, RENDER_TIMEOUT_MS);
  });

  const writeFrame = (buf: Buffer): Promise<void> =>
    new Promise((resolve, reject) => {
      const ok = ff.stdin.write(buf, (err) => {
        if (err) reject(err);
      });
      if (ok) resolve();
      else ff.stdin.once("drain", resolve);
    });

  try {
    for (let f = 0; f < TOTAL_FRAMES; f++) {
      if (exited) break;
      const t = f / FPS;
      const progress = easeInOut(clamp01((t - INTRO_S) / MAIN_S));
      const counterProgress = easeOut(clamp01((t - INTRO_S) / (MAIN_S * 0.85)));

      drawBackground(ctx);
      drawHeader(ctx);
      drawFooter(ctx, input);
      drawRoute(ctx, pts, cum, total, progress);
      drawStats(ctx, input.stats, counterProgress);
      if (input.watermark) drawWatermark(ctx);

      const frame = Buffer.from(ctx.getImageData(0, 0, WIDTH, HEIGHT).data.buffer);
      await Promise.race([writeFrame(frame), timeout]);
    }
    ff.stdin.end();
    await Promise.race([ffDone, timeout]);
    return await readFile(outPath);
  } finally {
    if (timer) clearTimeout(timer);
    if (!exited) {
      try {
        ff.stdin.destroy();
      } catch {
        /* noop */
      }
      ff.kill("SIGKILL");
    }
    await unlink(outPath).catch(() => {});
  }
}
