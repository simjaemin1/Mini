#!/usr/bin/env node
// (@regress 없음 — 러너 밖 · T574 자)
// =============================================================================
// T574 ③ 추신3 — **존 안 접근성**(판정 0 · 표만): 그 존 프로필의 품목마다, 그 품목 셀이 마을 중심에서
//   **걸어서 한반도 광맥 p95(127셀 · T524 자)** 안에 있는 마을의 비율 — 혼용 전(정본) / 후(미리보기 json · L 마다).
//   마을의 절반도 못 닿는 품목 = 빨간 줄(어디에 몰렸나는 `--fig` 칸 · 그림 스크립트가 쓴다).
//   ★꼬리로 들어온 **이웃 존 고유 품목**(한반도 동부의 비취 등)은 뺀다 — 드물게 나는 게 그 품목의 뜻이다(추신3).
//
//   품목 셀 = 그 품목을 내는 광맥(`mineral` 이 그것이거나 `minerals` 분포에 들어 있는 것 — 연은 광맥의 은)이 덮는 셀
//            (`terrain.oreCandidatesAt` — 채굴이 묻는 그 술어 · 사본 0). 주요만(NPC 시야 · `minor` 없음) / 전부 두 갈래.
//   걸음 = T524 자 그대로: 통행 = 뭍 ∪ 다리 셀(4방) · 막힌 과녁(바위 속 광맥)은 그 옆 뭍 칸이 0.
//   마을 = 시딩 마을(`pickSeedVillages` → `findOpenCenter` — 서버·t17·t525 와 같은 길) + 정본 후보 전부(같이 적는다).
//   광맥 객체는 **그 자리에서 광종만 갈아 끼운다**(같은 수 · 같은 자리 · 같은 모양 — 색인 그대로 · 미리보기 json 의 같은 차례).
//
// 쓰는 법: node scripts/t574-access.js --var 정본=server/hanbando-terrain.json --var L500=<미리보기.json> … [--out f.json]
// =============================================================================
'use strict';
process.env.ENABLE_VILLAGES = process.env.ENABLE_VILLAGES || '0';
process.env.DB_PATH = process.env.DB_PATH || `/tmp/t574-acc-${process.pid}.db`;
const path = require('path');
const fs = require('fs');
const R = (p) => require(path.join(__dirname, '..', p));
const say = (s) => process.stdout.write(s + '\n');
const VARS = []; for (let i = 2; i < process.argv.length; i++) if (process.argv[i] === '--var') { const [k, v] = process.argv[++i].split('='); VARS.push({ label: k, file: v }); }
const OUT = (() => { const i = process.argv.indexOf('--out'); return i > 0 ? process.argv[i + 1] : null; })();
const REACH = 127;   // ★T524 자 — 한반도 뭍의 광맥까지 걸음 p95(셀) · 새 수 0

const G = R('server/xzone-geo');
const { ZONES, findZoneAt, T, P, SZ, chunk } = G._mods();
const RP = R('server/region-profiles');
const OTHER = { hanbando: 'nippon', nippon: 'hanbando' };
const OR = Object.values(ZONES).filter((z) => z.isOcean).map((z) => ({ x0: z.worldOffsetX, y0: z.worldOffsetY, x1: z.worldOffsetX + z.zoneWidth, y1: z.worldOffsetY + z.zoneHeight }));
const quiet = (f) => { const l = console.log, w = console.warn; console.log = () => {}; console.warn = () => {}; try { return f(); } finally { console.log = l; console.warn = w; } };

