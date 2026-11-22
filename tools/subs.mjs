// Субтитры по одному слову поверх 9:16-ролика: текст из сценария, тайминги из озвучки (words.json от voice.mjs).
//   node tools/subs.mjs video.mp4 episodes/001/voice/words.json out.mp4 [--script episodes/001/script.ru.txt]
//        [--offset 0] [--center 0.53] [--size 40] [--color #45F6E7] [--keep-overlay]
// words.json: {"words": [{"w": "Ян", "t0": 0.12, "t1": 0.40}, ...]} — время в секундах итогового ролика.
// С --script проверяется, что слова в words.json — это ровно слова сценария по порядку (регистр и написание сценария сохраняются).
import fs from 'node:fs';
import path from 'node:path';
import {parseArgs, readJson, die, probe, say} from './lib/common.mjs';
import {renderAndComposite} from './lib/overlay.mjs';

const {pos, opt} = parseArgs(process.argv.slice(2), ['keep-overlay']);
if (pos.length < 3) die('использование: node tools/subs.mjs video.mp4 words.json out.mp4 [--script script.ru.txt] [--offset 0] [--center 0.53] [--size 40] [--color #45F6E7]');
const [video, wordsFile, out] = pos;
const info = probe(video);
if (info.width !== 720 || info.height !== 1280) say(`ВНИМАНИЕ: кадр ${info.width}×${info.height}, а субтитры рассчитаны на 720×1280`);
const raw = readJson(wordsFile);
const offset = Number(opt.offset ?? 0);
const words = (raw.words ?? raw).map((x) => ({w: x.w, t0: x.t0 + offset, t1: x.t1 + offset}));
if (!words.length) die('в words.json нет слов');
words.forEach((x, i) => {
	if (typeof x.w !== 'string' || !x.w.trim()) die(`слово #${i}: пустой текст`);
	if (!(x.t1 > x.t0)) die(`слово #${i} "${x.w}": t1 должно быть больше t0`);
	if (i && x.t0 < words[i - 1].t0) die(`слово #${i} "${x.w}": идёт раньше предыдущего`);
});
const last = words[words.length - 1].t1;
if (last > info.duration + 0.05) say(`ВНИМАНИЕ: последние слова заканчиваются на ${last.toFixed(2)} с, а видео ${info.duration.toFixed(2)} с`);
// слово держится до начала следующего, но не дольше 0.9 с после своего конца (пауза между фразами = пустой кадр)
for (let i = 0; i < words.length; i++) {
	const next = words[i + 1]?.t0 ?? Infinity;
	words[i].t1 = Math.min(Math.max(words[i].t1, Math.min(next, words[i].t1 + 0.9)), next);
}
if (opt.script) {
	const tok = (s) => s.split(/\s+/).map((x) => x.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '')).filter(Boolean);
	const exp = tok(fs.readFileSync(opt.script, 'utf8'));
	const got = words.map((x) => x.w);
	if (exp.length !== got.length) die(`слов в сценарии ${exp.length}, в words.json ${got.length}`);
	const bad = exp.findIndex((w, i) => w !== got[i]);
	if (bad >= 0) die(`слово #${bad}: в сценарии "${exp[bad]}", в words.json "${got[bad]}"`);
	say(`сценарий и words.json совпадают: ${exp.length} слов`);
}
const style = {};
if (opt.center) style.centerY = Number(opt.center);
if (opt.size) style.size = Number(opt.size);
if (opt.color) style.color = String(opt.color);
renderAndComposite({comp: 'Subs', video, out, props: {words, style}, workName: path.basename(out).replace(/\.[^.]+$/, '') + '.subs', keepOverlay: !!opt['keep-overlay']});
