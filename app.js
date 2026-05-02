const SIGNAL_VERSION = "oft-web-mvp-v1";
const CHUNK_SIZE = 64 * 1024;
const MAX_BUFFERED_BYTES = 4 * 1024 * 1024;
const ICE_SERVERS = [{ urls: "stun:stun.l.google.com:19302" }];

const $ = (id) => document.getElementById(id);

const elements = {
  connectionSummary: $("connectionSummary"),
  connectionState: $("connectionState"),
  deviceName: $("deviceName"),
  saveDeviceName: $("saveDeviceName"),
  deviceId: $("deviceId"),
  senderMode: $("senderMode"),
  receiverMode: $("receiverMode"),
  resetConnection: $("resetConnection"),
  senderPanel: $("senderPanel"),
  receiverPanel: $("receiverPanel"),
  fileInput: $("fileInput"),
  dropZone: $("dropZone"),
  fileName: $("fileName"),
  fileSize: $("fileSize"),
  offerCode: $("offerCode"),
  answerInput: $("answerInput"),
  offerInput: $("offerInput"),
  answerCode: $("answerCode"),
  createOffer: $("createOffer"),
  acceptAnswer: $("acceptAnswer"),
  createAnswer: $("createAnswer"),
  copyOffer: $("copyOffer"),
  copyAnswer: $("copyAnswer"),
  pasteOffer: $("pasteOffer"),
  pasteAnswer: $("pasteAnswer"),
  sendFile: $("sendFile"),
  downloadFile: $("downloadFile"),
  senderReady: $("senderReady"),
  receiverReady: $("receiverReady"),
  transferPercent: $("transferPercent"),
  progressFill: $("progressFill"),
  eventList: $("eventList"),
};

const state = {
  role: "sender",
  pc: null,
  channel: null,
  selectedFile: null,
  receiveMeta: null,
  receiveBuffers: [],
  receiveBytes: 0,
  connectedPeer: null,
  transferBusy: false,
};

function init() {
  const device = loadDevice();
  elements.deviceName.value = device.name;
  elements.deviceId.textContent = device.id;
  bindEvents();
  renderMode();
  setConnection("오프라인", "대기 중", false);
  logEvent("웹 앱이 준비되었습니다.");
}

function bindEvents() {
  elements.saveDeviceName.addEventListener("click", saveDeviceName);
  elements.senderMode.addEventListener("click", () => setMode("sender"));
  elements.receiverMode.addEventListener("click", () => setMode("receiver"));
  elements.resetConnection.addEventListener("click", resetConnection);
  elements.fileInput.addEventListener("change", onFileSelected);
  elements.createOffer.addEventListener("click", createSenderOffer);
  elements.acceptAnswer.addEventListener("click", acceptReceiverAnswer);
  elements.createAnswer.addEventListener("click", createReceiverAnswer);
  elements.copyOffer.addEventListener("click", () => copyText(elements.offerCode.value, "초대 코드를 복사했습니다."));
  elements.copyAnswer.addEventListener("click", () => copyText(elements.answerCode.value, "응답 코드를 복사했습니다."));
  elements.pasteOffer.addEventListener("click", () => pasteText(elements.offerInput));
  elements.pasteAnswer.addEventListener("click", () => pasteText(elements.answerInput));
  elements.sendFile.addEventListener("click", sendSelectedFile);

  elements.dropZone.addEventListener("dragover", (event) => {
    event.preventDefault();
    elements.dropZone.classList.add("dragging");
  });
  elements.dropZone.addEventListener("dragleave", () => {
    elements.dropZone.classList.remove("dragging");
  });
  elements.dropZone.addEventListener("drop", (event) => {
    event.preventDefault();
    elements.dropZone.classList.remove("dragging");
    const [file] = event.dataTransfer.files;
    if (file) {
      setSelectedFile(file);
    }
  });
}

function loadDevice() {
  const stored = localStorage.getItem("oft-web-device");
  if (stored) {
    return JSON.parse(stored);
  }

  const device = {
    id: crypto.randomUUID(),
    name: defaultDeviceName(),
  };
  localStorage.setItem("oft-web-device", JSON.stringify(device));
  return device;
}

function getDevice() {
  return {
    id: elements.deviceId.textContent,
    name: elements.deviceName.value.trim() || defaultDeviceName(),
  };
}

function saveDeviceName() {
  const device = getDevice();
  localStorage.setItem("oft-web-device", JSON.stringify(device));
  elements.deviceName.value = device.name;
  logEvent("디바이스 이름을 저장했습니다.");
}

function defaultDeviceName() {
  const platform = navigator.platform || "Web";
  return `Web ${platform}`.slice(0, 32);
}

function setMode(role) {
  state.role = role;
  renderMode();
}

function renderMode() {
  const sender = state.role === "sender";
  elements.senderMode.classList.toggle("active", sender);
  elements.receiverMode.classList.toggle("active", !sender);
  elements.senderPanel.classList.toggle("active", sender);
  elements.receiverPanel.classList.toggle("active", !sender);
}

