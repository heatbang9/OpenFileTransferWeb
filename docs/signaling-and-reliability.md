# Signaling, TURN, PWA, 재시도 설계

## 현재 signaling

현재 웹 앱은 Vercel Function `/api/nearby`와 Runtime Cache를 사용합니다.

- `heartbeat`: 같은 방의 온라인 디바이스 목록과 내 inbox 메시지를 가져옵니다.
- `signal`: WebRTC offer/answer/reject 메시지를 상대 inbox에 넣습니다.
- `leave`: 방 목록에서 내 디바이스를 제거합니다.

Runtime Cache는 영구 DB가 아니라 짧은 presence/signaling 캐시입니다. 파일 데이터는 저장하지 않습니다.

## 외부 realtime signaling 확장안

Vercel Function polling은 구현이 단순하지만, 즉시성은 3초 heartbeat 주기에 묶입니다. 운영 품질을 올릴 때는 아래 방식으로 교체합니다.

1. Supabase Realtime, Ably, Pusher, PartyKit 중 하나를 선택합니다.
2. room channel에 `join`, `leave`, `offer`, `answer`, `reject` 이벤트를 발행합니다.
3. 현재 `nearbyRequest()` 호출부를 `signalingProvider.send()` / `signalingProvider.subscribe()` 형태로 분리합니다.
4. provider는 `runtime-cache-polling`과 `realtime` 두 구현을 둡니다.

선택 기준:

- Supabase Realtime: DB와 presence를 같이 운영할 때 유리합니다.
- Ably/Pusher: managed realtime만 빠르게 붙일 때 유리합니다.
- PartyKit: 방 단위 WebSocket 서버를 코드로 제어할 때 유리합니다.

## TURN 운영 설계

앱은 사용자가 입력한 TURN 서버를 WebRTC ICE 서버 목록에 추가합니다. `테스트` 버튼은 `iceTransportPolicy: "relay"`로 relay 후보가 생성되는지 확인합니다.

운영에 필요한 것:

- TURN 서버 URL: `turn:host:3478` 또는 `turns:host:5349`
- username/credential
- UDP/TCP/TLS relay 포트 방화벽 개방
- 지역별 latency 테스트

권장 검증:

1. 같은 네트워크 PC 두 대에서 기본 STUN 연결을 테스트합니다.
2. 서로 다른 네트워크 또는 모바일 핫스팟에서 연결을 테스트합니다.
3. relay-only 테스트가 성공하는지 확인합니다.
4. 큰 파일 전송 중 대역폭과 실패율을 기록합니다.

## PWA/오프라인 캐시

`manifest.webmanifest`와 `sw.js`를 추가했습니다. Service Worker는 앱 shell만 캐시하고 `/api/` 요청은 캐시하지 않습니다.

오프라인에서 가능한 것:

- 앱 화면 열기
- 이전 디바이스 이름/TURN/이력 확인

오프라인에서 불가능한 것:

- Nearby 방 동기화
- 새 WebRTC signaling
- 인터넷이 필요한 TURN relay 연결

## 재시도/이어받기

현재 구현은 전송 실패 또는 중지 후 실패 큐를 보존하고 `재시도` 버튼으로 남은 파일을 다시 보냅니다. 같은 파일을 다시 보내면 수신자가 localStorage에 저장한 청크 bitmap을 확인한 뒤 `resumeAck`로 누락 구간만 응답하고, 송신자는 빠진 청크만 전송합니다.

이어받기 프로토콜:

1. 송신자는 파일 이름, 크기, 마지막 수정 시간, 청크 크기로 안정적인 파일 ID를 만들고 `meta`에 `chunkSize`, `chunkCount`를 담아 보냅니다.
2. 수신자는 같은 ID의 이어받기 상태가 있으면 받은 청크 bitmap을 복원합니다.
3. 수신자는 `resumeAck`에 `missingRanges`와 `receivedBytes`를 담아 응답합니다.
4. 송신자는 각 청크 전에 `{ kind: "chunk", id, index, size }`를 보내고, 이어서 바이너리 청크를 전송합니다.
5. 암호화 시 AES-GCM nonce는 청크 index를 기준으로 만들기 때문에 누락 청크만 다시 보내도 복호화 순서가 맞습니다.
6. 수신자는 청크를 받을 때 OPFS 또는 File System Access writer에 위치 기반으로 기록하고 bitmap을 갱신합니다.

현재 수신 저장 경로는 `수신 파일 바로 저장`이 켜져 있고 File System Access API를 지원하면 사용자가 고른 파일을 우선 사용합니다. 그 외 OPFS를 지원하는 브라우저는 OPFS 임시 파일에 기록합니다. 둘 다 사용할 수 없는 브라우저는 메모리 Blob으로 받기 때문에 탭 종료 후 이어받기는 지원하지 않습니다.

남은 보강:

- 파일 전체 SHA-256 또는 chunk hash manifest 검증
- 오래된 이어받기 bitmap과 OPFS 임시 파일 정리 UI
- 외부 realtime signaling 적용 후 재연결 자동화
