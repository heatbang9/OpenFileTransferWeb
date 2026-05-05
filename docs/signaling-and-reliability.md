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

현재 구현은 전송 실패 또는 중지 후 실패 큐를 보존하고 `재시도` 버튼으로 남은 파일을 처음부터 다시 보냅니다. 청크 단위 이어받기는 아직 다음 단계입니다.

이어받기를 구현하려면:

1. 파일별 `id`, `size`, `sha256`, `chunkSize` manifest를 먼저 보냅니다.
2. 수신자는 받은 chunk index bitmap을 localStorage 또는 OPFS에 기록합니다.
3. 재연결 후 수신자가 `resumeRequest`로 누락 chunk index 목록을 보냅니다.
4. 송신자는 누락 chunk만 다시 보냅니다.
5. 암호화 시 chunk nonce는 파일 ID와 chunk index로 결정적으로 만들어야 합니다.

현재 수신 저장 경로는 File System Access API를 우선 사용하고, 사용할 수 없으면 OPFS 임시 파일을 사용합니다. 청크 단위 이어받기를 완성하려면 OPFS 파일과 chunk bitmap을 같은 파일 ID로 묶어 보관하면 됩니다.
