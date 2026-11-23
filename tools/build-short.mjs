// Сборка шорта 9:16 из episodes/<имя>/timeline.json: cut → slowmo → annotate → vertical по сегментам,
// склейка, субтитры по одному слову, звук озвучки. Запускать после voice.mjs (нужны voice/voice.mp3 и words.json).
//   node tools/build-short.mjs episodes/garcia-benn [--out out/garcia-benn.mp4] [--keep]
// timeline.json: {clip (клип по умолчанию, необязателен, если clip задан у каждого сегмента), voice:{starts:[...], total}, segments:[{id, clip (необязательно: свой клип сегмента), from, to, factor, cx, cy, zoom, full, annotations: "annotations.json" (необязательно)}]}
// Несколько клипов в одном выпуске: поле clip у сегмента перекрывает tl.clip; времена from/to/annotations — секунды именно этого клипа.
// Профиль: --profile wide (или "profile": "wide" в timeline.json) — 16:9 1920×1080 для лонга: wide.mjs вместо vertical.mjs, субтитры фразами внизу,
// координаты разметки (пиксели клипа) умножаются на 1920/ширина клипа. Сегмент без клипа: {"id", "blank": секунд, "color": "#0b0e13", "annotations"} — заставка/карточка.
// "chapter": {"n", "title", "total"} в timeline.json добавляет метку главы в левом верхнем углу первого сегмента (0,2–2,7 с).
// Времена в annotations.json — секунды ИСХОДНОГО клипа; сегмент переводит их во время замедленного сегмента сам ((t−from)·factor).
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {parseArgs, readJson, writeJson, die, say, ROOT, ff, probe, profileOf, styleScaleFor} from './lib/common.mjs';
import {scaleItem} from './lib/annot.mjs';

const {pos, opt} = parseArgs(process.argv.slice(2), ['keep', 'resume']);
if (!pos[0]) die('использование: node tools/build-short.mjs episodes/<имя> [--out out/<имя>.mp4]');
const ep = path.resolve(pos[0]);
const parent = path.basename(path.dirname(ep));
const name = parent === 'episodes' ? path.basename(ep) : parent + '-' + path.basename(ep); // главы лонга: episodes/003-long/ch01 → 003-long-ch01
const tl = readJson(path.join(ep, 'timeline.json'));
const profile = opt.profile ?? tl.profile ?? 'short';
const prof = profileOf(profile);
const wide = profile === 'wide';
const work = path.join(ROOT, 'work', 'short', name);
fs.mkdirSync(work, {recursive: true});
const out = path.resolve(opt.out ?? path.join('out', name + '.mp4'));
fs.mkdirSync(path.dirname(out), {recursive: true});
const run = (script, args) => {
	const r = spawnSync(process.execPath, [path.join(ROOT, 'tools', script), ...args.map(String)], {cwd: ROOT, encoding: 'utf8', env: process.env});
	if (r.status !== 0) die(`${script} ${args.slice(0, 3).join(' ')}…: ${(r.stdout + r.stderr).slice(-800)}`);
	return r.stdout;
};

// клип/сегменты: у сегмента может быть свой clip (иначе берётся tl.clip)
const clipOf = (s) => {
	const c = s.clip ?? tl.clip;
	if (!c) die(`сегмент ${s.id}: не задан clip ни у сегмента, ни в timeline.json`);
	const f = path.resolve(ROOT, c);
	if (!fs.existsSync(f)) die(`сегмент ${s.id}: нет клипа ${c}`);
	return f;
};
let totalExpected = 0;
const finals = [];
for (const s of tl.segments) {
	const d = path.join(work, s.id);
	fs.mkdirSync(d, {recursive: true});
	const dur0 = s.blank ?? (s.to - s.from) * s.factor;
	if (opt.resume && fs.existsSync(path.join(d, 'vert.mp4'))) {
		finals.push(path.join(d, 'vert.mp4'));
		totalExpected += dur0;
		say(`сегмент ${s.id}: взят готовый (--resume)`);
		continue;
	}
	let cur;
	let dur;
	let k = 1; // во сколько раз увеличены пиксели клипа (wide)
	const isFirst = s === tl.segments[0];
	if (s.blank) {
		if (!wide) die(`сегмент ${s.id}: blank только в профиле wide`);
		cur = path.join(d, 'blank.mp4');
		ff(['-f', 'lavfi', '-i', `color=c=${String(s.color ?? '#0b0e13').replace('#', '0x')}:s=${prof.w}x${prof.h}:r=30:d=${s.blank}`, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '16', '-an', cur], {quiet: true});
		dur = s.blank;
	} else {
		const cut = path.join(d, 'cut.mp4');
		run('cut.mjs', [clipOf(s), cut, '--from', s.from, '--to', s.to]);
		cur = cut;
		if (s.factor > 1) {
			cur = path.join(d, 'slow.mp4');
			run('slowmo.mjs', [cut, cur, '--factor', s.factor, '--interp', s.interp ?? 'mci']);
		}
		dur = (s.to - s.from) * s.factor;
		if (wide) {
			const wv = path.join(d, 'wide.mp4');
			const clipW = probe(cur).width;
			k = prof.w / clipW;
			run('wide.mjs', [cur, wv, '--zoom', s.zoom ?? 1, '--cx', s.cx ?? 0.5, '--cy', s.cy ?? 0.5]);
			cur = wv;
		}
	}
	totalExpected += dur;
	const chapterItem = wide && isFirst && tl.chapter ? [{type: 'chapter', t0: 0.2, t1: Math.min(2.7, dur), ...tl.chapter}] : [];
	if (s.annotations || chapterItem.length) {
		const raw = s.annotations ? readJson(path.join(ep, s.annotations)) : {items: []};
		const conv = s.blank ? (t) => t : (t) => (t - s.from) * s.factor;
		const items = [...chapterItem];
		for (const it0 of raw.items ?? raw) {
			const it = scaleItem(it0, k);
			if (s.blank) {
				items.push({...it, t1: it.t1 ?? it.t0 + 1});
				continue;
			}
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
		run('annotate.mjs', wide ? [cur, annJson, ann, '--style-scale', styleScaleFor(probe(cur).width, prof.h, 'wide')] : [cur, annJson, ann]);
		cur = ann;
	}
	const vert = path.join(d, 'vert.mp4');
	if (wide) fs.copyFileSync(cur, vert);
	else {
		const va = [cur, vert, '--cx', s.cx ?? 0.5, '--cy', s.cy ?? 0.5, '--zoom', s.zoom ?? 1];
		if (s.full) va.push('--full');
		run('vertical.mjs', va);
	}
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
run('subs.mjs', [joined, wordsFile, subs, '--script', path.join(ep, 'script.ru.txt'), ...(wide ? ['--mode', 'phrase'] : [])]);
// звук
const voice = path.join(ep, 'voice', 'voice.mp3');
ff(['-i', subs, '-i', voice, '-map', '0:v', '-map', '1:a', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '160k', '-t', String(jp.duration), out], {quiet: true});
const o = probe(out);
say(`готово: ${out} (${o.width}×${o.height}, ${o.duration.toFixed(2)} с)`);
if (!opt.keep) for (const f of [subs]) fs.rmSync(f, {force: true});
