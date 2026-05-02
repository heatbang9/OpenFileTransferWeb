const SIGNAL_VERSION = "oft-web-mvp-v2";
const CHUNK_SIZE = 64 * 1024;
const MAX_BUFFERED_BYTES = 4 * 1024 * 1024;
const PBKDF2_ITERATIONS = 120000;
const ICE_SERVERS = [{ urls: "stun:stun.l.google.com:19302" }];

const $ = (id) => document.getElementById(id);

const elements = {
  connectionSummary: $("connectionSummary"),
  connectionState: $("connectionState"),
  deviceName: $("deviceName"),
  saveDeviceName: $("saveDeviceName"),
  deviceId: $("deviceId"),
  passphrase: $("passphrase"),
  senderMode: $("senderMode"),
  receiverMode: $("receiverMode"),
  resetConnection: $("resetConnection"),
  senderPanel: $("senderPanel"),
  receiverPanel: $("receiverPanel"),
  fileInput: $("fileInput"),
  dropZone: $("dropZone"),
  fileName: $("fileName"),
  fileSize: $("fileSize"),
  selectedFiles: $("selectedFiles"),
  offerCode: $("offerCode"),
  answerInput: $("answerInput"),
  offerInput: $("offerInput"),
  answerCode: $("answerCode"),
  offerQrCard: $("offerQrCard"),
  offerQr: $("offerQr"),
  answerQrCard: $("answerQrCard"),
  answerQr: $("answerQr"),
  createOffer: $("createOffer"),
  acceptAnswer: $("acceptAnswer"),
  createAnswer: $("createAnswer"),
  copyOffer: $("copyOffer"),
  copyAnswer: $("copyAnswer"),
  shareOffer: $("shareOffer"),
  shareAnswer: $("shareAnswer"),
  pasteOffer: $("pasteOffer"),
  pasteAnswer: $("pasteAnswer"),
  sendFile: $("sendFile"),
  cancelTransfer: $("cancelTransfer"),
  clearReceived: $("clearReceived"),
  receivedFiles: $("receivedFiles"),
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
  selectedFiles: [],
  activeReceive: null,
  receiveQueue: Promise.resolve(),
  connectedPeer: null,
  transferBusy: false,
  cancelRequested: false,
};

function init() {
  const device = loadDevice();
  elements.deviceName.value = device.name;
  elements.deviceId.textContent = device.id;
  bindEvents();
  renderMode();
  applySignalFromHash();
  renderSelectedFiles();
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
  elements.shareOffer.addEventListener("click", () => shareSignal("offer", elements.offerCode.value));
  elements.shareAnswer.addEventListener("click", () => shareSignal("answer", elements.answerCode.value));
  elements.pasteOffer.addEventListener("click", () => pasteText(elements.offerInput));
  elements.pasteAnswer.addEventListener("click", () => pasteText(elements.answerInput));
  elements.sendFile.addEventListener("click", sendSelectedFiles);
  elements.cancelTransfer.addEventListener("click", cancelTransfer);
  elements.clearReceived.addEventListener("click", clearReceivedFiles);

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
    addSelectedFiles([...event.dataTransfer.files]);
  });

  window.addEventListener("hashchange", applySignalFromHash);
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
  addSelectedFiles([...event.target.files]);
  event.target.value = "";
}

function addSelectedFiles(files) {
  if (files.length === 0) {
    return;
  }

  const keyed = new Set(state.selectedFiles.map((file) => fileKey(file)));
  for (const file of files) {
    if (!keyed.has(fileKey(file))) {
      state.selectedFiles.push(file);
      keyed.add(fileKey(file));
    }
  }
  renderSelectedFiles();
  updateSendButton();
}

