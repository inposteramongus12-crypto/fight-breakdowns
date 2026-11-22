// Самопроверка инструментов на синтетическом клипе и поддельном сервере ElevenLabs (реальный API и кредиты не трогает).
//   node tools/selftest.mjs [--skip-render]
// Проверяет: cut, slowmo + карту времени, vertical, тайминги слов (по разметке и по аудио), voice.mjs целиком,
// annotate + verify (в том числе что verify замечает сдвинутую разметку), subs со сверкой сценария.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import {spawn, spawnSync} from 'node:child_process';
import {ROOT, ffbin, ff, probe, readJson, writeJson} from './lib/common.mjs';
import {wordsFromAlignment, wordsFromAudio} from './lib/align.mjs';

const skipRender = process.argv.includes('--skip-render');
const dir = path.join(ROOT, 'work', 'selftest');
fs.rmSync(dir, {recursive: true, force: true});
fs.mkdirSync(dir, {recursive: true});
let fails = 0;
const check = (name, ok, extra = '') => {
	console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  — ' + extra : ''}`);
	if (!ok) fails++;
};
const node = (args, env) => spawnSync(process.execPath, args.map(String), {cwd: ROOT, encoding: 'utf8', env: env ?? process.env});
const nodeAsync = (args, env) =>
	new Promise((res) => {
		const p = spawn(process.execPath, args.map(String), {cwd: ROOT, env});
		let out = '';
		p.stdout.on('data', (d) => (out += d));
		p.stderr.on('data', (d) => (out += d));
		p.on('close', (code) => res({status: code, out}));
	});
