import React from 'react';
import {AbsoluteFill, useCurrentFrame, useVideoConfig} from 'remotion';
import type {Arrow, Box, Chapter, Icon, Item, Key, Label, Limb, Mark, OverlayProps, P, Plaque} from './types';

// Стиль по референсам (FORMAT.md): белые тонкие линии с мягким свечением, рамки 4 px,
// красный ≈#FF3B3B для заливки и отметок. Толщины даны в пикселях итогового кадра 9:16
// и умножаются на styleScale, если клип потом режется под полосу 720×900.
const WHITE = '#FFFFFF';
const RED = '#FF3B3B';
const YELLOW = '#F6E927';
const clamp = (v: number, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
const easeOut = (k: number) => 1 - Math.pow(1 - clamp(k), 3);
const easeInOut = (k: number) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);

const keyAt = (track: Key[], t: number): P => {
	const s = [...track].sort((a, b) => a.t - b.t);
	if (t <= s[0].t) return [s[0].x, s[0].y];
	if (t >= s[s.length - 1].t) return [s[s.length - 1].x, s[s.length - 1].y];
	for (let i = 0; i < s.length - 1; i++)
		if (t >= s[i].t && t <= s[i + 1].t) {
			const k = (t - s[i].t) / (s[i + 1].t - s[i].t); // линейно: ключи ставятся часто (кадры каждые 0,1–0,2 с)
			return [lerp(s[i].x, s[i + 1].x, k), lerp(s[i].y, s[i + 1].y, k)];
		}
	return [s[0].x, s[0].y];
};

/** непрозрачность: появление fin сек, затухание fout сек перед t1 */
const life = (t: number, t0: number, t1: number, fin = 0.06, fout = 0.12) => clamp(Math.min((t - t0) / fin, (t1 - t) / fout));

const glow = (c: string, r = 7) => `drop-shadow(0 0 ${r}px ${c}) drop-shadow(0 0 2px ${c})`;

const arrowGeom = (a: Arrow, t: number) => {
	const grow = a.grow ?? 0.25;
	const p0: P = a.track ? keyAt(a.track, a.t0) : a.from;
	const tip: P = a.track ? keyAt(a.track, t) : [lerp(a.from[0], a.to[0], easeOut((t - a.t0) / grow)), lerp(a.from[1], a.to[1], easeOut((t - a.t0) / grow))];
	// хвост остаётся в from, остриё тянется
	const tail: P = a.from;
	const dx = tip[0] - tail[0];
	const dy = tip[1] - tail[1];
	const len = Math.hypot(dx, dy) || 1;
	const n: P = [-dy / len, dx / len];
	const bend = (a.bend ?? 0) * len;
	const ctrl: P = [(tail[0] + tip[0]) / 2 + n[0] * bend, (tail[1] + tip[1]) / 2 + n[1] * bend];
	return {tail, tip, ctrl, len, p0};
};

const ArrowEl: React.FC<{a: Arrow; t: number; ss: number}> = ({a, t, ss}) => {
	const t1 = a.t1 ?? a.t0 + 1;
	if (t < a.t0 || t > t1) return null;
	const {tail, tip, ctrl, len} = arrowGeom(a, t);
	if (len < 2) return null;
	const color = a.color ?? WHITE;
	const w = (a.width ?? 2.5) * ss; // в референсах белое ядро линии ≈1–2 px + свечение
	const head = 22 * ss;
	// направление острия = касательная в конце кривой
	const tx = tip[0] - ctrl[0];
	const ty = tip[1] - ctrl[1];
	const tl = Math.hypot(tx, ty) || 1;
	const u: P = [tx / tl, ty / tl];
	const v: P = [-u[1], u[0]];
	const base: P = [tip[0] - u[0] * head, tip[1] - u[1] * head];
	const h1: P = [base[0] + v[0] * head * 0.45, base[1] + v[1] * head * 0.45];
	const h2: P = [base[0] - v[0] * head * 0.45, base[1] - v[1] * head * 0.45];
	// линия заканчивается у основания головки, чтобы не торчала за остриём
	const endLine: P = [base[0] + u[0] * 2, base[1] + u[1] * 2];
	const op = life(t, a.t0, t1);
	return (
		<g opacity={op} style={{filter: glow(color, 7 * ss)}}>
			<path d={`M ${tail[0]} ${tail[1]} Q ${ctrl[0]} ${ctrl[1]} ${endLine[0]} ${endLine[1]}`} fill="none" stroke={color} strokeWidth={w} strokeLinecap="round" />
			<polygon points={`${tip[0]},${tip[1]} ${h1[0]},${h1[1]} ${h2[0]},${h2[1]}`} fill={color} />
		</g>
	);
};

