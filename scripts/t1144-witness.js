#!/usr/bin/env node
// (@regress 없음 — 러너 밖 · 존을 띄운다 · 제품 무변)
// === scripts/t1144-witness.js — T1144 생활 층 사건 셋(`T1144_LIFE_EVENT`) 산 존 증인 [T1154 2026-11-05 · 세션14 판 증인의 산 판 · 미끼를 S15 틀(verify)로 옮김] ===
//   산 존 하나(틀 DB · 관측자 하나 · 실제 날 · T455 고정 원점 · 어부 켬 `T312_FISH_ACT=1`)를 `T1144_LIFE_EVENT=verify` 로 띄운다 —
//   verify 판은 사건 셋마다 지난 답을 쓰지 않고 종전 셈으로 다시 내어 견준다(세계는 종전 답으로 돈다 · 셈은 `/lifedbg` totals.t1144):
//     ① 밭 칸 훑기  — 견줌 `vq` · 어긋남 `vbad`
//     ② 어부 던짐 종 — 지난 답이 있던 던짐 `fvq` · 다시 뽑은 종과 다름 `fvbad`
//     ③ 물린 한 마리 낱값 — 지난 값이 있던 부름 `uvq` · 다시 잰 값과 다름 `uvbad`
//   미끼(자명 통과 금지 · 세션14 증인 `brk-sp` 그대로): `T1144_VERIFY_BAIT=sp` = 종 기억이 칸 사건을 빠뜨린다 → `fvbad > 0` 이어야 한다.
//   (밭 칸 미끼는 하네스 `test-t1144-life-event` ④가 진다 — 사건 밖 칸 고침을 verify 가 문다.)
// 실행: node scripts/t1144-witness.js <틀 DB> [--secs 600] [--bait-secs 300] [--out <json>]
'use strict';
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const ROOT = path.join(__dirname, '..');
const TPL = process.argv[2];
const arg = (k, d) => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : d; };
const SECS = +arg('--secs', 600), BSECS = +arg('--bait-secs', 300), OUT = arg('--out', null);
const TMP = process.env.T1144_TMP || path.join(require('os').tmpdir(), 't1144-wit');
fs.mkdirSync(TMP, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (x != null ? '  ' + x : '')); };
const rmdb = (f) => { for (const s of ['', '-wal', '-shm']) { try { fs.unlinkSync(f + s); } catch (e) {} } };

