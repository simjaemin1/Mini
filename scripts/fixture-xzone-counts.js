'use strict';
// 서로 다른 시각의 존 계수: ACK를 읽고 → 상대 수신을 읽고 → 송신 누계를 다시 읽는다.
// 같은 존의 수신 = 반환 + 이동 중 보존식은 별도로 정확히 같아야 한다.
module.exports=(ackBefore,received,emittedAfter)=>ackBefore<=received && received<=emittedAfter;
