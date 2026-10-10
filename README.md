# GAME / LIFE · wdstql 的游戏生涯档案

线上地址：https://wdstql.github.io/

记录自己玩过的每一款游戏：状态、游玩时间、百分制评分、整体感受、精彩瞬间截图、B 站二创收藏。

## 启动

```bash
npm install
npm run dev        # http://localhost:5180 ，可编辑
```

- 右上角「编辑」开关：打开后可以直接在页面上改状态、评分、写感受、拖入或 ⌘V 粘贴截图、粘贴 B 站链接。
- 「添加游戏」：输入名字，从 Steam 结果中选一个，封面和基本信息自动填好。
- `⌘K`：全局搜索。

## 页面

- **总览**：玩家档案、进行中的游戏、生涯数据（点击图表即可筛选）、档案库。档案库有三种视图：
  - 星图：横轴时间、纵轴评分，同类型游戏连成星座
  - 时间线：按年份回看
  - 卡带架：按状态上架，悬停抽出卡带
- **天梯榜**：前三名领奖台、SS–D 档位表（编辑模式下可拖动换档）、完整排名，可切换为分类型天梯。
- **喜好表**：自定义奖项墙（最爱的、最受苦的……）。
- **详情页**：评分环、个人记录、整体感受（Markdown）、精彩瞬间、二创整理。

## 让 agent 添加

见 [AGENTS.md](./AGENTS.md)。一行命令即可：

```bash
npm run game -- add "只狼" --steam auto --en Sekiro --status 已完结 --score 98
```

## 发布与在线编辑

仓库 `Wdstql/Wdstql.github.io` 的 `main` 分支一有推送，GitHub Actions（`.github/workflows/deploy.yml`）就会构建并发布到 GitHub Pages，约 1–2 分钟。

- **本地改完发布**：`git pull --rebase && git add -A && git commit -m "..." && git push`
- **在网站上直接改**：点右上角「编辑」，输入编辑密码。改动会直接提交到仓库，再自动部署。
  - 在线模式不能搜索 Steam（浏览器跨域限制）。添加游戏时填 Steam 商店链接或 AppID，部署时自动下载封面和信息。
  - 在线添加 B 站视频时，浏览器会直接读取标题和封面（Chromium 内核浏览器实测可用）。读取失败时只记 BV 号，之后在本地运行 `npm run hydrate` 补全再推送。部署服务器访问 B 站会被拦截（HTTP 412），补不了。
  - 在线改过之后，本地动手前先 `git pull --rebase`。

### 编辑密码

`public/edit-key.json` 里是一个 GitHub 令牌，用编辑密码加密（PBKDF2-SHA256 60 万次 + AES-GCM）。仓库里只有密文，没有密码。

设置或更换密码：

1. 在 GitHub 新建 fine-grained token：只选 `Wdstql.github.io` 仓库，权限只给 Contents: Read and write。
2. 在自己的终端运行 `npm run edit-key`，粘贴令牌，设置密码（至少 10 位）。
3. 提交并推送 `public/edit-key.json`。

令牌过期或泄露时，在 GitHub 上撤销它，再重复上面三步。
