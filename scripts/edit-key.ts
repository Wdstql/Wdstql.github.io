#!/usr/bin/env node
// Creates public/edit-key.json: a GitHub token, encrypted with the edit password.
// Run in a real terminal (input is hidden):  npm run edit-key
// The password is never written anywhere. Re-run to change the password or token.
import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import { encryptRemote, type Remote } from '../src/lib/editKey.ts'

const REPO = process.env.GAME_LIFE_REPO ?? 'Wdstql/Wdstql.github.io'
const BRANCH = process.env.GAME_LIFE_BRANCH ?? 'main'
const OUT = path.resolve(import.meta.dirname, '..', 'public', 'edit-key.json')

function ask(prompt: string): Promise<string> {
  return new Promise((resolve) => {
    const { stdin, stdout } = process
    stdout.write(prompt)
    if (!stdin.isTTY) {
      stdin.once('data', (d) => resolve(String(d).trim()))
      return
    }
    stdin.setRawMode(true)
    stdin.resume()
    let s = ''
    const onData = (buf: Buffer) => {
      for (const ch of buf.toString('utf8')) {
        if (ch === '\r' || ch === '\n') {
          stdin.setRawMode(false)
          stdin.pause()
          stdin.off('data', onData)
          stdout.write('\n')
          return resolve(s)
        }
        if (ch === '\u0003') process.exit(130)
        if (ch === '\u007f') s = s.slice(0, -1)
        else s += ch
      }
    }
    stdin.on('data', onData)
  })
}

async function gh(token: string, method: string, url: string, body?: unknown) {
  return fetch(`https://api.github.com/repos/${REPO}${url}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' },
    body: body ? JSON.stringify(body) : undefined,
  })
}

const token = process.env.GAME_LIFE_TOKEN ?? (await ask(`GitHub 令牌（只授权 ${REPO} 的 Contents 读写，输入不显示）：`)).trim()
if (!token) throw new Error('没有输入令牌')

// Creating an unreferenced blob proves write access without changing the repo.
const probe = await gh(token, 'POST', '/git/blobs', { content: 'edit-key probe', encoding: 'utf-8' })
if (!probe.ok) {
  console.error(`令牌不能写入 ${REPO}（HTTP ${probe.status}）。请确认：仓库已选中，Contents 权限为 Read and write。`)
  process.exit(1)
}

const password = process.env.GAME_LIFE_PASSWORD ?? await ask('设置编辑密码（至少 10 位，输入不显示）：')
if (password.length < 10) {
  console.error('密码太短。密钥文件是公开的，短密码可以被离线暴力破解。请至少用 10 位。')
  process.exit(1)
}
if (!process.env.GAME_LIFE_PASSWORD && (await ask('再输入一次：')) !== password) {
  console.error('两次输入不一致')
  process.exit(1)
}

const remote: Remote = { repo: REPO, branch: BRANCH, token }
await writeFile(OUT, JSON.stringify(await encryptRemote(remote, password), null, 2) + '\n')
console.log(`已写入 ${path.relative(process.cwd(), OUT)}。提交并推送后，网站上的「编辑」按钮会要求输入这个密码。`)
