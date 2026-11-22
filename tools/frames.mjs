// Покадровая раскладка для поиска кадра контакта (правило разбора: каждые 0,1–0,2 с, в полном размере).
//   node tools/frames.mjs clip.mp4 --from 1.0 --to 2.0 --every 0.1 --out work/frames [--crop x:y:w:h] [--grid 4 --tile 540]
// Пишет PNG t_<секунды>.png в полном размере (с --crop — вырезка для крупного плана) и, если задан --grid,
// контактный лист grid.jpg с таймкодами на каждой плитке.
import fs from 'node:fs';
import path from 'node:path';
import {ff, parseArgs, parseTime, die, probe, say, ROOT} from './lib/common.mjs';

const {pos, opt} = parseArgs(process.argv.slice(2));
if (!pos[0]) die('использование: node tools/frames.mjs clip.mp4 --from 1.0 --to 2.0 --every 0.1 --out work/frames [--crop x:y:w:h] [--grid 4 --tile 540]');
const info = probe(pos[0]);
const from = parseTime(opt.from ?? 0);
const to = Math.min(parseTime(opt.to ?? info.duration), info.duration);
const every = Number(opt.every ?? 0.2);
if (!(every >= 1 / info.fps - 1e-9)) die(`--every меньше длительности кадра (${(1 / info.fps).toFixed(3)} с)`);
if (!(to > from)) die('--to должно быть больше --from');
const dir = path.resolve(opt.out ?? 'work/frames');
fs.mkdirSync(dir, {recursive: true});
const n = Math.floor((to - from) / every + 1e-9) + 1;
let crop = '';
if (opt.crop) {
	const c = String(opt.crop).split(':').map(Number);
	if (c.length !== 4 || c.some((v) => !Number.isFinite(v) || v < 0) || c[2] < 2 || c[3] < 2) die('--crop: нужно x:y:w:h, например 600:200:800:500');
	if (c[0] + c[2] > info.width || c[1] + c[3] > info.height) die(`--crop выходит за кадр ${info.width}×${info.height}`);
	crop = `crop=${c[2]}:${c[3]}:${c[0]}:${c[1]},`; // ffmpeg ждёт w:h:x:y
}
const names = [];
for (let i = 0; i < n; i++) {
	const t = from + i * every;
	const f = path.join(dir, `t_${t.toFixed(2).padStart(6, '0')}.png`);
	ff(['-ss', t.toFixed(3), '-i', pos[0], '-frames:v', '1', '-vf', crop + 'null', f], {quiet: true});
	names.push({t, f});
}
say(`${n} кадров в ${dir} (${info.width}×${info.height}${opt.crop ? ', вырезка ' + opt.crop : ''})`);
if (opt.grid) {
	const cols = Number(opt.grid);
	const tile = Number(opt.tile ?? 540);
	const rows = Math.ceil(n / cols);
	const font = path.join(ROOT, 'public/fonts/Rubik.ttf');
	const inputs = names.flatMap((x) => ['-i', x.f]);
	const lab = names.map((x, i) => `[${i}:v]scale=${tile}:-2,drawtext=fontfile=${font}:text='${x.t.toFixed(2)}':x=8:y=8:fontsize=30:fontcolor=yellow:box=1:boxcolor=black@0.6[v${i}]`);
	// xstack с явной раскладкой: плитки одинаковой ширины; высоту берём у первой плитки
	const pos2 = names.map((_, i) => `${i % cols === 0 ? '0' : [...Array(i % cols).keys()].map((k) => 'w' + (i - (i % cols) + k)).join('+')}_${Math.floor(i / cols) === 0 ? '0' : [...Array(Math.floor(i / cols)).keys()].map((k) => 'h' + (k * cols)).join('+')}`).join('|');
	const filter = lab.join(';') + ';' + names.map((_, i) => `[v${i}]`).join('') + `xstack=inputs=${n}:layout=${pos2}[g]`;
	ff([...inputs, '-filter_complex', filter, '-map', '[g]', '-frames:v', '1', '-q:v', '3', path.join(dir, 'grid.jpg')], {quiet: true});
	say(`контактный лист: ${path.join(dir, 'grid.jpg')} (${cols}×${rows}, плитка ${tile} px)`);
}
