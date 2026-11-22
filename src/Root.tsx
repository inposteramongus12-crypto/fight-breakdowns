import React from 'react';
import {Composition, continueRender, delayRender, staticFile} from 'remotion';
import {Overlay} from './Overlay';
import {Subs} from './Subs';
import type {OverlayProps, SubsProps} from './types';

// Rubik (variable 300–900) из public/fonts; таймаут большой, как в Tallest: короткий убивал вкладки рендера
const fontsReady = delayRender('fonts', {timeoutInMilliseconds: 3600000});
let released = false;
const release = () => {
	if (released) return;
	released = true;
	continueRender(fontsReady);
};
const f = new FontFace('Rubik', `url(${staticFile('fonts/Rubik.ttf')})`, {weight: '300 900'});
document.fonts.add(f);
f.load().then(release, release);
setTimeout(release, 60000);

const base = {width: 720, height: 1280, fps: 30, durationInFrames: 30};
const meta = ({props}: {props: {width: number; height: number; fps: number; durationInFrames: number}}) => ({
	width: props.width,
	height: props.height,
	fps: props.fps,
	durationInFrames: Math.max(1, props.durationInFrames),
});

export const Root: React.FC = () => (
	<>
		<Composition
			id="Overlay"
			component={Overlay as React.FC<any>}
			{...base}
			defaultProps={{...base, styleScale: 1, items: []} as OverlayProps}
			calculateMetadata={meta as any}
		/>
		<Composition
			id="Subs"
			component={Subs as React.FC<any>}
			{...base}
			defaultProps={{...base, words: []} as SubsProps}
			calculateMetadata={meta as any}
		/>
	</>
);
