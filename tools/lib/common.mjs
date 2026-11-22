// Общие помощники. Все инструменты запускаются из корня репозитория: node tools/<tool>.mjs ...
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync, spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const FPS = 30;
export const W = 720; // итоговый кадр 9:16
export const H = 1280;
export const BAND_H = 900; // полоса с видео по центру (замер по референсам: 720×~900)

export const say = (...a) => console.log('[' + new Date().toISOString().slice(11, 19) + ']', ...a);
export const die = (msg) => {
	console.error('ОШИБКА: ' + msg);
	process.exit(1);
};

/* ffmpeg: системный, иначе из пакета Remotion */
const which = (name) => {
	const r = spawnSync('which', [name], {encoding: 'utf8'});
	return r.status === 0 ? r.stdout.trim() : null;
};
export const ffbin = (name = 'ffmpeg') => {
	const sys = which(name);
	if (sys) return sys;
	const base = path.join(ROOT, 'node_modules', '@remotion');
	if (fs.existsSync(base))
		for (const d of fs.readdirSync(base))
			if (d.startsWith('compositor-')) {
				const p = path.join(base, d, name);
				if (fs.existsSync(p)) return p;
			}
	throw new Error(name + ' не найден (ни в системе, ни в node_modules/@remotion/compositor-*)');
};

export const ff = (args, {quiet = false} = {}) => {
	const r = spawnSync(ffbin(), ['-hide_banner', '-v', quiet ? 'error' : 'warning', '-y', ...args], {encoding: 'utf8', maxBuffer: 1 << 28});
	if (r.status !== 0) die('ffmpeg упал:\n' + (r.stderr || '').slice(-1500));
	return r;
};

export const probe = (file) => {
	if (!fs.existsSync(file)) die('нет файла ' + file);
	const r = spawnSync(ffbin('ffprobe'), ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height,r_frame_rate,nb_frames,duration:format=duration', '-of', 'json', file], {encoding: 'utf8'});
	const j = JSON.parse(r.stdout || '{}');
	const s = j.streams?.[0];
	if (!s) die('в файле нет видео: ' + file);
	const [a, b] = s.r_frame_rate.split('/').map(Number);
	const fps = b ? a / b : a;
	const duration = Number(s.duration ?? j.format?.duration);
	return {width: s.width, height: s.height, fps, duration, frames: Math.round(duration * fps)};
};

/* время: 12.5 | "12,5" | "1:02.5" | "0:01:02.5" -> секунды */
export const parseTime = (v) => {
	if (typeof v === 'number') return v;
	const parts = String(v).trim().replace(',', '.').split(':').map(Number);
	if (parts.some(Number.isNaN)) die('не разобрал время: ' + v);
	return parts.reduce((acc, x) => acc * 60 + x, 0);
};

/* простой разбор аргументов: позиционные + --флаг значение + --булев */
export const parseArgs = (argv, boolFlags = []) => {
	const pos = [];
	const opt = {};
	for (let i = 0; i < argv.length; i++) {
		const a = argv[i];
		if (a.startsWith('--')) {
			const k = a.slice(2);
			if (boolFlags.includes(k) || i + 1 >= argv.length || argv[i + 1].startsWith('--')) opt[k] = true;
			else opt[k] = argv[++i];
		} else pos.push(a);
	}
	return {pos, opt};
};

export const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
export const writeJson = (p, v) => {
	fs.mkdirSync(path.dirname(p), {recursive: true});
	fs.writeFileSync(p, JSON.stringify(v, null, 1));
};

/* Remotion: запуск CLI через node, браузер — предустановленный Chromium (без скачивания) */
const remotionCli = () => path.join(ROOT, 'node_modules', '@remotion', 'cli', 'remotion-cli.js');
export const browserExe = () => {
	for (const p of ['/opt/pw-browsers/chromium', process.env.CHROME_PATH].filter(Boolean)) if (fs.existsSync(p)) return p;
	return null;
};
export const ensureRemotionBinaries = () => {
	// в облаке у бинарников compositor иногда нет прав на запуск (EACCES, код 126)
	const base = path.join(ROOT, 'node_modules', '@remotion');
	if (!fs.existsSync(base)) die('Remotion не установлен: выполните npm install');
	for (const d of fs.readdirSync(base))
		if (d.startsWith('compositor-'))
			for (const f of fs.readdirSync(path.join(base, d))) {
				const p = path.join(base, d, f);
				try {
					if (fs.statSync(p).isFile() && !f.endsWith('.json') && !f.endsWith('.md')) fs.chmodSync(p, 0o755);
				} catch {}
			}
};
export const remotionRender = (comp, outFile, propsFile, extra = [], {frames} = {}) => {
	ensureRemotionBinaries();
	const args = [
		remotionCli(), 'render', path.join(ROOT, 'src', 'index.ts'), comp, outFile,
		'--props=' + propsFile,
		'--codec=prores', '--prores-profile=4444', '--pixel-format=yuva444p10le', '--image-format=png',
		'--muted', '--gl=angle', '--log=error', '--timeout=180000', '--concurrency=' + (process.env.RENDER_CONCURRENCY || '3'),
		...extra,
	];
	if (frames) args.push('--frames=' + frames);
	const be = browserExe();
	if (be) args.push('--browser-executable=' + be);
	const r = spawnSync(process.execPath, args, {stdio: 'inherit', cwd: ROOT, env: {...process.env, NODE_USE_ENV_PROXY: '1'}});
	if (r.status !== 0) die(`remotion render ${comp} завершился с кодом ${r.status}`);
};

/* ширина стрелок/рамок задаётся в пикселях ИТОГОВОГО кадра 9:16; на исходном клипе
   (например 1920×1080), который потом режется под полосу 720×900, линии надо увеличить */
export const styleScaleFor = (w, h) => {
	const cover = Math.max(W / w, BAND_H / h); // масштаб «cover» под полосу
	return 1 / cover;
};
