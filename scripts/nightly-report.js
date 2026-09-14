#!/usr/bin/env node
// ═══ scripts/nightly-report.js — 야간 로그 → 보고 마크다운 (결정적) [T293 2026-09-14 · 재민 확정] ═══
//
// ★왜: 야간 보고의 표를 모델이 손으로 썼다. 통과/실패 세기 · 단독 재실행 대조 · 상시 목록 대조 —
//   전부 로그에 이미 있는 것을 **다시 읽어서** 옮겨 적는 일이었고, 그게 밤마다 한도를 먹었다.
//   ⇒ 로그만 읽어 표를 낸다. 판단이 필요한 칸은 **하나**다: 상시 목록에 없는 빨강의 귀속.
//     그 칸만 "귀속: 모델 몫" 으로 비워 두고 나머지는 기계가 채운다.
//
// ★결정적이다 — 같은 로그를 넣으면 **바이트가 같은** 마크다운이 나온다.
//   그래서 이 파일 안에 `Date.now()` · `new Date()`(인자 없는) · 난수 · 파일 시각 읽기가 **하나도 없다**.
//   시각은 전부 로그 줄머리의 도장에서 온다(`nightly-run.sh` 가 줄마다 찍는다).
//   ⚠`scripts/test-nightly-report.js` 가 픽스처 둘로 이것을 검사한다(자명 통과 금지 줄 포함).
//
// 쓰는 법:
//   node scripts/nightly-report.js --reds <로그>                 # 빨간 하네스 이름만 한 줄씩(러너가 쓴다)
//   node scripts/nightly-report.js --log <로그> --base <커밋> --out 보고/야간러너_<날짜>.md
//   (옵션) --retry <로그.retry>  기본은 `<로그>.retry` · --known <목록>  기본은 scripts/nightly-known.txt
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const KNOWN_DEFAULT = path.join(__dirname, 'nightly-known.txt');

// ── 인자 ─────────────────────────────────────────────────────────────────────
function argOf(name, dflt) {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] !== undefined ? process.argv[i + 1] : dflt;
}

// ── 줄머리 도장 — `2026-09-14T04:09:03+0900 <본문>` ──────────────────────────
//   ⚠도장이 없는 줄도 받는다(사람이 손으로 이어 붙였을 수 있다) — 그때 시각은 null 이다.
const STAMP = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{4})\s(.*)$/;
function split1(line) {
  const m = STAMP.exec(line);
  return m ? { t: m[1], s: m[2] } : { t: null, s: line };
}
// 도장 → 분(minute) 단위 정수. **`Date` 를 안 쓴다** — 시간대·로캘이 끼면 결정성이 깨진다.
function mins(stamp) {
  if (!stamp) return null;
  const d = +stamp.slice(8, 10), h = +stamp.slice(11, 13), mi = +stamp.slice(14, 16);
  return ((d * 24) + h) * 60 + mi;   // 달을 넘는 밤은 없다(야간 창은 4시간)
}
function hhmm(stamp) { return stamp ? stamp.slice(11, 16) : '?'; }
function dur(a, b) {
  const x = mins(a), y = mins(b);
  if (x == null || y == null) return '?';
  const d = y - x;
  return d >= 60 ? `${Math.floor(d / 60)}시간 ${d % 60}분` : `${d}분`;
}

// ── 로그 읽기 — **이번 판만** 본다(로그는 이어 쓴다) ─────────────────────────
const START_MARK = '===== nightly-run 시작';
function readRun(file) {
  const raw = fs.readFileSync(file, 'utf8').split('\n');
  let from = 0;
  for (let i = 0; i < raw.length; i++) if (split1(raw[i]).s.startsWith(START_MARK)) from = i;
  return raw.slice(from).filter((l) => l.length > 0);
}

