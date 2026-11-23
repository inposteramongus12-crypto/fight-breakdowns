// Сборка 16:9 (по умолчанию 1920×1080) для лонга: клип масштабируется «cover» (lanczos), без размытого фона.
//   node tools/wide.mjs in.mp4 out.mp4 [--w 1920] [--h 1080] [--zoom 1] [--cx 0.5] [--cy 0.5]
//   --zoom/--cx/--cy: крупнее и сдвиг кадрирования (как в vertical.mjs, 0 — левый/верхний край исходника)
// Исходник не 16:9 (например 9:16) обрезается по «cover»; лишнее не дополняется полосами.
import {ff, parseArgs, die, probe, say, profileOf} from './lib/common.mjs';

const {pos, opt} = parseArgs(process.argv.slice(2));
if (pos.length < 2) die('использование: node tools/wide.mjs in.mp4 out.mp4 [--w 1920] [--h 1080] [--zoom 1] [--cx 0.5] [--cy 0.5]');
const [inp, out] = pos;
const p = profileOf('wide');
const W = Number(opt.w ?? p.w), H = Number(opt.h ?? p.h);
const zoom = Number(opt.zoom ?? 1), cx = Number(opt.cx ?? 0.5), cy = Number(opt.cy ?? 0.5);
for (const [k, v] of Object.entries({W, H, zoom, cx, cy})) if (!Number.isFinite(v)) die(`--${k.toLowerCase()}: не число`);
if (zoom < 1) die('--zoom не меньше 1');
if (cx < 0 || cx > 1 || cy < 0 || cy > 1) die('--cx и --cy должны быть от 0 до 1');
const info = probe(inp);
const even = (n) => Math.round(n / 2) * 2;
const s = Math.max(W / info.width, H / info.height) * zoom;
const fw = even(info.width * s), fh = even(info.height * s);
const vf = `scale=${fw}:${fh}:flags=lanczos,crop=${W}:${H}:(iw-${W})*${cx}:(ih-${H})*${cy},setsar=1`;
ff(['-i', inp, '-vf', vf, '-c:v', 'libx264', '-crf', '16', '-preset', 'fast', '-pix_fmt', 'yuv420p', '-an', out], {quiet: true});
const o = probe(out);
if (o.width !== W || o.height !== H) die(`получилось ${o.width}×${o.height}, ожидалось ${W}×${H}`);
say(`16:9 готово: ${out} (${o.width}×${o.height}, ${o.duration.toFixed(2)} с)`);
