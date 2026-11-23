export type P = [number, number];
export type Key = {t: number; x: number; y: number};

type Base = {id?: string; t0: number; t1?: number};

/** Стрелка: хвост в from, остриё растёт к to за grow секунд; с track остриё идёт по ключам (за кулаком). */
export type Arrow = Base & {
	type: 'arrow';
	from: P;
	to: P;
	bend?: number; // изгиб как доля длины хорды: 0 прямая, 0.3 заметная дуга, знак = сторона
	grow?: number; // сек, по умолчанию 0.25
	track?: Key[]; // положение острия по времени (в координатах клипа)
	color?: string;
	width?: number; // толщина ядра линии в пикселях итогового кадра 9:16, по умолчанию 2.5
};

/** Рамка. Либо x,y,w,h (левый верх), либо cx,cy,w,h; track двигает центр. */
export type Box = Base & {
	type: 'box';
	x?: number;
	y?: number;
	cx?: number;
	cy?: number;
	w: number;
	h: number;
	rotate?: number;
	track?: Key[]; // центр рамки по времени
	color?: string;
	width?: number;
};

/** Отметка: star — красная четырёхлучевая (попадание), cross — красный ✕ (разрыв дистанции), ring — белый овал. */
export type Mark = Base & {
	type: 'mark';
	kind: 'star' | 'cross' | 'ring';
	x: number;
	y: number;
	size?: number;
	w?: number;
	h?: number;
};

/** Заливка конечности: капсула от from до to с мягким краем (красная — бьющая рука/нога, жёлтая — герой). */
export type Limb = Base & {
	type: 'limb';
	from: P;
	to: P;
	width?: number;
	color?: 'red' | 'yellow' | string;
	opacity?: number;
};

/** Иконка в квадратной рамке с выноской к точке at (голова/рука). */
export type Icon = Base & {
	type: 'icon';
	kind: 'question' | 'double-question' | 'brain';
	at: P;
	box: P; // центр квадрата
	size?: number;
};

export type Label = Base & {type: 'label'; text: string; x: number; y: number; size?: number; color?: string};

/** Плашка-пилюля в углу кадра (16:9): «по данным прессы», «UFC 329 · 11.07.2026». Позиция в долях кадра, размеры от высоты кадра. */
export type Plaque = Base & {type: 'plaque'; text: string; pos?: 'tl' | 'tr' | 'bl' | 'br'};

/** Метка главы в левом верхнем углу (16:9): «3 / 8  Заход, сетка, перевод». */
export type Chapter = Base & {type: 'chapter'; n: number; total: number; title: string};

export type Item = Arrow | Box | Mark | Limb | Icon | Label | Plaque | Chapter;

export type OverlayProps = {
	width: number;
	height: number;
	fps: number;
	durationInFrames: number;
	styleScale: number; // во сколько раз увеличить линии, если клип потом режется под полосу 720×900
	items: Item[];
};

export type Word = {w: string; t0: number; t1: number};
export type SubsProps = {
	width: number;
	height: number;
	fps: number;
	durationInFrames: number;
	words: Word[];
	style?: {size?: number; color?: string; centerY?: number; weight?: number};
};

export type Phrase = {text: string; t0: number; t1: number};
export type CaptionsProps = {
	width: number;
	height: number;
	fps: number;
	durationInFrames: number;
	phrases: Phrase[];
	style?: {size?: number; color?: string; bottom?: number}; // size в долях высоты кадра (0.042), bottom — центр строки в долях высоты (0.9)
};
