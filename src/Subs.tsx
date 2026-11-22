import React from 'react';
import {AbsoluteFill, useCurrentFrame, useVideoConfig} from 'remotion';
import type {SubsProps} from './types';

// Стиль по замерам референсов (FORMAT.md): одно слово, бирюзовый ≈#45F6E7, жирный гротеск,
// кегль ≈40 px (x-height ≈20 px), центр по вертикали ≈53 % высоты кадра, мягкая тёмная тень,
// на стыке слов лёгкое затухание (в референсах слова на смене полупрозрачны).
const FADE = 0.07;

export const Subs: React.FC<SubsProps> = ({words, style}) => {
	const frame = useCurrentFrame();
	const {fps, width, height} = useVideoConfig();
	const t = frame / fps;
	const size = style?.size ?? 40;
	const color = style?.color ?? '#45F6E7';
	const cy = (style?.centerY ?? 0.53) * height;
	const weight = style?.weight ?? 800;
	const cur = words.filter((x) => t >= x.t0 && t < x.t1);
	return (
		<AbsoluteFill>
			{cur.map((x, i) => {
				const op = Math.max(0, Math.min(1, (t - x.t0) / FADE, (x.t1 - t) / FADE));
				return (
					<div
						key={i}
						style={{
							position: 'absolute',
							left: 0,
							width,
							top: cy,
							transform: 'translateY(-50%)',
							textAlign: 'center',
							fontFamily: 'Rubik, sans-serif',
							fontWeight: weight,
							fontSize: size,
							lineHeight: 1,
							color,
							opacity: op,
							textShadow: '0 2px 6px rgba(0,0,0,0.65), 0 0 2px rgba(0,0,0,0.5)',
							whiteSpace: 'nowrap',
						}}
					>
						{x.w}
					</div>
				);
			})}
		</AbsoluteFill>
	);
};