function renderSelectedFiles() {
  elements.selectedFiles.innerHTML = "";

  const totalBytes = state.selectedFiles.reduce((sum, file) => sum + file.size, 0);
  elements.fileName.textContent = state.selectedFiles.length > 0 ? `${state.selectedFiles.length}개 파일 준비됨` : "파일 선택 또는 드롭";
  elements.fileSize.textContent = state.selectedFiles.length > 0 ? formatBytes(totalBytes) : "선택된 파일 0개";
  elements.senderReady.textContent = state.selectedFiles.length > 0 ? "파일 선택됨" : "준비 전";

  state.selectedFiles.forEach((file, index) => {
    const item = document.createElement("li");
    const info = document.createElement("span");
    const name = document.createElement("strong");
    const size = document.createElement("small");
    const remove = document.createElement("button");

    name.textContent = file.name;
    size.textContent = formatBytes(file.size);
    info.append(name, document.createElement("br"), size);
    remove.className = "text-button";
    remove.type = "button";
    remove.textContent = "제거";
    remove.addEventListener("click", () => {
      state.selectedFiles.splice(index, 1);
      renderSelectedFiles();
      updateSendButton();
    });

    item.append(info, remove);
    elements.selectedFiles.append(item);
  });
}

async function createSenderOffer() {
  try {
    resetConnection(false);
    state.role = "sender";
    renderMode();
    state.pc = createPeerConnection();
    state.channel = state.pc.createDataChannel("oft-file-v2", { ordered: true });
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
    renderQr(elements.offerQr, elements.offerQrCard, signalLink("offer", elements.offerCode.value));

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
    renderQr(elements.answerQr, elements.answerQrCard, elements.answerCode.value);

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

async function sendSelectedFiles() {
  if (state.selectedFiles.length === 0 || !isChannelOpen()) {
    return;
  }

  state.transferBusy = true;
  state.cancelRequested = false;
  updateSendButton();
  setProgress(0);

  try {
    const totalBytes = state.selectedFiles.reduce((sum, file) => sum + file.size, 0);
    let batchSent = 0;

    for (const file of state.selectedFiles) {
      if (state.cancelRequested) {
        break;
      }
      const sent = await sendOneFile(file, batchSent, totalBytes);
      batchSent += sent;
    }

    state.channel.send(JSON.stringify({ kind: "batchDone", count: state.selectedFiles.length }));
    if (state.cancelRequested) {
      logEvent("전송을 중지했습니다.", true);
    } else {
      setProgress(100);
      logEvent(`${state.selectedFiles.length}개 파일 전송 완료`);
    }
  } catch (error) {
    handleError(error);
  } finally {
    state.transferBusy = false;
    state.cancelRequested = false;
    updateSendButton();
  }
}

async function sendOneFile(file, batchSent, totalBytes) {
  const passphrase = elements.passphrase.value;
  const encrypted = passphrase.length > 0;
  const cryptoContext = encrypted ? await createEncryptContext(passphrase) : null;
  const id = crypto.randomUUID();

  state.channel.send(JSON.stringify({
    kind: "meta",
    id,
    name: file.name,
    size: file.size,
    type: file.type || "application/octet-stream",
    updatedAt: file.lastModified,
    encrypted,
    salt: cryptoContext ? bytesToBase64Url(cryptoContext.salt) : null,
    noncePrefix: cryptoContext ? bytesToBase64Url(cryptoContext.noncePrefix) : null,
  }));

  logEvent(`${file.name} 전송 시작`);
  const reader = file.stream().getReader();
  let fileSent = 0;
  let sequence = 0;

  while (true) {
    if (state.cancelRequested) {
      throw new Error("전송 중지 요청");
    }

    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    for (let offset = 0; offset < value.byteLength; offset += CHUNK_SIZE) {
      if (state.cancelRequested) {
        throw new Error("전송 중지 요청");
      }

      const plainChunk = value.slice(offset, offset + CHUNK_SIZE);
      const outbound = cryptoContext
        ? await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonceForSequence(cryptoContext.noncePrefix, sequence) }, cryptoContext.key, plainChunk)
        : plainChunk;

      await waitForChannelBuffer(state.channel);
      state.channel.send(outbound);
      sequence += 1;
      fileSent += plainChunk.byteLength;
      setProgress(percent(batchSent + fileSent, totalBytes));
    }
  }

  state.channel.send(JSON.stringify({ kind: "done", id }));
  logEvent(`${file.name} 전송 완료`);
  return fileSent;
}

