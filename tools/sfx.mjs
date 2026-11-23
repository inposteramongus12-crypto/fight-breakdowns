// Синтез звуковых эффектов шортов (без внешних записей): whoosh (свист на замедлении), thud (глухой удар), click (мягкий щелчок плашки).
//   node tools/sfx.mjs events.json out.wav [--dur 35.2]
// events.json: [{"t": 9.66, "type": "whoosh", "amp": 0.05}, ...] — t в секундах итогового ролика; amp — пик эффекта (доля полной шкалы).
// Уровни по умолчанию: whoosh 0.05 (≈ −26 dBFS), thud 0.16 (≈ −16 dBFS), click 0.03 (≈ −30 dBFS); голос остаётся главным (микс с приглушением в build-short).
import fs from 'node:fs';
import {parseArgs, readJson, die, say} from './lib/common.mjs';

export const SR = 44100;
const rnd = (() => { let s = 12345; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296) * 2 - 1; })();
const norm = (a, peak) => { let m = 1e-9; for (const v of a) m = Math.max(m, Math.abs(v)); return a.map((v) => (v / m) * peak); };

const whoosh = (amp) => {
	const dur = 0.6, n = Math.round(dur * SR), out = new Float64Array(n);
	let lp = 0, bp = 0; // фильтр состояния (SVF)
	for (let i = 0; i < n; i++) {
		const k = i / n;
		const fc = 400 + 3200 * Math.sin(Math.PI * Math.min(1, k * 1.15)) ** 1.2; // центр полосы растёт и падает
		const f = 2 * Math.sin((Math.PI * fc) / SR), q = 0.35;
		const x = rnd();
		lp += f * bp; const hp = x - lp - q * bp; bp += f * hp;
		const env = Math.sin(Math.PI * k) ** 2 * (1 - 0.3 * k);
		out[i] = bp * env;
	}
	return norm(out, amp);
};
const thud = (amp) => {
	const dur = 0.28, n = Math.round(dur * SR), out = new Float64Array(n);
	let ph = 0, lp = 0;
	for (let i = 0; i < n; i++) {
		const t = i / SR;
		const f = 38 + 52 * Math.exp(-t / 0.05);
		ph += (2 * Math.PI * f) / SR;
		lp += 0.06 * (rnd() - lp); // низкочастотный шум
		out[i] = (Math.sin(ph) * Math.exp(-t / 0.07) + 0.6 * lp * Math.exp(-t / 0.025)) * Math.min(1, t / 0.002);
	}
	return norm(out, amp);
};
const click = (amp) => {
	const n = Math.round(0.05 * SR), out = new Float64Array(n);
	for (let i = 0; i < n; i++) {
		const t = i / SR;
		out[i] = (Math.sin(2 * Math.PI * 1900 * t) * 0.7 + Math.sin(2 * Math.PI * 3100 * t) * 0.3) * Math.exp(-t / 0.007) * Math.min(1, t / 0.0006);
	}
	return norm(out, amp);
};
const DEF = {whoosh: [whoosh, 0.05], thud: [thud, 0.16], click: [click, 0.03]};

export const synth = (events, dur) => {
	const buf = new Float64Array(Math.ceil(dur * SR));
	for (const e of events) {
		const d = DEF[e.type] ?? die('неизвестный эффект: ' + e.type);
		const s = d[0](e.amp ?? d[1]);
		const o = Math.round(e.t * SR);
		for (let i = 0; i < s.length && o + i < buf.length; i++) if (o + i >= 0) buf[o + i] += s[i];
	}
	return buf;
};
export const writeWav = (file, buf) => {
	const n = buf.length, b = Buffer.alloc(44 + n * 2);
	b.write('RIFF', 0); b.writeUInt32LE(36 + n * 2, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22);
	b.writeUInt32LE(SR, 24); b.writeUInt32LE(SR * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(n * 2, 40);
	for (let i = 0; i < n; i++) b.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(buf[i] * 32767))), 44 + i * 2);
	fs.writeFileSync(file, b);
};
if (import.meta.url === `file://${process.argv[1]}`) {
	const {pos, opt} = parseArgs(process.argv.slice(2));
	if (pos.length < 2) die('использование: node tools/sfx.mjs events.json out.wav [--dur 35.2]');
	const ev = readJson(pos[0]);
	const dur = Number(opt.dur ?? Math.max(...ev.map((e) => e.t)) + 1);
	writeWav(pos[1], synth(ev, dur));
	say(`${ev.length} эффектов, ${dur.toFixed(2)} с → ${pos[1]}`);
}