const res = { reach: REACH, zones: {} };
for (const Z of ['hanbando', 'nippon']) {
  const ZONE = ZONES[Z], t0 = Date.now();
  const NX = Math.floor(ZONE.zoneWidth / SZ), NY = Math.floor(ZONE.zoneHeight / SZ), N = NX * NY;
  // ── 통행 격자(T524 ⓐ 와 같은 세 술어 · 같은 차례) ──
  const BAND = chunk.generateCoastlineWaterTiles({ ...ZONE, id: Z }, SZ, findZoneAt, OR);
  const BR = new Set(); { const b = ZONE.bridges || []; for (let i = 0; i + 1 < b.length; i += 2) BR.add(b[i] + '_' + b[i + 1]); }
  const pass = new Uint8Array(N);
  for (let cy = 0; cy < NY; cy++) for (let cx = 0; cx < NX; cx++) {
    const x = cx * SZ + SZ / 2, y = cy * SZ + SZ / 2, i = cy * NX + cx;
    let k;
    if (BAND.has(cx + '_' + cy)) k = 2; else if (T.isWaterCellLocal(Z, x, y)) k = 3; else if (T.isRockCellLocal(Z, x, y)) k = 4; else k = 1;
    if (k === 1 || ((k === 2 || k === 3) && BR.has(cx + '_' + cy))) pass[i] = 1;
  }
  // ── 광맥이 덮는 셀 — 광맥 차례(정본·미리보기 json 같은 차례)의 번호 목록 ──
  const tz = T.ZONE_TERRAIN[Z], ores = tz.ores, idx = new Map(ores.map((o, i) => [o, i]));
  const cover = new Map();   // 셀 → [광맥 번호]
  for (const o of ores) {
    const r = Math.ceil(o.radius * 1.6 / SZ), ccx = Math.floor(o.center[0] / SZ), ccy = Math.floor(o.center[1] / SZ);
    for (let cy = Math.max(0, ccy - r); cy <= Math.min(NY - 1, ccy + r); cy++) for (let cx = Math.max(0, ccx - r); cx <= Math.min(NX - 1, ccx + r); cx++) {
      const i = cy * NX + cx; if (cover.has(i)) continue;
      const c = T.oreCandidatesAt(Z, cx * SZ + SZ / 2, cy * SZ + SZ / 2);
      if (c && c.length) cover.set(i, c.map((e) => idx.get(e.o)).filter((v) => v != null));
    }
  }
  // ── 마을 — 시딩(서버 길) + 후보 전부 ──
  const { ta } = quiet(() => G.zoneAdapter(Z));
  const hard = T.getZoneVillages(Z) || [];
  const picked = quiet(() => P.pickSeedVillages(hard, ta, { seedAll: !!ZONE.seedAllVillages, max: ZONE.villageMax || 0 }));
  const cent = (hv) => { const c = quiet(() => P.findOpenCenter(ta, Math.round(hv.x / SZ), Math.round(hv.y / SZ))); return c ? { name: hv.name, i: c.ccy * NX + c.ccx } : null; };
  const seeded = picked.map(cent).filter(Boolean), cands = hard.map(cent).filter(Boolean);
  // ── BFS(4방 · 통행 셀) — 원천: 품목 셀이 통행이면 그 칸 · 막혔으면 그 옆 통행 칸 ──
  const dist = new Int32Array(N), Q = new Int32Array(N);
  function bfs(isSrc) {
    dist.fill(-1); let h = 0, tq = 0;
    for (const [i] of cover) {
      if (!isSrc(i)) continue;
      const seed = (j) => { if (pass[j] && dist[j] < 0) { dist[j] = 0; Q[tq++] = j; } };
      if (pass[i]) seed(i);
      else { const cx = i % NX; if (cx > 0) seed(i - 1); if (cx < NX - 1) seed(i + 1); if (i >= NX) seed(i - NX); if (i < N - NX) seed(i + NX); }
    }
    while (h < tq) {
      const i = Q[h++], d = dist[i] + 1, cx = i % NX;
      if (d > REACH) continue;   // 자 밖은 안 편다(마을 판정은 ≤ REACH 뿐)
      const go = (j) => { if (pass[j] && dist[j] < 0) { dist[j] = d; Q[tq++] = j; } };
      if (cx > 0) go(i - 1); if (cx < NX - 1) go(i + 1); if (i >= NX) go(i - NX); if (i < N - NX) go(i + NX);
    }
  }
  // ── 변형마다 광종 갈아 끼우고 품목마다 잰다 ──
  const own = RP.weightsOf('ore', Z), items = Object.keys(own).sort((a, b) => own[b] - own[a]);
  const uniq = new Set(RP.uniqueOf('ore', Z, OTHER[Z]));
  const keep = ores.map((o) => ({ m: o.mineral, ms: o.minerals }));
  const row = { items, unique: [...uniq], seeded: seeded.length, cands: cands.length, vars: {}, ms: 0 };
  for (const V of VARS) {
    const doc = JSON.parse(fs.readFileSync(V.file, 'utf8')), vo = doc[Z].ores;
    if (vo.length !== ores.length) { say(`⚠${V.label} ${Z}: 광맥 수가 다르다(${vo.length} ≠ ${ores.length}) — 건너뜀`); continue; }
    ores.forEach((o, i) => { o.mineral = vo[i].mineral; if (vo[i].minerals) o.minerals = vo[i].minerals; else delete o.minerals; });
    const has = (o, m) => m === '*' || o.mineral === m || !!(o.minerals && o.minerals[m] > 0);
    const out = {};
    for (const m of ['*'].concat(items)) {   // '*' = 아무 광맥(T524 자의 그 뜻 — 이 자가 맞게 재는지 맞대 보는 줄)
      for (const scope of ['all', 'major']) {
        bfs((i) => cover.get(i).some((j) => (scope === 'all' || !ores[j].minor) && has(ores[j], m)));
        const hit = (arr) => arr.filter((v) => dist[v.i] >= 0 && dist[v.i] <= REACH).length;
        out[m + ':' + scope] = { seeded: hit(seeded), cands: hit(cands), miss: seeded.filter((v) => !(dist[v.i] >= 0 && dist[v.i] <= REACH)).map((v) => v.name) };
      }
    }
    row.vars[V.label] = out;
    ores.forEach((o, i) => { o.mineral = keep[i].m; if (keep[i].ms) o.minerals = keep[i].ms; else delete o.minerals; });
  }
  row.ms = Date.now() - t0;
  res.zones[Z] = row;
  say(`\n## ${Z} — 시딩 마을 ${seeded.length} · 후보 ${cands.length} · 걸음 ≤ ${REACH}셀 안에 그 품목 셀이 있는 마을(시딩 · 후보) · ${(row.ms / 1000).toFixed(0)}초`);
  say('| 품목(비중) | ' + VARS.map((V) => `${V.label} 전부 · 주요만`).join(' | ') + ' |');
  say('|---|' + VARS.map(() => '---').join('|') + '|');
  for (const m of ['*'].concat(items)) {
    const cells = VARS.map((V) => {
      const a = row.vars[V.label] && row.vars[V.label][m + ':all'], b = row.vars[V.label] && row.vars[V.label][m + ':major'];
      if (!a) return '—';
      const red = (x) => (x.seeded * 2 < seeded.length ? '**🟥' : '') + `${x.seeded}/${seeded.length}` + (x.seeded * 2 < seeded.length ? '**' : '');
      return `${red(a)}(${a.cands}/${cands.length}) · ${red(b)}(${b.cands}/${cands.length})`;
    });
    say(`| ${m === '*' ? '(아무 광맥 — T524 자 맞대기)' : `${m}${uniq.has(m) ? '★고유' : ''} ${(own[m] * 100).toFixed(1)}%`} | ${cells.join(' | ')} |`);
  }
}
if (OUT) { fs.writeFileSync(OUT, JSON.stringify(res, null, 1)); say('→ ' + OUT); }
