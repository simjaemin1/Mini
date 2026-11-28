# T1450 준비 조사 — 진행 중

바탕은 `origin/main@0e2ae3916acdb7380b7eb615a0f3c85d2b41f61d`다. T1411의 고정 제품과는 다른 작업 트리다. 카드 순서대로 T1411의 실제 장기 판을 먼저 끝내며, 여기서는 소스·문서·Git 기록만 읽었다. 제품 모듈 실행·제품 변경·`T1450_LIFT` 구현·실험 세계 시작은 모두 0이다.

`설계/조사_손으로적은목표_T1450.md`와 `reviewed-policy-rows.json`은 **부분표**다. 선언 77개는 의사결정 문 77개라는 뜻이 아니다. 하나가 여러 문에 쓰이기도 하고, 지도 수용·마모처럼 물리인 것도 들어 있다. 전수 수·등급·실험 결과로 보고하지 않는다.

파일의 의미:

- `scan-decisions.cjs`: Acorn으로 네 파일의 분기·클램프·루프·수기 선언·목표 반환을 수집한다. 외부 상수만 읽는 `_terrCap` 반환도 포착한다. 제품을 require하지 않는다.
- `decision-candidates.json.gz`: 모두 `unreviewed`인 검색 후보. 기술적 경계·캐시·검증도 섞였고, 이 수집기가 모든 의미상의 문을 증명하지는 않는다. 전체 원문 해시는 유지하고 긴 표현은 표시한 뒤 잘랐다.
- `scan-summary.json`, `named-policy-queue.tsv`: 후보 종류·파일별 크기와 우선 읽을 목록. 정책 총계가 아니다.
- `line-provenance.py`, `line-provenance.json.gz`: 고정 바탕의 줄별 `git blame` 귀속. **숫자 최초 도입·측정 근거의 증명은 아니다.**
- `prepare-reviewed.py`, `reviewed-policy-rows.json`: 읽은 선언의 분류·의미·걷을 자리·주의·줄 귀속을 기록하고 부분표를 만든다. 모든 사용처·첫 도입·핀 하네스 추적은 아직 남았다.
- `recipe-crosswalk.py`, `recipe-crosswalk-draft.json`: T718 원래 레시피 E28/S54/L1, 합 83줄의 정체성을 보존한 초안. 뒤의 비용 표에 반복된 ID는 중복 세지 않는다. 현재 비용·쓰임 판정은 전부 미검토다.

재현(소스 네 파일이 위 바탕과 같을 때):

```sh
source /tmp/t1358/node-env.sh
node 계측/T1450_2026-11-28/scan-decisions.cjs > 계측/T1450_2026-11-28/scan-summary.json
python3 계측/T1450_2026-11-28/line-provenance.py > 계측/T1450_2026-11-28/provenance-summary.json
python3 계측/T1450_2026-11-28/recipe-crosswalk.py
python3 계측/T1450_2026-11-28/prepare-reviewed.py
```

걷기 전 필수로 남은 것: 사용처별 행 분할, 이름 없는 문 전수, 최초 숫자 출처·현행 측정 여부, 하네스 핀·인라인·v1/v2 사본, T718 현재 83줄 대조와 ⓪~⑤, 실험 손잡이·4미끼, 실제 문을 지나는 실험과 OFF 검증. 서버 전용 문이 랩에서 안 돈 경우는 미검증이며 ‘가) 죽은 수’가 아니다. 실제 라이브 손잡이는 읽지 않았다.
