// Озвучка ElevenLabs с таймингами слов.
//   node tools/voice.mjs episodes/001 --plan                 только посчитать знаки (без сети)
//   node tools/voice.mjs episodes/001 [--voice N] [--gap 0.25] [--force] [--keys 2|2,5] [--no-timestamps]
// Читает episodes/001/script.voice.txt, если он есть (текст ДЛЯ ОЗВУЧКИ: числа и аббревиатуры словами), иначе script.ru.txt
// (одна строка = одна реплика, пустые строки и строки с # пропускаются). Если есть оба файла, число реплик должно совпасть:
// на экране и в субтитрах остаётся script.ru.txt (см. subs.mjs --voice-script).
// Пишет episodes/001/voice/: NNN.mp3, NNN.align.json, voice.mp3 (склейка с паузами) и words.json
// ({"words":[{"w","t0","t1"}]}, время в секундах склеенной дорожки) — это вход для tools/subs.mjs.
// Тайминги берутся из ответа /v1/text-to-speech/{voice}/with-timestamps (посимвольная разметка, по OpenAPI-описанию ElevenLabs);
// если разметки нет или она не совпала с текстом, слова считаются по самому аудио (участки речи + число букв),
// и в NNN.align.json пишется source:"audio". Ключи только из переменных окружения (tools/lib/eleven-keys.mjs), в файлы не пишутся.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {parseArgs, readJson, writeJson, die, say, ROOT, ff, probe} from './lib/common.mjs';
import {findKeys, pickKeys} from './lib/eleven-keys.mjs';
import {wordsFromAlignment, wordsFromAudio} from './lib/align.mjs';

// Node сам прокси не использует: перезапуск с NODE_USE_ENV_PROXY=1 (как в Tallest)
if (!process.env.NODE_USE_ENV_PROXY && (process.env.HTTPS_PROXY || process.env.https_proxy)) {
	const r = spawnSync(process.execPath, process.argv.slice(1), {stdio: 'inherit', env: {...process.env, NODE_USE_ENV_PROXY: '1'}});
	process.exit(r.status ?? 1);
}

const {pos, opt} = parseArgs(process.argv.slice(2), ['plan', 'force', 'no-timestamps']);
const onlyIds = opt.only ? String(opt.only).split(',').map((x) => String(Number(x)).padStart(3, '0')) : null;
if (!pos[0]) die('использование: node tools/voice.mjs episodes/001 [--plan] [--voice N] [--gap 0.25] [--force] [--keys N] [--no-timestamps]');
const epDir = path.resolve(pos[0]);
const screenFile = path.join(epDir, 'script.ru.txt');
const voiceFile = path.join(epDir, 'script.voice.txt');
const scriptFile = fs.existsSync(voiceFile) ? voiceFile : screenFile;
if (!fs.existsSync(scriptFile)) die('нет ' + scriptFile);
const readLines = (f) => fs.readFileSync(f, 'utf8').split('\n').map((s) => s.trim()).filter((s) => s && !s.startsWith('#'));
const lines = readLines(scriptFile);
if (scriptFile === voiceFile && fs.existsSync(screenFile) && readLines(screenFile).length !== lines.length) die(`в script.voice.txt ${lines.length} реплик, а в script.ru.txt ${readLines(screenFile).length}`);
if (!lines.length) die('в сценарии нет реплик');
const chars = lines.reduce((a, l) => a + [...l].length, 0);
if (opt.plan) {
	say(`реплик: ${lines.length}, знаков: ${chars}, ≈${(chars / 15).toFixed(0)} с речи (15 знаков/с, оценка Tallest). Ничего не озвучено.`);
	process.exit(0);
}

const voices = readJson(path.join(ROOT, 'voices.json'));
const voiceKey = String(opt.voice ?? 'N');
const voiceId = voices[voiceKey]?.eleven ?? (/^[A-Za-z0-9]{15,}$/.test(voiceKey) ? voiceKey : null);
if (!voiceId) die(`голос "${voiceKey}" не найден в voices.json (или передайте voice_id целиком)`);
const gap = Number(opt.gap ?? 0.25);
const MODEL = 'eleven_multilingual_v2';
const BASE = process.env.ELEVENLABS_API_BASE || 'https://api.elevenlabs.io';
if (BASE !== 'https://api.elevenlabs.io' && !/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(BASE)) die('ELEVENLABS_API_BASE допустим только для localhost (тесты)');
const keys = pickKeys(findKeys(), opt.keys ? String(opt.keys) : null);
if (!keys.length) die('нет ключа ElevenLabs в окружении (переменная с ELEVENLABS в имени)');
say(`ключей: ${keys.map((k) => k.n).join(', ')}; голос ${voices[voiceKey]?.name ?? voiceKey}; реплик ${lines.length}, знаков ${chars}`);

const outDir = path.join(epDir, 'voice');
fs.mkdirSync(outDir, {recursive: true});
const madeFile = path.join(outDir, 'made.json');
const made = fs.existsSync(madeFile) ? readJson(madeFile) : {};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const BACKOFF = [3000, 6000, 12000, 24000, 48000];
const hash = (t) => crypto.createHash('sha1').update(`${voiceId}|${MODEL}|${t}`).digest('hex').slice(0, 12);

