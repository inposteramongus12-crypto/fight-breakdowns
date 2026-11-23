// Сборка лонга 16:9 по главам: каждая глава — каталог-«выпуск» (timeline.json, script.ru.txt, schedule.json, voice/, annotations*.json),
// собирается build-short.mjs в профиле wide, затем главы склеиваются в один файл.
//   node tools/build-long.mjs episodes/003-long [--chapter 3|3,4] [--resume] [--keep] [--loudnorm] [--out out/003-long.mp4]
// episodes/003-long/long.json: {"title": "...", "chapters": [{"id": "ch01", "title": "Хук"}, ...]}
// --chapter собирает только перечисленные главы (номера по порядку в long.json) и склеивает их в out/<имя>-chN-M.mp4 (если глав больше одной).
// --concat-only: ничего не пересобирать, склеить готовые out/<имя>-chNN.mp4 (после пересборки отдельных глав).
// Время рендера по главам пишется в work/<имя>.timing.json.
// Склейка: видео копируется, звук склеивается и (с --loudnorm) нормализуется по EBU R128 (−16 LUFS); длительность склейки сверяется с суммой глав.
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {parseArgs, readJson, die, say, ROOT, ff, probe} from './lib/common.mjs';

const {pos, opt} = parseArgs(process.argv.slice(2), ['resume', 'keep', 'loudnorm', 'concat-only']);
if (!pos[0]) die('использование: node tools/build-long.mjs episodes/<имя> [--chapter N] [--resume] [--keep] [--loudnorm] [--out out/<имя>.mp4]');
const ep = path.resolve(pos[0]);
const name = path.basename(ep);
const cfgFile = path.join(ep, 'long.json');
if (!fs.existsSync(cfgFile)) die('нет ' + cfgFile);
const cfg = readJson(cfgFile);
if (!Array.isArray(cfg.chapters) || !cfg.chapters.length) die('в long.json нет chapters');
const only = opt.chapter ? String(opt.chapter).split(',').map(Number) : null;
const outDir = path.join(ROOT, 'out');
fs.mkdirSync(outDir, {recursive: true});
const files = [];
const timing = [];
cfg.chapters.forEach((ch, i) => {
	const n = i + 1;
	if (only && !only.includes(n)) return;
	const dir = path.join(ep, ch.id);
	const tlFile = path.join(dir, 'timeline.json');
	if (!fs.existsSync(tlFile)) die(`глава ${n} (${ch.id}): нет ${tlFile}`);
	const tl = readJson(tlFile);
	if (!tl.chapter) {
		tl.chapter = {n, total: cfg.chapters.length, title: ch.title};
		fs.writeFileSync(tlFile, JSON.stringify(tl, null, 1)); // метка главы берётся из long.json
	}
	const out = path.join(outDir, `${name}-${ch.id}.mp4`);
	if (opt['concat-only']) {
		if (!fs.existsSync(out)) die(`--concat-only: нет готовой главы ${out}`);
		files.push(out);
		return;
	}
	say(`глава ${n}/${cfg.chapters.length} «${ch.title}»`);
	const t0 = Date.now();
	const r = spawnSync(process.execPath, [path.join(ROOT, 'tools', 'build-short.mjs'), dir, '--profile', 'wide', '--out', out, ...(opt.resume ? ['--resume'] : []), ...(opt.keep ? ['--keep'] : [])], {cwd: ROOT, stdio: 'inherit', env: process.env});
	if (r.status !== 0) die(`глава ${n} (${ch.id}): build-short завершился с кодом ${r.status}`);
	const secs = (Date.now() - t0) / 1000;
	const dur = probe(out).duration;
	timing.push({n, id: ch.id, render_s: +secs.toFixed(1), video_s: +dur.toFixed(2), per_video_s: +(secs / dur).toFixed(2)});
	say(`глава ${n}: рендер ${secs.toFixed(0)} с на ${dur.toFixed(1)} с видео (${(secs / dur).toFixed(1)} с рендера на секунду видео)`);
	files.push(out);
});
if (only && files.length < 2) {
	say(`собрана глава ${only.join(', ')}; склейка не нужна (одна глава)`);
	process.exit(0);
}
const list = path.join(outDir, `${name}.chapters.txt`);
fs.writeFileSync(list, files.map((f) => `file '${f}'`).join('\n'));
const out = path.resolve(opt.out ?? path.join(outDir, only ? `${name}-ch${only.join('-')}.mp4` : name + '.mp4'));
const af = opt.loudnorm ? ['-af', 'loudnorm=I=-16:TP=-1.5:LRA=11'] : [];
ff(['-f', 'concat', '-safe', '0', '-i', list, '-c:v', 'copy', ...(opt.loudnorm ? ['-c:a', 'aac', '-b:a', '192k', ...af] : ['-c:a', 'copy']), out], {quiet: true});
const o = probe(out);
const sum = files.reduce((a, f) => a + probe(f).duration, 0);
say(`готово: ${out} (${o.width}×${o.height}, ${o.duration.toFixed(2)} с; сумма глав ${sum.toFixed(2)} с)`);
if (Math.abs(o.duration - sum) > 0.3) say('ВНИМАНИЕ: длительность склейки отличается от суммы глав');
if (o.width !== 1920 || o.height !== 1080) say(`ВНИМАНИЕ: кадр ${o.width}×${o.height}, ожидалось 1920×1080`);
fs.rmSync(list, {force: true});
fs.writeFileSync(path.join(ROOT, 'work', `${name}.timing.json`), JSON.stringify({chapters: timing, concat_s: undefined}, null, 1));
say('время рендера по главам: ' + JSON.stringify(timing));
