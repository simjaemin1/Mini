// ═══════════════════════════════════════════════════════════════════════════
// skirmish-lab.js — 오픈월드 per-entity 근접 조우 랩 (전사 효과 측정, 정본 모델)
//   ★ battle-core(전투실험실)는 군단 편성·사기·방패벽 = 마을 전쟁용. 오픈월드 맵 조우는 아님.
//   이 랩은 zone.js 실제 근접 전투를 충실히 모델(늑대↔NPC와 동일 체계):
//     - 엔티티 hp = PLAYER_MAX_HP 100 (server/zone.js:730)
//     - 근접 atk = PLAYER_ATTACK_DAMAGE(10) + round(무기공격 × WEAPON_EQUIP_ATK_SCALE 0.2)  (zone.js:4253-4258)
//     - damagePlayer = 평면 감산(방어/갑옷 미적용) (zone.js:4447-4449)  ※ armor는 현재 데미지 경감 안 함
//     - 최근접 1표적, 고정 쿨다운(전원 동일) → 라운드제 스크럼으로 근사(위치 없이)
//   도적 무기 = 스킬레벨3 (player-items.craftItem). 도적 구성 = 의도적 진행형(경장/베테랑 갱).
//   사용: node sim/skirmish-lab.js  [--n 400] [--seed 7]
//   ★비파괴·측정 전용. Phase 2 서버 이식은 이 결과 검증 후.
// ═══════════════════════════════════════════════════════════════════════════
'use strict';
const PI = require('../server/player-items.js');

function argOf(f, d) { const i = process.argv.indexOf(f); return i >= 0 && process.argv[i + 1] != null ? process.argv[i + 1] : d; }
const N     = +argOf('--n', 400);
const SEED0 = +argOf('--seed', 20260714);

// ── zone.js 상수 (충실 반영) ──
const HP = 100, BASE_ATK = 10, WSCALE = 0.2;
function meleeAtk(weaponAttack) { return BASE_ATK + Math.round(weaponAttack * WSCALE); }

// ── rng ──
function mkRng(s) { s = (s >>> 0) || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }
function hashSeed(a, b, c) { let h = (a * 374761393 + b * 668265263 + c * 2246822519) >>> 0; h = (h ^ (h >>> 13)) >>> 0; return (h * 1274126177) >>> 0; }

// ── 무기 → 근접 atk ──
function skill3WeaponAttack(rng, matPool) { const mats = matPool || ['stone', 'wood', 'bone', 'iron', 'obsidian', 'bronze']; const mat = mats[(rng() * mats.length) | 0]; return PI.craftItem('weapon', 3, { [mat]: 3 }).attrs.attack; }

// ── 전사(호위) 프로파일: 무기 티어만 다름(hp 동일 100) ──
const WARRIORS = {
  석기전사: { mat: 'stone' },    // 마제석검 skill3 attack≈35 → atk 17
  청동전사: { mat: 'bronze' },   // 청동 skill3 attack≈58 → atk 22
};
function warriorUnit(mat) { return { hp: HP, atk: meleeAtk(PI.craftItem('weapon', 3, { [mat]: 3 }).attrs.attack) }; }

// ── 도적 갱 프로파일 (의도적 진행형) ──
const GANGS = {
  경장갱:   { pool: ['stone', 'wood', 'bone'], hp: HP },        // 초반: 조악한 무기(atk 17~19)
  베테랑갱: { pool: ['iron', 'obsidian', 'bronze'], hp: HP },   // 후반: 좋은 무기(atk 20~22)
};
function banditUnit(prof, rng) { return { hp: prof.hp, atk: meleeAtk(skill3WeaponAttack(rng, prof.pool)) }; }

// ── per-entity 스크럼: 라운드마다 생존 개체가 무작위 생존 적 1명 타격(동시 정산) ──
function fight(A, B, rng) {
  const a = A.map(u => ({ hp: u.hp, atk: u.atk })), b = B.map(u => ({ hp: u.hp, atk: u.atk }));
  const liveIdx = (arr) => { const idx = []; for (let i = 0; i < arr.length; i++) if (arr[i].hp > 0) idx.push(i); return idx; };
  let round = 0;
  while (round < 500) {
    const aL = liveIdx(a), bL = liveIdx(b);
    if (!aL.length || !bL.length) break;
    round++;
    const dA = new Array(a.length).fill(0), dB = new Array(b.length).fill(0);
    for (const i of aL) dB[bL[(rng() * bL.length) | 0]] += a[i].atk;   // 전사 → 무작위 도적
    for (const i of bL) dA[aL[(rng() * aL.length) | 0]] += b[i].atk;   // 도적 → 무작위 전사
    for (let i = 0; i < a.length; i++) if (a[i].hp > 0) a[i].hp -= dA[i];
    for (let i = 0; i < b.length; i++) if (b[i].hp > 0) b[i].hp -= dB[i];
  }
  const aSurv = a.filter(u => u.hp > 0).length, bSurv = b.filter(u => u.hp > 0).length;
  return { repel: bSurv === 0 && aSurv > 0, aSurv, bSurv };
}

