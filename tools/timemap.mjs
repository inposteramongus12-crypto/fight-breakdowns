// Перевод времени между исходником и замедленным клипом по карте из slowmo.mjs.
//   node tools/timemap.mjs out.timemap.json --src 1.53     -> время в замедленном клипе (момент контакта в исходнике)
//   node tools/timemap.mjs out.timemap.json --out 5.2      -> время в исходнике
import {parseArgs, readJson, die, parseTime} from './lib/common.mjs';

const {pos, opt} = parseArgs(process.argv.slice(2));
if (!pos[0] || (opt.src === undefined && opt.out === undefined)) die('использование: node tools/timemap.mjs file.timemap.json --src 1.53 | --out 5.2');
const map = readJson(pos[0]);
if (opt.src !== undefined) {
	const t = parseTime(opt.src);
	const p = map.find((x) => t >= x.src0 - 1e-9 && t <= x.src1 + 1e-9);
	if (!p) die(`время ${t} вне исходника`);
	console.log(((p.out0 + (t - p.src0) * p.factor)).toFixed(3));
} else {
	const t = parseTime(opt.out);
	const p = map.find((x) => t >= x.out0 - 1e-9 && t <= x.out1 + 1e-9);
	if (!p) die(`время ${t} вне результата`);
	console.log(((p.src0 + (t - p.out0) / p.factor)).toFixed(3));
}
