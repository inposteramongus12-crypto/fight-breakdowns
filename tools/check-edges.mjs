// Проверки 16:9 по готовым сегментам и главе: (1) отступ накладок (плашки, метка главы) от края кадра ≥ 60 px,
// (2) чёрные кадры на стыках сегментов и в главе.
//   node tools/check-edges.mjs work/short/<имя>/ [--chapter out/<имя>.mp4] [--margin 60] [--step 0.5]
// Для каждого сегмента с wide.mp4 и ann.mp4 сравнивает кадры с накладкой и без неё (раз в --step секунд) и берёт
// границы изменённых пикселей (одиночные пиксели без соседей отбрасываются как шум сжатия); изменения ближе --margin к краю считаются нарушением. Центральные рамки и стрелки на этот отступ
// не проверяются, если они дальше от края; ближе — тоже попадут в отчёт (это нужно знать). Код выхода 2 при нарушении.
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {parseArgs, die, say, probe, ffbin} from './lib/common.mjs';

const {pos, opt} = parseArgs(process.argv.slice(2));
if (!pos[0]) die('использование: node tools/check-edges.mjs work/short/<имя>/ [--chapter out/<имя>.mp4] [--margin 60] [--step 0.5]');
const margin = Number(opt.margin ?? 60), step = Number(opt.step ?? 0.5);
const W = 1920, H = 1080, FS = W * H * 3;
const raw = (file, fps) => spawnSync(ffbin(), ['-v', 'error', '-i', file, '-vf', `fps=${fps}`, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], {maxBuffer: 1 << 30}).stdout;
let bad = 0;
const root = path.resolve(pos[0]);
for (const d of fs.readdirSync(root).sort()) {
	const wv = path.join(root, d, 'wide.mp4'), an = path.join(root, d, 'ann.mp4');
	if (!fs.existsSync(wv) || !fs.existsSync(an)) continue;
	const a = raw(wv, 1 / step), b = raw(an, 1 / step);
	const n = Math.min(Math.floor(a.length / FS), Math.floor(b.length / FS));
	let minL = Infinity, minR = Infinity, minT = Infinity, minB = Infinity, any = 0;
	const mask = new Uint8Array(W * H);
	for (let k = 0; k < n; k++) {
		const o = k * FS;
		for (let p = 0; p < W * H; p++) {
			const i = o + p * 3;
			mask[p] = Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]) > 60 ? 1 : 0;
		}
		// одиночные пиксели (шум сжатия) не считаются накладкой: нужен сосед справа и снизу
		for (let y = 0; y < H - 1; y++) for (let x = 0; x < W - 1; x++) {
			const p = y * W + x;
			if (mask[p] && mask[p + 1] && mask[p + W]) {
				any++;
				if (x < minL) minL = x; if (W - 1 - x < minR) minR = W - 1 - x; if (y < minT) minT = y; if (H - 1 - y < minB) minB = H - 1 - y;
			}
		}
	}
	if (!any) { say(`сегмент ${d}: накладок не найдено на ${n} кадрах`); continue; }
	const m = Math.min(minL, minR, minT, minB);
	const ok = m >= margin;
	if (!ok) bad++;
	say(`${ok ? 'OK ' : 'БЛИЗКО'} сегмент ${d}: до края слева ${minL}, справа ${minR}, сверху ${minT}, снизу ${minB} px (минимум ${m}, нужно ≥ ${margin}), кадров ${n}`);
}
if (opt.chapter) {
	const r = spawnSync(ffbin(), ['-hide_banner', '-i', path.resolve(opt.chapter), '-vf', 'blackdetect=d=0.05:pix_th=0.10', '-an', '-f', 'null', '-'], {encoding: 'utf8'});
	const m = [...(r.stderr ?? '').matchAll(/black_start:([\d.]+) black_end:([\d.]+) black_duration:([\d.]+)/g)];
	if (m.length) { bad++; say(`ЧЁРНЫЕ КАДРЫ в ${opt.chapter}: ` + m.map((x) => `${x[1]}–${x[2]} с`).join(', ')); }
	else say(`OK  чёрных кадров нет (blackdetect d=0,05 с) в ${opt.chapter} (${probe(path.resolve(opt.chapter)).duration.toFixed(2)} с)`);
}
process.exit(bad ? 2 : 0);
