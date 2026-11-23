// Листы для поиска момента: кадр раз в N с, ширина 320 px, подпись времени под кадром.
//   node tools/sheets.mjs clips/part1.mp4 --out work/sheets/part1 [--every 3] [--width 320] [--cols 4] [--rows 4]
// Время подписи — время внутри этого файла (с). Пишет sheet_01.jpg, sheet_02.jpg ... и index.txt.
import fs from 'node:fs';
import path from 'node:path';
import {ff, parseArgs, parseTime, die, probe, say, ROOT} from './lib/common.mjs';

const {pos, opt} = parseArgs(process.argv.slice(2));
if (!pos[0]) die('использование: node tools/sheets.mjs clip.mp4 --out work/sheets/part1 [--every 3] [--width 320] [--cols 4] [--rows 4]');
const info = probe(pos[0]);
const every = Number(opt.every ?? 3), width = Number(opt.width ?? 320);
const cols = Number(opt.cols ?? 4), rows = Number(opt.rows ?? 4), per = cols * rows;
const dir = path.resolve(opt.out ?? 'work/sheets');
fs.mkdirSync(dir, {recursive: true});
const font = path.join(ROOT, 'public/fonts/Rubik.ttf');
const times = [];
for (let t = 0; t < info.duration - 0.05; t += every) times.push(t);
const sheets = [];
for (let s = 0; s * per < times.length; s++) {
	const chunk = times.slice(s * per, (s + 1) * per);
	const files = chunk.map((t, i) => {
		const f = path.join(dir, `f_${String(i).padStart(3, '0')}.jpg`);
		const label = `${Math.floor(t / 60)}\\:${String(Math.round(t % 60)).padStart(2, '0')}  ${t.toFixed(1)} s`;
		const vf = `scale=${width}:-2,pad=iw:ih+26:0:0:black,drawtext=fontfile=${font}:text='${label}':fontcolor=white:fontsize=18:x=6:y=h-22`;
		ff(['-ss', t.toFixed(3), '-i', pos[0], '-frames:v', '1', '-vf', vf, '-q:v', '3', f], {quiet: true});
		return f;
	});
	const out = path.join(dir, `sheet_${String(s + 1).padStart(2, '0')}.jpg`);
	ff(['-framerate', '1', '-i', path.join(dir, 'f_%03d.jpg'), '-vf', `tile=${cols}x${rows}`, '-frames:v', '1', '-q:v', '3', out], {quiet: true});
	files.forEach((f) => fs.unlinkSync(f));
	sheets.push({out, from: chunk[0], to: chunk[chunk.length - 1]});
}
fs.writeFileSync(path.join(dir, 'index.txt'), sheets.map((x) => `${path.basename(x.out)}  ${x.from.toFixed(1)}–${x.to.toFixed(1)} с`).join('\n') + '\n');
say(`${times.length} кадров, ${sheets.length} листов в ${dir} (${info.width}×${info.height}, ${info.duration.toFixed(1)} с)`);
