// Микс голоса с подложкой эффектов (приглушение под голос) и двухпроходной loudnorm с проверкой истинного пика.
import fs from 'node:fs';
import {spawnSync} from 'node:child_process';
import {ff, ffbin, say} from './common.mjs';

export const mixVoiceBed = (voice, bed, out, dur) => {
	const f = '[1:a]aresample=44100,aformat=channel_layouts=mono[b];[0:a]aresample=44100,aformat=channel_layouts=mono,asplit[v][vs];[b][vs]sidechaincompress=threshold=0.02:ratio=6:attack=8:release=250[bd];[v][bd]amix=inputs=2:duration=first:normalize=0,apad=whole_dur=' + dur.toFixed(3) + ',atrim=0:' + dur.toFixed(3) + '[o]';
	ff(['-i', voice, '-i', bed, '-filter_complex', f, '-map', '[o]', '-c:a', 'pcm_s16le', out], {quiet: true});
};
export const peakOf = (file) => {
	const r = spawnSync(ffbin(), ['-hide_banner', '-i', file, '-af', 'ebur128=peak=true', '-f', 'null', '-'], {encoding: 'utf8', maxBuffer: 1 << 26});
	const m = [...(r.stderr ?? '').matchAll(/Peak:\s+(-?[\d.]+) dBFS/g)].pop();
	const i = [...(r.stderr ?? '').matchAll(/I:\s+(-?[\d.]+) LUFS/g)].pop();
	return {peak: m ? Number(m[1]) : NaN, lufs: i ? Number(i[1]) : NaN};
};
// in: любой файл со звуком → out (aac в mp4/m4a по расширению), −16 LUFS, истинный пик ≤ −1,0 dBFS
export const loudnormTo = (inp, out, {extra = []} = {}) => {
	const meas = spawnSync(ffbin(), ['-hide_banner', '-i', inp, '-vn', '-af', 'loudnorm=I=-16:TP=-2:LRA=11:print_format=json', '-f', 'null', '-'], {encoding: 'utf8', maxBuffer: 1 << 26});
	const js = JSON.parse((meas.stderr ?? '').slice((meas.stderr ?? '').lastIndexOf('{')));
	let tp = -2, res;
	for (let k = 0; k < 5; k++) {
		const f = `loudnorm=I=-16:TP=${tp}:LRA=11:measured_I=${js.input_i}:measured_TP=${js.input_tp}:measured_LRA=${js.input_lra}:measured_thresh=${js.input_thresh}:offset=${js.target_offset}:linear=true,alimiter=limit=${(10 ** ((tp - 0.5) / 20)).toFixed(4)}:level=disabled`;
		ff(['-i', inp, ...extra, '-af', f, '-c:a', 'aac', '-b:a', '192k', out], {quiet: true});
		res = peakOf(out);
		say(`громкость: ${res.lufs} LUFS, истинный пик ${res.peak} dBFS (цель TP ${tp.toFixed(1)})`);
		if (res.peak <= -1.0) return res;
		tp -= 0.7;
	}
	return res;
};