// ── 러너 출력 파서 — 이름 규칙을 **안 믿는다**(`e2e-`/`test-` 로 안 가른다) ───
//   러너가 찍는 것만 본다: `##### <파일> #####` 로 열리고 `✓ RC=0` 또는 `✗ RC=n …` 로 닫힌다.
//   닫히지 않은 블록은 **빨강이 아니다** — 창이 닫혀 끊긴 것이다(미측정으로 센다).
const OPEN = /^#{5} (\S+) #{5}$/;
const VERDICT = /^\s*(✓|✗) RC=(\d+)(.*)$/;
function parseBlocks(lines) {
  const out = [];
  let cur = null;
  for (const raw of lines) {
    const { t, s } = split1(raw);
    const o = OPEN.exec(s.trim());
    if (o) { if (cur) out.push(cur); cur = { name: o[1], t0: t, t1: null, ok: null, verdict: '', marks: [] }; continue; }
    if (!cur) continue;
    const v = VERDICT.exec(s);
    if (v) { cur.ok = v[1] === '✓'; cur.t1 = t; cur.verdict = `RC=${v[2]}${v[3]}`.replace(/\s*→ \*\*실패로 센다\*\*/, '').trim(); continue; }
    if (/^\s*✗/.test(s)) cur.marks.push(s.trim().replace(/^✗\s*/, ''));
  }
  if (cur) out.push(cur);
  return out;
}

// ── 상시 목록 — `이름 | 이유 | 근거` ─────────────────────────────────────────
function readKnown(file) {
  const map = new Map();
  if (!fs.existsSync(file)) return map;
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const s = line.trim();
    if (!s || s.startsWith('#')) continue;
    const c = s.split('|').map((x) => x.trim());
    if (c.length < 2 || !c[0]) continue;
    map.set(base(c[0]), { why: c[1] || '상시', src: c[2] || '' });
  }
  return map;
}
const base = (n) => String(n).replace(/\.js$/, '');
const cell = (s) => String(s == null ? '' : s).replace(/\|/g, '\\|').replace(/\n/g, ' ');

// ── --reds : 빨간 하네스 이름만 (러너가 이걸로 단독 재실행 목록을 잡는다) ─────
if (process.argv.includes('--reds')) {
  const f = argOf('--reds');
  if (!f || !fs.existsSync(f)) process.exit(0);
  for (const b of parseBlocks(readRun(f))) if (b.ok === false) console.log(b.name);
  process.exit(0);
}

// ── 보고 ─────────────────────────────────────────────────────────────────────
const LOG = argOf('--log');
if (!LOG || !fs.existsSync(LOG)) {
  console.error('쓰는 법: node scripts/nightly-report.js --log <로그> --base <커밋> --out <보고.md>');
  process.exit(2);
}
const RETRY = argOf('--retry', LOG + '.retry');
const OUT = argOf('--out');
const BASE = argOf('--base', '?');
const known = readKnown(argOf('--known', KNOWN_DEFAULT));

const lines = readRun(LOG);
const head = lines.map(split1);
const T0 = head.length ? head[0].t : null;
const T1 = head.length ? head[head.length - 1].t : null;

// 오늘 목록 · 묶음 — `nightly-run.sh` 가 로그에 적어 둔 두 줄에서 읽는다(내가 세지 않는다).
let listed = [], which = '?';
for (const { s } of head) {
  const w = /^\s*\[오늘\] 묶음 (\S+) · (\d+)종$/.exec(s);
  if (w) which = w[1];
  const l = /^\s*\[목록\] (.+)$/.exec(s);
  if (l) listed = l[1].trim().split(/\s+/).filter(Boolean);
}

const blocks = parseBlocks(lines);
const seen = new Map();
for (const b of blocks) seen.set(base(b.name), b);          // 같은 이름이 두 번이면 마지막 판
const reds = blocks.filter((b) => b.ok === false);
const greens = blocks.filter((b) => b.ok === true);
const cut = blocks.filter((b) => b.ok === null);             // 열렸는데 안 닫힌 것 = 끊김
const missing = listed.filter((n) => !seen.has(base(n)));

// 단독 재실행 결과
const retryOf = new Map();
if (fs.existsSync(RETRY)) {
  for (const b of parseBlocks(fs.readFileSync(RETRY, 'utf8').split('\n').filter((l) => l.length > 0))) {
    retryOf.set(base(b.name), b);
  }
}

const outside = reds.filter((b) => !known.has(base(b.name)));

