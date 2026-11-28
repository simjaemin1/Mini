# T1478 흔들림 전수 셋째 — 러너 로그만 읽는다(`node scripts/t1418-table.js`)

· 하네스 566종 · -j 4 판 2 · 혼자 판(-j 4 에서 한 번이라도 빨강인 것만) 6 · 죽은 · 무효 판 4 · 판 벽 합 **19.7시간**
· 늘 빨강 **10** · 혼자도 흔들림 **3** · 나란히만 **3** · 초록 **550**
· 칸: ○ 초록 · ✗ 빨강 · ⏱ 상한 넘김(RC=124) · △ 유보(RC=75 — 빨강 아님) · 찌꺼기 = 판 뒤 그 판의 TMPDIR 에 남은 것 + /tmp 에 새로 선 것(박힌 `/tmp/` 경로 몫)

## 1. 판

| 판 | 갈래 | 초록 | 빨강 | 건너뜀(유보) | 러너 요약 통과/실패/유보 | 벽 | 찌꺼기 TMPDIR | 찌꺼기 /tmp | 찌꺼기 합 |
|---|---|---:|---:|---:|---|---|---|---|---|
| J3 | -j 4 | 550 | 16 | 0 | 550/16/0 | 7.24시간 | 88개 · 593 MB | 15개 · 240 MB | 103개 · 833 MB |
| J4-부분 | -j 4 | 277 | 10 | 0 | 149/5/0 ≠ | ? | 71개 · 479 MB | 12개 · 210 MB | 83개 · 690 MB |
| S1 | -j 1 | 4 | 11 | 0 | 4/11/0 | 2.14시간 | 0개 · 0 MB | 0개 · 0 MB | 0개 · 0 MB |
| S2 | -j 1 | 6 | 9 | 0 | 6/9/0 | 2.15시간 | 64개 · 421 MB | 0개 · 0 MB | 64개 · 421 MB |
| S3 | -j 1 | 5 | 10 | 0 | 5/10/0 | 2.35시간 | 64개 · 421 MB | 0개 · 0 MB | 64개 · 421 MB |
| S4 | -j 1 | 3 | 12 | 0 | 3/12/0 | 2.45시간 | 64개 · 421 MB | 0개 · 0 MB | 64개 · 421 MB |
| S5 | -j 1 | 4 | 11 | 0 | 4/11/0 | 2.35시간 | 64개 · 421 MB | 0개 · 0 MB | 64개 · 421 MB |
| V1 | -j 1 | 0 | 1 | 0 | 0/1/0 | 1.00시간 | 12개 · 100 MB | 0개 · 0 MB | 12개 · 100 MB |

죽은 판 · 무효 판(덮지 않음 — 다음 번호로 새 판을 띄웠다)

| 판 | 죽은 때(로그 마지막 쓰기 · UTC) | 하네스 몇째 | 까닭 | 찌꺼기(치움) |
|---|---|---:|---|---|
| J1 | 2026-11-25T01:20:22 | 50 | 컨테이너 재시작(로그 마지막 쓰기 2026-11-25 01:20 UTC · 전수 566종 중 50번째 하네스에서) | 89개 · 346 MB |
| J2 | 2026-11-25T05:39:15 | 435 | 컨테이너 재시작(로그 마지막 쓰기 05:39 UTC · 전수 566종 중 435번째 하네스에서 · 제 가지 server/ 에 T1403 미끼 둘이 남음) | 788개 · 1.12 GB |
| J4c3 | 2026-11-25T16:44:30 | 0 | 내가 멈춤(덧붙임 11-27: 보고 우선) · J4 는 c1 · c2 만 끝 · c3 중단 · c4 안 돌림 | 15개 · 78 MB |
| S1 | 2026-11-25T18:13:42 | 11 | 컨테이너 재시작(혼자 판 S1 · 15종 중 11종 끝 → 하네스별로 살림 · 그 뒤 하네스 한 종 단위 끝 표시로 잇는다 · 11-26 03:06 · 04:27 에도 다시 섰고 그때 돌던 한 종(S1 route-persist · S2 lab-diverge-ctl)만 다시 돌림) | 0개 · 0 MB |

## 2. 빨강 표(-j 4 에서 한 번이라도 빨강)

