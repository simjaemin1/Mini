#!/usr/bin/env node
// (@regress 없음 — 러너 밖 · T1139 자 · 제품 무변 · 한 판 ≈ 걸음표 두 벌 시간)
// =============================================================================
// T1139 — "물은 쌍만 판다"(`server/xzone-geo.js lazySplit` · 존 서버 손잡이 `T1139_XZ_LAZY`)가 **전 쌍 한 벌과 글자 같은가**.
//   존 서버 워커와 같은 질문(A<B · coast 켬 · 명부 = T524 시딩 표 — `t662-geo-anatomy.js` 와 같은 명부)으로:
//     ① 끔 — `crossGeo` 전 쌍 한 벌(종전 · splitR 없음)
//     ② 켬 — `crossGeo` 한 벌(splitR = <splitR>) + 그 밖의 쌍을 늦게 파는 일꾼에 **거꾸로**(B 마지막 · A 마지막부터) 다 묻는다
//        → 쌍 차례(i, j)로 다시 엮은 { dist, split } 를 ①과 JSON 바이트로 견준다(차례가 달라도 같은 답 = 격자 메모가 답을 안 바꾼다).
//   [--ref <e2e 한 벌 파일>] — e2e 끔 판이 남긴 한 벌(`T662_GEO_CACHE_DIR` 의 `hanbando+nippon.<지문>.json`)과도 ①을 견준다(명부가 서버와 같은가 · 표만).
//   [--live] — 명부를 T524 표 대신 **지금 서버 시딩**에서 읽는다(central + 두 존을 e2e 처럼 같이 띄워 관측자 welcome `simVillages` 의 name · cx · cy =
//     존 서버 호스트 `rosterOf` 와 같은 칸 · 판 뒤 끔) — 이때 <T524 dir> 자리는 `-`.
//   출력: 한 줄 JSON(시간 · 쌍 수 · 같음) · <out>/full.json(① dist+split) · <out>/lazy.json(② 다시 엮은 것)
// 쓰는 법: node scripts/t1139-lazy-proof.js <T524 dir | -> <out dir> <splitR> [--ref <file>] [--fwd] [--live]
//   splitR = 존 서버 econ `infoRange`(server/villages.js `createWorldV2` 인자 — e2e 존 로그 "정보 반경 N(econ)")
//   --fwd = 늦게 묻는 차례를 거꾸로 대신 바로(i, j)로
// =============================================================================
'use strict';
if (require.main === module) require('./lib-port').hold(3010, 3020, 3021);   // [T1288] 제품 고정 포트(존 설정 · central 기본) — 띄우는 동안 이 기계에서 혼자 쥔다(나란히 돌면 줄 선다 · `lib-port.hold`)
const path = require('path'), fs = require('fs'), crypto = require('crypto');
process.env.ENABLE_VILLAGES = process.env.ENABLE_VILLAGES || '0';
process.env.DB_PATH = process.env.DB_PATH || path.join(require('os').tmpdir(), `t1139-proof-${process.pid}.db`);
const [AD, OUTD, SR] = process.argv.slice(2);
const REF = process.argv.includes('--ref') ? process.argv[process.argv.indexOf('--ref') + 1] : null;
const FWD = process.argv.includes('--fwd'), LIVE = process.argv.includes('--live');
if (!AD || !OUTD || !(+SR > 0)) { console.error('node scripts/t1139-lazy-proof.js <T524 dir | -> <out dir> <splitR> [--ref <file>] [--fwd] [--live]'); process.exit(2); }
const G = require(path.join(__dirname, '..', 'server', 'xzone-geo.js'));
const ros = (z) => JSON.parse(fs.readFileSync(path.join(AD, `${z}.json`), 'utf8')).vills.filter((v) => v.seeded).map((v) => ({ name: v.name, cx: v.ccx, cy: v.ccy }));
const A = 'hanbando', B = 'nippon';
const sha = (s) => crypto.createHash('sha1').update(s).digest('hex').slice(0, 16);
fs.mkdirSync(OUTD, { recursive: true });
// 지금 서버 시딩의 명부 — central + 두 존(e2e 와 같이 둘 다 켠 판 · `ENABLED_ZONES=A,B` · 마을 켬 · 그 밖 env 는 이 자에 준 그대로) · 관측자 welcome 의 `simVillages`
async function liveRosters(zs) {
  const { spawn } = require('child_process'), FB = require('./fixture-boot'), ROOT = path.join(__dirname, '..');
  const { ZONES } = require(path.join(ROOT, 'server', 'zone-config'));
  const WS = require(path.join(ROOT, 'node_modules', 'ws'));
  const D = fs.mkdtempSync(path.join(require('os').tmpdir(), 't1139-live-')), kids = [];
  const boot = (args, env) => { const p = spawn(process.execPath, args, { cwd: ROOT, env: Object.assign({}, process.env, env), stdio: ['ignore', 'pipe', 'pipe'] }); p.stdout.resume(); p.stderr.resume(); kids.push(p); return p; };
  const EN = zs.join(',');
  try {
    const c = boot([path.join(ROOT, 'server', 'central.js')], { PORT: '3010', DB_PATH: `${D}/central.db`, PUBLIC_HOST: 'localhost', ENABLED_ZONES: EN });
    const cu = await FB.waitUp(c, /central server up on/, { name: 'central' }); if (!cu.ok) throw new Error(`central: ${cu.why}`);
    const ups = zs.map((Z) => FB.waitUp(boot([path.join(ROOT, 'server', 'zone.js')], { PORT: String(ZONES[Z].port), ZONE_ID: Z, DB_PATH: `${D}/w-${Z}.db`, CENTRAL_URL: 'http://localhost:3010', ENABLED_ZONES: EN, ENABLE_VILLAGES: '1' }),
      /zone server up on/, { name: Z, capMs: 900000 }));
    for (const u of ups) { const r = await u; if (!r.ok) throw new Error(`존: ${r.why}`); }
    const out = {};
    for (const Z of zs) out[Z] = await new Promise((res, rej) => {
      const w = new WS(`ws://localhost:${ZONES[Z].port}/?observer=1`); w.on('error', rej);
      w.on('message', (b) => { let m = null; try { m = JSON.parse(String(b)); } catch (e) { return; }
        if (m && m.type === 'welcome' && Array.isArray(m.simVillages)) { try { w.close(); } catch (e) {} res(m.simVillages.map((v) => ({ name: v.name, cx: v.cx, cy: v.cy }))); } });
    });
    return out;
  } finally {
    for (const p of kids) { try { p.kill('SIGKILL'); } catch (e) {} }
    await new Promise((r) => setTimeout(r, 500)); fs.rmSync(D, { recursive: true, force: true });
  }
}
(async () => {
const LR = LIVE ? await liveRosters([A, B]) : null;
const rA = LIVE ? LR[A] : ros(A), rB = LIVE ? LR[B] : ros(B);
const q = { A, B, rosterA: rA, rosterB: rB, coast: true };

// ① 끔 — 전 쌍
let t = Date.now();
const r0 = G.crossGeo(q);
const offWall = Date.now() - t;
const full = JSON.stringify({ dist: r0.dist, split: r0.split });
fs.writeFileSync(path.join(OUTD, 'full.json'), full);

// ② 켬 — 한 벌(splitR) + 늦게(그 밖 전부 · 거꾸로)
t = Date.now();
const qE = Object.assign({}, q, { splitR: +SR });
const rE = G.crossGeo(qE);
const onTableWall = Date.now() - t;
const L = G.lazySplit(qE, rE, {});
const names = (r) => { const as = Object.keys(r.dist), bs = as.length ? Object.keys(r.dist[as[0]]) : []; return [as, bs]; };
const [as, bs] = names(rE);
const far = [];
for (const a of as) for (const b of bs) { const d = rE.dist[a][b]; if (d != null && d > +SR) far.push([a, b]); }
if (!FWD) far.reverse();
t = Date.now();
for (const [a, b] of far) L.get(a, b);
const lazyWall = Date.now() - t;
L.close();
const split1 = {};
for (const a of as) for (const b of bs) {
  const e = (rE.split[a] && rE.split[a][b]) || L.get(a, b);   // 물은 것은 메모에서(다시 안 판다)
  if (e) (split1[a] || (split1[a] = {}))[b] = e;
}
const lazy = JSON.stringify({ dist: rE.dist, split: split1 });
fs.writeFileSync(path.join(OUTD, 'lazy.json'), lazy);

let refSame = null;
if (REF) { const R = JSON.parse(fs.readFileSync(REF, 'utf8')); refSame = JSON.stringify({ dist: R.dist, split: R.split }) === full; }
const pairs = as.length * bs.length;
console.log(JSON.stringify({
  roster: LIVE ? 'live' : 'T524', nA: rA.length, nB: rB.length, pairs, splitR: +SR,
  off: { wallMs: offWall, bfsMs: r0.ms.bfs, routeMs: r0.ms.route, routed: r0.routed, failed: r0.failed, sha: sha(full), bytes: full.length },
  on: { tableWallMs: onTableWall, bfsMs: rE.ms.bfs, routeMs: rE.ms.route, routed: rE.routed, failed: rE.failed,
    farAsked: far.length, order: FWD ? 'fwd' : 'rev', lazyWallMs: lazyWall, lazy: L.st, sha: sha(lazy), bytes: lazy.length },
  same: lazy === full, distSame: JSON.stringify(rE.dist) === JSON.stringify(r0.dist), refSame,
}));
process.exit(lazy === full ? 0 : 1);   // 판정 = ② 가 ① 과 같은가(`refSame` 은 명부가 서버와 같은가 — 표만)
})().catch((e) => { console.error('자 실패:', e); process.exit(2); });