const BoxEl: React.FC<{b: Box; t: number; ss: number}> = ({b, t, ss}) => {
	const t1 = b.t1 ?? b.t0 + 1;
	if (t < b.t0 || t > t1) return null;
	const c: P = b.track ? keyAt(b.track, t) : b.cx !== undefined ? [b.cx, b.cy as number] : [(b.x as number) + b.w / 2, (b.y as number) + b.h / 2];
	const pop = lerp(0.85, 1, easeOut((t - b.t0) / 0.12));
	const color = b.color ?? WHITE;
	const w = (b.width ?? 4) * ss;
	return (
		<g opacity={life(t, b.t0, t1, 0.08)} style={{filter: glow(color, 6 * ss)}} transform={`translate(${c[0]} ${c[1]}) rotate(${b.rotate ?? 0}) scale(${pop})`}>
			<rect x={-b.w / 2} y={-b.h / 2} width={b.w} height={b.h} fill="none" stroke={color} strokeWidth={w} />
		</g>
	);
};

const star = (r: number) => {
	// четырёхлучевая звезда
	const k = r * 0.18;
	return `M 0 ${-r} L ${k} ${-k} L ${r} 0 L ${k} ${k} L 0 ${r} L ${-k} ${k} L ${-r} 0 L ${-k} ${-k} Z`;
};

const MarkEl: React.FC<{m: Mark; t: number; ss: number}> = ({m, t, ss}) => {
	const t1 = m.t1 ?? m.t0 + 0.6;
	if (t < m.t0 || t > t1) return null;
	const size = (m.size ?? 70) * ss;
	const k = t - m.t0;
	const pulse = k < 0.1 ? lerp(0.3, 1.2, k / 0.1) : k < 0.22 ? lerp(1.2, 1, (k - 0.1) / 0.12) : 1;
	const op = life(t, m.t0, t1, 0.03, 0.15);
	if (m.kind === 'star')
		return (
			<g opacity={op} transform={`translate(${m.x} ${m.y}) scale(${pulse})`} style={{filter: glow(RED, 10 * ss)}}>
				<path d={star(size / 2)} fill={RED} />
				<circle r={size * 0.1} fill="#FFFFFF" opacity={0.9} />
			</g>
		);
	if (m.kind === 'cross') {
		const r = size / 2;
		return (
			<g opacity={op} transform={`translate(${m.x} ${m.y}) scale(${pulse})`} style={{filter: glow(RED, 8 * ss)}}>
				<path d={`M ${-r} ${-r} L ${r} ${r} M ${r} ${-r} L ${-r} ${r}`} stroke={RED} strokeWidth={9 * ss} strokeLinecap="round" />
			</g>
		);
	}
	return (
		<g opacity={op} transform={`translate(${m.x} ${m.y})`} style={{filter: glow(WHITE, 6 * ss)}}>
			<ellipse rx={(m.w ?? size * 2) / 2} ry={(m.h ?? size) / 2} fill="none" stroke={WHITE} strokeWidth={4 * ss} />
		</g>
	);
};