function onFileSelected(event) {
  const [file] = event.target.files;
  if (file) {
    setSelectedFile(file);
  }
}

function setSelectedFile(file) {
  state.selectedFile = file;
  elements.fileName.textContent = file.name;
  elements.fileSize.textContent = formatBytes(file.size);
  elements.senderReady.textContent = "파일 선택됨";
  updateSendButton();
}

async function createSenderOffer() {
  try {
    resetConnection(false);
    state.role = "sender";
    renderMode();
    state.pc = createPeerConnection();
    state.channel = state.pc.createDataChannel("oft-file-v1", { ordered: true });
    setupDataChannel(state.channel);

    const offer = await state.pc.createOffer();
    await state.pc.setLocalDescription(offer);
    await waitForIceGathering(state.pc);

    elements.offerCode.value = encodeSignal({
      version: SIGNAL_VERSION,
      kind: "offer",
      device: getDevice(),
      description: state.pc.localDescription,
    });

    elements.senderReady.textContent = "초대 코드 준비";
    logEvent("초대 코드를 만들었습니다.");
  } catch (error) {
    handleError(error);
  }
}

async function acceptReceiverAnswer() {
  try {
    if (!state.pc) {
      throw new Error("먼저 초대 코드를 만들어 주세요.");
    }

    const signal = decodeSignal(elements.answerInput.value);
    assertSignal(signal, "answer");
    state.connectedPeer = signal.device;
    await state.pc.setRemoteDescription(signal.description);
    setConnection("연결 중", `${signal.device.name} 응답 확인`, false);
    logEvent(`${signal.device.name} 응답 코드를 연결했습니다.`);
  } catch (error) {
    handleError(error);
  }
}

async function createReceiverAnswer() {
  try {
    resetConnection(false);
    state.role = "receiver";
    renderMode();

    const signal = decodeSignal(elements.offerInput.value);
    assertSignal(signal, "offer");
    state.connectedPeer = signal.device;
    state.pc = createPeerConnection();
    state.pc.ondatachannel = (event) => setupDataChannel(event.channel);

    await state.pc.setRemoteDescription(signal.description);
    const answer = await state.pc.createAnswer();
    await state.pc.setLocalDescription(answer);
    await waitForIceGathering(state.pc);

    elements.answerCode.value = encodeSignal({
      version: SIGNAL_VERSION,
      kind: "answer",
      device: getDevice(),
      description: state.pc.localDescription,
    });

    elements.receiverReady.textContent = "응답 코드 준비";
    setConnection("연결 중", `${signal.device.name} 초대 확인`, false);
    logEvent("응답 코드를 만들었습니다.");
  } catch (error) {
    handleError(error);
  }
}

function createPeerConnection() {
  const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

  pc.addEventListener("connectionstatechange", () => {
    const peerName = state.connectedPeer?.name || "상대 디바이스";
    if (pc.connectionState === "connected") {
      setConnection("연결됨", `${peerName} 연결됨`, true);
      logEvent(`${peerName}와 연결되었습니다.`);
    } else if (pc.connectionState === "failed") {
      setConnection("실패", "연결 실패", false);
      logEvent("WebRTC 연결에 실패했습니다.", true);
    } else if (pc.connectionState === "disconnected") {
      setConnection("끊김", "연결이 끊겼습니다.", false);
    } else {
      setConnection(pc.connectionState, `${peerName} ${pc.connectionState}`, false);
    }
    updateSendButton();
  });

  return pc;
}

function setupDataChannel(channel) {
  state.channel = channel;
  channel.binaryType = "arraybuffer";

  channel.addEventListener("open", () => {
    const peerName = state.connectedPeer?.name || "상대 디바이스";
    setConnection("연결됨", `${peerName} 채널 열림`, true);
    elements.senderReady.textContent = "전송 가능";
    elements.receiverReady.textContent = "수신 가능";
    updateSendButton();
  });

  channel.addEventListener("close", () => {
    setConnection("닫힘", "채널 닫힘", false);
    updateSendButton();
  });

  channel.addEventListener("message", receiveMessage);
}

async function sendSelectedFile() {
  if (!state.selectedFile || !state.channel || state.channel.readyState !== "open") {
    return;
  }

  const file = state.selectedFile;
  state.transferBusy = true;
  updateSendButton();
  setProgress(0);

  try {
    state.channel.send(JSON.stringify({
      kind: "meta",
      name: file.name,
      size: file.size,
      type: file.type || "application/octet-stream",
      updatedAt: file.lastModified,
    }));

    const reader = file.stream().getReader();
    let sent = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      for (let offset = 0; offset < value.byteLength; offset += CHUNK_SIZE) {
        const chunk = value.slice(offset, offset + CHUNK_SIZE);
        await waitForChannelBuffer(state.channel);
        state.channel.send(chunk);
        sent += chunk.byteLength;
        setProgress(percent(sent, file.size));
      }
    }

    state.channel.send(JSON.stringify({ kind: "done" }));
    setProgress(100);
    logEvent(`${file.name} 전송 완료`);
  } catch (error) {
    handleError(error);
  } finally {
    state.transferBusy = false;
    updateSendButton();
  }
}