// ── sweep ──
function cell(warMat, gangProf, E, G, gname, wname) {
  let rep = 0, wDead = 0, bDead = 0;
  for (let i = 0; i < N; i++) {
    const rng = mkRng(hashSeed(SEED0 ^ (E * 101 + G * 7919), i + 1, wname.length * 31 + gname.length));
    const A = []; for (let k = 0; k < E; k++) A.push(warriorUnit(warMat));
    const B = []; for (let k = 0; k < G; k++) B.push(banditUnit(gangProf, rng));
    const r = fight(A, B, rng);
    if (r.repel) rep++; wDead += (E - r.aSurv); bDead += (G - r.bSurv);
  }
  return { repelRate: rep / N, wDead: wDead / N, bDead: bDead / N };
}

const ESCORTS = (argOf('--escorts', '1,2,3,4,5,6,8,10,12')).split(',').map(Number);
const GLIST = [3, 5, 8];
const pad = (s, n) => String(s).padStart(n);
const pct = x => (x * 100).toFixed(0) + '%';

console.log(`\n═══ 오픈월드 per-entity 근접 조우 랩 · 전사 효과 ═══`);
console.log(`모델: hp100 · atk=10+무기×0.2 · 평면데미지 · N=${N}/셀 · seed=${SEED0}`);
console.log(`전사 atk: 석기=${warriorUnit('stone').atk} 청동=${warriorUnit('bronze').atk}\n`);

const minW = {};
for (const wname in WARRIORS) {
  minW[wname] = {};
  const mat = WARRIORS[wname].mat;
  console.log(`▓▓ ${wname} (무기=${mat}, atk=${warriorUnit(mat).atk}) ▓▓`);
  for (const gname in GANGS) {
    const gp = GANGS[gname];
    console.log(`  vs ${gname} (무기 atk≈${meleeAtk(PI.craftItem('weapon',3,{[gp.pool[0]]:3}).attrs.attack)}~${meleeAtk(PI.craftItem('weapon',3,{[gp.pool[gp.pool.length-1]]:3}).attrs.attack)}):`);
    for (const G of GLIST) {
      const rr = [], wd = [];
      let r90 = null;
      for (const E of ESCORTS) {
        const c = cell(mat, gp, E, G, gname, wname);
        rr.push(pad(pct(c.repelRate), 4)); wd.push(pad(c.wDead.toFixed(1), 4));
        if (r90 === null && c.repelRate >= 0.9) r90 = E;
      }
      minW[wname][gname + G] = r90;
      console.log(`    갱${G}│호위 ${ESCORTS.map(e=>pad(e,4)).join(' ')}`);
      console.log(`       │격퇴 ${rr.join(' ')}`);
      console.log(`       │전사사망 ${wd.join(' ')}   (90%격퇴 최소호위=${r90 == null ? '>' + Math.max(...ESCORTS) : r90})`);
    }
  }
  console.log('');
}

// ── Lanchester 제곱법칙 검증 (per-entity 대칭 근접의 이론 예측) ──
console.log(`▓▓ 이론 대조 (Lanchester 제곱법칙: 전사 승리 ⇔ E/G > √(도적atk/전사atk)) ▓▓`);
for (const wname in WARRIORS) {
  const wa = warriorUnit(WARRIORS[wname].mat).atk;
  for (const gname in GANGS) {
    const gp = GANGS[gname]; const ba = meleeAtk((PI.craftItem('weapon',3,{[gp.pool[0]]:3}).attrs.attack + PI.craftItem('weapon',3,{[gp.pool[gp.pool.length-1]]:3}).attrs.attack)/2);
    const ratio = Math.sqrt(ba / wa);
    console.log(`  ${wname}(atk${wa}) vs ${gname}(atk≈${ba}): 필요 E/G > ${ratio.toFixed(2)}  → 갱8이면 ${Math.ceil(8*ratio)}명↑`);
  }
}
console.log('');
