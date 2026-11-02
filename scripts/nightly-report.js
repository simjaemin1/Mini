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
//   ★[T1038] 지난 밤 보고들(`--prev-dir`)도 **입력**이다(§1b 연속 초록 셈) — 같은 로그 + 같은 보고 칸 → 같은 바이트.
//   ⚠`scripts/test-nightly-report.js` 가 픽스처 둘로 이것을 검사한다(자명 통과 금지 줄 포함).
//
// 쓰는 법:
//   node scripts/nightly-report.js --reds <로그>                 # 빨간 하네스 이름만 한 줄씩(러너가 쓴다)
//   node scripts/nightly-report.js --log <로그> --base <커밋> --out 보고/야간러너_<날짜>.md
//   node scripts/nightly-report.js --streaks <날짜> [--known <목록>] [--prev-dir 보고]   # [T1038] 그 밤까지 보고만 읽어 §1b 상시 점검 표
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
if (!process.argv.includes('--streaks') && (!LOG || !fs.existsSync(LOG))) {   // ★[T1038] `--streaks` 는 로그 없이 보고만 읽는다
  console.error('쓰는 법: node scripts/nightly-report.js --log <로그> --base <커밋> --out <보고.md>');
  process.exit(2);
}
const RETRY = argOf('--retry', LOG + '.retry');
const OUT = argOf('--out');
const BASE = argOf('--base', '?');
const known = readKnown(argOf('--known', KNOWN_DEFAULT));

// ── [T314 2026-09-19] **연속 몇 밤째 빨간가** — 직전 밤 보고 한 장을 읽어 숫자만 낸다 ─────────
//   왜: T304 가 세운 규약이 *"단독 초록이어도 **두 밤째** 빨강이면 `nightly-known` 에 올린다"* 인데,
//   그 "두 밤째"를 사람이 손으로 세고 있었다(09-18 의 넷을 09-19 아침에 아무도 못 셌다).
//   ⇒ 기계가 센다. **판정은 안 한다** — 올리고 내리는 것은 PM 이다(`nightly-known.txt` 머리 규약).
//   ★결정적이다: 직전 밤 파일도 **입력**이다. 같은 로그 + 같은 직전 보고 → 같은 바이트.
//   ★못 읽으면 못 읽었다고 말한다(조용히 1 로 되돌리지 않는다 — 그게 "안 쟀는데 초록"이다).
//   ⚠꼴이 둘이다: 기계가 낸 표(`| \`이름\` | 연속 **n밤** | …`)와 **사람이 쓴 표**(09-19 판처럼
//     이름을 굵게 쓴다: `| **\`이름\`** | …`). 둘 다 읽는다 — 안 그러면 손으로 쓴 밤 하나가
//     연속 수를 **조용히 0 으로 되돌린다**(그게 "안 쟀는데 초록"과 같은 자리다).
const PREV_ROW = /^\|\s*\*{0,2}`([^`]+)`\*{0,2}\s*\|\s*연속 \*\*(\d+)밤\*\*/;
function prevNight(day, dir) {
  // 날짜 문자열 하루 빼기 — `Date` 를 안 쓴다(결정성 · 시간대 0). 달 넘김만 표로 처리한다.
  const DIM = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  let y = +day.slice(0, 4), m = +day.slice(5, 7), d = +day.slice(8, 10);
  if (!(y && m && d)) return { file: null, rows: new Map(), why: '날짜를 못 읽었다' };
  d -= 1;
  if (d < 1) { m -= 1; if (m < 1) { m = 12; y -= 1; } d = DIM[m - 1] + ((m === 2 && (y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0))) ? 1 : 0); }
  const pd = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  const file = path.join(dir, `야간러너_${pd}.md`);
  if (!fs.existsSync(file)) return { file, rows: new Map(), why: `직전 밤 보고가 없다(${pd})` };
  const rows = new Map();
  let sawTable = false;
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const m2 = PREV_ROW.exec(line.trim());
    if (m2) { rows.set(base(m2[1]), +m2[2]); sawTable = true; continue; }
    // 연속 칸이 없던 판(T314 이전 꼴)은 **빨강 한 밤**으로 읽는다.
    const m3 = /^\|\s*\*{0,2}`([^`]+)`\*{0,2}\s*\|/.exec(line.trim());
    if (m3 && !rows.has(base(m3[1]))) { rows.set(base(m3[1]), 1); sawTable = true; }
  }
  return { file, rows, why: sawTable ? null : '직전 밤 보고에서 실패 표를 못 찾았다(꼴이 다르다)' };
}

