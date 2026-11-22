// Сборка шорта 9:16 из episodes/<имя>/timeline.json: cut → slowmo → annotate → vertical по сегментам,
// склейка, субтитры по одному слову, звук озвучки. Запускать после voice.mjs (нужны voice/voice.mp3 и words.json).
//   node tools/build-short.mjs episodes/garcia-benn [--out out/garcia-benn.mp4] [--keep]
// timeline.json: {clip, voice:{starts:[...], total}, segments:[{id, from, to, factor, cx, cy, zoom, full, annotations: "annotations.json" (необязательно)}]}
// Времена в annotations.json — секунды ИСХОДНОГО клипа; сегмент переводит их во время замедленного сегмента сам ((t−from)·factor).
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {parseArgs, readJson, writeJson, die, say, ROOT, ff, probe} from './lib/common.mjs';

const {pos, opt} = parseArgs(process.argv.slice(2), ['keep', 'resume']);
if (!pos[0]) die('использование: node tools/build-short.mjs episodes/<имя> [--out out/<имя>.mp4]');
const ep = path.resolve(pos[0]);
const name = path.basename(ep);
const tl = readJson(path.join(ep, 'timeline.json'));
const work = path.join(ROOT, 'work', 'short', name);
fs.mkdirSync(work, {recursive: true});
const out = path.resolve(opt.out ?? path.join('out', name + '.mp4'));
fs.mkdirSync(path.dirname(out), {recursive: true});
const run = (script, args) => {
	const r = spawnSync(process.execPath, [path.join(ROOT, 'tools', script), ...args.map(String)], {cwd: ROOT, encoding: 'utf8', env: process.env});
	if (r.status !== 0) die(`${script} ${args.slice(0, 3).join(' ')}…: ${(r.stdout + r.stderr).slice(-800)}`);
	return r.stdout;
};

// клип/сегменты
const clip = path.resolve(ROOT, tl.clip);
let totalExpected = 0;
const finals = [];
for (const s of tl.segments) {
	const d = path.join(work, s.id);
	fs.mkdirSync(d, {recursive: true});
	const dur0 = (s.to - s.from) * s.factor;
	if (opt.resume && fs.existsSync(path.join(d, 'vert.mp4'))) {
		finals.push(path.join(d, 'vert.mp4'));
		totalExpected += dur0;
		say(`сегмент ${s.id}: взят готовый (--resume)`);
		continue;
	}
	const cut = path.join(d, 'cut.mp4');
	run('cut.mjs', [clip, cut, '--from', s.from, '--to', s.to]);
	let cur = cut;
	if (s.factor > 1) {
		cur = path.join(d, 'slow.mp4');
		run('slowmo.mjs', [cut, cur, '--factor', s.factor, '--interp', s.interp ?? 'mci']);
	}
	const dur = (s.to - s.from) * s.factor;
	totalExpected += dur;
	if (s.annotations) {
		const raw = readJson(path.join(ep, s.annotations));
		const conv = (t) => (t - s.from) * s.factor;
		const items = [];
		for (const it of raw.items ?? raw) {
			const t1 = it.t1 ?? it.t0 + 1;
			if (t1 <= s.from || it.t0 >= s.to) continue;
			const o = {...it, t0: Math.max(0, conv(Math.max(it.t0, s.from))), t1: Math.min(dur, conv(Math.min(t1, s.to)))};
			if (o.t1 - o.t0 < 0.05) continue;
			if (it.track) o.track = it.track.map((k) => ({...k, t: conv(k.t)}));
			items.push(o);
		}
		const annJson = path.join(d, 'annotations.json');
		writeJson(annJson, {items});
		const ann = path.join(d, 'ann.mp4');
		run('annotate.mjs', [cur, annJson, ann]);
		cur = ann;
	}
	const vert = path.join(d, 'vert.mp4');
	const va = [cur, vert, '--cx', s.cx ?? 0.5, '--cy', s.cy ?? 0.5, '--zoom', s.zoom ?? 1];
	if (s.full) va.push('--full');
	run('vertical.mjs', va);
	finals.push(vert);
	say(`сегмент ${s.id}: ${dur.toFixed(2)} с`);
}
// склейка
const list = path.join(work, 'list.txt');
fs.writeFileSync(list, finals.map((f) => `file '${f}'`).join('\n'));
const joined = path.join(work, 'joined.mp4');
ff(['-f', 'concat', '-safe', '0', '-i', list, '-c:v', 'libx264', '-crf', '14', '-preset', 'fast', '-pix_fmt', 'yuv420p', '-an', joined], {quiet: true});
const jp = probe(joined);
say(`склейка: ${jp.duration.toFixed(2)} с (по плану ${totalExpected.toFixed(2)} с)`);
if (Math.abs(jp.duration - totalExpected) > 0.15) say('ВНИМАНИЕ: длительность склейки отличается от плана');
// субтитры
const subs = path.join(work, 'subs.mp4');
const wordsFile = path.join(ep, 'voice', 'words.json');
if (!fs.existsSync(wordsFile)) die('нет ' + wordsFile + ': сначала tools/voice.mjs');
run('subs.mjs', [joined, wordsFile, subs, '--script', path.join(ep, 'script.ru.txt')]);
// звук
const voice = path.join(ep, 'voice', 'voice.mp3');
ff(['-i', subs, '-i', voice, '-map', '0:v', '-map', '1:a', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '160k', '-t', String(jp.duration), out], {quiet: true});
const o = probe(out);
say(`готово: ${out} (${o.width}×${o.height}, ${o.duration.toFixed(2)} с)`);
if (!opt.keep) for (const f of [subs]) fs.rmSync(f, {force: true});