const LimbEl: React.FC<{l: Limb; t: number; ss: number}> = ({l, t, ss}) => {
	const t1 = l.t1 ?? l.t0 + 1;
	if (t < l.t0 || t > t1) return null;
	const col = l.color === 'yellow' ? YELLOW : l.color === 'red' || !l.color ? '#FF3B2F' : l.color;
	const w = (l.width ?? 80) * ss;
	return (
		<g opacity={life(t, l.t0, t1, 0.15, 0.2) * (l.opacity ?? 0.6)} style={{filter: `blur(${w * 0.14}px)`}}>
			<line x1={l.from[0]} y1={l.from[1]} x2={l.to[0]} y2={l.to[1]} stroke={col} strokeWidth={w} strokeLinecap="round" />
		</g>
	);
};

const brain = (s: number) => (
	// упрощённый мозг: два полушария и извилины
	<g transform={`scale(${s / 64})`} fill="none" stroke={WHITE} strokeWidth={3.2} strokeLinecap="round" strokeLinejoin="round">
		<path d="M -2 -22 C -10 -30 -26 -26 -26 -12 C -34 -8 -32 6 -26 8 C -28 20 -14 28 -6 20 C -4 24 -2 24 -2 22 Z" />
		<path d="M 2 -22 C 10 -30 26 -26 26 -12 C 34 -8 32 6 26 8 C 28 20 14 28 6 20 C 4 24 2 24 2 22 Z" />
		<path d="M -14 -12 C -8 -10 -8 -2 -14 0 M 14 -12 C 8 -10 8 -2 14 0 M -16 10 C -10 8 -6 12 -6 16 M 16 10 C 10 8 6 12 6 16" />
	</g>
);

const IconEl: React.FC<{i: Icon; t: number; ss: number}> = ({i, t, ss}) => {
	const t1 = i.t1 ?? i.t0 + 1;
	if (t < i.t0 || t > t1) return null;
	const s = (i.size ?? 110) * ss; // квадрат иконки в референсах ≈110 px
	const pop = lerp(0.8, 1, easeOut((t - i.t0) / 0.12));
	const [bx, by] = i.box;
	// выноска от ближней точки на границе квадрата к якорю, с точкой на конце
	const dx = i.at[0] - bx;
	const dy = i.at[1] - by;
	const m = Math.max(Math.abs(dx), Math.abs(dy)) || 1;
	const sx = bx + (dx / m) * (s / 2);
	const sy = by + (dy / m) * (s / 2);
	return (
		<g opacity={life(t, i.t0, t1, 0.08)} style={{filter: glow(WHITE, 6 * ss)}}>
			<line x1={sx} y1={sy} x2={i.at[0]} y2={i.at[1]} stroke={WHITE} strokeWidth={3 * ss} />
			<circle cx={i.at[0]} cy={i.at[1]} r={7 * ss} fill={WHITE} />
			<g transform={`translate(${bx} ${by}) scale(${pop})`}>
				<rect x={-s / 2} y={-s / 2} width={s} height={s} fill="rgba(0,0,0,0.25)" stroke={WHITE} strokeWidth={4 * ss} />
				{i.kind === 'brain' ? (
					brain(s * 0.62)
				) : (
					<text x={0} y={s * 0.2} textAnchor="middle" fontFamily="Rubik" fontWeight={800} fontSize={s * (i.kind === 'double-question' ? 0.52 : 0.68)} fill={WHITE}>
						{i.kind === 'double-question' ? '??' : '?'}
					</text>
				)}
			</g>
		</g>
	);
};

const LabelEl: React.FC<{l: Label; t: number; ss: number}> = ({l, t, ss}) => {
	const t1 = l.t1 ?? l.t0 + 1;
	if (t < l.t0 || t > t1) return null;
	return (
		<text x={l.x} y={l.y} textAnchor="middle" fontFamily="Rubik" fontWeight={800} fontSize={(l.size ?? 56) * ss} fill={l.color ?? YELLOW} opacity={life(t, l.t0, t1)} stroke="#000" strokeWidth={5 * ss} paintOrder="stroke" style={{filter: glow(l.color ?? YELLOW, 8 * ss)}}>
			{l.text}
		</text>
	);
};

