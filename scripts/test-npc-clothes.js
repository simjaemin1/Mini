#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh)
// === scripts/test-npc-clothes.js — 마을 옷 재고 → 주민 착장 [재민 확정 2026-09-05 · T125] ===
//
// ★재민 캐논: **실체는 회계를 보여 준다.** econ 은 옷을 세는데(`storage.clothes` · 재봉 산출 ·
//   `_clothCov` 로 한랭 행복) 화면의 주민은 전부 삼베였다. T125 가 그 둘을 이었다.
//
// ★이 하네스는 **정본 함수 그대로**를 부른다(`villages.syncVillageClothes`) — 산수를 안 베낀다.
//   가짜 마을(곳간·주민)을 만들어 걸고, 나온 배정표를 잰다. 서버를 안 띄운다(0.1초).
//
// ★검사가 자명하게 통과하지 않게 거는 것:
//   · 재고를 0 으로 두면 **전원 맨몸**이어야 한다(모두 삼베로 떨어지면 종전과 같은 그림이다).
//   · 모피만 쌓은 마을은 **갖옷**이 나와야 한다(어느 마을이든 삼베면 회계가 안 보인다).
//   · 두 번 걸면 **같은 배정**이어야 한다(주사위 0).
//   · 재고를 늘리면 입는 사람이 **늘어야** 한다(단조).
'use strict';
const path = require('path');
const ROOT = path.join(__dirname, '..');
const V = require(path.join(ROOT, 'server', 'villages'));
const econ = require(path.join(ROOT, 'sim', 'economy-sim'));

let pass = 0, fail = 0;
const ok = (c, m, extra) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (extra ? `  ${extra}` : '')); };

// ── 가짜 마을 하나 ────────────────────────────────────────────────────────────
//   `syncVillageClothes(vil, players, econ)` 가 읽는 것만 채운다: npcPids · econ.storage.
function makeVil(n, storage) {
  const players = new Map();
  const npcPids = [];
  for (let i = 0; i < n; i++) { const pid = `npc_${i}`; npcPids.push(pid); players.set(pid, { pid, isNpc: true }); }
  return { vil: { npcPids, econ: { storage } }, players };
}
const worn = (players) => [...players.values()].map((p) => p._simCloth);
const wornN = (players) => worn(players).filter(Boolean).length;
const matsOf = (players) => { const c = {}; for (const m of worn(players)) if (m) c[m] = (c[m] || 0) + 1; return c; };

console.log('\n=== ⓐ 곳간이 비면 **맨몸** — 종전(전원 삼베)과 갈린다 ===');
{
  const { vil, players } = makeVil(20, { clothes: 0, hemp: 100 });
  V.syncVillageClothes(vil, players, econ);
  ok(wornN(players) === 0, '★재고 0 → 입은 사람 0 (옷감이 쌓여 있어도 옷이 아니면 못 입는다)',
     `입은 수 ${wornN(players)} / 20`);
  ok(worn(players).every((m) => m === null), '★값이 `null` 이다 — 클라가 옷 층 자체를 뺀다(`clothes_hemp` 아님)');
}

console.log('\n=== ⓑ 벌수만큼 입는다 · 재고를 늘리면 늘어난다(단조) ===');
{
  const rows = [];
  for (const c of [0, 1, 3.9, 7, 20, 40]) {
    const { vil, players } = makeVil(20, { clothes: c, hemp: 100 });
    V.syncVillageClothes(vil, players, econ);
    rows.push([c, wornN(players)]);
  }
  ok(rows.every(([c, w]) => w === Math.min(20, Math.floor(c))),
     '★입는 수 = min(인구, floor(재고)) — 소수 벌은 못 입는다', rows.map(([c, w]) => `${c}→${w}`).join(' '));
  ok(rows.every((r, i) => i === 0 || r[1] >= rows[i - 1][1]), '★단조 — 재고가 늘면 입는 사람이 안 준다');
  ok(rows[rows.length - 1][1] === 20, '★재고가 인구를 넘어도 인구까지만 (여벌은 화면에 안 나온다)');
}

console.log('\n=== ⓒ 재질은 **곳간이 정한다** — 재봉이 쓸 믹스 그대로 ===');
{
  // 모피만 쌓인 마을
  {
    const { vil, players } = makeVil(10, { clothes: 10, fur: 100 });
    V.syncVillageClothes(vil, players, econ);
    const m = matsOf(players);
    ok(Object.keys(m).length === 1 && m.fur === 10, '★모피뿐인 마을 → 전원 **갖옷**', JSON.stringify(m));
  }
  // 삼베만
  {
    const { vil, players } = makeVil(10, { clothes: 10, hemp: 100 });
    V.syncVillageClothes(vil, players, econ);
    const m = matsOf(players);
    ok(Object.keys(m).length === 1 && m.hemp === 10, '★삼밭뿐인 마을 → 전원 삼베', JSON.stringify(m));
  }
  // 섞인 마을 — 보온 가중 비율대로 갈린다(가중표는 econ 정본에서 읽는다 · 사본 0)
  {
    const st = { clothes: 100, fur: 40, hemp: 60 };
    const { vil, players } = makeVil(100, st);
    V.syncVillageClothes(vil, players, econ);
    const m = matsOf(players);
    const W = econ.CLOTH_MATS;
    const wf = st.fur * W.fur, wh = st.hemp * W.hemp;
    const expFur = Math.round(100 * wf / (wf + wh));
    ok(Math.abs((m.fur || 0) - expFur) <= 1,
       `★섞인 마을은 **비율대로** 갈린다 — 갖옷 ${m.fur || 0}명 (econ 가중으로 유도한 값 ${expFur})`,
       JSON.stringify(m));
    ok((m.fur || 0) > 0 && (m.hemp || 0) > 0, '★두 재질이 다 나온다 (한 재질로 안 뭉갠다)');
  }
  // 곳간에 옷감이 하나도 없는데 옷은 있다(교역으로 들어온 옷) → 삼베로 떨어진다
  {
    const { vil, players } = makeVil(5, { clothes: 5 });
    V.syncVillageClothes(vil, players, econ);
    const m = matsOf(players);
    ok(m.hemp === 5, '★옷감 재고 0 + 옷 5벌(교역품) → 삼베로 떨어진다 (빈 값이 아니다)', JSON.stringify(m));
  }
}