async function live(tag, { secs, bait, port }) {
  const CP = port, ZP = port + 1, SECRET = 't1144';
  const zdb = path.join(TMP, `z-${tag}.db`), cdb = path.join(TMP, `c-${tag}.db`);
  rmdb(zdb); rmdb(cdb);
  for (const s of ['', '-wal', '-shm']) { try { fs.copyFileSync(TPL + s, zdb + s); } catch (e) {} }
  const DAY = 1440000, LEAD_S = 150;
  const at = (Math.floor(fs.statSync(TPL).mtimeMs / DAY) + 2) * DAY - LEAD_S * 1000;   // T455 고정 원점(t646 자와 같은 식 — 하루 경계 LEAD 초 앞)
  const env0 = Object.assign({}, process.env, { NODE_OPTIONS: `--require ${path.join(__dirname, 't455-clock.js')}`, T455_CLOCK_PRE: '1', T455_CLOCK_AT: String(at) });
  const logf = fs.openSync(path.join(TMP, `${tag}.log`), 'w');
  const c = spawn(process.execPath, [path.join(ROOT, 'server/central.js')], { cwd: ROOT, stdio: 'ignore',
    env: Object.assign({}, env0, { PORT: String(CP), DB_PATH: cdb, PUBLIC_HOST: 'localhost', ENABLED_ZONES: 'hanbando', CENTRAL_SECRET: SECRET }) });
  const z = spawn(process.execPath, [path.join(ROOT, 'server/zone.js')], { cwd: ROOT, stdio: ['ignore', logf, logf],
    env: Object.assign({}, env0, { PORT: String(ZP), ZONE_ID: 'hanbando', CENTRAL_HOST: 'localhost', CENTRAL_PORT: String(CP), CENTRAL_SECRET: SECRET,
      DB_PATH: zdb, ENABLE_VILLAGES: '1', VILLAGE_DAY_MS: String(DAY), VILLAGE_WAR_LOG: '0', T312_FISH_ACT: '1',
      T1144_LIFE_EVENT: 'verify', T1144_VERIFY_BAIT: bait || '' }) });
  const getj = async (p) => { try { const r = await fetch(`http://localhost:${ZP}${p}`, { headers: { 'x-zone-secret': SECRET }, signal: AbortSignal.timeout(20000) }); return await r.json(); } catch (e) { return null; } };
  const kill = async () => { try { z.kill('SIGINT'); } catch (e) {} await sleep(3000); try { z.kill('SIGKILL'); } catch (e) {} try { c.kill('SIGKILL'); } catch (e) {} await sleep(500); rmdb(zdb); rmdb(cdb); };
  try {
    const t0 = Date.now();
    for (let i = 0; i < 600; i++) { try { const r = await fetch(`http://localhost:${ZP}/health`, { signal: AbortSignal.timeout(3000) }); if (r.ok) break; } catch (e) {} await sleep(1000); }
    const WS = require(path.join(ROOT, 'node_modules', 'ws'));
    const ws = new WS(`ws://localhost:${ZP}/?observer=1`); ws.on('error', () => {}); ws.on('message', () => {});
    const ping = setInterval(() => { try { ws.send(JSON.stringify({ type: 'ping', t: Date.now() })); } catch (e) {} }, 5000);
    console.log(`  [${tag}] 기동 ${((Date.now() - t0) / 1000).toFixed(0)}초 · ${secs}초 돈다`);
    const t1 = Date.now(); let L = null, S = null;
    while (Date.now() - t1 < secs * 1000) { await sleep(30000); L = await getj('/lifedbg'); S = (L && L.totals && L.totals.t1144) || S; if (S) console.log(`  [${tag}] phase ${L && L.phase} · ${JSON.stringify(S)}`); }
    clearInterval(ping); try { ws.close(); } catch (e) {}
    L = await getj('/lifedbg');
    return (L && L.totals && L.totals.t1144) || S;
  } finally { await kill(); }
}

(async () => {
  const res = { at: new Date().toISOString(), tpl: TPL, secs: SECS, baitSecs: BSECS };
  if (!TPL || !fs.existsSync(TPL)) { ok(false, '틀 DB 가 없다', TPL); console.log(`\nt1144-witness ${pass}/${fail}`); process.exit(1); }
  console.log('ⓐ 산 판 — verify(사건 셋 · 지난 답 ↔ 다시 낸 답)');
  { const S = await live('ver', { secs: SECS, port: 4150 }); res.ver = S;
    ok(!!S && S.vq > 0 && S.vbad === 0, '① 밭 칸 훑기 — 견줌 > 0 · 어긋남 0', S ? `견줌 ${S.vq} · 어긋남 ${S.vbad} · 물음 ${S.ask} · 0 건너뜀 ${S.skip}` : 'null');
    ok(!!S && S.fvq > 0 && S.fvbad === 0, '② 어부 던짐 종 — 지난 답이 있던 던짐 > 0 · 다시 뽑은 종과 다름 0', S ? `던짐 ${S.fq} · 지난 답 ${S.fhit}(${(100 * S.fhit / Math.max(1, S.fq)).toFixed(1)} %) · 견줌 ${S.fvq} · 다름 ${S.fvbad}` : 'null');
    ok(!!S && S.uvq > 0 && S.uvbad === 0, '③ 물린 한 마리 낱값 — 지난 값이 있던 부름 > 0 · 다시 잰 값과 다름 0', S ? `부름 ${S.uq} · 견줌 ${S.uvq} · 다름 ${S.uvbad}` : 'null'); }
  console.log('ⓑ 미끼 — 종 기억이 칸 사건을 빠뜨리면(`T1144_VERIFY_BAIT=sp`) verify 가 문다');
  { const S = await live('bait-sp', { secs: BSECS, bait: 'sp', port: 4160 }); res.baitSp = S;
    ok(!!S && S.fvq > 0 && S.fvbad > 0, '미끼 sp — 다름이 난다', S ? `견줌 ${S.fvq} · 다름 ${S.fvbad}` : 'null'); }
  res.pass = pass; res.fail = fail;
  if (OUT) fs.writeFileSync(OUT, JSON.stringify(res, null, 1));
  console.log(`\nt1144-witness ${pass}/${fail}`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
