#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// === scripts/test-index-named.js — 색인을 못 물으면 이름을 붙이나 (T393 ③) ==================
//
// ★왜 [T378 §1-3 → T393 ③] `_actEntitiesAtCell` 은 색인(`resourcesAtCell`) 호출이 던지면 **말없이** `[]` 를 냈다.
//   그러면 "그 셀엔 없다"와 "물을 수 없었다"가 같은 답이다 — T378 이 부팅 개간 0그루의 이유를 그래서 못 봤다
//   (부팅엔 `gameDayNow()` 가 `_e2eClock` TDZ 로 던진다 · 족보 308). 이 하네스가 지키는 것:
//     ① 던지면 **한 번** 이름이 붙는다(개간 · 자원 셀 질의 두 자리 다 — 문 하나 `_idxWarnOnce`)
//     ② **같은 이유는 한 번만** — 셀마다 · 부를 때마다 같은 줄을 쏟지 않는다(다른 이유면 또 말한다)
//     ③ 안 던지면 **아무 말도 안 한다** — "0"(없다)과 "못 물었다"가 갈린다(자명 통과 금지: ①이 말하는 걸 봤다)
//
// ★던지게 하는 법 — 제품 손잡이를 만들지 않는다. 존이 `require('./chunk')` 에서 `resourcesAtCell` 을
//   **구조 분해로 받아 가기 전에** 이 프로세스가 그 자리를 감싼다(모듈 캐시 · 깃발이 서면 던진다).
//   존 소스는 한 글자도 안 바뀐다.
//
// ⚠존을 **이 프로세스 안에서** 띄운다(`test-regrow ⑦` · `test-ghost-tree` 와 같은 문법 · `Zone.__testBind`).
// 실행: node scripts/test-index-named.js
'use strict';
const path = require('path');
const fs = require('fs');
const ROOT = path.join(__dirname, '..');

let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (x !== undefined && x !== '' ? `  ${x}` : '')); };

(async () => {
  console.log('\n=== 색인을 못 물으면 이름을 붙이나 (T393 ③) ===\n');
  const TMP = `/tmp/test-index-named-${process.pid}.db`;
  for (const f of [TMP, TMP + '-wal', TMP + '-shm']) { try { fs.unlinkSync(f); } catch (e) {} }
  process.on('exit', () => { for (const f of [TMP, TMP + '-wal', TMP + '-shm']) { try { fs.unlinkSync(f); } catch (e) {} } });
  process.env.ZONE_ID = 'hanbando';
  process.env.PORT = String(39400 + (process.pid % 500));
  process.env.DB_PATH = TMP;
  process.env.ENABLE_VILLAGES = '0'; process.env.ENABLE_WILDLIFE = '0';
  process.env.ENABLE_BANDITS = '0'; process.env.ENABLE_ROADS = '0';

  // ── 감싼다 — 존이 받아 가기 전에(구조 분해는 require 순간의 값을 쥔다) ──────────
  const CH = require(path.join(ROOT, 'server', 'chunk.js'));
  const _orig = CH.resourcesAtCell;
  let boom = null;                                   // 문자열이 서면 그 말로 던진다
  CH.resourcesAtCell = function (...a) { if (boom) throw new Error(boom); return _orig.apply(this, a); };

  const lines = [];
  const _l = console.log, _w = console.warn, _e = console.error;
  console.log = () => {}; console.warn = () => {}; console.error = () => {};
  const Zone = require(path.join(ROOT, 'server', 'zone.js'));
  //   존의 말은 **받아 적는다**(판정 재료) — 이 하네스의 줄만 화면에 낸다
  const _cap = (...a) => { const s = a.map(String).join(' '); if (/^\[hanbando\]|^\s{4,}biome=/.test(s)) { lines.push(s); return; } _l(...a); };
  console.log = _cap; console.warn = (...a) => { const s = a.map(String).join(' '); if (/^\[hanbando\]/.test(s)) lines.push(s); };
  console.error = console.warn;
  const H = Zone.__testBind();
  const named = (where) => lines.filter((s) => s.includes(`★${where} — 색인을 못 물었다`));

  // 셀 둘 — 숲이 아니어도 된다(던지는지 · 이름을 붙이는지만 본다)
  const cells = new Set(['2000,2000', '2001,2000', '2002,2000']);

  // ── ③ 대조 먼저 — 안 던지면 아무 말도 안 한다 ─────────────────────────────
  {
    const n0 = lines.length;
    H.clearTreesInCells(cells);
    H._t325TreesAtCell(2000, 2000);
    ok(named('영토 개간').length === 0 && named('자원 셀 질의').length === 0,
      '★③ 안 던지면 **아무 말도 없다** — "0"은 조용하다', `${lines.length - n0}줄`);
  }
  // ── ① 던지면 한 번 이름 — 두 자리 ──────────────────────────────────────
  {
    boom = 'T393 주입 — 색인이 던졌다(가';
    const r = H.clearTreesInCells(cells);
    ok(named('영토 개간').length === 1, '★★① 개간 — 색인이 던지면 **이름이 붙는다**', named('영토 개간')[0] || '없음');
    ok(r === 0, '① 개간 — 그리고 벤 수는 0 이다(못 물었으니까 · 서 있는 개체만 본다)', `${r}`);
    const a = H._t325TreesAtCell(2000, 2000);
    ok(named('자원 셀 질의').length === 1, '★★① 자원 셀 질의(`_actEntitiesAtCell`) — 색인이 던지면 **이름이 붙는다**(종전: 말없이 `[]`)',
      named('자원 셀 질의')[0] || '없음');
    ok(Array.isArray(a) && a.length === 0, '① 자원 셀 질의 — 답은 여전히 빈 배열이다(호출부 계약 무변)');
  }
  // ── ② 같은 이유는 한 번만 · 다른 이유면 또 ───────────────────────────────
  {
    for (let i = 0; i < 5; i++) { H.clearTreesInCells(cells); H._t325TreesAtCell(2000 + i, 2000); }
    ok(named('영토 개간').length === 1 && named('자원 셀 질의').length === 1,
      '★② 같은 이유는 **한 번만** 말한다(셀 셋 × 다섯 번 더 불러도 줄이 안 는다)', `${named('영토 개간').length} · ${named('자원 셀 질의').length}`);
    boom = 'T393 주입 — 색인이 던졌다(나';
    H.clearTreesInCells(cells); H._t325TreesAtCell(2000, 2000);
    ok(named('영토 개간').length === 2 && named('자원 셀 질의').length === 2,
      '★② **다른 이유면 또** 말한다(삼키는 게 아니라 줄이는 것이다)', `${named('영토 개간').length} · ${named('자원 셀 질의').length}`);
  }
  boom = null;
  CH.resourcesAtCell = _orig;

  console.log(`\n=== 결과: ${pass} PASS / ${fail} FAIL ===\n`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('하네스 크래시:', e); process.exit(1); });