| 가름 | 하네스 | -j 4 빨강 | -j 4 판 | 혼자 빨강 | 혼자 판 | 첫 실패 줄(혼자 판 먼저) |
|---|---|---:|---|---:|---|---|
| 늘 빨강 | `test-bundle-blackbox.js` | 2/2 | ✗✗ | 5/5 | ✗✗✗✗✗ | ✗ ① 기본 세계가 묶음 세계(켬 판 결과 ≠ 끔 판) 갈린 날 · 마을 0 |
| 늘 빨강 | `test-car-fast.js` | 2/2 | ✗✗ | 5/5 | ✗✗✗✗✗ | ✗ [상황] 저장된 세계 — 길 위 캐러밴이 메타에 실렸고 메타 날 = 마을 날(복원 문이 캐러밴을 되돌리는 판) 캐러밴 0 · 메타 날 undefined · 마을 날 9 |
| 늘 빨강 | `test-deeds-blackbox.js` | 2/2 | ✗✗ | 5/5 | ✗✗✗✗✗ | ✗ 마을 영토 안에는 그 마을에서 인정받은 사람만 — 미가입자 · 가입만 한 사람은 거절되고 가방이 안 준다(11-13) 미가입 "집터는 선 자리를 가운데로 아홉 칸(3×3)을 한 번에 잡습니다. 북서 " · 가입 "농촌1 촌장 — 잘 왔네. 오늘부터 자네는 우리 마을 사람일세. 마을  |
| 늘 빨강 | `test-lab-mining.js` | 2/2 | ✗✗ | 5/5 | ✗✗✗✗✗ | ✗ 광부가 광맥 셀에 배치됨 |
| 늘 빨강 | `test-resume-one.js` | 2/2 | ✗✗ | 5/5 | ✗✗✗✗✗ | ✗ [상황] 저장된 세계 — 길 위 캐러밴이 메타에 실렸다 캐러밴 0 |
| 늘 빨강 | `test-return-resume.js` | 2/2 | ✗✗ | 5/5 | ✗✗✗✗✗ | ✗ ★★켬: 도착 경계 줄에서 새로 판 귀환 길 0(전부 재개형 문이 조각으로 팠다) 158번 · 그 줄 최대 858ms |
| 늘 빨강 | `test-route-persist.js` | 2/2 | ✗✗ | 5/5 | ✗✗✗✗✗ | ✗ ⑥ 데운 만큼 캐시에 들어갔다 메모리 143 ≥ 594 |
| 늘 빨강 | `test-slot-keep.js` | 2/2 | ✗✗ | 5/5 | ✗✗✗✗✗ | ✗ ⑤ ★★다 판 쌍이 두 문의 버림보다 많다(종전 꼴 = 버림만 늘고 다 판은 제자리) 다 판 +0 > 버림 0 |
| 늘 빨강 | `test-t1034-caravan-keep.js` | 2/2 | ✗✗ | 5/5 | ✗✗✗✗✗ | ✗ [상황] 저장된 세계 — 다음 마감에 도착할 캐러밴 하나 · 메타 행이 그 날 #3 · 날 4 · 메타 날 0 |
| 늘 빨강 | `test-t1322-verify-night.js` | 1/1 | ⏱ | 1/1 | ⏱ | 상한 넘김(RC=124 · 3600초) |
| 혼자도 흔들림 | `e2e-membership.js` | 1/1 | ✗ | 4/5 | ✗○✗✗✗ | ✗ ⑦ 곳간은 촌장만 — `/인출` 이 거절된다(NPC 마을 = 사람 촌장 없음) ["마을에서 너무 멉니다. 곳간 앞으로 가십시오."] |
| 혼자도 흔들림 | `e2e-rtt.js` | 1/1 | ✗ | 2/5 | ✗○○✗○ | ✗ ① [상황] 대조군 RTT 가 마감 창에서 ×5 이상 튄다 ×4.7 |
| 혼자도 흔들림 | `e2e-streams.js` | 1/1 | ✗ | 2/5 | ○○○✗✗ | ✗ ★★③ 같은 키 — 개울 줄기 위 한 걸음 = 뭍의 절반(걸음당 거리 · 예측 = 서버 좌표) 뭍 2.207px/걸음(29) · 개울 1.032px/걸음(31) · ×0.468 |
| 나란히만 | `test-lab-diverge-ctl.js` | 2/2 | ✗✗ | 0/5 | ○○○○○ | RC=1 · 실패 줄 없음 |
| 나란히만 | `e2e-npc-walk.js` | 1/1 | ✗ | 0/5 | ○○○○○ | ✗ ★★① 켬 — NPC 곧은 걸음 = MOVE_SPEED × 1 = 64px/s(플레이어 걸음 · ±10%) — 중앙 12.7px/s · 창 73 |
| 나란히만 | `test-save-race.js` | 1/2 | ✗○ | 0/5 | ○○○○○ | ✗ [상황] 판마다 A 산 몸만 숙련 · 어획 기록을 가졌고 행은 아직 몰랐다(닫힐 때 저장이 유일한 길) · 같은 사람으로 B 에 붙었다 켬 race 1 · calm 1 · live 1 · 끔 race 0 |

## 3. T1418 맞대기(앞 전수 로그를 같은 자로 다시 가름)

* T1418 나란히만 7 가운데 **아직 흔들림 1** · 사라짐 6

