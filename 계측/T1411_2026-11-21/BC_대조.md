# T1358 회부 1 — 카드 글과 현재 main의 식

베이스 `1aa63e637` (land1087). 새 식·우선순위 변경 0.

| 카드의 한 줄 | main의 실제 한 줄 | 일치 범위·차이 |
|---|---|---|
| ⓑ 말뚝 몫을 땅 몫 앞에 | villages.js `_t1181Step`의 pick: 영토는 `E.woodSpare(vil.econ)`, 다리는 `E.woodSpareAfterLand(vil.econ)` | 영토 말뚝 인출이 땅 예약액을 다시 빼지 않는 뜻이면 이미 일치한다. |
| ⓑ 땅 몫의 식 | economy-sim.js `woodSpareAfterLand(v) = woodSpare(v) - landWoodShare(v)`; `landWoodShare`는 양수 `_t1207Need` | 말뚝 자체가 땅 예약액이다. 앞에 별도 새로운 ‘땅’ 자원이 있는 것이 아니다. |
| ⓑ 말뚝보다 앞인 몫 | `woodSpare = storage.wood - RESERVE_PC.wood × N - houseWoodShare(v)` | 현재 main은 1인 비축과 집 몫을 말뚝보다 먼저 남긴다. ‘말뚝을 비축·집보다도 먼저’라는 뜻이라면 현재 식과 다르지만, 카드에는 그 재배치가 명시돼 있지 않다. 임의로 바꾸지 않는다. |
| ⓒ 나무꾼 수요에 말뚝 줄을 싣는다 | villages.js `_t1207Queue`: 각 작업의 `max(0, j.wood - j.mat.wood)` 합 → `econ._t1207Need` | 견적에서 이미 놓인 재료를 뺀 실제 줄의 부족분을 적는다. 이미 일치한다. |
| ⓒ 수요에 더하는 자리 | economy-sim.js `woodShareD = 기존 땔감/목재 몫 + _t1207Need` | 말뚝 항을 기존 몫과 max로 고르는 것이 아니라 더한다. 이미 일치한다. |
| ⓒ 나무꾼의 남은 수요 | `woodDemandLeft(v, held) = actDemandLeft(v, woodShareD(v), '_t325InflowToday', held)` | 그날 입고와 들고 오는 몫을 같은 문에서 뺀다. 이미 일치한다. |
| ⓒ 갱신 시점 | 줄을 계산하는 `_t1207Queue` 호출 시 `_t1207Need` 갱신 | 카드의 한 줄은 갱신 빈도를 정하지 않는다. T1358의 빈 줄·양수 수요 관측을 근거로 ‘매 틱 즉시 일치’를 보장한다고 확대하지 않는다. 이번 성능 최적화도 이 의미를 바꾸지 않는다. |

정본 위치: server/villages.js `_t1207Queue`, `_t1181Step`; sim/economy-sim.js `woodSpare`, `landWoodShare`, `woodSpareAfterLand`, `woodShareD`, `woodDemandLeft`.
