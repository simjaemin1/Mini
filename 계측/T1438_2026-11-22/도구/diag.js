'use strict';
// T1438 진단 — 구조물 전수 표(종류 × 재료 · 원자재 · 빠르기 셋 · 체력 칸 · 공격 길 · 기능 · 0 에서 · 짓는 이) · 존을 켬으로 띄워 정본 표에서 뽑는다(손 0)
const path = require('path'), fs = require('fs');
const ROOT = process.env.T1438_ROOT || '/home/claude/mini';
const TMP = `/tmp/t1438-diag-${process.pid}.db`;
Object.assign(process.env, { ZONE_ID: 'hanbando', PORT: '39791', DB_PATH: TMP, ENABLE_VILLAGES: '0', ENABLE_WILDLIFE: '0', ENABLE_BANDITS: '0', ENABLE_ROADS: '0', T1438_DECAY: '1', CENTRAL_URL: 'http://127.0.0.1:1' });
const _log = console.log; console.log = () => {}; console.warn = () => {};
const Z = require(path.join(ROOT, 'server', 'zone.js')); console.log = _log;
const H = Z.__testBind(), D = H.Decay;
const Y = (r) => r > 0 ? (1 / r / D.yearDays()).toFixed(1) : '—';
const KO = { hut: '움집(플레이어)', shelter: '쉼터(공용)', house: 'NPC 집', phouse: '의뢰 움집', wall: '벽', fence: '울타리', door: '문', floor: '바닥', stair: '계단', chest: '상자', workbench: '작업대',
  drying_rack: '건조대', salt_kiln: '소금가마', guild_granary: '곳간(플레이어 · 길드)', granary: '곳간(NPC)', well: '우물', charcoal_kiln: '숯가마', furnace: '노', village_hall: '회관' };
const FN = {
  hut: '지붕 → 실내 몫(비 · 눈 · 추위 · 그늘 · 피로 · 젖음 — `indoorF` 비례) · 실내 바닥 · 상자 완충(부패) · 뼈대 → 0 이면 무너짐', shelter: '같음(마을 쪽 셈 — 쉼터 줄 회부)', house: '지붕 → 그 집 안 실내 몫 · 뼈대 0 → 무너짐(침상 명부에서 빠짐)', phouse: '같음(주인 = 플레이어 · 침상 명부 밖)',
  wall: '막음 · 방 경계 — 0 이면 부서짐(통과 · 방 해체 · 교역 거리 무효화) · 고쳐 절반 넘으면 다시 막음', fence: '막음 — 0 이면 부서짐(통과) · 고쳐 절반 넘으면 다시', door: '막음(문) — 같음',
  floor: '바닥(방 · 실내) — 0 이면 부서짐 표지(방 판정은 벽 · 문 — 바닥 0 의 쓰임 회부)', stair: '층 오르내림 — 0 이면 부서짐 표지(쓰임 막힘 회부)', chest: '부패 자리 칸(밀폐 = 상자 몫 · 실내 완충 = 지붕 몫) · 공격 대상',
  workbench: '0 이면 부서짐 표지(제작 막힘 회부)', drying_rack: '같음(말리기 막힘 회부)', salt_kiln: '같음(소금 막힘 회부)', guild_granary: '부패 자리 칸(밀폐 · 완충 = 남은 몫)',
  granary: '곳간 로트 장부 새 로트 자리 칸(마을 곳간 몫 평균) · econ 일일 부패는 안 읽음(회부)', well: '0 이면 부서짐 표지(물 긷기 막힘 회부)', charcoal_kiln: '같음(숯 굽기 막힘 회부)', furnace: '같음(제련 막힘 회부)', village_hall: '같음(회관 쓰임 회부)' };
const WHO = (t) => ({ house: 'NPC', granary: 'NPC', village_hall: 'NPC · 플레이어 마을', shelter: '마을(공용)', phouse: 'NPC(의뢰)' }[t] || '플레이어');
const BL = new Set(['wall', 'fence', 'door']);
const rows = [];
for (const t of D.typesList()) {
  const k = D.kindOf(t, null); if (!k) continue;
  const parts = k.parts.map((p) => {
    const it = Object.entries(p.items).map(([a, n]) => `${a} ${+n.toFixed(2)}`).join(' · ');
    const m = p.mats, mm = ['grass', 'wood', 'earth'].filter((c) => m[c] > 0).map((c) => ({ grass: '풀', wood: '나무', earth: '흙돌' }[c] + ' ' + +m[c].toFixed(2))).join(' + ');
    return { k: p.ko, it, mm, lo: Y(D.partRate(p, 'lo')), mid: Y(D.partRate(p, 'mid')), hi: Y(D.partRate(p, 'hi')), mat: p.mat };
  });
  const hp = k.multi ? `부위 둘(지붕 · 뼈대 0..1 — 앵커 \`data.dk\` / 마을 집 줄) · 벽을 치면 뼈대 −atk/${k.hpScale}` : `\`data.hp\`(최대 ${k.maxHp}) + \`data.dkT\` — 한 값`;
  const atk = k.multi ? '움집 벽 공격 → 뼈대' : (BL.has(t) || t === 'chest') ? '사람 공격(`tryAttack`) — 지금(낡은) 체력에서' : '공격 길 없음';
  const zero = k.multi ? '뼈대 0 → 무너짐(발자국 행 걷음 · 남은 몫 재료 바닥에 · 폐허 한 칸)' : '0 → 부서짐(`damaged` — 종전 공격 0 과 같은 상태)';
  for (const [i, p] of parts.entries()) rows.push(`| ${i ? '' : (KO[t] || t) + ' `' + t + '`'} | ${p.k} | ${p.it} | ${p.mm}${p.mat ? ` (부위 재료 = ${({ grass: '풀', wood: '나무', earth: '흙돌' })[p.mat]})` : ''} | ${p.mid} (${p.lo} ~ ${p.hi}) | ${i ? '' : hp} | ${i ? '' : atk} | ${i ? '' : FN[t] || '—'} | ${i ? '' : zero} | ${i ? '' : WHO(t)} |`);
}
const ex = Object.entries(D.EXCLUDE).map(([t, why]) => `| \`${t}\` | ${why} |`);
const out = [
  '| 종류 | 부위 | 지을 때 든 것 | 원자재(풀 · 나무 · 흙돌) | 해 — 가운데 (lo ~ hi) | 체력 칸 | 공격 길 | 기능(낡음이 닿는 곳) | 0 에서 | 짓는 이 |',
  '|---|---|---|---|---|---|---|---|---|---|', ...rows, '',
  '**안 낡는 것**(표에 까닭):', '', '| 종류 | 까닭 |', '|---|---|', ...ex,
  '| 다리(시딩 · 마을 T527) | 회부 — 주인 · 지을 때 든 재료 기록 없음(시딩) · 끊김 = 길 · 거리행렬 · 캐러밴 경로 재계산 · 고치는 손(공동 — 누구의 일인가) |',
  '| 마을 벽 · 바닥(태그 `hut` · `bld` · `gran`) | 그 집 · 곳간의 몸 — 마을 쪽(집 줄)이 낡힌다(따로 안 셈) |', '',
  `종류 ${D.typesList().length} · 빠르기 표 = decay.js \`MAT\`(${JSON.stringify(D.MAT)})`,
];
fs.writeFileSync(process.argv[2] || '/dev/stdout', out.join('\n') + '\n');
for (const f of [TMP, TMP + '-wal', TMP + '-shm']) { try { fs.unlinkSync(f); } catch (e) {} }
process.exit(0);
