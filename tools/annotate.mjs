// Стрелки, рамки, отметки, иконки из annotations.json поверх клипа (анимация: стрелка появляется и тянется за ударом).
//   node tools/annotate.mjs clip.mp4 episodes/001/annotations.json out.mp4 [--keep-overlay] [--style-scale 1.2]
// Время — секунды клипа (клип, который подаёте на вход; после slowmo это время замедленного клипа,
// перевод из времени исходника: tools/timemap.mjs). Координаты — пиксели кадра этого клипа, начало слева сверху.
// Формат и примеры: docs/ANNOTATIONS.md. Запускать ДО vertical.mjs: стрелки сами масштабируются вместе с видео.
import path from 'node:path';
import {parseArgs, readJson, die, probe, styleScaleFor, say} from './lib/common.mjs';
import {renderAndComposite} from './lib/overlay.mjs';

const {pos, opt} = parseArgs(process.argv.slice(2), ['keep-overlay']);
if (pos.length < 3) die('использование: node tools/annotate.mjs clip.mp4 annotations.json out.mp4 [--keep-overlay] [--style-scale N]');
const [clip, annFile, out] = pos;
const info = probe(clip);
const raw = readJson(annFile);
const items = Array.isArray(raw) ? raw : raw.items;
if (!Array.isArray(items)) die('в annotations.json нужен массив items');

const isPt = (p) => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite);
const need = {
	arrow: (i) => isPt(i.from) && isPt(i.to),
	box: (i) => Number.isFinite(i.w) && Number.isFinite(i.h) && (i.track || (Number.isFinite(i.x) && Number.isFinite(i.y)) || (Number.isFinite(i.cx) && Number.isFinite(i.cy))),
	mark: (i) => ['star', 'cross', 'ring'].includes(i.kind) && Number.isFinite(i.x) && Number.isFinite(i.y),
	limb: (i) => isPt(i.from) && isPt(i.to),
	icon: (i) => ['question', 'double-question', 'brain'].includes(i.kind) && isPt(i.at) && isPt(i.box),
	label: (i) => typeof i.text === 'string' && Number.isFinite(i.x) && Number.isFinite(i.y),
	plaque: (i) => typeof i.text === 'string' && (i.pos === undefined || ['tl', 'tr', 'bl', 'br'].includes(i.pos)),
	chapter: (i) => (i.extra === true || (Number.isFinite(i.n) && Number.isFinite(i.total))) && typeof i.title === 'string',
};
items.forEach((it, n) => {
	const name = `#${n} (${it.id ?? it.type})`;
	if (!need[it.type]) die(`${name}: неизвестный type "${it.type}"; допустимо: ${Object.keys(need).join(', ')}`);
	if (!need[it.type](it)) die(`${name}: не хватает или неверны поля для ${it.type} (см. docs/ANNOTATIONS.md)`);
	if (!Number.isFinite(it.t0) || it.t0 < 0 || it.t0 >= info.duration) die(`${name}: t0=${it.t0} вне клипа (0–${info.duration.toFixed(2)} с)`);
	if (it.t1 !== undefined && !(it.t1 > it.t0)) die(`${name}: t1 должно быть больше t0`);
	const pts = [it.from, it.to, it.at, it.box, it.x !== undefined ? [it.x, it.y] : null, it.cx !== undefined ? [it.cx, it.cy] : null].filter(Boolean);
	for (const [x, y] of pts) if (x < -50 || y < -50 || x > info.width + 50 || y > info.height + 50) say(`ВНИМАНИЕ ${name}: точка (${x}, ${y}) за пределами кадра ${info.width}×${info.height}`);
});
const styleScale = Number(opt['style-scale'] ?? styleScaleFor(info.width, info.height));
say(`${items.length} элементов, клип ${info.width}×${info.height}, масштаб линий ×${styleScale.toFixed(2)}`);
renderAndComposite({comp: 'Overlay', video: clip, out, props: {styleScale, items}, workName: path.basename(out).replace(/\.[^.]+$/, '') + '.ann', keepOverlay: !!opt['keep-overlay']});
