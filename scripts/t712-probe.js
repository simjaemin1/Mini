'use strict';
// === scripts/t712-probe.js — T712 ① 손 → 곳간 탐침(`t686-spike.js` 의 `T686_PATCH` · 사본 `server/villages.js` 에만 박는다 · 제품 무접촉) ==========
//
// ⚠계측기다(러너 밖 · `@regress` 없음 · 판정 0). 사본에만 박고 판이 끝나면 사본째 지운다(T686 문법).
//
// ★무엇을 재나 — "손에 든 것이 econ 곳간에 **언제** 드나".
//   곳간 입구 넷(`_t312Deliver` 물고기 · `_t325Deliver` 통나무 · `_t347Deliver` 채집 · `_t368Deliver` 작물)을 감싸
//   든 몫(econ 단위 · 함수가 돌려준 got)을 **때**로 나눠 센다:
//     day   = 낮(마감 밖) — 몸이 곳간 사다리 · 짐 상한에서 넣었다(도착 순간)
//     head  = 경계 일괄 `_lifeHandsIn`(econ 틱 **앞** — T475 ②) 안
//     close = 마감 안 그 밖(`_lifeDaily` 생활층 조각 — econ 틱 **뒤**)
//   + `_lifeHandsIn` 마을마다 ms(경계 틱 몫) · 그 직전 손 셈(마을 몸의 손에 든 양 · 품목별 · 든 몸 수).
//   쓰기: `T712_PROBE_OUT`(jsonl · 마감마다 한 줄 · 60초 · SIGUSR2 · exit).
const fs = require('fs'), path = require('path');
module.exports = function patch(dir) {
  const vp = path.join(dir, 'server', 'villages.js'); let s = fs.readFileSync(vp, 'utf8');
  const rep = (a, b) => { const n = s.split(a).length - 1; if (n !== 1) throw new Error(`[t712-probe] 앵커 ${n}개: ${a.slice(0, 60)}`); s = s.replace(a, () => b); };
  const wrap = (sig, name, kind, args) => rep(`function ${name}(${sig}) {`,
    `function ${name}(${sig}) { const _r = ${name}__t712(${args}); globalThis.__T712D && __T712D(${JSON.stringify(kind)}, _r); return _r; }\nfunction ${name}__t712(${sig}) {`);
  wrap('vil, npc', '_t312Deliver', 'fish', 'vil, npc');
  wrap('vil, npc', '_t325Deliver', 'wood', 'vil, npc');
  wrap('vil, npc', '_t347Deliver', 'forage', 'vil, npc');
  wrap('vil, npc, why', '_t368Deliver', 'grain', 'vil, npc, why');
  rep('function _lifeHandsIn(vil) {', 'function _lifeHandsIn(vil) { return globalThis.__T712H ? __T712H(vil, _lifeHandsIn__t712, _t712Census) : _lifeHandsIn__t712(vil); }\nfunction _lifeHandsIn__t712(vil) {');
  s += `
// ── [T712 탐침 · 계측기가 박았다 · 제품엔 없다] ──────────────────────────────
function _t712Census(vil) {   // 그 마을 몸의 손 — 품목별 양 · 든 몸 수(읽기만)
  const pl = state.deps && state.deps.players; const o = { wood: 0, forage: 0, fish: 0, grain: 0, nWood: 0, nForage: 0, nFish: 0, nGrain: 0 };
  if (!pl) return o;
  let keep = []; try { keep = _t347KeepOf(vil) || []; } catch (e) {}
  for (const pid of (vil.npcPids || [])) {
    const p = pl.get(pid); if (!p) continue; const inv = p.inventory || {};
    const w = inv.wood || 0; if (w > 0) { o.wood += w; o.nWood++; }
    let f = 0; for (const k of keep) for (const h of _t347HandsOf(k)) f += inv[h] || 0; if (f > 0) { o.forage += f; o.nForage++; }
    const u = p._t312U || 0; if (u > 0) { o.fish += u; o.nFish++; }
    let g = 0; if (p._t368H) for (const c in p._t368H) g += p._t368H[c] || 0; if (g > 0) { o.grain += g; o.nGrain++; }
  }
  return o;
}
;(function () {
  const OUT = process.env.T712_PROBE_OUT; if (!OUT) return;
  const fs = require('fs');
  let inHI = false, lastHI = 0, rec = null;
  const K = ['fish', 'wood', 'forage', 'grain'];
  const fresh = () => { const d = {}; for (const k of K) d[k] = { day: 0, head: 0, close: 0 }; return d; };
  let del = fresh();
  const rows = [];
  globalThis.__T712D = (kind, got) => { const g = +got || 0; if (!(g > 0)) return; const ctx = inHI ? 'head' : (state.tickJobs ? 'close' : 'day'); del[kind][ctx] += g; };
  globalThis.__T712H = (vil, f, census) => {
    const now = Date.now();
    if (now - lastHI > 1000) {   // 새 마감 — 앞 마감 사이(낮 + 그 마감)의 들어감을 닫고 새 줄을 연다
      if (rec) { rec.del = del; rows.push(rec); del = fresh(); }
      rec = { at: now, wd: state.world ? state.world.day : null, n: 0, ms: 0, max: 0, held: { wood: 0, forage: 0, fish: 0, grain: 0, nWood: 0, nForage: 0, nFish: 0, nGrain: 0 }, after: { wood: 0, forage: 0, fish: 0, grain: 0 } };
    }
    lastHI = now;
    const c0 = census(vil); for (const k in c0) rec.held[k] += c0[k];
    const a = process.hrtime.bigint(); inHI = true; let r;
    try { r = f(vil); } finally { inHI = false; }
    const ms = Number(process.hrtime.bigint() - a) / 1e6; rec.n++; rec.ms += ms; if (ms > rec.max) rec.max = ms;
    const c1 = census(vil); for (const k of K) rec.after[k] += c1[k];
    return r;
  };
  const flush = () => { try { const cur = rec ? Object.assign({}, rec, { del, open: true }) : null; fs.writeFileSync(OUT, rows.concat(cur ? [cur] : []).map((x) => JSON.stringify(x)).join('\\n') + '\\n'); } catch (e) {} };
  setInterval(flush, 60000).unref(); process.on('SIGUSR2', flush); process.on('exit', flush);
})();
`;
  fs.writeFileSync(vp, s);
  require('child_process').execFileSync(process.execPath, ['--check', vp]);
};

