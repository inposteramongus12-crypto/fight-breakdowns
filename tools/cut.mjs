// Вырезать фрагмент (с перекодированием: точно по кадрам, без «рваного» старта).
//   node tools/cut.mjs in.mp4 out.mp4 --from 12.3 --to 14.8 [--audio] [--fps 30]
// Время: секунды (12.5), «1:02.5» или «0:01:02.5». Звук по умолчанию убирается (озвучка заменит).
import {ff, parseArgs, parseTime, die, probe, say} from './lib/common.mjs';

const {pos, opt} = parseArgs(process.argv.slice(2), ['audio']);
if (pos.length < 2 || opt.from === undefined || opt.to === undefined) die('использование: node tools/cut.mjs in.mp4 out.mp4 --from 12.3 --to 14.8 [--audio] [--fps 30]');
const [inp, out] = pos;
const from = parseTime(opt.from);
const to = parseTime(opt.to);
if (!(to > from)) die(`--to (${to}) должно быть больше --from (${from})`);
const info = probe(inp);
if (from >= info.duration) die(`--from ${from} за концом файла (${info.duration.toFixed(2)} с)`);
const fps = Number(opt.fps) || 30;
const args = ['-ss', String(from), '-i', inp, '-t', String(to - from), '-vf', `fps=${fps}`, '-c:v', 'libx264', '-crf', '14', '-preset', 'fast', '-pix_fmt', 'yuv420p'];
args.push(...(opt.audio ? ['-c:a', 'aac', '-b:a', '160k'] : ['-an']));
ff([...args, out], {quiet: true});
const o = probe(out);
say(`вырезано ${from}–${to} с -> ${out}: ${o.width}×${o.height}, ${o.duration.toFixed(2)} с, ${o.frames} кадров`);