// ── [T1038 · PM 10-31 판정] **상시 줄마다 연속 초록 밤 수** — 지난 밤 보고들을 거슬러 읽어 센다 ──────────
//   규칙(PM): 고침 커밋이 없어도 **연속 초록 10밤** 이상인 상시 줄은 목록에서 뺀다(더 엄해진다). 기계는 **세고 표시만** 한다(판정 0 ·
//   빼는 손은 PM 카드). 센 수 = 그 하네스가 **돈 밤** 중 끝에서부터 이어진 초록 밤 수(안 돈 밤 = 묶음 밖 · 건너뛴다 · 끊지 않는다).
//   밤 하나의 상태는 그 보고의 §1 실패 표(빨강) · §5 통과 덩이(초록)에서만 읽는다. 둘 다 못 읽는 꼴의 보고를 만나면 거기서 멈추고
//   "여기까지 읽음" 이라고 말한다(조용히 이어 세지 않는다 — "안 쟀는데 초록"이 되기 때문).
const STREAK_MIN = 10;
function nightFiles(dir, upto) {   // upto 날짜 **앞**의 밤들 · 새 것부터
  let fs_ = [];
  try { fs_ = fs.readdirSync(dir); } catch (e) { return []; }
  return fs_.map((f) => /^야간러너_(\d{4}-\d{2}-\d{2})\.md$/.exec(f)).filter((m) => m && m[1] < upto).map((m) => ({ day: m[1], file: path.join(dir, m[0]) }))
    .sort((a, b) => (a.day < b.day ? 1 : -1));
}
function nightStatus(file) {   // → { red:Set, green:Set, partial } · 못 읽으면 null
  //   partial = 실패 표는 있는데 §5 통과 덩이가 없다(손으로 쓴 밤 — 10-28 꼴). 그 밤은 빨강만 믿고 나머지 이름은 **건너뛴다**(세지도 끊지도 않는다).
  const L = fs.readFileSync(file, 'utf8').split('\n');
  const red = new Set(), green = new Set();
  let sec = '', inCode = false, sawTable = false, sawPass = false;
  for (const line of L) {
    if (/^## /.test(line)) { sec = line; inCode = false; if (/^## 1\. /.test(line)) sawTable = true; continue; }
    const m = /^\|\s*\*{0,2}`([^`]+)`\*{0,2}\s*\|/.exec(line.trim());
    if (m && !/^## [2-9]/.test(sec)) { red.add(base(m[1])); sawTable = true; }
    if (/^## 5\. 통과/.test(sec)) {
      if (/^```/.test(line)) { inCode = !inCode; continue; }
      if (inCode) { for (const n of line.trim().split(/\s+/).filter(Boolean)) green.add(base(n)); sawPass = true; }
    }
  }
  if (!sawTable && !sawPass) return null;
  return { red, green, partial: !sawPass };
}
// 이 밤(tonight: 이름 → 'g' | 'r' | 없음)부터 거슬러 센다 → { n, color: 'g'|'r'|null, until: 멈춘 날 · skipped: 건너뛴 손 보고 날들 }
function runStreak(name, tonight, files) {
  const nm = base(name);
  let color = tonight(nm) || null, n = color ? 1 : 0, until = null;
  const skipped = [];
  for (const f of files) {
    const st = nightStatus(f.file);
    if (!st) { until = f.day; break; }
    const c = st.red.has(nm) ? 'r' : (st.green.has(nm) ? 'g' : null);
    if (!c) { if (st.partial) skipped.push(f.day); continue; }   // 안 돌았거나(묶음 밖) · 손 보고라 모른다 — 건너뛴다
    if (!color) { color = c; n = 1; continue; }
    if (c !== color) break;
    n += 1;
  }
  return { n, color, until, skipped };
}
// §1b 표 — 상시 줄마다 연속 초록 · 상시 밖 연속 빨강(2밤 이상)
function checkTable(knownMap, tonight, files, outsideReds) {
  const out = [], marks = { drop: 0, raise: 0 };
  out.push(`## 1b. 상시 목록 점검 (T1038 규칙 — 상시 줄이 연속 초록 **${STREAK_MIN}밤**이면 뺄 차례 · 상시 밖 2밤 이상 빨강은 올릴지 · 카드)`);
  out.push('');
  const rows = [];
  for (const [nm, k] of knownMap) {
    const r = runStreak(nm, tonight, files);
    const cnt = r.color === 'g' ? `초록 **${r.n}밤**` : r.color === 'r' ? `빨강 **${r.n}밤**(초록 0)` : '돈 밤 없음';
    const mark = r.color === 'g' && r.n >= STREAK_MIN ? (marks.drop++, `**뺄 차례**(T1038 규칙 · ${STREAK_MIN}밤 · 빼는 손은 PM 카드)`) : '—';
    const note = (r.until ? ` · ${r.until} 보고에서 멈춤(꼴을 못 읽음)` : '') + (r.skipped.length ? ` · 손 보고 ${r.skipped.join(' · ')} 건너뜀(통과 줄 없음)` : '');
    rows.push(`| \`${nm}\` | 상시(${cell(k.why)}) | ${cnt}${note} | ${mark} |`);
  }
  for (const o of outsideReds) {
    marks.raise++;
    rows.push(`| \`${base(o.name)}\` | 상시 밖 | 빨강 **${o.n}밤** | **상시 올릴지 · 카드**(PM) |`);
  }
  if (!rows.length) out.push(`상시 줄 **0** · 상시 밖 2밤 이상 빨강 **0**.`);
  else { out.push('| 하네스 | 목록 | 연속(돈 밤만 · 안 돈 밤은 건너뜀) | 표시 |'); out.push('|---|---|---|---|'); out.push(...rows); }
  return { lines: out, marks };
}
// ── --streaks <날짜> : 로그 없이 **그 밤 보고까지** 읽어 §1b 표만 낸다(지난 밤에 규칙을 대 보는 자리 · T1038 ③) ──
if (process.argv.includes('--streaks')) {
  const day = argOf('--streaks', '');
  const dir = argOf('--prev-dir', path.join(ROOT, '보고'));
  const kn = readKnown(argOf('--known', KNOWN_DEFAULT));
  const me = path.join(dir, `야간러너_${day}.md`);
  const st = fs.existsSync(me) ? nightStatus(me) : null;
  if (!st) { console.error(`그 밤 보고를 못 읽었다(${me})`); process.exit(2); }
  const files = nightFiles(dir, day);
  const tonight = (nm) => (st.red.has(nm) ? 'r' : st.green.has(nm) ? 'g' : null);
  // 상시 밖 빨강의 연속 수는 **그 밤 보고 §1 의 "연속 n밤" 칸 그대로**(보고기가 낸 수 · 직전 밤 하나씩 이은 수 — §1 과 같은 자)
  const outs = [];
  for (const line of fs.readFileSync(me, 'utf8').split('\n')) { const m = PREV_ROW.exec(line.trim()); if (m && !kn.has(base(m[1])) && +m[2] >= 2) outs.push({ name: m[1], n: +m[2] }); }
  const t = checkTable(kn, tonight, files, outs);
  process.stdout.write(`# ${day} 밤 · 상시 목록 \`${path.relative(ROOT, argOf('--known', KNOWN_DEFAULT))}\` · 보고 ${files.length + 1}장\n\n` + t.lines.join('\n') + '\n');
  process.exit(0);
}

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

