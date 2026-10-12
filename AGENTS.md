# GAME LIFE — 给 agent 的操作说明

wdstql 的个人游戏生涯档案网站，发布在 https://wdstql.github.io/ 。Vite + React + TypeScript，数据全部是本地文件，没有数据库。

同一个项目里还有一个独立的**番剧子站**，地址 https://wdstql.github.io/anime/ ，说明见文末「番剧子站」一节。

## 数据在哪里

| 路径 | 内容 |
| --- | --- |
| `data/games/<id>.json` | 一个游戏一个文件。`id` = 文件名，小写字母、数字、连字符 |
| `data/awards.json` | 「喜好表」奖项列表：`{ id, title, gameId }` |
| `public/media/<id>/` | 封面 `cover.jpg`、横幅 `hero.jpg`、截图 `moments/`、B 站封面 `fanworks/` |
| `src/types.ts` | 数据结构的唯一定义（`Game`、`Status`、`GENRES`） |

开发服务器运行时，`data/` 下的文件一改，打开的网页会自动刷新，不需要重启。

## 添加游戏（推荐用 CLI）

```bash
# 自动搜 Steam：填好英文名、发售时间、开发商，下载封面和横幅
npm run game -- add "空洞骑士" --steam auto --en "Hollow Knight" --status 已完结 --score 97 --from 2019-07 --genres 类银河恶魔城,动作

# 已知 Steam AppID 时更准确
npm run game -- add "只狼" --steam 814380 --status 已完结 --score 98

# 主机 / 手游（Steam 上没有）：手动创建，再设置封面
npm run game -- add "血源诅咒" --en Bloodborne --platforms PS4 --status 已完结 --score 91
npm run game -- cover bloodborne https://example.com/bloodborne.jpg
```

不确定 AppID 时先查：`npm run game -- steam-search "关键词"`（中英文都可以）。

`--steam auto` 只给中文名时，必须和 Steam 名称完全一致才会自动关联，否则命令会列出候选并停止。Steam 上大多是英文名，所以请同时传 `--en`。

## 修改记录

```bash
npm run game -- set sekiro score=99 status=已完结 from=2019-04 to=2019-06 hours=80
npm run game -- set sekiro oneLiner="一心，我来了" review=@notes/sekiro.md
npm run game -- shot sekiro ./screenshot.png "第一次打过剑圣"
npm run game -- bili sekiro https://www.bilibili.com/video/BV1xx411c7mD "最好的剧情解析"
npm run game -- award "最爱的" sekiro
npm run game -- list --status 游玩中
```

也可以直接编辑 JSON 文件。写入时会经过 `server/store.ts` 的 `normalizeGame` 校验；手改文件时请遵守下面的字段规则。

## Game 字段

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | string | 与文件名一致 |
| `title` | string | 中文名（必填） |
| `titleEn` / `titleJa` | string? | 英文名 / 日文名 |
| `steamAppId` | number \| null | 有值时封面从 Steam CDN 下载 |
| `platforms` | string[] | 用户**实际游玩**的平台（不是游戏支持的全部平台）：`PC` `PS5` `PS4` `Switch` `Xbox` `Mobile`。不知道就留空，不要从商店页填 |
| `release` | `YYYY-MM`? | 首发时间 |
| `developer` | string? | 开发商 |
| `genres` | string[] | 优先从 `GENRES` 里选：魂系、动作、类银河恶魔城、平台跳跃、推理、悬疑、文字冒险、解谜、Roguelike、卡牌、策略、角色扮演、音游、派对、合作、射击、恐怖、叙事、开放世界、恋爱 |
| `cover` / `hero` | string? | `/media/<id>/...` 或图片 URL |
| `status` | enum | `finished` 已完结 · `playing` 游玩中 · `paused` 暂停中 · `dropped` 已弃坑 · `unplayed` 未游玩 · `watched` 已云过（CLI 接受中文） |
| `playedFrom` / `playedTo` | `YYYY-MM`? | 游玩时间，精确到月 |
| `score` | 0–100 \| null | 百分制。天梯档位：SS ≥95，S ≥90，A ≥84，B ≥75，C ≥60，D <60 |
| `hours` | number \| null | 游玩时长 |
| `oneLiner` | string? | 一句话短评，显示在卡片上 |
| `review` | string? | 整体感受，Markdown |
| `moments` | `{id, src, caption?, addedAt}[]` | 精彩瞬间截图 |
| `fanworks` | `{id, bvid, title?, author?, cover?, duration?, note?, addedAt}[]` | B 站二创 |
| `tags` | string[] | 自定义标签 |
| `inferred` | string[]? | 由 agent 推断、用户尚未确认的字段名。页面会标「待确认」，推断评分显示为虚线档位和 `?`。用户在天梯榜点「确认」或在编辑抽屉保存后会清除 |

