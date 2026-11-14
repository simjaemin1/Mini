
### night — 판 D1,D2,D3 평균 · npcStep 1.205 µs · 몸통 자기 줄 합 0.654 µs
| 줄 | µs | 몸 칸(npc.) | 줄 |
|---:|---:|---|---|
| 4874 | 0.159 | _t791P · _t791Pn · path · pathIndex | `&& (!npc.path // npc.pathIndex >= (npc.path === npc._t791P ? npc._t791Pn : npc.path.length` |
| 5346 | 0.105 | behavior · gatherTarget | `if (npc.behavior === 'gather' && npc.gatherTarget) {` |
| 611 | 0.051 | — | `_t566RelPend.splice(0, i);` |
| 5223 | 0.047 | canadiaVillage · nextDecisionAt | `if (!(T670_SKIP_IDLE && !npc.canadiaVillage && now < npc.nextDecisionAt)) decideNpcBehavio` |
| 5239 | 0.046 | _t720 | `if (fv > WORLD.dayPhaseRatio && !(npc._t720 && npc._t720.k)) {   // ★[T720 ③] 해 질 녘 곳간 정산 ` |
| 5242 | 0.044 | targetX | `if (!Object.is(npc.targetX, _bx)) npc.targetX = _bx;` |
| 4844 | 0.027 | _stuckPos · x · y | `function _t670Stuck(npc, now) { const S = npc._stuckPos; if (S) { S.x = npc.x; S.y = npc.y` |
| 576 | 0.025 | — | `for (const [x, y] of [[cx - R, cy - R], [cx + R, cy - R], [cx - R, cy + R], [cx + R, cy + ` |
| 5315 | 0.020 | _t670Tk · _t670TkX · _t670TkY · targetX · targetY | `if (npc.targetX !== npc._t670TkX // npc.targetY !== npc._t670TkY) { npc._t670TkX = npc.tar` |
| 5243 | 0.012 | targetY | `if (!Object.is(npc.targetY, _by)) npc.targetY = _by;` |
| 4884 | 0.012 | _stuckPos · x · y | `if (_t671Gt(npc.x - npc._stuckPos.x, npc.y - npc._stuckPos.y, 5)) {   // ★[T671 ②] = `Math` |
| 4793 | 0.010 | x · y | `const dx = wx - npc.x, dy = wy - npc.y;` |
| 4875 | 0.008 | targetX · targetY · x · y | `&& _t671Lt(npc.x - npc.targetX, npc.y - npc.targetY, 12)) {   // ★[T671 ②] = `Math.hypot(…` |
| 5235 | 0.007 | behavior · npcHomeX · simLonOff | `else if (SIM_LON_ON && npc.simLonOff != null && npc.npcHomeX != null && npc.behavior !== '` |

생활층(villages.js 깊은 줄) 위 10:
| 줄 | µs | 몸 칸 | 마을 칸 |
|---:|---:|---|---|
| 16706 | 0.042 | — | _terrSet |
| 10602 | 0.017 | inventory | — |
| 15166 | 0.013 | _t1181Haul | — |
| 14647 | 0.012 | — | — |
| 16729 | 0.007 | _dOff | — |
| 14713 | 0.007 | — | — |
| 15144 | 0.006 | pid | _granPend |
| 14500 | 0.005 | pid | _site · _t400Crew |
| 11438 | 0.005 | x · y | — |
| 1287 | 0.003 | — | _psite |

### day — 판 D1,D2,D3 평균 · npcStep 0.661 µs · 몸통 자기 줄 합 0.266 µs
| 줄 | µs | 몸 칸(npc.) | 줄 |
|---:|---:|---|---|
| 4874 | 0.078 | _t791P · _t791Pn · path · pathIndex | `&& (!npc.path // npc.pathIndex >= (npc.path === npc._t791P ? npc._t791Pn : npc.path.length` |
| 5346 | 0.047 | behavior · gatherTarget | `if (npc.behavior === 'gather' && npc.gatherTarget) {` |
| 5223 | 0.041 | canadiaVillage · nextDecisionAt | `if (!(T670_SKIP_IDLE && !npc.canadiaVillage && now < npc.nextDecisionAt)) decideNpcBehavio` |
| 4884 | 0.012 | _stuckPos · x · y | `if (_t671Gt(npc.x - npc._stuckPos.x, npc.y - npc._stuckPos.y, 5)) {   // ★[T671 ②] = `Math` |
| 611 | 0.010 | — | `_t566RelPend.splice(0, i);` |
| 4793 | 0.009 | x · y | `const dx = wx - npc.x, dy = wy - npc.y;` |
| 5315 | 0.009 | _t670Tk · _t670TkX · _t670TkY · targetX · targetY | `if (npc.targetX !== npc._t670TkX // npc.targetY !== npc._t670TkY) { npc._t670TkX = npc.tar` |
| 576 | 0.009 | — | `for (const [x, y] of [[cx - R, cy - R], [cx + R, cy - R], [cx - R, cy + R], [cx + R, cy + ` |
| 5319 | 0.005 | _pathAt | `(npc._pathAt && now - npc._pathAt > 5000);` |
| 4844 | 0.004 | _stuckPos · x · y | `function _t670Stuck(npc, now) { const S = npc._stuckPos; if (S) { S.x = npc.x; S.y = npc.y` |
| 5318 | 0.004 | _pathFor | `npc._pathFor !== targetKey //` |
| 5235 | 0.003 | behavior · npcHomeX · simLonOff | `else if (SIM_LON_ON && npc.simLonOff != null && npc.npcHomeX != null && npc.behavior !== '` |
| 4873 | 0.003 | targetX · targetY | `if (npc.targetX != null && npc.targetY != null` |
| 5222 | 0.003 | _t540StepAt | `npc._t540StepAt = now;   // ★[T540 관측] 이 몸이 마지막으로 걸음 문을 받은 때(`/walkdbg stepAge` — 새벽 멎음을 이` |

생활층(villages.js 깊은 줄) 위 10:
| 줄 | µs | 몸 칸 | 마을 칸 |
|---:|---:|---|---|
| 16706 | 0.013 | — | _terrSet |
| 14500 | 0.009 | pid | _site · _t400Crew |
| 16729 | 0.007 | _dOff | — |
| 10602 | 0.006 | inventory | — |
| 1239 | 0.005 | — | _drySet · _farmSet · _terrSet |
| 16749 | 0.005 | _lifeTask | _mkt |
| 15166 | 0.004 | _t1181Haul | — |
| 16740 | 0.002 | _lifeTask | _t529Q |
| 15177 | 0.001 | — | — |
| 16822 | 0.001 | _jobT | — |

### 칸 수 × 몸 수(정적 — 걸음 문 한 번이 글자로 짚을 수 있는 몸 칸)
| 함수 | 몸 칸 수 |
|---|---:|
| `npcStep` | 41 |
| `detectStuck` | 10 |
| `followNpcPath` | 10 |
| `computeNpcPath` | 15 |
| `_t670Stuck`(한 줄) | 3 |
| 합(겹침 뺌) | 48 |

몸 1,512(밤 창) × 칸 48 = 틱마다 짚을 수 있는 몸 칸 72,576. 몸 하나에 객체가 넷 따로 있다 — 몸 객체 · 칸 뒤 저장(out-of-object) · 길 배열(`path`) · 막힘 자리(`_stuckPos`) — 첫 짚기도 그만큼.
