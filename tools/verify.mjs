// Проверка разметки по кадрам: для каждого элемента annotations.json берёт кадр готового клипа
// в момент, когда элемент уже полностью показан, сравнивает его с кадром исходного клипа без накладок
// и проверяет, что изменившиеся пиксели есть там, где элемент должен быть (остриё стрелки, края рамки, отметка).
// Это автоматическая сверка «нарисовано там, где написано в json». Что стрелка попала именно в момент
// и точку контакта удара, она НЕ проверяет: это смотрится глазами по сохранённым кадрам.
//   node tools/verify.mjs source_clip.mp4 annotated_clip.mp4 annotations.json [--out work/verify] [--times id=1.2,id2=0.8]
// Сохраняет work/verify/<id>_t<время>.png (вырезка вокруг элемента, увеличена) и full_t<время>.png.
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {ffbin, ff, parseArgs, readJson, die, probe, say} from './lib/common.mjs';

const {pos, opt} = parseArgs(process.argv.slice(2));
if (pos.length < 3) die('использование: node tools/verify.mjs source.mp4 annotated.mp4 annotations.json [--out work/verify] [--times id=1.2,...]');
const [srcFile, annFile, jsonFile] = pos;
const info = probe(srcFile);
const info2 = probe(annFile);
if (info.width !== info2.width || info.height !== info2.height) die('размеры исходника и размеченного клипа различаются');
const {width: W, height: H} = info;
const outDir = path.resolve(opt.out ?? 'work/verify');
fs.mkdirSync(outDir, {recursive: true});
const raw = readJson(jsonFile);
const items = Array.isArray(raw) ? raw : raw.items;
const override = Object.fromEntries(String(opt.times ?? '').split(',').filter(Boolean).map((s) => s.split('=')).map(([k, v]) => [k, Number(v)]));

const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const lerp = (a, b, k) => a + (b - a) * k;
const easeOut = (k) => 1 - Math.pow(1 - clamp(k), 3);
const easeInOut = (k) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);
const keyAt = (track, t) => {
	const s = [...track].sort((a, b) => a.t - b.t);
	if (t <= s[0].t) return [s[0].x, s[0].y];
	if (t >= s.at(-1).t) return [s.at(-1).x, s.at(-1).y];
	for (let i = 0; i < s.length - 1; i++) if (t >= s[i].t && t <= s[i + 1].t) {
		const k = (t - s[i].t) / (s[i + 1].t - s[i].t);
		return [lerp(s[i].x, s[i + 1].x, k), lerp(s[i].y, s[i + 1].y, k)];
	}
};
const frame = (file, t) => {
	const r = spawnSync(ffbin(), ['-v', 'error', '-ss', t.toFixed(3), '-i', file, '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], {maxBuffer: 1 << 28});
	if (r.status !== 0 || r.stdout.length < W * H * 3) die(`не удалось взять кадр ${file} @${t}`);
	return r.stdout;
};
const changedNear = (a, b, [px, py], rad) => {
	let n = 0;
	for (let y = Math.max(0, Math.floor(py - rad)); y < Math.min(H, Math.ceil(py + rad)); y++)
		for (let x = Math.max(0, Math.floor(px - rad)); x < Math.min(W, Math.ceil(px + rad)); x++) {
			if ((x - px) ** 2 + (y - py) ** 2 > rad * rad) continue;
			const i = (y * W + x) * 3;
			if (Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]) > 60) n++;
		}
	return n;
};

