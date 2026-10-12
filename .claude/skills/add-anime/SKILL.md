---
name: add-anime
description: Add or update an anime in the ANIME LIFE sub-site (data/anime/*.json, pages under /anime) — e.g. "把《XX》第二季加到番剧里", "我在看 XX", "XX 弃坑了".
---

1. Read the「番剧子站」section of `AGENTS.md` for the data model and CLI.
2. One season = one record. Check `npm run anime -- list` first and update instead of duplicating.
3. Find the Bangumi subject of that exact season: `npm run anime -- search "<中文或日文名>"`. Pick the TV/剧场版 entry whose date matches the season (not PV/CM/总集篇). Then:
   `npm run anime -- add <BangumiID> --status 已看过|正在看|待观看|已弃坑 [--progress "看到…"] [--series "<系列名>" --season "第二季"]`
   This fills titles, episodes, studio, synopsis, cover, banner and 是否完结 (`air`).
4. Only record what the user said. Anything you infer (status of a later season, watch dates, score) goes into `inferred`: `npm run anime -- set <id> inferred=status`.
5. A season split into two cours on Bangumi (e.g. SPY×FAMILY 第2クール) stays one record: add the first part, then `set <id> episodes=<total> airEnd=YYYY-MM`.
6. Finish with `npm run anime -- show <id>` and give the page URL: `http://localhost:5180/anime/<id>`.
