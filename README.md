# fight-breakdowns

Разборы боёв для шортсов 9:16: нарезка, замедление, анимированные стрелки и рамки, субтитры по одному слову, озвучка ElevenLabs с таймингами слов.

- `FORMAT.md` — формат (раскладка, субтитры, накладки, замедление, структура) с замерами;
- `FORMAT_NOTES.md` — заметки по 6 роликам-референсам;
- `CLAUDE.md` — правила работы и порядок разбора;
- `docs/ANNOTATIONS.md` — формат `annotations.json`;
- `episodes/_template/` — шаблон выпуска: `script.ru.txt`, `annotations.json`, `plan.md`.

## Установка

```bash
npm install
npm run selftest
```

Нужны ffmpeg в системе (иначе берётся из Remotion) и Chromium (в облаке `/opt/pw-browsers/chromium`, иначе Remotion скачает свой).

## Команды

```bash
node tools/cut.mjs clips/raw.mp4 work/cut.mp4 --from 12.3 --to 14.8
node tools/slowmo.mjs work/cut.mp4 work/slow.mp4 --segments "0.5-1.4:8"
node tools/timemap.mjs work/slow.timemap.json --src 0.9
node tools/frames.mjs work/slow.mp4 --from 3 --to 4 --every 0.1 --out work/frames --grid 4
node tools/annotate.mjs work/slow.mp4 episodes/001/annotations.json work/ann.mp4
node tools/verify.mjs work/slow.mp4 work/ann.mp4 episodes/001/annotations.json
node tools/vertical.mjs work/ann.mp4 work/vert.mp4 --cx 0.45
node tools/voice.mjs episodes/001 --plan
node tools/voice.mjs episodes/001 --voice N [--only 1]   # озвучка; schedule.json задаёт старт каждой реплики
node tools/build-short.mjs episodes/001                   # сегменты из timeline.json → шорт в out/
node tools/subs.mjs work/vert.mp4 episodes/001/voice/words.json out/final.mp4 --script episodes/001/script.ru.txt
```

## Что взято из Tallest

Шрифт Rubik (`public/fonts`), перебор ключей ElevenLabs из окружения (`tools/lib/eleven-keys.mjs`), схема озвучки (повтор при 429, ключи только из окружения, перезапуск Node с `NODE_USE_ENV_PROXY=1`), версии Remotion, исправление таймера загрузки шрифтов в `Root.tsx`, `chmod +x` бинарников compositor, запуск GPU-режима `--gl=angle`. Сцены, стикмены и сюжетные инструменты не брались.
