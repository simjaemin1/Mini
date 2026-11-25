# T1482 진단 증거

제품 변경/본판/제품미끼를 수행한 폴더가 아니다. 카드 진단중단 조건에 따라 옛 저장 정보손실을 입증한다. 정본은 `보고/T1482_2026-11-26.md` 첫15줄이다.

```sh
node scripts/lab-wiring-check.js
python3 계측/T1482_2026-11-26/extract.py /workspace/scratch/t1481-main870/saved-870 계측/T1482_2026-11-26 /workspace/scratch/t1482
node 계측/T1482_2026-11-26/restore.cjs /workspace/scratch/t1482/input.json 계측/T1482_2026-11-26
node 계측/T1482_2026-11-26/collision.cjs 계측/T1482_2026-11-26/collision.json
T1445_BOOT_BOUND=0 node 계측/T1482_2026-11-26/restore.cjs /workspace/scratch/t1482/input.json /workspace/scratch/t1482
T1445_BOOT_BOUND=0 node 계측/T1482_2026-11-26/collision.cjs 계측/T1482_2026-11-26/collision-boot-off.json
cmp 계측/T1482_2026-11-26/restore.json /workspace/scratch/t1482/restore.json
cmp 계측/T1482_2026-11-26/restored-bodies.csv /workspace/scratch/t1482/restored-bodies.csv
cmp 계측/T1482_2026-11-26/collision.json 계측/T1482_2026-11-26/collision-boot-off.json
node scripts/test-t1167-war-persist.js
node scripts/test-t1445-boot-flood.js
```

`extract.py`는 보존 파일 해시를 먼저 검증한다. 최초 원본SQLite 읽기 뒤SHM해시만 달랐고DB/WAL은 원래 해시 그대로다. SHM불일치를명시적으로기록하고복사본만연다. 원본 보존물/입력econ 전체는 레포에 넣지 않았다. `storage-audit.json`은 열쇠와sidecar전수, `restore.json`은실제복원문결과, CSV는전체369명좌표, `collision*.json`은저장문동일/다음정본걸음차이의합성반례다.

`restore.cjs`는 실제 서버 전체 부팅이 아니다. 정본 복원문과 소집 문만 부른다. `collision.cjs`의 저장문 비교는 전쟁+전체몸직렬화이며 전체서버DB재생시험이라고 부르지 않는다. T1445 양팔에서 이 두 좁은 진단을 돌린 것을 실제 먼 탐색/단계별장기판 통과로 세지 않는다.