const requestLine = async (text) => {
	for (const key of keys) {
		let r;
		for (let t = 0; t <= BACKOFF.length; t++) {
			r = await fetch(`${BASE}/v1/text-to-speech/${voiceId}/with-timestamps?output_format=mp3_44100_128`, {
				method: 'POST',
				headers: {'xi-api-key': key.k, 'content-type': 'application/json'},
				body: JSON.stringify({text, model_id: MODEL}),
			});
			if (r.status !== 429 || t === BACKOFF.length) break;
			say(`429, повтор через ${BACKOFF[t] / 1000} с`);
			await sleep(BACKOFF[t]);
		}
		if (r.ok) return await r.json();
		const msg = (await r.text()).slice(0, 200);
		say(`ключ ${key.n} отказал: ${r.status} ${msg}`);
		if (r.status === 401 || r.status === 402 || /quota|credits|limit/i.test(msg)) continue; // другой ключ
		throw new Error(`ElevenLabs ${r.status}: ${msg}`);
	}
	throw new Error('ни один ключ не принят или кредиты закончились');
};

const lineInfo = [];
for (let i = 0; i < lines.length; i++) {
	const id = String(i + 1).padStart(3, '0');
	const text = lines[i];
	if (onlyIds && !onlyIds.includes(id)) continue;
	const mp3 = path.join(outDir, id + '.mp3');
	const alignFile = path.join(outDir, id + '.align.json');
	if (!opt.force && made[id] === hash(text) && fs.existsSync(mp3) && fs.existsSync(alignFile)) {
		lineInfo.push({id, mp3, align: readJson(alignFile)});
		continue;
	}
	say(`озвучиваю ${id}: ${text.slice(0, 60)}${text.length > 60 ? '…' : ''}`);
	const j = await requestLine(text);
	if (!j.audio_base64) throw new Error(`${id}: в ответе нет audio_base64`);
	fs.writeFileSync(mp3, Buffer.from(j.audio_base64, 'base64'));
	let words;
	let source = 'elevenlabs';
	try {
		if (opt['no-timestamps']) throw new Error('--no-timestamps');
		words = wordsFromAlignment(text, j.alignment);
	} catch (e) {
		say(`${id}: разметка API не подошла (${e.message}), считаю по аудио`);
		words = wordsFromAudio(text, mp3);
		source = 'audio';
	}
	const align = {text, source, words};
	writeJson(alignFile, align);
	made[id] = hash(text);
	writeJson(madeFile, made);
	lineInfo.push({id, mp3, align});
	await sleep(1200);
}

if (onlyIds) {
	say(`озвучено только строки ${onlyIds.join(', ')}; склейка пропущена (--only)`);
	process.exit(0);
}
// склейка: либо по schedule.json (начало каждой реплики в секундах итогового ролика), либо подряд с паузой gap
const schedFile = path.join(epDir, 'schedule.json');
const sched = fs.existsSync(schedFile) ? readJson(schedFile) : null;
if (sched && sched.starts.length !== lineInfo.length) die(`в schedule.json ${sched.starts.length} стартов, а реплик ${lineInfo.length}`);
const probe_audio = (file) => {
	const r = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file], {encoding: 'utf8'});
	const d = Number(r.stdout);
	if (!(d > 0)) die('не удалось определить длительность ' + file);
	return d;
};
let offset = 0;
const all = [];
const inputs = [];
const parts = [];
const durs = lineInfo.map((l) => probe_audio(l.mp3));
lineInfo.forEach((l, i) => {
	const start = sched ? sched.starts[i] : offset;
	if (sched && i && start < sched.starts[i - 1] + durs[i - 1] + 0.05) die(`реплика ${i + 1} начинается в ${start} с, а предыдущая идёт до ${(sched.starts[i - 1] + durs[i - 1]).toFixed(2)} с`);
	for (const w of l.align.words) all.push({w: w.w, t0: +(w.t0 + start).toFixed(3), t1: +(w.t1 + start).toFixed(3)});
	inputs.push('-i', l.mp3);
	const ms = Math.round(start * 1000);
	parts.push(sched ? `[${i}:a]aresample=44100,aformat=channel_layouts=mono,adelay=${ms}:all=1[a${i}]` : `[${i}:a]aresample=44100,aformat=channel_layouts=mono,apad=pad_dur=${gap}[a${i}]`);
	offset = sched ? Math.max(offset, start + durs[i]) : offset + durs[i] + gap;
});
const total = sched?.total ?? offset;
const joinF = sched ? lineInfo.map((_, i) => `[a${i}]`).join('') + `amix=inputs=${lineInfo.length}:normalize=0:duration=longest,apad=whole_dur=${total}[o]` : lineInfo.map((_, i) => `[a${i}]`).join('') + `concat=n=${lineInfo.length}:v=0:a=1[o]`;
ff([...inputs, '-filter_complex', parts.join(';') + ';' + joinF, '-map', '[o]', '-c:a', 'libmp3lame', '-b:a', '128k', path.join(outDir, 'voice.mp3')], {quiet: true});
writeJson(path.join(outDir, 'words.json'), {voice: voiceKey, gap, total: +total.toFixed(3), words: all, lines: lineInfo.map((l, i) => ({id: l.id, start: sched ? sched.starts[i] : null, dur: +durs[i].toFixed(3)}))});
say(`готово: ${lineInfo.length} реплик, ${all.length} слов, ${offset.toFixed(1)} с; ${path.join(outDir, 'words.json')}`);
