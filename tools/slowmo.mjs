// Замедление всего клипа или отрезков с интерполяцией кадров (как в референсах: смаз движения).
//   node tools/slowmo.mjs in.mp4 out.mp4 --factor 6
//   node tools/slowmo.mjs in.mp4 out.mp4 --segments "1.2-1.9:8,3.0-3.4:6"   (с-по:во сколько раз медленнее; остальное ×1)
//   --interp mci (по умолчанию, плавно, медленно) | blend | dup (дублирование кадров, быстро)
// Рядом пишется out.timemap.json: соответствие времени исходника и результата (см. tools/timemap.mjs).
import path from 'node:path';
import {ff, parseArgs, parseTime, die, probe, say, writeJson} from './lib/common.mjs';

const {pos, opt} = parseArgs(process.argv.slice(2));
if (pos.length < 2 || (!opt.factor && !opt.segments)) die('использование: node tools/slowmo.mjs in.mp4 out.mp4 --factor 6  |  --segments "1.2-1.9:8,3.0-3.4:6" [--interp mci|blend|dup]');
const [inp, out] = pos;
const info = probe(inp);
const interp = opt.interp ?? 'mci';
if (!['mci', 'blend', 'dup'].includes(interp)) die('--interp: mci, blend или dup');
const FPS = 30;

let segs = [];
if (opt.factor) segs = [{from: 0, to: info.duration, f: Number(opt.factor)}];
else
	segs = String(opt.segments)
		.split(',')
		.map((s) => {
			const m = s.trim().match(/^(.+?)-(.+?):([\d.]+)$/);
			if (!m) die('сегмент должен быть вида "1.2-1.9:8", а не "' + s + '"');
			return {from: parseTime(m[1]), to: parseTime(m[2]), f: Number(m[3])};
		})
		.sort((a, b) => a.from - b.from);
for (const s of segs) {
	if (!(s.f >= 1)) die('коэффициент замедления должен быть ≥ 1: ' + s.f);
	if (!(s.to > s.from)) die(`пустой отрезок ${s.from}-${s.to}`);
	if (s.to > info.duration + 0.01) die(`отрезок ${s.from}-${s.to} выходит за конец клипа (${info.duration.toFixed(2)} с)`);
}
for (let i = 1; i < segs.length; i++) if (segs[i].from < segs[i - 1].to) die('отрезки пересекаются');

// заполняем промежутки обычной скоростью
const pieces = [];
let cur = 0;
for (const s of segs) {
	if (s.from > cur + 1e-6) pieces.push({from: cur, to: s.from, f: 1});
	pieces.push(s);
	cur = s.to;
}
if (cur < info.duration - 1e-6) pieces.push({from: cur, to: info.duration, f: 1});

const interpF = {
	mci: `minterpolate=fps=${FPS}:mi_mode=mci:mc_mode=aobmc:me_mode=bidir:vsbmc=1`,
	blend: `minterpolate=fps=${FPS}:mi_mode=blend`,
	dup: `fps=${FPS}`,
};
const chains = pieces.map((p, i) => {
	const base = `[0:v]trim=start=${p.from}:end=${p.to},setpts=PTS-STARTPTS`;
	// minterpolate не достраивает хвост после последнего кадра: клонируем последний кадр и обрезаем точно до расчётной длины
	const slow = p.f > 1 ? `,tpad=stop=3:stop_mode=clone,setpts=${p.f}*PTS,${interpF[interp]},trim=duration=${((p.to - p.from) * p.f).toFixed(4)},setpts=PTS-STARTPTS` : `,fps=${FPS}`;
	return `${base}${slow},setsar=1[v${i}]`;
});
const filter = chains.join(';') + ';' + pieces.map((_, i) => `[v${i}]`).join('') + `concat=n=${pieces.length}:v=1:a=0[outv]`;
say(`${pieces.length} кусков, режим ${interp}`);
ff(['-i', inp, '-filter_complex', filter, '-map', '[outv]', '-c:v', 'libx264', '-crf', '14', '-preset', 'fast', '-pix_fmt', 'yuv420p', '-an', out], {quiet: true});

let o = 0;
const map = pieces.map((p) => {
	const len = (p.to - p.from) * p.f;
	const r = {src0: p.from, src1: p.to, out0: o, out1: o + len, factor: p.f};
	o += len;
	return r;
});
const res = probe(out);
writeJson(out.replace(/\.[^.]+$/, '') + '.timemap.json', map);
say(`готово: ${out}, ${res.duration.toFixed(2)} с (ожидалось ${o.toFixed(2)}); карта времени: ${path.basename(out).replace(/\.[^.]+$/, '')}.timemap.json`);
if (Math.abs(res.duration - o) > 0.2) say(`ВНИМАНИЕ: длительность отличается от расчётной на ${(res.duration - o).toFixed(2)} с`);
