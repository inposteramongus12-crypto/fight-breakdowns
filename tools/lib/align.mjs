// Тайминги слов: из посимвольной разметки ElevenLabs (with-timestamps) или, если её нет, по самому аудио.
import {spawnSync} from 'node:child_process';
import {ffbin} from './common.mjs';

const PUNCT = /^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu;
export const cleanWord = (s) => s.replace(PUNCT, '');

/** alignment = {characters, character_start_times_seconds, character_end_times_seconds}; text — исходный текст реплики */
export const wordsFromAlignment = (text, al) => {
	const ch = al?.characters;
	const s = al?.character_start_times_seconds;
	const e = al?.character_end_times_seconds;
	if (!Array.isArray(ch) || !Array.isArray(s) || !Array.isArray(e) || ch.length !== s.length || ch.length !== e.length || !ch.length) throw new Error('в ответе нет посимвольной разметки (alignment)');
	const words = [];
	let cur = null;
	for (let i = 0; i < ch.length; i++) {
		if (/\s/.test(ch[i])) {
			if (cur) words.push(cur), (cur = null);
			continue;
		}
		if (!cur) cur = {raw: '', t0: s[i], t1: e[i]};
		cur.raw += ch[i];
		// конец слова = конец последней буквы/цифры: на знаке препинания ElevenLabs держит паузу, она к слову не относится
		if (/[\p{L}\p{N}]/u.test(ch[i]) || cur.t1 === undefined) cur.t1 = e[i];
	}
	if (cur) words.push(cur);
	const out = words.map((x) => ({w: cleanWord(x.raw), t0: x.t0, t1: x.t1})).filter((x) => x.w);
	// сверка со сценарием: слова из разметки должны совпасть со словами текста
	const exp = text.split(/\s+/).map(cleanWord).filter(Boolean);
	if (exp.length !== out.length || exp.some((w, i) => w !== out[i].w)) throw new Error('слова в разметке не совпали с текстом реплики');
	return out;
};

const detectSilences = (file) => {
	const r = spawnSync(ffbin(), ['-hide_banner', '-i', file, '-af', 'silencedetect=noise=-35dB:d=0.06', '-f', 'null', '-'], {encoding: 'utf8'});
	const err = r.stderr || '';
	const dur = (() => {
		const m = err.match(/Duration: (\d+):(\d+):([\d.]+)/);
		return m ? Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) : null;
	})();
	const starts = [...err.matchAll(/silence_start: (-?[\d.]+)/g)].map((m) => Math.max(0, Number(m[1])));
	const ends = [...err.matchAll(/silence_end: (-?[\d.]+)/g)].map((m) => Number(m[1]));
	return {dur, starts, ends};
};

/** Запасной вариант без разметки API: границы слов пропорционально числу букв внутри участков речи (паузы учитываются). */
export const wordsFromAudio = (text, file) => {
	const exp = text.split(/\s+/).map((x) => ({raw: x, w: cleanWord(x)})).filter((x) => x.w);
	if (!exp.length) throw new Error('в тексте нет слов');
	const {dur, starts, ends} = detectSilences(file);
	if (!dur) throw new Error('не удалось определить длительность аудио');
	// участки речи = дополнение к участкам тишины
	const sil = [];
	for (let i = 0; i < starts.length; i++) sil.push([starts[i], ends[i] ?? dur]);
	const speech = [];
	let p = 0;
	for (const [a, b] of sil) {
		if (a > p + 0.02) speech.push([p, a]);
		p = Math.max(p, b);
	}
	if (p < dur - 0.02) speech.push([p, dur]);
	if (!speech.length) throw new Error('в аудио не найдено речи');
	const total = speech.reduce((acc, [a, b]) => acc + (b - a), 0);
	const wt = exp.map((x) => [...x.w].length + (/[,;:—-]$/.test(x.raw) ? 1.2 : 0) + (/[.!?…]$/.test(x.raw) ? 1.8 : 0)); // пауза после знаков — часть веса
	const sum = wt.reduce((a, b) => a + b, 0);
	const EPS = 0.03; // silencedetect работает блоками ≈23 мс: границы участков речи точны только до этого
	// u — время «в речи» (без пауз) -> реальное время; side 'start': на границе берём начало следующего участка, 'end': конец предыдущего
	const at = (u, side) => {
		let left = u;
		for (let k = 0; k < speech.length; k++) {
			const [a, b] = speech[k];
			const len = b - a;
			if (side === 'end' ? left <= len + EPS : left < len - EPS) return a + Math.min(left, len);
			left -= len;
		}
		return speech.at(-1)[1];
	};
	let acc = 0;
	return exp.map((x, i) => {
		const u0 = (acc / sum) * total;
		acc += wt[i];
		const u1 = (acc / sum) * total;
		return {w: x.w, t0: at(u0, 'start'), t1: at(u1, 'end')};
	});
};