function cancelTransfer() {
  state.cancelRequested = true;
  elements.cancelTransfer.disabled = true;
}

function receiveMessage(event) {
  if (typeof event.data === "string") {
    state.receiveQueue = state.receiveQueue.then(() => handleTextMessage(event.data)).catch(handleError);
    return;
  }

  if (event.data instanceof ArrayBuffer) {
    state.receiveQueue = state.receiveQueue.then(() => handleBinaryMessage(event.data)).catch(handleError);
  }
}

async function handleTextMessage(raw) {
  const message = JSON.parse(raw);
  if (message.kind === "meta") {
    await startReceive(message);
    return;
  }

  if (message.kind === "done") {
    finishReceive(message.id);
    return;
  }

  if (message.kind === "batchDone") {
    logEvent("상대 전송 큐가 완료되었습니다.");
  }
}

async function startReceive(meta) {
  let key = null;
  let noncePrefix = null;
  if (meta.encrypted) {
    const passphrase = elements.passphrase.value;
    if (!passphrase) {
      throw new Error("암호화된 파일입니다. 같은 전송 암호를 입력한 뒤 다시 연결해 주세요.");
    }
    noncePrefix = base64UrlToBytes(meta.noncePrefix);
    key = await deriveAesKey(passphrase, base64UrlToBytes(meta.salt));
  }

  state.activeReceive = {
    meta,
    buffers: [],
    bytes: 0,
    key,
    noncePrefix,
    sequence: 0,
  };
  setProgress(0);
  logEvent(`${meta.name} 수신 시작`);
}

async function handleBinaryMessage(buffer) {
  const active = state.activeReceive;
  if (!active) {
    throw new Error("수신 메타데이터 없이 파일 청크를 받았습니다.");
  }

  const plain = active.key
    ? await crypto.subtle.decrypt({ name: "AES-GCM", iv: nonceForSequence(active.noncePrefix, active.sequence) }, active.key, buffer)
    : buffer;

  active.sequence += 1;
  active.buffers.push(plain);
  active.bytes += plain.byteLength;
  setProgress(percent(active.bytes, active.meta.size));
}

function finishReceive(id) {
  const active = state.activeReceive;
  if (!active || active.meta.id !== id) {
    return;
  }

  const blob = new Blob(active.buffers, { type: active.meta.type });
  const url = URL.createObjectURL(blob);
  addReceivedFile(active.meta, url);
  setProgress(100);
  logEvent(`${active.meta.name} 수신 완료`);
  state.activeReceive = null;
}

function addReceivedFile(meta, url) {
  const item = document.createElement("li");
  const info = document.createElement("span");
  const name = document.createElement("strong");
  const size = document.createElement("small");
  const download = document.createElement("a");

  name.textContent = meta.name;
  size.textContent = `${formatBytes(meta.size)}${meta.encrypted ? " · 암호화됨" : ""}`;
  info.append(name, document.createElement("br"), size);
  download.className = "download-button";
  download.href = url;
  download.download = meta.name;
  download.textContent = "저장";

  item.append(info, download);
  elements.receivedFiles.prepend(item);
}

function clearReceivedFiles() {
  for (const link of elements.receivedFiles.querySelectorAll("a[href^='blob:']")) {
    URL.revokeObjectURL(link.href);
  }
  elements.receivedFiles.innerHTML = "";
  logEvent("받은 파일 목록을 비웠습니다.");
}

function updateSendButton() {
  const channelOpen = isChannelOpen();
  elements.sendFile.disabled = state.selectedFiles.length === 0 || !channelOpen || state.transferBusy;
  elements.cancelTransfer.disabled = !state.transferBusy;
}

function resetConnection(clearSignals = true) {
  state.channel?.close();
  state.pc?.close();
  state.pc = null;
  state.channel = null;
  state.connectedPeer = null;
  state.activeReceive = null;
  state.receiveQueue = Promise.resolve();
  state.transferBusy = false;
  state.cancelRequested = false;

  if (clearSignals) {
    elements.offerCode.value = "";
    elements.answerCode.value = "";
    elements.offerInput.value = "";
    elements.answerInput.value = "";
    hideQr();
  }

  elements.senderReady.textContent = state.selectedFiles.length > 0 ? "파일 선택됨" : "준비 전";
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
  logEvent(message, message !== "전송 중지 요청");
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
  return bytesToBase64Url(bytes);
}

