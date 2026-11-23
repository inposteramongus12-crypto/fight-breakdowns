// Остатки по ключам ElevenLabs, список голосов и тест голосов одной фразой.
//   node tools/voice-check.mjs --balance
//   node tools/voice-check.mjs --voices [--key 9]
//   node tools/voice-check.mjs --test "фраза" --ids id1,id2,id3 --key 9 --out work/voicetest
// Ключи только из переменных окружения (tools/lib/eleven-keys.mjs), значения не печатаются и не пишутся.
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {parseArgs, die, say} from './lib/common.mjs';
import {findKeys} from './lib/eleven-keys.mjs';

if (!process.env.NODE_USE_ENV_PROXY && (process.env.HTTPS_PROXY || process.env.https_proxy)) {
	const r = spawnSync(process.execPath, process.argv.slice(1), {stdio: 'inherit', env: {...process.env, NODE_USE_ENV_PROXY: '1'}});
	process.exit(r.status ?? 1);
}
const {opt} = parseArgs(process.argv.slice(2), ['balance', 'voices']);
const BASE = 'https://api.elevenlabs.io';
const keys = findKeys();
if (!keys.length) die('нет ключей ELEVENLABS* в окружении');
const keyN = (n) => keys.find((k) => k.n === Number(n)) ?? die('нет ключа №' + n);

if (opt.balance) {
	for (const k of keys) {
		try {
			const r = await fetch(`${BASE}/v1/user/subscription`, {headers: {'xi-api-key': k.k}});
			if (!r.ok) { say(`ключ №${k.n}: HTTP ${r.status}`); continue; }
			const j = await r.json();
			say(`ключ №${k.n}: использовано ${j.character_count} из ${j.character_limit}, осталось ${j.character_limit - j.character_count}`);
		} catch (e) { say(`ключ №${k.n}: ошибка сети (${e.message})`); }
	}
}
if (opt.voices) {
	const r = await fetch(`${BASE}/v1/voices`, {headers: {'xi-api-key': keyN(opt.key ?? keys.at(-1).n).k}});
	if (!r.ok) die('голоса: HTTP ' + r.status);
	const j = await r.json();
	for (const v of j.voices) say(`${v.voice_id}  ${v.name}  [${v.category}] ${Object.values(v.labels ?? {}).join(', ')}`);
}
if (opt.test) {
	const out = path.resolve(opt.out ?? 'work/voicetest');
	fs.mkdirSync(out, {recursive: true});
	const k = keyN(opt.key ?? keys.at(-1).n);
	for (const id of String(opt.ids).split(',')) {
		const r = await fetch(`${BASE}/v1/text-to-speech/${id}?output_format=mp3_44100_128`, {
			method: 'POST',
			headers: {'xi-api-key': k.k, 'content-type': 'application/json'},
			body: JSON.stringify({text: opt.test, model_id: 'eleven_multilingual_v2'}),
		});
		if (!r.ok) { say(`${id}: HTTP ${r.status} ${(await r.text()).slice(0, 120)}`); continue; }
		fs.writeFileSync(path.join(out, `${id}.mp3`), Buffer.from(await r.arrayBuffer()));
		say(`${id}: записано ${path.join(out, id + '.mp3')} (ключ №${k.n}, ${opt.test.length} знаков)`);
	}
}
