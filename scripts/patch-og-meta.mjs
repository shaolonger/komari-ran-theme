import { readFileSync, writeFileSync } from 'node:fs'

const file = 'dist/index.html'
const replacements = {
  __OG_IMAGE__: 'https://obsr.net/og.png',
  __OG_URL__: 'https://obsr.net',
}

let html = readFileSync(file, 'utf8')
for (const [from, to] of Object.entries(replacements)) {
  html = html.replaceAll(from, to)
}
writeFileSync(file, html)
