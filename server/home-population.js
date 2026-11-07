'use strict';
// 장부 귀환일에 _warPid가 먼저 지워져도, 실제 귀환 몸과 살아 있는 주민의
// 결속은 유지한다. 죽음·포로로 명부에서 빠진 주민은 아래 living 검사로 제외한다.
const warResidents = new WeakMap();
function bindWarBody(body, resident) {
  if (!body) return;
  if (resident) warResidents.set(body, resident);
  else warResidents.delete(body);
}
// [T1159] 원정 표지는 후보 명부일 뿐이다. 집 영토 밖에 있는 실제 몸만 뺀다.
// 보통 일터로 나간 주민, 아직 집결 중인 병사, 몸/영토를 모르는 항목은 빼지 않는다.
function homePopulation(vil, players, cellSize) {
  const total = vil && vil.econ && vil.econ.npcs ? vil.econ.npcs.length : 0;
  if (!vil || !vil._terrSet || !players) return total;
  const drafted = new Set(vil.econ.npcs.filter(n => n._warDraft && n._warPid != null).map(n => n._warPid));
  const living = new Set(vil.econ.npcs);
  let away = 0;
  const seen = new Set();
  for (const pid of vil.npcPids || []) {
    if (seen.has(pid)) continue;
    seen.add(pid);
    const p = players.get(pid);
    if (!p || p.hp <= 0 || !((p._muster && (drafted.has(pid) || living.has(warResidents.get(p)))) || p._t1104W != null) || !Number.isFinite(p.x) || !Number.isFinite(p.y)) continue;
    // 좌표는 존의 픽셀, 영토는 존의 셀 정본이다.
    if (!vil._terrSet.has(Math.floor(p.x / cellSize) + ',' + Math.floor(p.y / cellSize))) away++;
  }
  return Math.max(0, total - away);
}
module.exports = { homePopulation, bindWarBody };