## 规则

- 不要编造用户的主观内容（评分、感受、游玩时间）。必须推断时，把字段名写进 `inferred`。
- 删除用 `npm run game -- rm <id>`，JSON 和 `public/media/<id>/` 会一起移到 `data/.trash/`，不会真正丢失。
- 改完代码跑 `npm run typecheck`。
- 网站部署在 GitHub Pages：推送到 `main` 就会自动构建发布。只有用户要求发布时才 `git push`。动手前先 `git pull --rebase`，因为用户可能在网站上在线改过数据。
- 不要读取、打印或改动 `public/edit-key.json` 的内容，也不要尝试解密。更换密码让用户自己运行 `npm run edit-key`。

## 番剧子站（/anime）

番剧记录和游戏主站共用项目、路由和编辑密码，页面与数据完全独立。游戏主站顶栏的「番剧」是它唯一的入口。

| 路径 | 内容 |
| --- | --- |
| `data/anime/<id>.json` | 一季一个文件。同一部作品的不同季度是不同记录，用 `series` 串起来 |
| `public/media/anime/<id>/` | 封面 `cover-*.jpg`、横幅 `hero-*.jpg`、缩略图 `thumb-*.webp` |
| `src/anime/model.ts` | 数据结构与校验（`Anime`、`WatchStatus`、`AirStatus`） |
| `src/anime/sources.ts` | 从 Bangumi（中文名、简介、标签、封面）和 AniList（横幅、主色、放送状态）读取资料 |

```bash
npm run anime -- search "间谍过家家"                  # 查 Bangumi 条目 ID（每一季是单独的条目）
npm run anime -- add 498378 --status 正在看            # 按 Bangumi ID 新增，资料和封面自动填
npm run anime -- add 975 --status 已看过 --progress "看到多弗朗明哥之前" --title 海贼王
npm run anime -- set spy-family-s3 status=已看过 score=90 oneLiner="阿尼亚最可爱"
npm run anime -- refresh all                          # 重新读取放送状态、集数、Bangumi 评分
npm run anime -- rm <id>                              # 移到 data/.trash/anime
```

主要字段：

| 字段 | 说明 |
| --- | --- |
| `title` / `titleJa` / `titleRomaji` | 中文名（必填）/ 日文名 / 罗马音 |
| `series` / `season` | 系列名（同系列各季相同）/ 季度标签，如「第二季」「剧场版」 |
| `air` | **是否完结**（必填）：`finished` 已完结 · `airing` 连载中 · `upcoming` 未开播 |
| `airStart` / `airEnd` | 首播 / 完结，`YYYY-MM`。首页「季度表」按 `airStart` 分到冬春夏秋 |
| `format` / `episodes` / `studio` / `source` | 形式（TV、剧场版、OVA、WEB、特别篇）/ 集数 / 制作公司 / 原作类型 |
| `status` | 用户的观看状态：`watched` 已看过 · `watching` 正在看 · `planned` 待观看 · `dropped` 已弃坑 |
| `progress` / `watchedEps` | 没看完时的进度说明 / 看到第几话 |
| `score` / `oneLiner` / `review` / `tags` / `watchedFrom` / `watchedTo` | 与游戏相同，都是用户的主观记录，不要编造 |
| `bgmScore` | Bangumi 社区评分（0–10），不是用户的评分 |
| `inferred` | 推断、未经用户确认的字段名，编辑模式下显示「待确认」 |

- 在线编辑：浏览器可以直接搜索 Bangumi 和 AniList（两者都允许跨域）。封面先存远程地址，部署时 `npm run hydrate` 下载进仓库。
- 部署流程每周日自动跑一次，`hydrate` 会刷新「连载中 / 未开播」番剧的放送状态和集数。

