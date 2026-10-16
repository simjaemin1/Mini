#!/usr/bin/env node
// === scripts/t738-witness.js — T738 SoA x·y 증인(계측기 · 러너 밖 · 제품 무변 · 손잡이 켬 판에서만 뜻이 있다) ==============
//
// ⓐ 값 왕복 — 경계값(−0 · NaN · 아주 작은 수 · 큰 수 · 정수 · 무한)을 접근자로 쓰고 읽어 `Object.is` 로 견준다.
// ⓑ 실제 몸 — 새 세계(마을 켬)를 프로세스 안에서 띄워 주민 몸 전부를 **바꾸기 전 / 후** 로 견준다:
//    `JSON.stringify(몸)` · 키 차례 · `serializeBody(몸)` · `{...몸}` 의 바이트가 같은가.
// ⓒ 쓰기 길 — 바꾼 몸에 `p.x += …` · `p.x = …` · 구조 분해 · `Object.assign` 이 열에 닿는가(열 값 = 몸 값).
// 실행: T738_SOA_XY=1 node scripts/t738-witness.js
'use strict';
const path = require('path'), fs = require('fs');
const ROOT = path.join(__dirname, '..');
if (process.env.T738_SOA_XY !== '1') { console.error('T738_SOA_XY=1 로 띄워라'); process.exit(2); }
const TMP = `/tmp/t738w-${process.pid}.db`;
const rm = () => { for (const s of ['', '-wal', '-shm']) { try { fs.unlinkSync(TMP + s); } catch (e) {} } };
rm(); process.on('exit', rm);
Object.assign(process.env, { ZONE_ID: 'hanbando', PORT: String(39300 + (process.pid % 300)), DB_PATH: TMP, ENABLE_VILLAGES: '1', ENABLE_WILDLIFE: '0', ENABLE_BANDITS: '0', ENABLE_ROADS: '0', VILLAGE_DAY_MS: '4000' });
const log = console.log; console.log = () => {}; console.warn = () => {};
let pass = 0, fail = 0;
const ok = (c, m, d) => { c ? pass++ : fail++; log((c ? '  ✓ ' : '  ✗ ') + m + (d ? '  ' + d : '')); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const Zone = require(path.join(ROOT, 'server', 'zone.js'));
  const H = Zone.__testBind();
  log('ⓐ 값 왕복');
  const V = [0, -0, NaN, Infinity, -Infinity, 1, -1, 0.1, 1e-310, 5e-324, -5e-324, Number.MAX_VALUE, 2 ** 53 + 2, 31871.123456789, -0.000001];
  const d = { x: 1, y: 2 }; H._t738Adopt(d);
  let bad = 0; for (const v of V) { d.x = v; d.y = -v; if (!Object.is(d.x, v) || !Object.is(d.y, -v)) bad++; }
  ok(bad === 0, '경계값 15개 — 쓰고 읽은 값이 `Object.is` 로 같다(비트 그대로)', `어긋남 ${bad}`);
  log('ⓑ 실제 몸(새 세계 · 마을 켬)');
  for (let i = 0; i < 600; i++) { let n = 0; for (const p of H.players.values()) if (p.isNpc && p.simVillageId != null) n++; if (n > 50) break; await sleep(200); }
  const npcs = [...H.players.values()].filter((p) => p.isNpc && p.simVillageId != null);
  ok(npcs.length > 50, '[전제] 주민 몸이 섰다', `${npcs.length}명`);
  let same = 0, diff = 0, first = '';
  for (const p of npcs) {
    H.serializeBody(p);   // ⚠처음 부르면 몸에 `body` 칸을 지연으로 세운다(제품 규약) — 견주기 전에 한 번 불러 그 칸을 세워 둔다
    const a = [JSON.stringify(p, (k, v) => (v instanceof Set || v instanceof Map ? [...v] : v)), Object.keys(p).join(','), JSON.stringify(H.serializeBody(p)), JSON.stringify({ ...p }, (k, v) => (v instanceof Set || v instanceof Map ? [...v] : v))];
    H._t738Adopt(p);
    const b = [JSON.stringify(p, (k, v) => (v instanceof Set || v instanceof Map ? [...v] : v)), Object.keys(p).join(','), JSON.stringify(H.serializeBody(p)), JSON.stringify({ ...p }, (k, v) => (v instanceof Set || v instanceof Map ? [...v] : v))];
    if (a.every((s, i) => s === b[i])) same++; else { diff++; if (!first) { first = p.pid + ' 칸 ' + a.map((s, i) => (s === b[i] ? '=' : '≠')).join(''); if (process.env.T738_W_DBG) { const i = a.findIndex((s, j) => s !== b[j]); let k = 0; while (a[i][k] === b[i][k]) k++; log('    전: ' + a[i].slice(Math.max(0, k - 80), k + 80)); log('    후: ' + b[i].slice(Math.max(0, k - 80), k + 80)); } } }
  }
  ok(diff === 0, '몸 전부 — JSON · 키 차례 · serializeBody · 펼침 바이트가 바꾸기 전 = 후', `같음 ${same} · 다름 ${diff}${first ? ' · 첫 ' + first : ''}`);
  const desc = Object.getOwnPropertyDescriptor(npcs[0], 'x');
  ok(!!(desc && desc.get && desc.set && desc.enumerable), '[전제] 바꾼 몸의 x 는 접근자다(열을 본다)');
  log('ⓒ 쓰기 길');
  const p = npcs[0], T = H._t738();
  const slot = (() => { for (let s = 0; s < T.n; s++) if (Object.is(T.X[s], p.x) && Object.is(T.Y[s], p.y)) return s; return -1; })();
  p.x += 1.25; p.y -= 0.5; const x1 = p.x;
  Object.assign(p, { x: x1 * 2 }); const { x, y } = p;
  ok(slot >= 0 && Object.is(T.X[slot], x) && Object.is(T.Y[slot], y) && x === x1 * 2, '`+=` · `-=` · `Object.assign` · 구조 분해가 같은 열 칸을 본다', `슬롯 ${slot} · x ${x}`);
  log(`\n=== ${pass + fail}건 중 PASS ${pass} · FAIL ${fail} ===`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { log('  ✗ 예외 ' + (e && e.stack || e)); process.exit(1); });