// Плашки и метка главы (16:9): HTML-слой, размеры от высоты кадра, текст белый на тёмной полупрозрачной подложке.
const pill = (h: number): React.CSSProperties => ({
	position: 'absolute',
	fontFamily: 'Rubik, sans-serif',
	fontWeight: 700,
	fontSize: h * 0.034,
	lineHeight: 1,
	color: '#FFFFFF',
	background: 'rgba(8,10,14,0.72)',
	border: `${Math.max(1, h * 0.002)}px solid rgba(255,255,255,0.55)`,
	borderRadius: h * 0.02,
	padding: `${h * 0.014}px ${h * 0.026}px`,
	whiteSpace: 'nowrap',
});
const PlaqueEl: React.FC<{p: Plaque; t: number; h: number; w: number}> = ({p, t, h, w}) => {
	const t1 = p.t1 ?? p.t0 + 2;
	if (t < p.t0 || t > t1) return null;
	const pos = p.pos ?? 'tr';
	const m = h * 0.06; // отступ плашки от края кадра ≥ 60 px при высоте 1080
	const st: React.CSSProperties = {...pill(h), opacity: life(t, p.t0, t1, 0.15, 0.2)};
	if (pos[0] === 't') st.top = m;
	else st.bottom = m;
	if (pos[1] === 'l') st.left = m;
	else st.right = m;
	void w;
	return <div style={st}>{p.text}</div>;
};
const ChapterEl: React.FC<{c: Chapter; t: number; h: number}> = ({c, t, h}) => {
	const t1 = c.t1 ?? c.t0 + 2.5;
	if (t < c.t0 || t > t1) return null;
	const m = h * 0.06; // отступ плашки от края кадра ≥ 60 px при высоте 1080
	return (
		<div style={{...pill(h), top: m, left: m, opacity: life(t, c.t0, t1, 0.2, 0.3)}}>
			<span style={{color: '#45F6E7', marginRight: h * 0.016}}>
				{c.extra ? '+' : `${c.n} / ${c.total}`}
			</span>
			{c.title}
		</div>
	);
};

export const Overlay: React.FC<OverlayProps> = ({items, styleScale, width, height}) => {
	const frame = useCurrentFrame();
	const {fps} = useVideoConfig();
	const t = frame / fps;
	const ss = styleScale || 1;
	// заливки рисуем под линиями
	const order: Item['type'][] = ['limb', 'box', 'icon', 'mark', 'arrow', 'label'];
	return (
		<AbsoluteFill>
			<svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
				{order.flatMap((ty) =>
					items
						.filter((x) => x.type === ty)
						.map((x, k) => {
							const key = `${ty}-${k}`;
							switch (x.type) {
								case 'arrow':
									return <ArrowEl key={key} a={x} t={t} ss={ss} />;
								case 'box':
									return <BoxEl key={key} b={x} t={t} ss={ss} />;
								case 'mark':
									return <MarkEl key={key} m={x} t={t} ss={ss} />;
								case 'limb':
									return <LimbEl key={key} l={x} t={t} ss={ss} />;
								case 'icon':
									return <IconEl key={key} i={x} t={t} ss={ss} />;
								case 'label':
									return <LabelEl key={key} l={x} t={t} ss={ss} />;
								default:
									return null;
							}
						}),
				)}
			</svg>
			{items.map((x, k) => (x.type === 'plaque' ? <PlaqueEl key={`pl${k}`} p={x} t={t} h={height} w={width} /> : x.type === 'chapter' ? <ChapterEl key={`ch${k}`} c={x} t={t} h={height} /> : null))}
		</AbsoluteFill>
	);
};
