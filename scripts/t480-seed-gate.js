#!/usr/bin/env node
// === scripts/t480-seed-gate.js — 시딩 JSON 을 뽑는다: 마을 좌표 · 땅 값(`coastal` · `_seaDistPx` …) (T480 ① 게이트) ==========
//
// ★계측기다 — 러너 밖. 존을 **새 DB** 로 띄워 `zone server up` 까지 기다린 뒤 죽이고, 그 DB 에서 읽는다(존 무접촉 · 읽기만):
//   `villages`(이름 · 셀 좌표) + 큰집(`village_buildings type='hall'`)의 `data.land`(시딩 때 `extractLandParamsApprox` 가 낸 그 값 전부).
//   두 판(베이스 트리 · 새 트리)을 뽑아 `cmp` 한다 — 한 바이트라도 다르면 게이트 빨강.
//
// 실행: node scripts/t480-seed-gate.js <ROOT(존 코드 트리)> <out.json> [zone,zone,…(기본 hanbando,nippon,jungwon_n)] [포트 시작 3500]
'use strict';
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const ROOT = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const OUT = process.argv[3] || '/tmp/t480-seed.json';
const ZIDS = (process.argv[4] || 'hanbando,nippon,jungwon_n').split(',');
const PORT0 = parseInt(process.argv[5] || '3500', 10);
const { DatabaseSync } = require('node:sqlite');
const DDIR = `/tmp/t480-seed-${process.pid}`; fs.mkdirSync(DDIR, { recursive: true });
const t0 = Date.now();
function bootOne(zid, port) {
  return new Promise((res) => {
    const db = `${DDIR}/w-${zid}.db`;
    const p = spawn(process.execPath, [path.join(ROOT, 'server', 'zone.js')], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'],
      env: Object.assign({}, process.env, { PORT: String(port), ZONE_ID: zid, DB_PATH: db, CENTRAL_URL: `http://localhost:${port - 1}` }) });
    let out = '', done = false; const ts = Date.now();
    const fin = (ok) => { if (done) return; done = true; try { p.kill('SIGKILL'); } catch (e) {} setTimeout(() => res({ zid, ok, s: (Date.now() - ts) / 1000, db, err: /(^|\s)(TypeError|ReferenceError)\b|Cannot read|is not a function/.test(out) }), 500); };
    p.stdout.on('data', (b) => { out += b; if (/zone server up on/.test(out)) fin(true); });
    p.stderr.on('data', (b) => { out += b; });
    p.on('exit', () => fin(false));
    setTimeout(() => fin(false), 600000);
  });
}
(async () => {
  const rs = await Promise.all(ZIDS.map((z, i) => bootOne(z, PORT0 + i * 2)));
  const dump = {};
  for (const r of rs) {
    const d = new DatabaseSync(r.db, { readOnly: true });
    const vils = d.prepare('SELECT id, name, cx, cy FROM villages ORDER BY id').all();
    const halls = d.prepare("SELECT village_id, data FROM village_buildings WHERE type = 'hall' ORDER BY village_id").all();
    const land = new Map(halls.map((h) => { let j = null; try { j = JSON.parse(h.data); } catch (e) {} return [h.village_id, j && j.land]; }));
    dump[r.zid] = { boot: { ok: r.ok, s: r.s, err: r.err }, villages: vils.map((v) => ({ name: v.name, cx: v.cx, cy: v.cy, land: land.get(v.id) || null })) };
    d.close();
    const V = dump[r.zid].villages;
    console.log(`${r.zid.padEnd(10)} 기동 ${r.s.toFixed(1)}s · 마을 ${V.length} · 해안 ${V.filter((v) => v.land && v.land.coastal).length} · 바다까지 px 합 ${V.reduce((a, v) => a + ((v.land && v.land._seaDistPx) || 0), 0)} · 예외 ${r.err ? '있음' : 0}`);
  }
  // 부팅 시간은 판마다 다르다 — 비교 JSON 엔 넣지 않는다(좌표·땅 값만)
  const cmpObj = {}; for (const z of ZIDS) cmpObj[z] = dump[z].villages;
  fs.writeFileSync(OUT, JSON.stringify(cmpObj, null, 1));
  fs.writeFileSync(OUT.replace(/\.json$/, '') + '.boot.json', JSON.stringify(Object.fromEntries(ZIDS.map((z) => [z, dump[z].boot]))));
  fs.rmSync(DDIR, { recursive: true, force: true });
  console.log(`→ ${OUT} · ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  process.exit(0);
})();
