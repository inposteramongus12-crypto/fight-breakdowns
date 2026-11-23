import React from 'react';
import {AbsoluteFill, useCurrentFrame, useVideoConfig} from 'remotion';
import type {CaptionsProps} from './types';

// Субтитры фразами внизу кадра для 16:9 (лонг): текст из сценария, тайминги из озвучки; в шортах слова по одному (Subs.tsx).
const FADE = 0.12;

export const Captions: React.FC<CaptionsProps> = ({phrases, style}) => {
	const frame = useCurrentFrame();
	const {fps, width, height} = useVideoConfig();
	const t = frame / fps;
	const size = (style?.size ?? 0.042) * height;
	const color = style?.color ?? '#FFFFFF';
	const cy = (style?.bottom ?? 0.9) * height;
	const cur = phrases.filter((x) => t >= x.t0 && t < x.t1);
	return (
		<AbsoluteFill>
			{cur.map((x, i) => {
				const op = Math.max(0, Math.min(1, (t - x.t0) / FADE, (x.t1 - t) / FADE));
				return (
					<div
						key={i}
						style={{
							position: 'absolute',
							left: width * 0.1,
							width: width * 0.8,
							top: cy,
							transform: 'translateY(-50%)',
							textAlign: 'center',
							fontFamily: 'Rubik, sans-serif',
							fontWeight: 700,
							fontSize: size,
							lineHeight: 1.18,
							color,
							opacity: op,
							textShadow: '0 0 4px rgba(0,0,0,0.9), 0 2px 8px rgba(0,0,0,0.8), 0 0 2px #000',
						}}
					>
						{x.text}
					</div>
				);
			})}
		</AbsoluteFill>
	);
};
