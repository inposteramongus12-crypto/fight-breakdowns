// Перевод разметки из пикселей исходного клипа в пиксели увеличенного (wide: 1280×720 → 1920×1080).
// Масштабируется только геометрия (точки, ключи track, размеры рамки/овала); толщины и размеры отметок/подписей
// задаются в «пикселях итогового кадра» и умножаются на styleScale в самом Overlay.
const pt = (p, k) => (Array.isArray(p) ? [p[0] * k, p[1] * k] : p);
export const scaleItem = (it, k) => {
	if (k === 1 || ['plaque', 'chapter'].includes(it.type)) return it; // плашки заданы в долях кадра
	const o = {...it};
	for (const f of ['from', 'to', 'at', 'box']) if (o[f]) o[f] = pt(o[f], k);
	for (const f of ['x', 'y', 'cx', 'cy']) if (Number.isFinite(o[f])) o[f] *= k;
	if (['box', 'mark'].includes(o.type)) for (const f of ['w', 'h']) if (Number.isFinite(o[f])) o[f] *= k;
	if (o.track) o.track = o.track.map((q) => ({...q, x: q.x * k, y: q.y * k}));
	return o;
};
