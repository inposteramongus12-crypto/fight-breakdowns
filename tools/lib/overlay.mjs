// Общее для annotate и subs: рендер прозрачного слоя Remotion (ProRes 4444 с альфой) и наложение ffmpeg.
import fs from 'node:fs';
import path from 'node:path';
import {ff, probe, remotionRender, writeJson, say} from './common.mjs';

export const renderAndComposite = ({comp, video, out, props, workName, keepOverlay = false, renderFrames}) => {
	const info = probe(video);
	const dir = path.resolve('work');
	fs.mkdirSync(dir, {recursive: true});
	const propsFile = path.join(dir, `${workName}.props.json`);
	const overlay = path.join(dir, `${workName}.overlay.mov`);
	const full = {width: info.width, height: info.height, fps: info.fps, durationInFrames: info.frames, ...props};
	writeJson(propsFile, full);
	const t0 = Date.now();
	remotionRender(comp, overlay, propsFile, [], {frames: renderFrames});
	say(`слой ${comp} отрендерен за ${Math.round((Date.now() - t0) / 1000)} с: ${overlay}`);
	ff(['-i', video, '-i', overlay, '-filter_complex', '[0:v][1:v]overlay=0:0:format=auto,format=yuv420p[o]', '-map', '[o]', '-c:v', 'libx264', '-crf', '14', '-preset', 'fast', '-an', out], {quiet: true});
	const o = probe(out);
	if (o.width !== info.width || o.height !== info.height || Math.abs(o.frames - info.frames) > 1) throw new Error(`размер или число кадров не совпали: ${o.width}×${o.height}, ${o.frames} вместо ${info.width}×${info.height}, ${info.frames}`);
	if (!keepOverlay) fs.rmSync(overlay, {force: true});
	say(`готово: ${out} (${o.width}×${o.height}, ${o.duration.toFixed(2)} с)`);
	return {info, out};
};