// ── 표: node scripts/t712-probe.js table <hands.jsonl> [<hands2.jsonl>] ──────────────────────────────
//   마감 줄마다(부팅 마감 = 첫 줄은 뺀다): 경계 손 셈 · `_lifeHandsIn` ms · 그 마감 뒤 ~ 다음 마감 앞(낮 + 마감)의 품목별 든 때.
if (require.main === module && process.argv[2] === 'table') {
  for (const f of process.argv.slice(3)) {
    const L = fs.readFileSync(f, 'utf8').trim().split('\n').map((x) => JSON.parse(x));
    console.log(`\n== ${f} — 마감 ${L.length}줄(첫 줄 = 부팅 마감)`);
    for (const r of L) {
      const d = r.del, s = (k) => `${k} 낮 ${d[k].day.toFixed(1)} · 앞 ${d[k].head.toFixed(1)} · 뒤 ${d[k].close.toFixed(1)}`;
      console.log(`  wd ${r.wd} · 마을 ${r.n} · handsIn ${r.ms.toFixed(2)} ms(최대 ${r.max.toFixed(2)}) · 손 셈 통 ${r.held.wood.toFixed(1)}(${r.held.nWood}) 채 ${r.held.forage.toFixed(1)}(${r.held.nForage}) 물 ${r.held.fish.toFixed(2)}(${r.held.nFish}) 곡 ${r.held.grain.toFixed(1)}(${r.held.nGrain}) → 뒤 통 ${r.after.wood.toFixed(1)} 채 ${r.after.forage.toFixed(1)}${r.open ? ' · (열린 줄)' : ''}`);
      console.log(`     그 뒤 든 것: ${['wood', 'forage', 'fish', 'grain'].map(s).join(' | ')}`);
    }
  }
}