console.log('\n=== ⓓ 결정론 — 두 번 걸면 같다 · 주사위 0 ===');
{
  const st = { clothes: 33, fur: 20, hide: 30, hemp: 50, ramie: 5 };
  const a = makeVil(50, st); V.syncVillageClothes(a.vil, a.players, econ);
  const b = makeVil(50, st); V.syncVillageClothes(b.vil, b.players, econ);
  const A = worn(a.players).join('|'), B = worn(b.players).join('|');
  ok(A === B, '★같은 곳간·같은 주민 → **같은 배정**(pid 별로 한 글자도 안 다르다)');
  // 같은 판을 두 번 더 걸어도 안 흔들린다(재호출 안정)
  V.syncVillageClothes(a.vil, a.players, econ);
  ok(worn(a.players).join('|') === A, '★다시 걸어도 그대로 — 하루가 지나도 같은 사람이 같은 옷을 입는다');
  // ★자명 통과 금지 — 재고 한 벌만 바꾸면 배정이 **달라져야** 한다(계기가 죽어 있지 않다)
  const c = makeVil(50, { ...st, clothes: 34 }); V.syncVillageClothes(c.vil, c.players, econ);
  ok(worn(c.players).join('|') !== A, '★★재고를 한 벌 늘리면 배정이 달라진다 (계기가 살아 있다)');
}

console.log('\n=== ⓔ 누가 입나 — 정본 `_pidHash` 순 · **목록 순서와 무관** · 성장에 안 흔들린다 ===');
{
  const st = { clothes: 4, hemp: 100 };
  const { vil, players } = makeVil(10, st);
  V.syncVillageClothes(vil, players, econ);
  const dressed = [...players.values()].filter((p) => p._simCloth).map((p) => p.pid).sort();
  ok(dressed.length === 4, '★넷이 입는다');
  // 정본 해시로 줄 세운 앞 넷과 같다(하네스가 해시를 다시 짜지 않는다)
  const byHash = vil.npcPids.slice().sort((x, y) => V._pidHash(x) - V._pidHash(y)).slice(0, 4).sort();
  ok(byHash.join(',') === dressed.join(','), '★정본 `_pidHash` 로 줄 세운 앞 넷과 정확히 같다', JSON.stringify(byHash));
  // ★★**목록 순서에 안 흔들린다** — `npcPids` 를 뒤집어도 같은 넷이 입는다.
  //   (이게 "자리로 안 고른다"의 진짜 검사다. 순서대로 자르면 여기서 갈린다.)
  {
    const b = makeVil(10, st);
    b.vil.npcPids.reverse();
    V.syncVillageClothes(b.vil, b.players, econ);
    const d2 = [...b.players.values()].filter((p) => p._simCloth).map((p) => p.pid).sort();
    ok(d2.join(',') === dressed.join(','), '★★`npcPids` 를 뒤집어도 **같은 넷**이 입는다 (목록 순서 무관)', JSON.stringify(d2));
  }
  // ★★**성장에 안 흔들린다** — 주민이 늘어도 이미 입은 사람이 벗지 않는다.
  //   (진짜 난수 해시였다면 새 pid 가 앞줄에 끼어들어 남의 옷을 벗길 수 있다.
  //    실측: 지금 pid 는 `p<N>` 라 `_pidHash` 순서 = 스폰 순서다 — 스피어만 rho = 1.0000.
  //    그래서 "먼저 온 주민부터 입는다"가 되고, 이 성질이 공짜로 따라온다. 보고 §0-ⓑ.)
  {
    const c = makeVil(14, st);       // 넷이 더 왔다
    V.syncVillageClothes(c.vil, c.players, econ);
    const d3 = [...c.players.values()].filter((p) => p._simCloth).map((p) => p.pid).sort();
    ok(d3.join(',') === dressed.join(','), '★★주민이 늘어도 **입던 사람이 그대로** 입는다 (남의 옷을 안 벗긴다)', JSON.stringify(d3));
  }
}

console.log('\n=== ⓕ econ 무접촉 — 재고를 안 깎는다 ===');
{
  const st = { clothes: 10, fur: 20, hemp: 30 };
  const { vil, players } = makeVil(10, st);
  const before = JSON.stringify(vil.econ.storage);
  V.syncVillageClothes(vil, players, econ);
  ok(JSON.stringify(vil.econ.storage) === before,
     '★★곳간이 한 톨도 안 줄었다 — 마모는 econ 의 `CLOTH_WEAR_PC` 몫이다(이중 차감 금지)', before);
}

console.log(`\n=== test-npc-clothes 결과: 통과 ${pass} · 실패 ${fail} ===`);
process.exit(fail ? 1 : 0);