const L = [];
L.push(`# 보고 — 야간 러너 ${T0 ? T0.slice(0, 10) : '?'} (${T0 ? T0.slice(-5) : '?'})`);
L.push('');
L.push(`**기준 커밋 \`${BASE}\`** · 시작 **${hhmm(T0)}** → 종료 **${hhmm(T1)}** (${dur(T0, T1)})`);
L.push(`· 오늘 묶음 **${which}** · 목록 **${listed.length}종** · 돈 것 **${blocks.length}** · 통과 **${greens.length}** · 실패 **${reds.length}** · 끊김 **${cut.length}** · 미측정 **${missing.length}**`);
L.push(`· 이 문서는 \`scripts/nightly-report.js\` 가 로그만 읽어 냈다 — **모델 판단 0** · 같은 로그면 바이트가 같다`);
L.push(`· 로그 \`${LOG}\` · 단독 재실행 \`${RETRY}\` · 상시 목록 \`${path.relative(ROOT, argOf('--known', KNOWN_DEFAULT))}\``);
L.push('');
L.push(outside.length === 0
  ? '## ★ 한 줄 — **상시 밖 빨강 0건.** 아침에 세션으로 되돌릴 것이 없다.'
  : `## ★ 한 줄 — **상시 밖 빨강 ${outside.length}건** — ${outside.map((b) => `\`${base(b.name)}\``).join(' · ')}`);
L.push('');

L.push('## 1. 실패 표');
L.push('');
if (reds.length === 0) {
  L.push('빨강 **0종**.');
} else {
  L.push('| 하네스 | 첫 판 | 소요 | 단독 재실행 | 귀속 |');
  L.push('|---|---|---|---|---|');
  for (const b of reds) {
    const k = known.get(base(b.name));
    const r = retryOf.get(base(b.name));
    const first = `${b.verdict}${b.marks.length ? ' · ' + b.marks[0] : ''}`;
    const again = !r ? '—' : (r.ok ? `★**단독 초록** (${r.verdict})` : `여전히 빨강 (${r.verdict}${r.marks.length ? ' · ' + r.marks[0] : ''})`);
    const who = k ? `**상시(${cell(k.why)})** — ${cell(k.src)}` : '**귀속: 모델 몫**';
    L.push(`| \`${base(b.name)}\` | ${cell(first)} | ${dur(b.t0, b.t1)} | ${cell(again)} | ${who} |`);
  }
}
L.push('');

if (cut.length) {
  L.push('## 2. 끊김 (열렸는데 안 닫혔다 — 창이 닫힌 자리다 · 빨강이 아니다)');
  L.push('');
  L.push('```');
  for (const b of cut) L.push(`${base(b.name)}  (${hhmm(b.t0)} 시작)`);
  L.push('```');
  L.push('');
}

L.push(`## 3. 미측정 ${missing.length}종`);
L.push('');
if (missing.length === 0) L.push('없다 — 오늘 목록을 다 돌았다.');
else { L.push('```'); L.push(missing.map(base).join('  ')); L.push('```'); }
L.push('');

L.push('## 4. 아침에 세션으로 넘길 빨강');
L.push('');
if (outside.length === 0) {
  L.push('**없음.**');
} else {
  L.push('아래는 **상시 목록에 없는** 빨강이다 — 귀속 카드를 찾아 세션에 넘긴다(이 칸만 사람 몫이다).');
  L.push('');
  for (const b of outside) {
    L.push(`* \`${base(b.name)}\` — ${cell(b.verdict)}`);
    for (const m of b.marks.slice(0, 3)) L.push(`  * ${cell(m)}`);
    const r = retryOf.get(base(b.name));
    if (r) L.push(`  * 단독 재실행: ${r.ok ? '**초록**' : '여전히 빨강'} (${cell(r.verdict)})`);
    L.push(`  * 귀속 찾는 법: \`git log -3 -- scripts/${base(b.name)}.js\` 와 그 하네스가 무는 제품 파일`);
  }
}
L.push('');

L.push('## 5. 통과 ' + greens.length + '종');
L.push('');
L.push('```');
L.push(greens.map((b) => base(b.name)).join('  '));
L.push('```');

const text = L.join('\n') + '\n';
if (OUT) { fs.mkdirSync(path.dirname(path.resolve(ROOT, OUT)), { recursive: true }); fs.writeFileSync(path.resolve(ROOT, OUT), text); console.log(OUT); }
else process.stdout.write(text);
