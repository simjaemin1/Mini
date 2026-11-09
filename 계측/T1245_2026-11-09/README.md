# T1245 원자료

- `before`: 9e9ea133 복사본의 켬 3×800일, `scripts/t176-ab.js`.
- `after`: 최종 코드의 요청 T17 명령(켬에서 같은 t176 정본 진입) 3×800일.
- `control`: 작업 중 코드의 끔 3×800일, source.json에 당시 해시. 공식 끔 400일 게이트와는 별개다.
- `full-capacity-diagnostic`: 미채택 중간안. 최종 전후 비교에 사용하지 않는다.
- 각 .json은 요약, .farm.json은 작물/씨/생활층 원자료, .log는 출력. gzip을 풀면 원본 바이트다.
- before/source.json은 실행 후 복사본 6파일을 git 9e9ea133과 대조하여 확인한 해시다. 실행 당시 생성 해시라고 주장하지 않는다.
- after/source.json과 off-source.json은 각 최종 실행 시작 시 해시다. control은 당시 해시를 보존하며 최종 코드 해시로 바꾸지 않았다.
- storage-before/after는 미소비 기준 감사다. 실제 소비·폐기율이 아니다. actual startup은 실제 zone 부팅 스냅샷이며 101일 투영값은 소비 없는 가정이다.
- 시계 이전 실패는 회귀 재현 증거(예상 exit1), 이후 켬/끔 exit0. 단위검사는 카드가 요구한 범위다.
- 원문 접근 실패와 이전 T1239 재인용을 구분한다. 파종량 0/6, 역사적 상한 몫 미확인.
- SHA256SUMS는 이 폴더의 압축된 파일을 포함한 보관 바이트 해시다.