let bad = 0;
const times = new Set();
items.forEach((it, n) => {
	const id = it.id ?? `${it.type}${n}`;
	const t1 = it.t1 ?? it.t0 + (it.type === 'mark' ? 0.6 : 1);
	let t = override[id] ?? Math.min(it.t0 + (it.type === 'arrow' ? (it.grow ?? 0.25) + 0.1 : 0.3), t1 - 0.05);
	t = Math.max(it.t0 + 0.02, Math.min(t, info.duration - 0.05));
	times.add(t.toFixed(2));
	// ожидаемые точки, в которых должны быть изменения, и радиус
	let probes = [];
	let box = [0, 0, W, H];
	if (it.type === 'arrow') {
		const grow = it.grow ?? 0.25;
		const tip = it.track ? keyAt(it.track, t) : [lerp(it.from[0], it.to[0], easeOut((t - it.t0) / grow)), lerp(it.from[1], it.to[1], easeOut((t - it.t0) / grow))];
		probes = [tip, it.from];
		box = [Math.min(tip[0], it.from[0]), Math.min(tip[1], it.from[1]), Math.max(tip[0], it.from[0]), Math.max(tip[1], it.from[1])];
	} else if (it.type === 'box') {
		const c = it.track ? keyAt(it.track, t) : it.cx !== undefined ? [it.cx, it.cy] : [it.x + it.w / 2, it.y + it.h / 2];
		probes = [[c[0] - it.w / 2, c[1]], [c[0] + it.w / 2, c[1]], [c[0], c[1] - it.h / 2], [c[0], c[1] + it.h / 2]];
		box = [c[0] - it.w / 2, c[1] - it.h / 2, c[0] + it.w / 2, c[1] + it.h / 2];
	} else if (it.type === 'mark') {
		probes = [[it.x, it.y]];
		box = [it.x - (it.w ?? it.size ?? 70), it.y - (it.h ?? it.size ?? 70), it.x + (it.w ?? it.size ?? 70), it.y + (it.h ?? it.size ?? 70)];
	} else if (it.type === 'limb') {
		probes = [it.from, it.to, [(it.from[0] + it.to[0]) / 2, (it.from[1] + it.to[1]) / 2]];
		box = [Math.min(it.from[0], it.to[0]), Math.min(it.from[1], it.to[1]), Math.max(it.from[0], it.to[0]), Math.max(it.from[1], it.to[1])];
	} else if (it.type === 'icon') {
		probes = [it.at, it.box];
		box = [Math.min(it.at[0], it.box[0]), Math.min(it.at[1], it.box[1]), Math.max(it.at[0], it.box[0]), Math.max(it.at[1], it.box[1])];
	} else {
		probes = [[it.x, it.y]];
		box = [it.x - 200, it.y - 60, it.x + 200, it.y + 20];
	}
	const a = frame(srcFile, t);
	const b = frame(annFile, t);
	const res = probes.map((p) => changedNear(a, b, p, it.type === 'limb' ? 25 : 30));
	const ok = res.every((r) => r >= 6);
	if (!ok) bad++;
	// вырезка вокруг элемента, увеличена до ширины ≥ 900
	const m = 90;
	const cx0 = Math.max(0, Math.floor(box[0] - m));
	const cy0 = Math.max(0, Math.floor(box[1] - m));
	const cw = Math.min(W - cx0, Math.ceil(box[2] - box[0] + 2 * m));
	const ch = Math.min(H - cy0, Math.ceil(box[3] - box[1] + 2 * m));
	const file = path.join(outDir, `${id}_t${t.toFixed(2)}.png`);
	ff(['-ss', t.toFixed(3), '-i', annFile, '-frames:v', '1', '-vf', `crop=${cw - (cw % 2)}:${ch - (ch % 2)}:${cx0}:${cy0},scale='min(1000,iw*3)':-2:flags=neighbor`, file], {quiet: true});
	say(`${ok ? 'OK ' : 'НЕТ'} ${id} (${it.type}) @${t.toFixed(2)}с: изменённых пикселей у контрольных точек ${res.join('/')} -> ${path.relative(process.cwd(), file)}`);
});
for (const t of times) ff(['-ss', t, '-i', annFile, '-frames:v', '1', path.join(outDir, `full_t${t}.png`)], {quiet: true});
say(bad ? `ПРОБЛЕМ: ${bad} из ${items.length}. Исправьте annotations.json, перерисуйте и проверьте снова.` : `автоматическая сверка пройдена: ${items.length} из ${items.length}. Теперь посмотрите кадры в ${path.relative(process.cwd(), outDir)} глазами.`);
process.exit(bad ? 2 : 0);
