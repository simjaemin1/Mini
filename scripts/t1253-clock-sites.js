'use strict';
// (@regress 없음 — 러너 밖 · T1253 전수 표 · 읽기만)
// === scripts/t1253-clock-sites.js — `server/` · `sim/` 에서 **시계를 읽는 자리** 전수 표(파일:줄 · 무엇을 재나 · 가상 시계가 갈아 끼우나 · 결과에 닿나) ===
//
// ★[T1253 2026-11-10] 글자로 찾는다(주석 줄 뺌): `Date.now()` · 인수 없는 `new Date()` · `performance.now()` · `process.hrtime` · `process.uptime()`.
//   무엇을 재나 — 줄 글자로 가른 갈래(손으로 고친 줄은 아래 `HAND` 표가 이긴다):
//     로그(console 줄) · 계측(_probe · Stat · perf · ns · Max — 셈만) · 몫(예산 · 조각 · TB — *언제*만 바꾼다 · T85 계약) · 시각(그 밖 — 세계 칸에 들거나 견줘지는 절대 시각)
//   가상 시계(`t745-vclock.js`) — 아이 존 한 프로세스의 전역(`Date` · `performance.now` · `process.hrtime`)을 V 로 바꾼다 ⇒ 존 안 자리는 전부 '예'.
//     일꾼 스레드 · 다른 프로세스(central) · 브라우저 묶음(`economy-engine.browser.js`) · 랩 도구(`sim/_*` · `bandit-lab`)는 '아니오/해당 없음'.
//   결과에 닿나 — 판 자 두 판(벽시계 · 가상 시계 · 시드 42)으로 잰 것이 `HAND` 표(보고/T1253 §1) · 나머지는 갈래 추정(로그 · 계측 = 아니오 · 몫 = 언제만 · 시각 = 후보).
// 쓰는 법: node scripts/t1253-clock-sites.js [--md out.md] [--json out.json]
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const A = process.argv.slice(2);
const opt = (k) => { const i = A.indexOf(k); return i >= 0 ? A[i + 1] : null; };
const RX = /Date\.now\(\)|new Date\(\)|performance\.now\(\)|process\.hrtime|process\.uptime\(\)/g;
//   손으로 짚은 줄(글자 조각으로 — 줄 번호는 움직인다) · [파일, 글자 조각, 무엇, 닿나]
const HAND = [
  ['server/villages.js', "const dtMs=_tk ? _tk : body._t1182?Math.min(500,Math.max(0,_bn-(body._t1182At??_bn))):frameDtMs;", '★범인 ① T1182 몸 걸음 간격 — 벽시계 틱 간격(`now − _t1182At` · 상한 500ms) · 하루 마감 동안 몸은 선다(T1)', '★닿음 — 귀환 · 도착 몸이 마감 사이 걸은 만큼만 econ 이 도착을 낸다(`_t1182BodyReady`) → 그날 곳간 · 금고(5날 광산2 hemp) · 켬 = econ 날 시계 알갱이'],
  ['server/villages.js', "} while (J.length && (TICK_SLICE_MS === 0 || Date.now() - f0 < _B));", '★범인 ② 하루 마감 조각 몫(프레임 예산) — 벽시계 판은 마감이 여러 틱에 걸친다', '★닿음(T1182 켬일 때만 · ①을 거쳐) — 마감이 길수록 몸이 서 있는 틱이 늘어 하루치를 못 걷는다 · 가상 시계 판은 몫이 안 닳아 한 틱 · 켬은 ①이 이 길이에 안 기대게 한다(이 줄은 그대로)'],
  ['server/villages.js', "const f0 = Date.now(), _B = TB.left(TICK_SLICE_MS);", '범인 ②의 짝 — 프레임 머리 시각 · 남은 몫', '★닿음(②와 같은 갈래 · 그대로 둠)'],
  ['server/tick-budget.js', "function begin(ms) {", '범인 ②의 짝 — 한 틱 공용 몫 머리(T687)', '★닿음(②와 같은 갈래 · 그대로 둠)'],
  ['server/tick-budget.js', "const r = _end - Date.now() - _rsvNow();", '범인 ②의 짝 — 남은 몫(T687)', '★닿음(②와 같은 갈래 · 그대로 둠)'],
  ['server/tick-budget.js', "const rv = _rsvNow(), r = _end - Date.now();", '범인 ②의 짝 — 몫 바닥(T687)', '★닿음(②와 같은 갈래 · 그대로 둠)'],
  ['server/zone.js', "  const now = Date.now();\n  if (BC.VERIFY) BC.check(players);", '존 30Hz 틱 머리 시각 — `SimVillages.onGameTick(now)` → `tickCaravanBodies(now)`(범인 ①의 원천)', '★닿음(①을 거쳐) — 켬은 T1182 몸만 이 값 대신 econ 날 시계를 쓴다'],
  ['server/villages.js', "end: (T762_CARAVAN_BODY ? (T1253_CLOCK_FIX ? _t1253Now() : Date.now())", '장 끝 시각(T707 장 · T1182 켬 = 장부 도착을 동기한 벽시각 + 하루 4/24)', '★닿을 수 있음(같은 갈래) — 다음 날 머리 장 정산이 견준다 · 시드 42 첫 갈림엔 안 닿음(이 둘만 고친 판은 그대로 갈림 — 보고 §1-③) · 켬 = econ 날 시계'],
  ['server/villages.js', "if (leg === 'market') { if (body.phase !== 'linger' || (T1253_CLOCK_FIX ? _t1253Now() : Date.now()) < body.lingerUntil)", '장 정산 문(머리) — 지금 < 장 끝 이면 정산을 하루 미룬다', '★닿을 수 있음(위와 짝) · 켬 = econ 날 시계'],
  ['server/villages.js', "body.lingerUntil = ((T1253_CLOCK_FIX && body._t1182) ? _t1253Now() : now) + state.dayMs * CARAVAN_LINGER_DAY_FRAC;", '도착 몸 머묾 끝(동기 `now` = 창 연 벽시각 + 1게임시간)', '★닿을 수 있음(장 기록이 없는 몸 · T707 끔) · 켬 = econ 날 시계'],
  ['server/villages.js', "body.lingerUntil = (rec && rec.cars.has(c.id)) ? rec.end : (T1253_CLOCK_FIX ? _t1253Now() : now)", '장 마당 몸 머묾 끝(몸 세울 때)', '★닿을 수 있음(같은 갈래) · 켬 = econ 날 시계'],
  ['server/villages.js', "body.lingerUntil <= (T1253_CLOCK_FIX ? _t1253Now() : now)) {", '다시 뜬 판 장 마당 몸 — 장이 이미 끝났나(T775)', '닿을 수 있음(다시 뜬 판) · 켬 = 같은 시계로 견줌'],
  ['server/villages.js', "_t1182: T762_CARAVAN_BODY, _t1182At: T1253_CLOCK_FIX ? _t1253Now() : now, pinHunger: p.hunger", '몸 걸음 시계 시작(몸 세울 때)', '★닿음(①의 시작점) · 켬 = econ 날 시계'],
  ['server/villages.js', "_t1182: T762_CARAVAN_BODY, _t1182At: T1253_CLOCK_FIX ? _t1253Now() : now, pinHunger: N.p.hunger", '교차 존 몸 걸음 시계 시작', '닿을 수 있음(교차 존 판만) · 켬 = econ 날 시계'],
  ['server/villages.js', "body._t1182At=T1253_CLOCK_FIX ? _t1253Now() : now;const A=S.act;", '다시 뜬 몸 걸음 시계 시작(T1034)', '닿을 수 있음(다시 뜬 판) · 켬 = econ 날 시계'],
  ['server/villages.js', "if (T762_CARAVAN_BODY) { const at=Date.now(); if (T1253_CLOCK_FIX)", '마감 끝 몸 틱 시각(`tickCaravanBodies(at)` — 범인 ①의 원천 둘째)', '★닿음(①을 거쳐 — 정산 · 귀환 출발이 이 틱에 선다) · 켬 = 경계 한 순간(`_t1253Edge`)'],
  ['server/villages.js', "const now = (T1253_CLOCK_FIX && T762_CARAVAN_BODY) ? _t1253Now() : Date.now();", '장마당 그림(방송 좌표)', '아니오(그림만) · 켬 = 장 끝과 같은 시계'],
  ['server/villages.js', "return D * M + Math.min(M, Math.max(0, Date.now() - econDayToMs(D)));", '★정본 econ 날 시계 `_t1253Now()`(켬만 · 위 줄들이 거친다)', '켬에서만 — 결과에 닿는 T1182 몸 시각의 한 출처'],
];
const files = [];
for (const d of ['server', 'sim']) for (const f of fs.readdirSync(path.join(ROOT, d)).sort()) if (/\.js$/.test(f)) files.push(path.join(d, f));
const rows = [];
for (const f of files) {
  const L = fs.readFileSync(path.join(ROOT, f), 'utf8').split('\n');
  L.forEach((ln, i) => {
    const t = ln.trim();
    if (/^\/\//.test(t) || /^\*/.test(t)) return;
    const code = ln.replace(/\/\/.*$/, (m) => (/['"`]/.test(m.slice(0, 3)) ? m : ''));   // 줄 끝 주석 뺌(대충 — 글자 안 // 는 남긴다)
    const m = code.match(RX); if (!m) return;
    let what;
    if (/console\.(log|error|warn)/.test(code) && !/=\s*Date\.now\(\)/.test(code)) what = '로그';
    else if (/_probe|Stat\b|Stat\.|perf|\.ns\b|nsPick|nsCut|_t1027|_t977|_lifeSub|Max\b|Ms\s*[+=]|\bms\s*[:=]|wall:|uptime|_tickPerf|metrics|_m\.|dbg|P\.ns|hist/.test(code)) what = '계측';
    else if (/budget|Budget|TB\.|SLICE|slice\(|>= ?B\b|> ?B\b|< ?_B\b|over\(\)|stop\b|capMs|>= ?budget|cap\b|deadline|_end\b|left\(/.test(code)) what = '몫';
    else what = '시각';
    let vc;
    if (/economy-engine\.browser\.js$/.test(f)) vc = '해당 없음(브라우저 묶음)';
    else if (/^sim\/_|bandit-lab/.test(f)) vc = '해당 없음(랩 도구 · 존 밖)';
    else if (/central\.js$/.test(f)) vc = '아니오(다른 프로세스 · 판 자에선 안 뜬다)';
    else if (/xzone-geo\.js$/.test(f)) vc = '예(존 프로세스) · 일꾼 스레드에서 돌면 아니오(교차 존 켬 판만 — `new Worker(__filename)`)';
    else vc = '예(존 프로세스 전역)';
    let reach = what === '로그' || what === '계측' ? '아니오(셈만)' : what === '몫' ? '언제만(조각 · T85 계약) — 가상 시계 판은 몫이 안 닳는다' : '후보(벽시각이 세계 칸 · 견줌에 든다)';
    let hand = null;
    for (const h of HAND) if (h[0] === f && (h[1].includes('\n') ? (ln + '\n' + (L[i + 1] || '')).includes(h[1]) : ln.includes(h[1]))) hand = h;
    if (hand) { what = hand[2]; reach = hand[3]; }
    rows.push({ f, line: i + 1, n: m.length, what, vc, reach, hand: !!hand, code: t.slice(0, 160) });
  });
}
const by = (k) => rows.reduce((o, r) => ((o[r[k]] = (o[r[k]] || 0) + 1), o), {});
const sum = { sites: rows.length, reads: rows.reduce((a, r) => a + r.n, 0), byWhat: by('what'), byFile: by('f'), hand: rows.filter((r) => r.hand).length };
console.log(JSON.stringify(sum, null, 1));
if (opt('--json')) fs.writeFileSync(opt('--json'), JSON.stringify({ sum, rows }));
if (opt('--md')) {
  const esc = (s) => String(s).replace(/\|/g, '\\|').replace(/`/g, "'");
  const out = ['# T1253 — `server/` · `sim/` 시계 읽는 자리 전수 표(2026-11-10 · `scripts/t1253-clock-sites.js` 가 뽑음 · 줄 번호는 이 가지 HEAD 기준)', '',
    `자리 ${sum.sites}줄(읽기 ${sum.reads}번) · 갈래 ${Object.entries(sum.byWhat).filter(([k]) => ['로그', '계측', '몫', '시각'].includes(k)).map(([k, v]) => `${k} ${v}`).join(' · ')} · 손으로 짚은 줄 ${sum.hand}(범인)`, '',
    '| 파일:줄 | 무엇을 재나 | 가상 시계가 갈아 끼우나 | 결과에 닿나 | 글자 |', '|---|---|---|---|---|'];
  for (const r of rows.sort((a, b) => (b.hand - a.hand) || a.f.localeCompare(b.f) || a.line - b.line)) out.push(`| ${r.f}:${r.line} | ${esc(r.what)} | ${esc(r.vc)} | ${esc(r.reach)} | \`${esc(r.code)}\` |`);
  fs.writeFileSync(opt('--md'), out.join('\n') + '\n');
}
