// Сборка 9:16 (720×1280): видео полосой 720×900 по центру, сверху и снизу размытая тёмная копия того же видео.
//   node tools/vertical.mjs in.mp4 out.mp4 [--cx 0.5] [--cy 0.5] [--zoom 1] [--band 900] [--full] [--dim 0.2] [--blur 28]
//   --cx/--cy  куда сдвинуть кадрирование (0 — левый/верхний край исходника, 1 — правый/нижний)
//   --full     крупный план на весь кадр без полос (в референсах так идут punch-in клипы)
import {ff, parseArgs, die, probe, say, W, H, BAND_H} from './lib/common.mjs';

const {pos, opt} = parseArgs(process.argv.slice(2), ['full']);
if (pos.length < 2) die('использование: node tools/vertical.mjs in.mp4 out.mp4 [--cx 0.5] [--cy 0.5] [--zoom 1] [--band 900] [--full] [--dim 0.2] [--blur 28]');
const [inp, out] = pos;
const info = probe(inp);
const cx = Number(opt.cx ?? 0.5);
const cy = Number(opt.cy ?? 0.5);
const zoom = Number(opt.zoom ?? 1);
const band = opt.full ? H : Number(opt.band ?? BAND_H);
const dim = Number(opt.dim ?? 0.2);
const blur = Number(opt.blur ?? 28);
for (const [k, v] of Object.entries({cx, cy, zoom, band, dim, blur})) if (!Number.isFinite(v)) die(`--${k}: не число`);
if (cx < 0 || cx > 1 || cy < 0 || cy > 1) die('--cx и --cy должны быть от 0 до 1');
if (zoom < 1) die('--zoom не меньше 1');
const even = (n) => Math.round(n / 2) * 2;
// «cover»: масштаб, при котором видео целиком закрывает полосу
const sFg = Math.max(W / info.width, band / info.height) * zoom;
const fgW = even(info.width * sFg);
const fgH = even(info.height * sFg);
const sBg = Math.max(W / info.width, H / info.height);
const bgW = even(info.width * sBg);
const bgH = even(info.height * sBg);
const fg = `[fgsrc]scale=${fgW}:${fgH},crop=${W}:${band}:(iw-${W})*${cx}:(ih-${band})*${cy}[fg]`;
const bg = `[bgsrc]scale=${bgW}:${bgH},crop=${W}:${H}:(iw-${W})*${cx}:(ih-${H})*${cy},boxblur=${blur}:4,eq=brightness=-${dim}[bg]`;
const y = Math.round((H - band) / 2);
const filter = `[0:v]split[fgsrc][bgsrc];${fg};${bg};[bg][fg]overlay=0:${y},setsar=1[outv]`;
ff(['-i', inp, '-filter_complex', filter, '-map', '[outv]', '-c:v', 'libx264', '-crf', '16', '-preset', 'fast', '-pix_fmt', 'yuv420p', '-an', out], {quiet: true});
const o = probe(out);
if (o.width !== W || o.height !== H) die(`получилось ${o.width}×${o.height}, ожидалось ${W}×${H}`);
say(`9:16 готово: ${out} (${o.width}×${o.height}, ${o.duration.toFixed(2)} с); полоса ${W}×${band} по y=${y}${opt.full ? ' (full)' : ''}`);