function decodeSignal(value) {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error("연결 코드를 입력해 주세요.");
  }
  const bytes = base64UrlToBytes(trimmed);
  return JSON.parse(new TextDecoder().decode(bytes));
}

async function copyText(value, message) {
  if (!value.trim()) {
    logEvent("복사할 코드가 없습니다.", true);
    return;
  }

  try {
    await navigator.clipboard.writeText(value);
  } catch {
    fallbackCopy(value);
  }
  logEvent(message);
}

async function pasteText(target) {
  target.value = await navigator.clipboard.readText();
  target.focus();
}

async function shareSignal(kind, code) {
  if (!code.trim()) {
    logEvent("공유할 코드가 없습니다.", true);
    return;
  }

  const label = kind === "offer" ? "초대 코드" : "응답 코드";
  const link = signalLink(kind, code);
  const text = `${label}\n${code}`;

  if (navigator.share) {
    await navigator.share({
      title: `OpenFileTransfer ${label}`,
      text,
      url: kind === "offer" ? link : undefined,
    });
    logEvent(`${label}를 공유했습니다.`);
    return;
  }

  await copyText(kind === "offer" ? link : code, `${label}를 복사했습니다.`);
}

function applySignalFromHash() {
  const hash = window.location.hash.slice(1);
  if (!hash) {
    return;
  }

  const params = new URLSearchParams(hash);
  const offer = params.get("offer");
  const answer = params.get("answer");

  if (offer) {
    setMode("receiver");
    elements.offerInput.value = offer;
    logEvent("링크에서 초대 코드를 불러왔습니다.");
  }

  if (answer) {
    setMode("sender");
    elements.answerInput.value = answer;
    logEvent("링크에서 응답 코드를 불러왔습니다.");
  }
}

function signalLink(kind, code) {
  const url = new URL(window.location.href);
  url.hash = `${kind}=${encodeURIComponent(code)}`;
  return url.toString();
}

function renderQr(canvas, card, text) {
  if (!window.QrCreator || !text) {
    return;
  }

  const context = canvas.getContext("2d");
  context.clearRect(0, 0, canvas.width, canvas.height);
  window.QrCreator.render({
    text,
    radius: 0.45,
    ecLevel: "M",
    fill: "#176A63",
    background: "#FFFFFF",
    size: 220,
  }, canvas);
  card.classList.remove("hidden");
}

function hideQr() {
  elements.offerQrCard.classList.add("hidden");
  elements.answerQrCard.classList.add("hidden");
}

async function createEncryptContext(passphrase) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const noncePrefix = crypto.getRandomValues(new Uint8Array(8));
  const key = await deriveAesKey(passphrase, salt);
  return { key, salt, noncePrefix };
}

async function deriveAesKey(passphrase, salt) {
  const material = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(passphrase),
    "PBKDF2",
    false,
    ["deriveKey"],
  );

  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt,
      iterations: PBKDF2_ITERATIONS,
      hash: "SHA-256",
    },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

function nonceForSequence(prefix, sequence) {
  const nonce = new Uint8Array(12);
  nonce.set(prefix, 0);
  const view = new DataView(nonce.buffer);
  view.setUint32(8, sequence, false);
  return nonce;
}

function bytesToBase64Url(bytes) {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlToBytes(value) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function fallbackCopy(value) {
  const area = document.createElement("textarea");
  area.value = value;
  area.style.position = "fixed";
  area.style.inset = "0 auto auto 0";
  area.style.opacity = "0";
  document.body.append(area);
  area.select();
  document.execCommand("copy");
  area.remove();
}

function isChannelOpen() {
  return state.channel?.readyState === "open";
}

function fileKey(file) {
  return `${file.name}:${file.size}:${file.lastModified}`;
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