| T1418 | 하네스 | T1418 -j 4 | 이번 |
|---|---|---|---|
| 나란히만 | `test-village-only.js` | 1/3 | 초록(-j 4 0/1) |
| 나란히만 | `e2e-blizzard.js` | 1/3 | 초록(-j 4 0/1) |
| 나란히만 | `e2e-charsprite.js` | 1/3 | 초록(-j 4 0/1) |
| 나란히만 | `e2e-membership.js` | 3/3 | 혼자도 흔들림(-j 4 1/1 · 혼자 4/5) |
| 나란히만 | `test-t1389-deeds-on.js` | 3/3 | 초록(-j 4 0/1) |
| 나란히만 | `e2e-nature.js` | 1/3 | 초록(-j 4 0/1) |
| 나란히만 | `e2e-waterperf.js` | 1/3 | 초록(-j 4 0/1) |
| 늘 빨강 | `test-route-persist.js` | 3/3 | 늘 빨강(-j 4 2/2 · 혼자 5/5) |
| 늘 빨강 | `test-bundle-blackbox.js` | 3/3 | 늘 빨강(-j 4 2/2 · 혼자 5/5) |
| 늘 빨강 | `test-deeds-blackbox.js` | 3/3 | 늘 빨강(-j 4 2/2 · 혼자 5/5) |
| 늘 빨강 | `test-distmatrix.js` | 3/3 | 초록(-j 4 0/2) |
| 늘 빨강 | `test-harness-bite.js` | 3/3 | 초록(-j 4 0/2) |
| 늘 빨강 | `test-lab-mining.js` | 3/3 | 늘 빨강(-j 4 2/2 · 혼자 5/5) |
| 늘 빨강 | `test-t1308-resume.js` | 3/3 | 초록(-j 4 0/1) |

* 새로 흔들림(T1418 에서 초록이거나 없던 것) 10: `test-car-fast.js`(늘 빨강) · `test-resume-one.js`(늘 빨강) · `test-return-resume.js`(늘 빨강) · `test-slot-keep.js`(늘 빨강) · `test-t1034-caravan-keep.js`(늘 빨강) · `test-t1322-verify-night.js`(늘 빨강) · `e2e-streams.js`(혼자도 흔들림) · `test-lab-diverge-ctl.js`(나란히만) · `e2e-npc-walk.js`(나란히만) · `test-save-race.js`(나란히만)

## 4. 상시 목록(`scripts/nightly-known.txt`) 줄마다 — 편집은 PM

| 줄 | 이번 -j 4 | 이번 혼자 | 이번 가름 | 내릴 후보 |
|---|---|---|---|---|
| `test-tick-slicer.js` | ○ | — | 초록 | 후보(늘 빨강 아님) |
| `test-lab-mining.js` | ✗✗ | ✗✗✗✗✗ | 늘 빨강 |  |
| `test-resume-one.js` | ✗✗ | ✗✗✗✗✗ | 늘 빨강 |  |
| `test-bundle-blackbox.js` | ✗✗ | ✗✗✗✗✗ | 늘 빨강 |  |
| `test-distmatrix.js` | ○○ | — | 초록 | 후보(늘 빨강 아님) |
| `test-route-persist.js` | ✗✗ | ✗✗✗✗✗ | 늘 빨강 |  |
| `test-deeds-blackbox.js` | ✗✗ | ✗✗✗✗✗ | 늘 빨강 |  |

## 5. 초록 550