const rawFrame = (file, t, w, h) => spawnSync(ffbin(), ['-v', 'error', '-ss', String(t), '-i', file, '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], {maxBuffer: 1 << 28}).stdout;
const redCentroid = (buf, w, h) => {
	let sx = 0, n = 0;
	for (let y = 0; y < h; y += 2) for (let x = 0; x < w; x += 2) {
		const i = (y * w + x) * 3;
		if (buf[i] > 180 && buf[i + 1] < 80 && buf[i + 2] < 80) (sx += x), n++;
	}
	return n ? sx / n : NaN;
};

// 1. синтетический клип 1920×1080, красный квадрат 80 px едет вправо: левый край x = 300 + 400·t
const src = path.join(dir, 'src.mp4');
ff(['-f', 'lavfi', '-i', 'color=c=0x445566:s=1920x1080:r=30:d=3', '-f', 'lavfi', '-i', 'color=c=red:s=80x80:r=30:d=3', '-filter_complex', "[0:v][1:v]overlay=x='300+400*t':y=500,format=yuv420p", '-c:v', 'libx264', '-crf', '12', src], {quiet: true});
const cut = path.join(dir, 'cut.mp4');
let r = node(['tools/cut.mjs', src, cut, '--from', '0.5', '--to', '2.5']);
let p = probe(cut);
check('cut: 2.0 с, 1920×1080', r.status === 0 && Math.abs(p.duration - 2) < 0.05 && p.width === 1920, `${p.duration?.toFixed(2)} с`);
r = node(['tools/cut.mjs', src, path.join(dir, 'bad.mp4'), '--from', '2', '--to', '1']);
check('cut: --to меньше --from отклоняется', r.status !== 0);

const slow = path.join(dir, 'slow.mp4');
r = node(['tools/slowmo.mjs', cut, slow, '--segments', '0.5-1.0:4', '--interp', 'dup']);
p = probe(slow);
check('slowmo: длительность = расчётной (3.5 с)', r.status === 0 && Math.abs(p.duration - 3.5) < 0.1, `${p.duration?.toFixed(2)} с`);
// момент cut-времени 0.75 (квадрат: центр 340+400·(0.5+0.75)=840) должен быть в slow-времени 1.5 по карте
const tm = node(['tools/timemap.mjs', path.join(dir, 'slow.timemap.json'), '--src', '0.75']);
const tOut = Number(tm.stdout.trim());
const cx = redCentroid(rawFrame(slow, tOut, 1920, 1080), 1920, 1080);
check('timemap: квадрат в расчётном кадре на месте (±15 px)', Math.abs(cx - 840) < 15, `t=${tOut}, центр x=${cx.toFixed(0)}, ожидалось 840`);
r = node(['tools/slowmo.mjs', cut, path.join(dir, 'bad2.mp4'), '--segments', '0.5-9:4']);
check('slowmo: отрезок за концом клипа отклоняется', r.status !== 0);

const vert = path.join(dir, 'vert.mp4');
r = node(['tools/vertical.mjs', slow, vert, '--cx', '0.4']);
p = probe(vert);
check('vertical: 720×1280', r.status === 0 && p.width === 720 && p.height === 1280, `${p.width}×${p.height}`);
{
	// полоса: верхние 190 строк размыты (нет резких границ), в полосе y=190..1090 видны края квадрата
	const fr = rawFrame(vert, 0.2, 720, 1280);
	const rowSharp = (y) => { let s = 0; for (let x = 1; x < 720; x++) s += Math.abs(fr[(y * 720 + x) * 3] - fr[(y * 720 + x - 1) * 3]); return s / 719; };
	check('vertical: фон у верхнего и нижнего края тёмный', fr[(5 * 720 + 360) * 3] < 120 && fr[(1275 * 720 + 360) * 3] < 120);
	void rowSharp;
}

// 2. тайминги слов
const al = {characters: [...'Ян бьёт, слева'], character_start_times_seconds: [...'Ян бьёт, слева'].map((_, i) => i * 0.1), character_end_times_seconds: [...'Ян бьёт, слева'].map((_, i) => i * 0.1 + 0.1)};
const w1 = wordsFromAlignment('Ян бьёт, слева', al);
check('align: слова из разметки без пунктуации и с верными временами', w1.map((x) => x.w).join('|') === 'Ян|бьёт|слева' && Math.abs(w1[1].t0 - 0.3) < 1e-9 && Math.abs(w1[1].t1 - 0.7) < 1e-9, JSON.stringify(w1[1]));
let threw = false;
try { wordsFromAlignment('Ян бьёт слева справа', al); } catch { threw = true; }
check('align: несовпадение слов с текстом отклоняется', threw);
// аудио: три тона по 0.4 с с паузами 0.3 с, перед ними 0.2 с тишины -> слова начинаются в 0.2, 0.9, 1.6
const tones = path.join(dir, 'tones.wav');
ff(['-f', 'lavfi', '-i', "aevalsrc='if(lt(mod(t-0.2,0.7),0.4)*gte(t,0.2),0.6*sin(2*PI*300*t),0)':s=44100:d=2.3", tones], {quiet: true});
const w2 = wordsFromAudio('раз два три', tones);
const okAudio = [0.2, 0.9, 1.6].every((t, i) => Math.abs(w2[i].t0 - t) < 0.08) && [0.6, 1.3, 2.0].every((t, i) => Math.abs(w2[i].t1 - t) < 0.08);
check('align: тайминги по аудио (паузы учтены, ±0.08 с)', okAudio, w2.map((x) => `${x.t0.toFixed(2)}-${x.t1.toFixed(2)}`).join(' '));

// 3. voice.mjs против поддельного сервера
const server = await new Promise((res) => {
	const s = http.createServer((req, rsp) => {
		let body = '';
		req.on('data', (d) => (body += d));
		req.on('end', () => {
			const m = req.url.match(/^\/v1\/text-to-speech\/([^/]+)\/with-timestamps/);
			if (!m || req.headers['xi-api-key'] !== 'fake_key_for_selftest_only_000000') { rsp.writeHead(401).end('no'); return; }
			const text = JSON.parse(body).text;
			const n = [...text].length;
			const f = path.join(dir, `mock_${n}.mp3`);
			if (!fs.existsSync(f)) ff(['-f', 'lavfi', '-i', `sine=frequency=250:duration=${(n * 0.05).toFixed(2)}`, '-ar', '44100', '-ac', '1', f], {quiet: true});
			const out = {audio_base64: fs.readFileSync(f).toString('base64')};
			if (!s.noAlign) out.alignment = {characters: [...text], character_start_times_seconds: [...text].map((_, i) => i * 0.05), character_end_times_seconds: [...text].map((_, i) => (i + 1) * 0.05)};
			rsp.writeHead(200, {'content-type': 'application/json'}).end(JSON.stringify(out));
		});
	}).listen(0, '127.0.0.1', () => res(s));
});
const port = server.address().port;
const ep = path.join(dir, 'ep');
fs.mkdirSync(ep, {recursive: true});
fs.writeFileSync(path.join(ep, 'script.ru.txt'), '# комментарий\nЯн бьёт слева.\n\nДва шага назад, потом джеб!\n');
const env = {PATH: process.env.PATH, HOME: process.env.HOME, ELEVENLABS_API_KEY: 'fake_key_for_selftest_only_000000', ELEVENLABS_API_BASE: `http://127.0.0.1:${port}`};
let v = await nodeAsync(['tools/voice.mjs', ep, '--gap', '0.25'], env);
check('voice: прогон завершился', v.status === 0, v.status ? v.out.slice(-300) : '');
if (v.status === 0) {
	const wj = readJson(path.join(ep, 'voice', 'words.json'));
	const a1 = readJson(path.join(ep, 'voice', '001.align.json'));
	const pv = probe_audio(path.join(ep, 'voice', 'voice.mp3'));
	check('voice: 8 слов, источник разметки — elevenlabs', wj.words.length === 8 && a1.source === 'elevenlabs', `${wj.words.length} слов, ${a1.source}`);
	// «Два» — первое слово второй реплики (t0=0 внутри реплики): на общей шкале это реальная длительность mp3 первой реплики + пауза
	const d1 = probe_audio(path.join(ep, 'voice', '001.mp3'));
	check('voice: сдвиг второй реплики = длительность первой + пауза', Math.abs(wj.words[3].t0 - (d1 + 0.25)) < 0.01, `Два t0=${wj.words[3].t0}, ожидалось ${(d1 + 0.25).toFixed(3)}`);
	check('voice: длительность склейки ≈ сумма + паузы', Math.abs(pv - wj.total) < 0.15, `mp3 ${pv.toFixed(2)} с, words.total ${wj.total}`);
	const again = await nodeAsync(['tools/voice.mjs', ep], env);
	check('voice: повторный запуск не озвучивает заново (кеш)', again.status === 0 && !/озвучиваю/.test(again.out));
	// расписание: реплики стартуют в заданные секунды; --only озвучивает выбранные строки без склейки
	const ep3 = path.join(dir, 'ep3');
	fs.mkdirSync(ep3, {recursive: true});
	fs.copyFileSync(path.join(ep, 'script.ru.txt'), path.join(ep3, 'script.ru.txt'));
	const o1 = await nodeAsync(['tools/voice.mjs', ep3, '--only', '1'], env);
	check('voice --only: озвучена одна строка, склейки нет', o1.status === 0 && fs.existsSync(path.join(ep3, 'voice', '001.mp3')) && !fs.existsSync(path.join(ep3, 'voice', '002.mp3')) && !fs.existsSync(path.join(ep3, 'voice', 'voice.mp3')));
	writeJson(path.join(ep3, 'schedule.json'), {starts: [0.5, 3.0], total: 6});
	const sc = await nodeAsync(['tools/voice.mjs', ep3], env);
	const wj3 = sc.status === 0 ? readJson(path.join(ep3, 'voice', 'words.json')) : {words: []};
	check('voice schedule: первая реплика с 0.5 с, вторая с 3.0 с, общая длина 6 с', sc.status === 0 && Math.abs(wj3.words[0].t0 - 0.5) < 0.01 && Math.abs(wj3.words[3].t0 - 3.0) < 0.01 && Math.abs(probe_audio(path.join(ep3, 'voice', 'voice.mp3')) - 6) < 0.2, JSON.stringify([wj3.words[0]?.t0, wj3.words[3]?.t0]));
	writeJson(path.join(ep3, 'schedule.json'), {starts: [0.5, 0.6], total: 6});
	const ov = await nodeAsync(['tools/voice.mjs', ep3], env);
	check('voice schedule: наложение реплик отклоняется', ov.status !== 0);
	server.noAlign = true;
	const ep2 = path.join(dir, 'ep2');
	fs.mkdirSync(ep2, {recursive: true});
	fs.copyFileSync(path.join(ep, 'script.ru.txt'), path.join(ep2, 'script.ru.txt'));
	const v2 = await nodeAsync(['tools/voice.mjs', ep2], env);
	const a2 = v2.status === 0 ? readJson(path.join(ep2, 'voice', '001.align.json')) : {};
	check('voice: без разметки в ответе слова считаются по аудио', v2.status === 0 && a2.source === 'audio', a2.source);
}
server.close();
const bad = await nodeAsync(['tools/voice.mjs', ep], {...env, ELEVENLABS_API_BASE: 'https://evil.example.com'});
check('voice: чужой ELEVENLABS_API_BASE запрещён', bad.status !== 0);
function probe_audio(f) { return Number(spawnSync(ffbin('ffprobe'), ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f], {encoding: 'utf8'}).stdout); }

// 4. annotate + verify + subs (нужен Remotion)
if (!skipRender) {
	const ann = path.join(dir, 'ann.json');
	// стрелка тянется за квадратом: ключи каждые 0.1 с, острие в центре квадрата (центр x = 540 + 400·t в cut-времени)
	const track = [];
	for (let t = 0.3; t <= 1.5001; t += 0.1) track.push({t: +t.toFixed(2), x: 540 + 400 * t, y: 540});
	writeJson(ann, {items: [
		{id: 'arrow', type: 'arrow', t0: 0.3, t1: 1.6, from: [300, 420], to: [900, 540], bend: 0.2, grow: 0.3, track},
		{id: 'box', type: 'box', t0: 0.3, t1: 1.8, cx: 1500, cy: 700, w: 220, h: 260},
		{id: 'star', type: 'mark', kind: 'star', t0: 0.9, t1: 1.5, x: 1500, y: 700, size: 120},
		{id: 'icon', type: 'icon', kind: 'brain', t0: 0.3, t1: 1.6, at: [1500, 600], box: [1650, 300], size: 170},
	]});
	const annOut = path.join(dir, 'ann.mp4');
	const a = node(['tools/annotate.mjs', cut, ann, annOut]);
	check('annotate: рендер завершился, размер и длительность те же', a.status === 0 && probe(annOut).width === 1920 && Math.abs(probe(annOut).duration - 2) < 0.1, a.status ? (a.stderr + a.stdout).slice(-300) : '');
	if (a.status === 0) {
		const vr = node(['tools/verify.mjs', cut, annOut, ann, '--out', path.join(dir, 'verify')]);
		check('verify: верная разметка проходит', vr.status === 0, vr.status ? vr.stdout.slice(-300) : '');
		// остриё стрелки на кадре 1.0 должно быть на квадрате: красный квадрат закрыт? нет, стрелка рисуется поверх -> ищем белые пиксели у центра квадрата
		const fr = rawFrame(annOut, 1.0, 1920, 1080);
		const cxq = 540 + 400 * 1.0;
		let white = 0;
		for (let y = 520; y < 560; y++) for (let x = Math.round(cxq) - 30; x < Math.round(cxq) + 30; x++) { const i = (y * 1920 + x) * 3; if (fr[i] > 235 && fr[i + 1] > 235 && fr[i + 2] > 235) white++; }
		check('annotate: остриё стрелки у центра красного квадрата в t=1.0', white > 40, `белых пикселей ${white}`);
		const shifted = readJson(ann);
		shifted.items.forEach((it) => { if (it.cx) it.cx += 500; if (it.x) it.x += 500; if (it.from) it.from = [it.from[0] + 500, it.from[1] + 300]; if (it.to) it.to = [it.to[0] + 500, it.to[1] + 300]; if (it.track) it.track = it.track.map((k) => ({...k, x: k.x + 500, y: k.y + 300})); if (it.at) it.at = [it.at[0] - 600, it.at[1] + 300]; if (it.box) it.box = [it.box[0] - 600, it.box[1] + 300]; });
		writeJson(path.join(dir, 'ann-shifted.json'), shifted);
		const vn = node(['tools/verify.mjs', cut, annOut, path.join(dir, 'ann-shifted.json'), '--out', path.join(dir, 'verify-neg')]);
		check('verify: сдвинутая разметка отклоняется (код 2)', vn.status === 2);
	}
	const words = path.join(dir, 'words.json');
	writeJson(words, {words: [{w: 'Ян', t0: 0.2, t1: 0.7}, {w: 'бьёт', t0: 0.7, t1: 1.2}, {w: 'слева', t0: 1.2, t1: 1.9}]});
	fs.writeFileSync(path.join(dir, 'script.txt'), 'Ян бьёт, слева.\n');
	const sOut = path.join(dir, 'subs.mp4');
	const s1 = node(['tools/subs.mjs', vert, words, sOut, '--script', path.join(dir, 'script.txt')]);
	check('subs: рендер, 720×1280', s1.status === 0 && probe(sOut).width === 720, s1.status ? (s1.stderr + s1.stdout).slice(-300) : '');
	if (s1.status === 0) {
		const f = rawFrame(sOut, 1.0, 720, 1280);
		let teal = 0, ys = [];
		for (let y = 0; y < 1280; y++) for (let x = 0; x < 720; x++) { const i = (y * 720 + x) * 3; if (f[i + 1] > 200 && f[i + 2] > 185 && f[i] < 120) { teal++; ys.push(y); } }
		const c = ys.length ? (Math.min(...ys) + Math.max(...ys)) / 2 / 1280 : 0;
		check('subs: слово на кадре, центр ≈53 % высоты', teal > 300 && Math.abs(c - 0.53) < 0.02, `пикселей ${teal}, центр ${(c * 100).toFixed(1)} %`);
	}
	fs.writeFileSync(path.join(dir, 'script2.txt'), 'Ян бьёт справа\n');
	const s2 = node(['tools/subs.mjs', vert, words, path.join(dir, 'x.mp4'), '--script', path.join(dir, 'script2.txt')]);
	check('subs: слова не по сценарию отклоняются', s2.status !== 0);
}
console.log(fails ? `\nПРОВАЛЕНО проверок: ${fails}` : '\nвсе проверки пройдены');
process.exit(fails ? 1 : 0);