function receiveMessage(event) {
  if (typeof event.data === "string") {
    const message = JSON.parse(event.data);
    if (message.kind === "meta") {
      state.receiveMeta = message;
      state.receiveBuffers = [];
      state.receiveBytes = 0;
      elements.downloadFile.classList.add("hidden");
      setProgress(0);
      logEvent(`${message.name} 수신 시작`);
      return;
    }

    if (message.kind === "done") {
      finishReceive();
      return;
    }
  }

  if (event.data instanceof ArrayBuffer) {
    state.receiveBuffers.push(event.data);
    state.receiveBytes += event.data.byteLength;
    if (state.receiveMeta?.size) {
      setProgress(percent(state.receiveBytes, state.receiveMeta.size));
    }
  }
}

function finishReceive() {
  if (!state.receiveMeta) {
    return;
  }

  const blob = new Blob(state.receiveBuffers, { type: state.receiveMeta.type });
  const url = URL.createObjectURL(blob);
  elements.downloadFile.href = url;
  elements.downloadFile.download = state.receiveMeta.name;
  elements.downloadFile.classList.remove("hidden");
  setProgress(100);
  logEvent(`${state.receiveMeta.name} 수신 완료`);
}

function updateSendButton() {
  const channelOpen = state.channel?.readyState === "open";
  elements.sendFile.disabled = !state.selectedFile || !channelOpen || state.transferBusy;
}

function resetConnection(clearSignals = true) {
  state.channel?.close();
  state.pc?.close();
  state.pc = null;
  state.channel = null;
  state.connectedPeer = null;
  state.receiveMeta = null;
  state.receiveBuffers = [];
  state.receiveBytes = 0;
  state.transferBusy = false;
  elements.downloadFile.classList.add("hidden");

  if (clearSignals) {
    elements.offerCode.value = "";
    elements.answerCode.value = "";
    elements.offerInput.value = "";
    elements.answerInput.value = "";
  }

  elements.senderReady.textContent = state.selectedFile ? "파일 선택됨" : "준비 전";
  elements.receiverReady.textContent = "준비 전";
  setProgress(0);
  setConnection("오프라인", "대기 중", false);
  updateSendButton();
}

function setConnection(label, summary, connected) {
  elements.connectionState.textContent = label;
  elements.connectionState.classList.toggle("connected", connected);
  elements.connectionSummary.textContent = summary;
}

function setProgress(value) {
  const next = Math.max(0, Math.min(100, Math.round(value)));
  elements.progressFill.style.width = `${next}%`;
  elements.transferPercent.textContent = `${next}%`;
}

function logEvent(message, isError = false) {
  const item = document.createElement("li");
  item.textContent = `${new Date().toLocaleTimeString("ko-KR")} ${message}`;
  item.classList.toggle("error", isError);
  elements.eventList.prepend(item);
}

function handleError(error) {
  const message = error instanceof Error ? error.message : String(error);
  logEvent(message, true);
}

async function waitForIceGathering(pc) {
  if (pc.iceGatheringState === "complete") {
    return;
  }

  await new Promise((resolve) => {
    const timeout = setTimeout(resolve, 4000);
    pc.addEventListener("icegatheringstatechange", () => {
      if (pc.iceGatheringState === "complete") {
        clearTimeout(timeout);
        resolve();
      }
    });
  });
}

async function waitForChannelBuffer(channel) {
  while (channel.bufferedAmount > MAX_BUFFERED_BYTES) {
    await sleep(30);
  }
}

function assertSignal(signal, kind) {
  if (signal.version !== SIGNAL_VERSION || signal.kind !== kind || !signal.description) {
    throw new Error("지원하지 않는 연결 코드입니다.");
  }
}

function encodeSignal(payload) {
  const bytes = new TextEncoder().encode(JSON.stringify(payload));
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function decodeSignal(value) {
  const normalized = value.trim().replace(/-/g, "+").replace(/_/g, "/");
  if (!normalized) {
    throw new Error("연결 코드를 입력해 주세요.");
  }
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes));
}

async function copyText(value, message) {
  if (!value.trim()) {
    logEvent("복사할 코드가 없습니다.", true);
    return;
  }
  await navigator.clipboard.writeText(value);
  logEvent(message);
}

async function pasteText(target) {
  target.value = await navigator.clipboard.readText();
  target.focus();
}

function formatBytes(bytes) {
  if (bytes === 0) {
    return "0 B";
  }
  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** index).toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

function percent(value, total) {
  if (!total) {
    return 0;
  }
  return (value / total) * 100;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

init();
