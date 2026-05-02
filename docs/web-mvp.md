# 웹 MVP 설계와 제약

## 목표

OpenFileTransfer Web MVP는 앱 설치 없이 브라우저만으로 파일을 주고받는 흐름을 검증합니다. Vercel에는 정적 HTML/CSS/JS만 배포하고, 실제 파일은 WebRTC DataChannel로 디바이스 간 직접 전송합니다.

## UPnP/SSDP를 넣지 않는 이유

브라우저 JavaScript는 UDP multicast socket을 열 수 없어서 SSDP `M-SEARCH`를 보낼 수 없습니다. 로컬 네트워크 스캔이나 임의 포트 연결도 브라우저 보안 정책, CORS, Local Network Access 정책의 영향을 받습니다.

따라서 웹 버전은 네이티브 앱의 자동 탐색 구조와 다르게 갑니다.

- 네이티브 앱: SSDP/UPnP 탐색, gRPC 직접 연결, 백그라운드 수신
- 웹 MVP: 초대 코드/응답 코드, WebRTC P2P, 브라우저 탭 활성 상태 중심

## 연결 구조

```mermaid
flowchart LR
  A["보내는 브라우저"] -- "초대 코드" --> B["받는 브라우저"]
  B -- "응답 코드" --> A
  A <-- "WebRTC DataChannel" --> B
```

초대 코드와 응답 코드는 WebRTC SDP 정보를 base64url로 감싼 값입니다. 두 코드가 교환된 뒤 브라우저는 ICE 후보를 이용해 직접 연결을 시도합니다.

## Vercel의 역할

현재 MVP에서 Vercel은 앱 파일을 배포하는 정적 호스팅 역할만 합니다. 파일 데이터, 파일 이름, 파일 내용은 Vercel API로 업로드하지 않습니다.

방 코드 자동 매칭을 넣고 싶다면 별도 signaling 저장소가 필요합니다.

- 간단안: Vercel API + 외부 DB 또는 KV
- 안정안: Supabase Realtime, Ably, Pusher, PartyKit
- 자체운영안: 작은 WebSocket signaling 서버

Vercel Functions는 WebSocket 서버로 오래 연결을 유지하는 용도에는 맞지 않습니다.

## 보안

- WebRTC DataChannel은 DTLS 기반 암호화를 사용합니다.
- MVP는 WebRTC 기본 암호화 위에 동작합니다.
- 앱 레벨 파일 암호화는 다음 단계에서 추가할 수 있습니다.
- 초대/응답 코드를 제3자가 보면 연결 시도가 가능하므로 코드는 같은 사용자 흐름 안에서만 공유해야 합니다.

## 현재 제약

- 브라우저 탭이 닫히면 전송이 중단됩니다.
- 수신 파일은 Blob으로 메모리에 모은 뒤 저장합니다.
- 매우 큰 파일은 브라우저 메모리 제약을 받을 수 있습니다.
- NAT/방화벽 환경에 따라 직접 연결이 실패할 수 있습니다.
- TURN 서버를 넣지 않았으므로 복잡한 네트워크에서는 실패할 수 있습니다.
- 모바일 브라우저는 백그라운드 전송 안정성이 낮습니다.

## 다음 후보 작업

1. QR 코드 생성과 카메라 스캔 연결
2. 파일 수신을 File System Access API로 스트리밍 저장
3. 복수 파일 전송 큐
4. 외부 realtime signaling을 붙인 방 코드 자동 매칭
5. TURN 서버 옵션 문서화
6. 앱 레벨 파일 암호화
