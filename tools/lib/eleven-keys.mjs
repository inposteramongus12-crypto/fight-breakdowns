// ElevenLabs keys from the environment: every variable whose name contains ELEVENLABS.
// Numbering: ELEVENLABS_API_KEY = 1, ELEVENLABS_API_KEY_<N> = N, any other ELEVENLABS* name gets the next free number
// (sorted by name). Duplicate values are dropped (one account counted once). Values are never printed or stored.
export const findKeys = (env = process.env) => {
	const names = Object.keys(env)
		.filter((n) => n.includes('ELEVENLABS'))
		.filter((n) => /^\S{20,}$/.test(env[n] ?? '')); // a key, not an empty or text setting
	const num = (n) => (n === 'ELEVENLABS_API_KEY' ? 1 : /^ELEVENLABS_API_KEY_(\d+)$/.test(n) ? Number(n.match(/_(\d+)$/)[1]) : null);
	const taken = new Set();
	const out = [];
	const seen = new Set();
	for (const n of names.filter((x) => num(x) !== null).sort((a, b) => num(a) - num(b))) {
		if (seen.has(env[n]) || taken.has(num(n))) continue;
		seen.add(env[n]);
		taken.add(num(n));
		out.push({n: num(n), name: n, k: env[n]});
	}
	let next = 1;
	for (const n of names.filter((x) => num(x) === null).sort()) {
		if (seen.has(env[n])) continue;
		while (taken.has(next)) next++;
		seen.add(env[n]);
		taken.add(next);
		out.push({n: next, name: n, k: env[n]});
	}
	return out.sort((a, b) => a.n - b.n);
};
// --keys 3  -> keys 1..3;  --keys 2,5,7 -> exactly these numbers
export const pickKeys = (keys, arg) => {
	if (!arg) return keys;
	if (/^\d+$/.test(arg)) return keys.slice(0, Number(arg));
	const want = arg.split(',').map(Number);
	return keys.filter((k) => want.includes(k.n));
};
