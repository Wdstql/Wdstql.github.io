---
name: add-game
description: Add or update a game in the GAME LIFE archive (data/games/*.json) — e.g. "把《XX》加到游戏生涯里", "给只狼打 98 分", "加一张截图/一个B站视频".
---

1. Read `AGENTS.md` in this project for the data model and CLI.
2. If the game might already exist, run `npm run game -- list` and match by title first; update instead of duplicating.
3. For a new game, find the Steam AppID with `npm run game -- steam-search "<name>"` and verify the hit is the base game (not DLC/soundtrack). Then:
   `npm run game -- add "<中文名>" --steam <appid> --status <状态> [--score N] [--from YYYY-MM] [--to YYYY-MM] [--genres a,b]`
   Not on Steam → omit `--steam`, pass `--en`, `--platforms`, then set a cover with `npm run game -- cover <id> <url-or-file>`.
4. Only record what the user said. Anything you infer (score, played month, status) goes into the `inferred` field: `npm run game -- set <id> inferred=score,playedFrom`.
5. Screenshots: `npm run game -- shot <id> <file> "说明"`. Bilibili: `npm run game -- bili <id> <link> "备注"`.
6. Finish with `npm run game -- show <id>` and tell the user the page URL: `http://localhost:5180/game/<id>`.