// 연속 몇 밤째인가 — 직전 밤 보고를 본다(있으면). `--prev-dir` 는 시험용 · 기본은 이 보고가 사는 곳.
const PREVDIR = argOf('--prev-dir', OUT ? path.dirname(path.resolve(ROOT, OUT)) : path.join(ROOT, '보고'));
const prev = prevNight(T0 ? T0.slice(0, 10) : '', PREVDIR);
const streak = (n) => (prev.rows.get(base(n)) || 0) + 1;
// ★[T1038] §1b 상시 점검 — 이 밤 로그(돈 것 · 초록/빨강)에서 시작해 지난 밤 보고들을 거슬러 센다(판정 0 · 표시만)
const CHK = checkTable(known, (nm) => { const x = seen.get(nm); return x && x.ok === true ? 'g' : x && x.ok === false ? 'r' : null; },
  nightFiles(PREVDIR, T0 ? T0.slice(0, 10) : ''),
  prev.why ? [] : reds.filter((b) => !known.has(base(b.name)) && streak(b.name) >= 2).map((b) => ({ name: b.name, n: streak(b.name) })));

const L = [];
L.push(`# 보고 — 야간 러너 ${T0 ? T0.slice(0, 10) : '?'} (${T0 ? T0.slice(-5) : '?'})`);
L.push('');
L.push(`**기준 커밋 \`${BASE}\`** · 시작 **${hhmm(T0)}** → 종료 **${hhmm(T1)}** (${dur(T0, T1)})`);
L.push(`· 오늘 묶음 **${which}** · 목록 **${listed.length}종** · 돈 것 **${blocks.length}** · 통과 **${greens.length}** · 실패 **${reds.length}** · 끊김 **${cut.length}** · 미측정 **${missing.length}**`);
// ★[T760] 상자의 판 — 러너가 시작 줄 뒤에 찍은 `[판]` 한 줄을 그대로 옮긴다(옛 로그엔 없다 — 없다고 적는다)
const VER = (lines.map((l) => split1(l).s).find((s) => /^\s*\[판\] /.test(s)) || '').replace(/^\s*\[판\] /, '');
L.push(`· 상자 판 ${VER ? `\`${VER}\`` : '**로그에 없다**(T760 앞 러너)'}`);
// ★[T1029] 상자 의존 — 러너가 찍은 `[의존]` 한 줄(python · numpy · PIL · zlib 판 · 없으면 `[상황]`)을 그대로 옮긴다(옛 로그엔 없다 — 없다고 적는다)
const DEP = (lines.map((l) => split1(l).s).find((s) => /^\s*\[의존\] /.test(s)) || '').replace(/^\s*\[의존\] /, '');
L.push(`· 상자 의존 ${DEP ? (/^\[상황\]/.test(DEP) ? `**${DEP}**` : `\`${DEP}\``) : '**로그에 없다**(T1029 앞 러너)'}`);
// ★[T1051 · PM 11-01] `test-map-editor` 층 데이터가 PNG 바이트만 다르고 화소가 같으면(통과) 그 `[상황]` 줄을 의존 줄 밑에 옮긴다 — PIL · zlib 판과 같이 본다
const ENC = (lines.map((l) => split1(l).s).find((s) => /\[상황\] 층 데이터 PNG 인코더 차이\(화소 같음\)/.test(s)) || '').replace(/^\s*\[상황\] 층 데이터 PNG 인코더 차이\(화소 같음\) — /, '');
if (ENC) L.push(`· 층 데이터 인코더 차이(화소 같음 · 통과 · T1051) — ${cell(ENC)}`);
L.push(`· 상시 점검(§1b · T1038) — 뺄 차례 **${CHK.marks.drop}** · 상시 올릴지 **${CHK.marks.raise}** · 상시 줄 ${known.size}`);
L.push(`· 이 문서는 \`scripts/nightly-report.js\` 가 로그만 읽어 냈다 — **모델 판단 0** · 같은 로그면 바이트가 같다`);
L.push(`· 로그 \`${LOG}\` · 단독 재실행 \`${RETRY}\` · 상시 목록 \`${path.relative(ROOT, argOf('--known', KNOWN_DEFAULT))}\``);
L.push(`· 직전 밤 ${prev.why ? `**못 읽었다** (${prev.why})` : `\`${path.relative(ROOT, prev.file)}\` — 빨강 ${prev.rows.size}종`} · "연속 n밤"은 **세기만** 한 수다(판정 0)`);
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
  L.push('| 하네스 | 연속 | 첫 판 | 소요 | 단독 재실행 | 귀속 |');
  L.push('|---|---|---|---|---|---|');
  for (const b of reds) {
    const k = known.get(base(b.name));
    const r = retryOf.get(base(b.name));
    const first = `${b.verdict}${b.marks.length ? ' · ' + b.marks[0] : ''}`;
    const again = !r ? '—' : (r.ok ? `★**단독 초록** (${r.verdict})` : `여전히 빨강 (${r.verdict}${r.marks.length ? ' · ' + r.marks[0] : ''})`);
    const who = k ? `**상시(${cell(k.why)})** — ${cell(k.src)}` : '**귀속: 모델 몫**';
    const n = streak(b.name);
    // ★표는 **글자로** 표시한다(이모지 0) — 자가 이 칸을 읽는다(`test-harness-lint ②`: 판정 자리에 이모지 0).
    L.push(`| \`${base(b.name)}\` | 연속 **${n}밤**${n >= 2 && !k ? ' (상시 밖)' : ''} | ${cell(first)} | ${dur(b.t0, b.t1)} | ${cell(again)} | ${who} |`);
  }
  if (prev.why) L.push('');
  if (prev.why) L.push(`⚠**연속 수를 못 믿는다 — ${cell(prev.why)}.** 위의 "연속 n밤"은 전부 이 밤만 센 것이다(\`${cell(prev.file || '-')}\`).`);
  else {
    const two = reds.filter((b) => streak(b.name) >= 2 && !known.has(base(b.name)));
    L.push('');
    L.push(two.length
      ? `⚠**연속 2밤 이상인데 상시 목록에 없는 것 ${two.length}건** — ${two.map((b) => `\`${base(b.name)}\`(${streak(b.name)}밤)`).join(' · ')}. T304 규약대로 **PM 이 \`nightly-known.txt\` 에 올릴지** 정한다(이 기계는 세기만 한다).`
      : '연속 2밤 이상인데 상시 목록에 없는 것 **0건**.');
  }
}
L.push('');

L.push(...CHK.lines);
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
    // ★[T1029 · T971 회부 1] `test-map-editor` 층 데이터 대조가 남긴 `[editor-layers] 다른 자리` 줄 — 그 글자로 귀속을 가른다(판정 0 · 글자 대응만)
    const el = b.marks.find((m) => /\[editor-layers\] 다른 자리/.test(m));
    if (el) L.push(/화소 같음\(인코더 차이\)/.test(el)
      ? '  * [editor-layers] 귀속: **상자 인코더(zlib) 차** — 화소는 정본과 같다 · 층 데이터 대조를 화소 비교로 바꿀지는 PM 몫(T971 회부 1)'
      : /값 다름|화소 \*\*다름\*\*/.test(el)
        ? '  * [editor-layers] 귀속: **층 데이터가 정본과 다르다** — `python3 scripts/editor-layers-bake.py` 다시 굽기 · 지형 정본을 바꾼 카드(T971 회부 1)'
        : '  * [editor-layers] 귀속: **다른 자리 못 찾음** — 줄 글자 그대로 본다(T971 회부 1)');
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