`e2e-aim.js` · `e2e-assign-job.js` · `e2e-audio-probe.js` · `e2e-bgm-phrase.js` · `e2e-bigmap-cells.js` · `e2e-bigmap-live.js` · `e2e-blizzard.js` · `e2e-breath.js` · `e2e-char3d.js` · `e2e-charsprite.js` · `e2e-chronicle.js` · `e2e-cold.js` · `e2e-conn.js` · `e2e-craft.js` · `e2e-cutaway.js` · `e2e-downed.js` · `e2e-emptystart.js` · `e2e-events.js` · `e2e-fishing.js` · `e2e-fogray.js` · `e2e-forage-village.js` · `e2e-friends.js` · `e2e-frost.js` · `e2e-guest-reconnect.js` · `e2e-guild.js` · `e2e-handoff-proto.js` · `e2e-hp.js` · `e2e-inv.js` · `e2e-metallurgy.js` · `e2e-mountain.js` · `e2e-move.js` · `e2e-mtcorridor.js` · `e2e-mtcut.js` · `e2e-mtfoot.js` · `e2e-mtfuzz.js` · `e2e-mtocc.js` · `e2e-nametag-others.js` · `e2e-nature.js` · `e2e-next-step.js` · `e2e-npcsprite.js` · `e2e-onboarding.js` · `e2e-oseok-all.js` · `e2e-pick-top.js` · `e2e-pid-collide.js` · `e2e-preserve.js` · `e2e-respawn-choice.js` · `e2e-rooms.js` · `e2e-rumor.js` · `e2e-salt.js` · `e2e-site-exit.js` · `e2e-snow.js` · `e2e-spoil2.js` · `e2e-t1160-promote-key.js` · `e2e-t1204-now-words.js` · `e2e-t1341-own-house.js` · `e2e-t1389-deeds-on.js` · `e2e-terrain.js` · `e2e-thirst.js` · `e2e-tidal.js` · `e2e-tilestate.js` · `e2e-trade.js` · `e2e-ui.js` · `e2e-verbs.js` · `e2e-village-view.js` · `e2e-village.js` · `e2e-waterperf.js` · `e2e-weather.js` · `e2e-weight.js` · `e2e-well.js` · `e2e-winter.js` · `e2e-zone-cross.js` · `e2e-zoom.js` · `test-alloy.js` · `test-armor-cap.js` · `test-arms-body.js` · `test-arms-keep.js` · `test-army-morale.js` · `test-assault-miss.js` · `test-assay.js` · `test-audio.js` · `test-backup-live.js` · `test-bandit-all.js` · `test-bandit-body.js` · `test-bandit-camp.js` · `test-bandit-walk.js` · `test-battle-fast.js` · `test-bgm-phrase.js` · `test-bigmap-cells.js` · `test-body-chunks.js` · `test-body-exit.js` · `test-body-fields.js` · `test-body-seed-other.js` · `test-body-seed-restart.js` · `test-body.js` · `test-bridge-act.js` · `test-bridge-path.js` · `test-bridge-sprite.js` · `test-build-act.js` · `test-building-anchor.js` · `test-calendar.js` · `test-cand-walk.js` · `test-cargo-age.js` · `test-carrier.js` · `test-cell-memo.js` · `test-charsheet.js` · `test-chron-icons.js` · `test-chunk-gates.js` · `test-ci-changes.js` · `test-ci-list.js` · `test-claim-v2.js` · `test-client-globals.js` · `test-clock-shift.js` · `test-clothes-tiers.js` · `test-clothes.js` · `test-coast-shape.js` · `test-coll-grid.js` · `test-craft.js` · `test-crop-cal.js` · `test-crop-memo.js` · `test-crops-world.js` · `test-crops.js` · `test-day-deaths.js` · `test-deforest-game.js` · `test-disk-check.js` · `test-distmatrix.js` · `test-ditch.js` · `test-donate.js` · `test-doors.js` · `test-downed.js` · `test-draft-famine.js` · `test-drop-kg.js` · `test-dusk-stamp.js` · `test-e2e-src.js` · `test-econ-diet.js` · `test-econ-fast.js` · `test-econ-fieldyield.js` · `test-econ-rawgrain.js` · `test-emptystart.js` · `test-events.js` · `test-far-trees.js` · `test-farm-act.js` · `test-farm-life.js` · `test-farm-metrics.js` · `test-fell-loot.js` · `test-fish-act.js` · `test-fishing.js` · `test-fixture-reap.js` · `test-floor-stone.js` · `test-food-floor.js` · `test-food-hunger.js` · `test-food-keep.js` · `test-food-sick.js` · `test-forage-act.js` · `test-frontier-iron.js` · `test-furnace.js` · `test-game-meat.js` · `test-gap-ruler.js` · `test-gate-draft.js` · `test-ghost-band.js` · `test-ghost-tree.js` · `test-granary-add.js` · `test-granary-age.js` · `test-granary-haul.js` · `test-granary-item.js` · `test-granary-rot.js` · `test-guest-identity.js` · `test-guest-rejoin.js` · `test-guild-treasury.js` · `test-hall-door-path.js` · `test-hall-units.js` · `test-handoff-body.js` · `test-happy-converge.js` · `test-harness-bite.js` · `test-harness-lint.js` · `test-headless-parity.js` · `test-hist.js` · `test-hp-src.js` · `test-hunt-port.js` · `test-hunt-vis.js` · `test-icons.js` · `test-imsu.js` · `test-index-named.js` · `test-indoor-on.js` · `test-inv-ground.js` · `test-itemlabel.js` · `test-jungwon-boot.js` · `test-kcal.js` · `test-lab-alloc.js` · `test-lab-army-morale.js` · `test-lab-happywork.js` · `test-lab-hunt.js` · `test-lab-psite.js` · `test-lab-stone.js` · `test-lab-trees.js` · `test-lab-wood.js` · `test-land-elev.js` · `test-ledger.js` · `test-lib-port.js` · `test-lint-harness-words.js` · `test-live-lag-net.js` · `test-live-ping.js` · `test-local-clocks.js` · `test-local-midnight-window.js` · `test-local-midnight.js` · `test-lon-day.js` · `test-loot-body.js` · `test-map-editor.js` · `test-member-open.js` · `test-membership.js` · `test-mining.js` · `test-mob-hp-door.js` · `test-mob-hp-restart.js` · `test-mob-respawn.js` · `test-model-intake.js` · `test-moment-lot.js` · `test-move-soa.js` · `test-move.js` · `test-msy.js` · `test-newcomers.js` · `test-nightly.js` · `test-nippon-boot.js` · `test-no-shield.js` · `test-notice-mark.js` · `test-notice.js` · `test-npc-clothes.js` · `test-npc-hp-door.js` · `test-npc-label.js` · `test-npc-wild-sync.js` · `test-onb-blackbox.js` · `test-onboarding.js` · `test-one-clock.js` · `test-one-decay.js` · `test-one-target.js` · `test-oremix.js` · `test-path-core.js` · `test-picker-tables.js` · `test-preserve-carry.js` · `test-preserve.js` · `test-props.js` · `test-psite-server.js` · `test-reanchor.js` · `test-reap-scope.js` · `test-recut.js` · `test-redeploy-light.js` · `test-redeploy.js` · `test-region-profiles.js` · `test-regrow-block.js` · `test-regrow.js` · `test-relic.js` · `test-render-common.js` · `test-reset-world.js` · `test-resource-index.js` · `test-resume-slice.js` · `test-road-day.js` · `test-road-tail.js` · `test-rock-los.js` · `test-rooms.js` · `test-route-sig.js` · `test-salt.js` · `test-save-periodic.js` · `test-seam-walk.js` · `test-seam.js` · `test-seed-hp.js` · `test-seed-reserve.js` · `test-segindex.js` · `test-server-market.js` · `test-shelter.js` · `test-site-memo.js` · `test-smelt-return.js` · `test-snow.js` · `test-sortie-miss.js` · `test-spoil2.js` · `test-static-cache.js` · `test-stone-real.js` · `test-streams.js` · `test-t1000-chunk-restart.js` · `test-t1001-econ-day.js` · `test-t1013-band-day.js` · `test-t1019-untrap.js` · `test-t1043-gate-house.js` · `test-t1044-scram-walk.js` · `test-t1046-wood-share.js` · `test-t1054-decay-wood.js` · `test-t1059-pick-top.js` · `test-t1060-scram-hold.js` · `test-t1063-terr-draw.js` · `test-t1064-next-step.js` · `test-t1065-tool-gate.js` · `test-t1066-village-fire.js` · `test-t1074-food-debt.js` · `test-t1075-happy-eq.js` · `test-t1080-road-life.js` · `test-t1085-assign-job.js` · `test-t1086-first-join.js` · `test-t1087-crew-cap.js` · `test-t1089-ret-walk.js` · `test-t1092-handoff-back.js` · `test-t1093-shelter-roof.js` · `test-t1094-arms-trip.js` · `test-t1094-carry-cap.js` · `test-t1095-mine-demand.js` · `test-t1107-regrow.js` · `test-t1113-low-happy.js` · `test-t1118-rack-age.js` · `test-t1120-next-tool.js` · `test-t1125-welcome.js` · `test-t1126-rock-yield.js` · `test-t1128-kcal-tidy.js` · `test-t1130-hosted.js` · `test-t1132-hall-view.js` · `test-t1133-bag-persist.js` · `test-t1135-fuel-eq.js` · `test-t1136-basket.js` · `test-t1143-no-dissolve.js` · `test-t1144-life-event.js` · `test-t1146-stone-rule.js` · `test-t1147-emig-pick.js` · `test-t1148-fuel-job.js` · `test-t1149-winter.js` · `test-t1152-market.js` · `test-t1159-home-n.js` · `test-t1160-promote-key.js` · `test-t1161-two-prices.js` · `test-t1163-welcome-sig.js` · `test-t1166-npc-lot-persist.js` · `test-t1167-war-persist.js` · `test-t1168-sortie-ammo.js` · `test-t1170-lab-clock.js` · `test-t1170-route-audit.js` · `test-t1179-crop-season.js` · `test-t1180-produce-defaults.js` · `test-t1181-build-defaults.js` · `test-t1182-caravan-body.js` · `test-t1183-physical-war.js` · `test-t1183-surrender-loss.js` · `test-t1184-war-owner.js` · `test-t1186-blade-wear.js` · `test-t1187-names.js` · `test-t1188-ore-split.js` · `test-t1192-fish-species.js` · `test-t1195-hunt-real.js` · `test-t1196-artisan.js` · `test-t1197-meal-body.js` · `test-t1198-birth-body.js` · `test-t1200-kg-fast.js` · `test-t1201-bronze-crops.js` · `test-t1202-produce-live.js` · `test-t1204-now-words.js` · `test-t1205-happy.js` · `test-t1206-natural-death.js` · `test-t1207-terr-real.js` · `test-t1209-meal-triage.js` · `test-t1212-farm-clock.js` · `test-t1213-terr-supply.js` · `test-t1214-step-fast.js` · `test-t1215-field-area.js` · `test-t1217-margin.js` · `test-t1218-fish-canon.js` · `test-t1219-step-fast.js` · `test-t1221-farm-labor.js` · `test-t1224-econ-farm.js` · `test-t1225-fish-capital.js` · `test-t1226-job-flex.js` · `test-t1229-field-grow.js` · `test-t1235-nearest.js` · `test-t1237-water-deer.js` · `test-t1238-terr-v2.js` · `test-t1240-kill-once.js` · `test-t1241-des.js` · `test-t1243-farm-on.js` · `test-t1246-food-price.js` · `test-t1249-ore-fix.js` · `test-t1257-seed-handoff.js` · `test-t1259-wood-cap.js` · `test-t1260-food-reads.js` · `test-t1266-ore-body.js` · `test-t1268-econ-clock.js` · `test-t1273-clock-rest.js` · `test-t1278-perf.js` · `test-t1290-perf.js` · `test-t1292-t952-axis.js` · `test-t1292-xz-esc.js` · `test-t1292-xz-hide.js` · `test-t1294-perf.js` · `test-t1306-migrate-food.js` · `test-t1308-resume.js` · `test-t1314-cols.js` · `test-t1315-war-corpse.js` · `test-t1321-xz-beast.js` · `test-t1321-xz-drain.js` · `test-t1321-xz-keep.js` · `test-t1322-prefilter.js` · `test-t1324-xz-migrate.js` · `test-t1325-one-rot.js` · `test-t1328-ore-zero.js` · `test-t1330-war-path.js` · `test-t1331-beast-body.js` · `test-t1333-alloy-order.js` · `test-t1334-bundle.js` · `test-t1336-crop-eq.js` · `test-t1337-wake.js` · `test-t1338-war-tick.js` · `test-t1339-wait-day.js` · `test-t1341-own-house.js` · `test-t1342-gate-home.js` · `test-t1344-bronze-mix.js` · `test-t1345-body-day.js` · `test-t1346-birth-flow.js` · `test-t1347-fetch.js` · `test-t1348-loop.js` · `test-t1349-war-stall.js` · `test-t1351-mine-clock.js` · `test-t1352-xz-hold.js` · `test-t1352-xz-news.js` · `test-t1353-onb-on-prep.js` · `test-t1355-lot-day.js` · `test-t1358-terr-stake.js` · `test-t1359-hunt-body.js` · `test-t1363-famine-tools.js` · `test-t1365-work.js` · `test-t1368-onb-newbie.js` · `test-t1372-resume.js` · `test-t1373-home-cap.js` · `test-t1374-farm-winter.js` · `test-t1376-tick-fail.js` · `test-t1376-xz-market.js` · `test-t1377-onb-guide.js` · `test-t1381-walk-heap.js` · `test-t1382-resume-body.js` · `test-t1384-mine-food.js` · `test-t1385-bronze-nocap.js` · `test-t1386-deeds-debt.js` · `test-t1388-farm-gap.js` · `test-t1389-deeds-on.js` · `test-t1391-unhappy-bandit.js` · `test-t1392-first-lot.js` · `test-t1393-hunt-chase.js` · `test-t1395-lab-diff.js` · `test-t1396-hunt-lab.js` · `test-t1398-bronze-band.js` · `test-t1399-tok.js` · `test-t1401-walk-map.js` · `test-t1402-deeds-split.js` · `test-t1402-deeds-uptime.js` · `test-t1402-deeds-work.js` · `test-t1403-small-hut.js` · `test-t1403-walk-arrow.js` · `test-t1404-bandit-live.js` · `test-t1405-leave-rare.js` · `test-t1407-tin-world.js` · `test-t1408-farm-4000.js` · `test-t1409-shared-rules.js` · `test-t1413-hunt-year.js` · `test-t1414-ocr-tmpdir.js` · `test-t1415-wakeq.js` · `test-t1416-hunt-body2.js` · `test-t1419-food-need.js` · `test-t1420-eq.js` · `test-t1421-farm-4000b.js` · `test-t1422-side-work.js` · `test-t1423-block-react.js` · `test-t1425-ruler.js` · `test-t1426-eq-bind.js` · `test-t1428-deeds-home.js` · `test-t1429-hunt-body3.js` · `test-t1431-raid-battle.js` · `test-t1432-npc-death.js` · `test-t1433-terr-rows.js` · `test-t1437-food-buffer.js` · `test-t1438-decay.js` · `test-t1439-call-carry.js` · `test-t1440-road-rule.js` · `test-t1441-passage.js` · `test-t1441-village-rules.js` · `test-t1445-boot-flood.js` · `test-t1446-view-index.js` · `test-t1447-grudge.js` · `test-t1448-road-grid.js` · `test-t1451-farm-side-wood.js` · `test-t1452-food-ahead.js` · `test-t1453-load.js` · `test-t1454-slow.js` · `test-t1455-bridge-decay.js` · `test-t1457-no-k-death.js` · `test-t1459-raid-ground.js` · `test-t1460-den-land.js` · `test-t1461-beast-unseen.js` · `test-t1466-road-fast.js` · `test-t1467-us-all.js` · `test-t1468-lab-land.js` · `test-t1469-den-move.js` · `test-t1470-road-pin.js` · `test-t740-side.js` · `test-t742-zone.js` · `test-t762-sync.js` · `test-t766-dissolve.js` · `test-t772-leg.js` · `test-t807-quote-exec.js` · `test-t835-quote-weight.js` · `test-t860-catch-dry.js` · `test-t877-dry-fix.js` · `test-t924-debt-cap.js` · `test-t931-slotk-ema.js` · `test-t941-ruler.js` · `test-t958-house-real.js` · `test-t965-want-start.js` · `test-t969-shelter-day.js` · `test-t976-want-capped.js` · `test-t986-bandit-day.js` · `test-t988-trade-words.js` · `test-t989-chunk-save.js` · `test-t995-dry-dance.js` · `test-t999-trade-cap.js` · `test-tame.js` · `test-terr-backfill.js` · `test-terr-overlap.js` · `test-terr-persist.js` · `test-terrain-memo.js` · `test-terraincache.js` · `test-tick-slicer.js` · `test-tidal.js` · `test-touched-harness.js` · `test-trade.js` · `test-trees.js` · `test-update-live-status.js` · `test-update-snap.js` · `test-valuechain.js` · `test-vein-batch.js` · `test-vern-num.js` · `test-vil-fast.js` · `test-village-boot-mem.js` · `test-village-found.js` · `test-village-label.js` · `test-village-only.js` · `test-village-view.js` · `test-villager-stuck.js` · `test-war-nosnap.js` · `test-war-world.js` · `test-weather.js` · `test-weight.js` · `test-well-art.js` · `test-well.js` · `test-wild-door.js` · `test-winter-fx.js` · `test-winter.js` · `test-wood-act.js` · `test-wood-flow.js` · `test-wood-step1.js` · `test-xhost-env.js` · `test-zone-fauna.js`


## 6. T1418 에 없던 새 빨강(T1418 에서 초록이거나 판에 없던 것)

| 가름 | 하네스 | 첫 ✗ 줄 | 하네스를 마지막으로 만진 카드 | 무는 제품 파일 | 그 제품 파일을 마지막으로 만진 카드 |
|---|---|---|---|---|---|
| 늘 빨강 | `test-car-fast.js` | ✗ [상황] 저장된 세계 — 길 위 캐러밴이 메타에 실렸고 메타 날 = 마을 날(복원 문이 캐러밴을 되돌리는 판) 캐러밴 0 · 메타 날 undefined · 마을 날 9 | T1281 ([승인 대기 · T1281] 하네스 포트 → 공용 할당기 lib-port) | `server/villages.js` | T1468 ([승인 대기 · T1468] CI — 굽기 탐침 몸짓 이름 setup →) |
| 늘 빨강 | `test-resume-one.js` | ✗ [상황] 저장된 세계 — 길 위 캐러밴이 메타에 실렸다 캐러밴 0 | T1288 ([승인 대기 · T1288] 시간을 재는 하네스 넷 @regress-al) | `server/villages.js` | T1468 ([승인 대기 · T1468] CI — 굽기 탐침 몸짓 이름 setup →) |
| 늘 빨강 | `test-return-resume.js` | ✗ ★★켬: 도착 경계 줄에서 새로 판 귀환 길 0(전부 재개형 문이 조각으로 팠다) 158번 · 그 줄 최대 858ms | T1281 ([승인 대기 · T1281] 하네스 포트 → 공용 할당기 lib-port) | `server/villages.js` | T1468 ([승인 대기 · T1468] CI — 굽기 탐침 몸짓 이름 setup →) |
| 늘 빨강 | `test-slot-keep.js` | ✗ ⑤ ★★다 판 쌍이 두 문의 버림보다 많다(종전 꼴 = 버림만 늘고 다 판은 제자리) 다 판 +0 > 버림 0 | T1288 ([승인 대기 · T1288] 고정 포트 리터럴 → lib-port(hol) | `server/zone.js` | T1451 ([승인 대기 · T1451] 미끼 ⓔ(밭 일감 문 앞 남는 시간 문) ·) |
| 늘 빨강 | `test-t1034-caravan-keep.js` | ✗ [상황] 저장된 세계 — 다음 마감에 도착할 캐러밴 하나 · 메타 행이 그 날 #3 · 날 4 · 메타 날 0 | T1382 (Revert "Merge T1382 (batch/resume-body-1) | `server/villages.js` | T1468 ([승인 대기 · T1468] CI — 굽기 탐침 몸짓 이름 setup →) |
| 늘 빨강 | `test-t1322-verify-night.js` | 상한 넘김(RC=124 · 3600초) | T1365 (Reapply "Merge T1365 (batch/perf-work-11) | `server/zone.js` | T1451 ([승인 대기 · T1451] 미끼 ⓔ(밭 일감 문 앞 남는 시간 문) ·) |
| 혼자도 흔들림 | `e2e-streams.js` | ✗ ★★③ 같은 키 — 개울 줄기 위 한 걸음 = 뭍의 절반(걸음당 거리 · 예측 = 서버 좌표) 뭍 2.207px/걸음(29) · 개울 1.032px/걸음(31) · ×0.468 | T1367 ([승인 대기 · T1367] CI 둘째 — 서버 잡 46종(잡 둘 · 차) | `server/zone.js` | T1451 ([승인 대기 · T1451] 미끼 ⓔ(밭 일감 문 앞 남는 시간 문) ·) |
| 나란히만 | `test-lab-diverge-ctl.js` | RC=1 · 실패 줄 없음 | T1058 ([승인 대기 · T1058] 랩 띠 자 — 켬 세계(T1047)에서 안 ) | `sim/economy-sim-v2.js` | T1452 ([승인 대기 · T1452] 앞날 장부 — 손잡이 값 `T1419_FOO) |
| 나란히만 | `e2e-npc-walk.js` | ✗ ★★① 켬 — NPC 곧은 걸음 = MOVE_SPEED × 1 = 64px/s(플레이어 걸음 · ±10%) — 중앙 12.7px/s · 창 73 | T1288 ([승인 대기 · T1288] -j 판 셋째 손질 — 혼자 돌 하네스(@r) | `server/zone.js` | T1451 ([승인 대기 · T1451] 미끼 ⓔ(밭 일감 문 앞 남는 시간 문) ·) |
| 나란히만 | `test-save-race.js` | ✗ [상황] 판마다 A 산 몸만 숙련 · 어획 기록을 가졌고 행은 아직 몰랐다(닫힐 때 저장이 유일한 길) · 같은 사람으로 B 에 붙었다 켬 race 1 · calm 1 · live 1 · 끔 race 0 | T940 ([승인 대기 · T940] 배포 차례(central 먼저) 증명 · 옛 ) | `server/zone.js` | T1451 ([승인 대기 · T1451] 미끼 ⓔ(밭 일감 문 앞 남는 시간 문) ·) |

· 상시 목록 안 늘 빨강: `test-bundle-blackbox.js` · `test-deeds-blackbox.js` · `test-lab-mining.js` · `test-resume-one.js` · `test-route-persist.js`
· 상시 목록 밖 늘 빨강: `test-car-fast.js` · `test-return-resume.js` · `test-slot-keep.js` · `test-t1034-caravan-keep.js` · `test-t1322-verify-night.js`

## 7. test-t1118-rack-age

· 혼자 `node scripts/test-t1118-rack-age.js` 20번 가운데 빨강 **0** · 서버 잡 2/2 차례 그대로(`run-regress.sh` -j 1 · TIDE_FREEZE_MS=372603 · DRAIN_SEC=3 · TIMEOUT_SEC=180 · 25종) 5번 가운데 rack-age 빨강 **0**

| 판 | 결과 | 벽 | 비고 |
|---|---|---|---|
| 혼자 1 | ○ | 15s | |
| 혼자 2 | ○ | 15s | |
| 혼자 3 | ○ | 15s | |
| 혼자 4 | ○ | 15s | |
| 혼자 5 | ○ | 15s | |
| 혼자 6 | ○ | 15s | |
| 혼자 7 | ○ | 15s | |
| 혼자 8 | ○ | 15s | |
| 혼자 9 | ○ | 15s | |
| 혼자 10 | ○ | 15s | |
| 혼자 11 | ○ | 15s | |
| 혼자 12 | ○ | 14s | |
| 혼자 13 | ○ | 15s | |
| 혼자 14 | ○ | 15s | |
| 혼자 15 | ○ | 15s | |
| 혼자 16 | ○ | 15s | |
| 혼자 17 | ○ | 15s | |
| 혼자 18 | ○ | 15s | |
| 혼자 19 | ○ | 15s | |
| 혼자 20 | ○ | 15s | |
| 차례 1 | ○ (러너 rc=0) | 417s |  ✓ RC=0 |
| 차례 2 | ○ (러너 rc=0) | 410s |  ✓ RC=0 |
| 차례 3 | ○ (러너 rc=0) | 411s |  ✓ RC=0 |
| 차례 4 | ○ (러너 rc=0) | 414s |  ✓ RC=0 |
| 차례 5 | ○ (러너 rc=0) | 408s |  ✓ RC=0 |

## 8. 사유지 끔 전제 하네스(글자 훑기 · 돌리기 전) — 35종

· 가름: `@regress` 전수 가운데 글자에 사유지 · deeds 가 나오는데 `T1305_DEEDS` 를 박지 않은 것(켬 기본에서 끔 쪽 가정이 남았을 수 있는 후보 · 글자 훑기이지 판정 아님).

`test-audio.js` · `test-coll-grid.js` · `test-craft.js` · `test-downed.js` · `test-events.js` · `test-furnace.js` · `test-guest-identity.js` · `test-harness-lint.js` · `test-member-open.js` · `test-membership.js` · `test-notice.js` · `test-onb-blackbox.js` · `test-regrow.js` · `test-shelter.js` · `test-t1086-first-join.js` · `test-t1204-now-words.js` · `test-t1238-terr-v2.js` · `test-t1341-own-house.js` · `test-t1438-decay.js` · `test-t1440-road-rule.js` · `test-t1447-grudge.js` · `test-t1466-road-fast.js` · `test-t1470-road-pin.js` · `test-well-art.js` · `test-well.js` · `e2e-chronicle.js` · `e2e-guest-reconnect.js` · `e2e-metallurgy.js` · `e2e-nature.js` · `e2e-next-step.js` · `e2e-t1341-own-house.js` · `e2e-ui.js` · `e2e-village-view.js` · `e2e-village.js` · `e2e-well.js`
