const { getCache } = require("@vercel/functions");
const { randomUUID } = require("crypto");

const ROOM_TTL_SECONDS = 45;
const MESSAGE_TTL_SECONDS = 90;
const DEVICE_STALE_MS = 30000;

const cache = getCache({ namespace: "oft-nearby" });
const memoryCache = globalThis.__oftNearbyMemoryCache || new Map();
globalThis.__oftNearbyMemoryCache = memoryCache;

module.exports = async function nearby(request, response) {
  response.setHeader("Access-Control-Allow-Origin", "*");
  response.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type");
  response.setHeader("Cache-Control", "no-store");

  if (request.method === "OPTIONS") {
    response.status(204).end();
    return;
  }

  if (request.method !== "POST") {
    response.status(405).json({ error: "POST만 지원합니다." });
    return;
  }

  try {
    const body = await readJson(request);
    const action = String(body.action || "");

    if (action === "heartbeat") {
      const result = await heartbeat(body);
      response.status(200).json(result);
      return;
    }

    if (action === "signal") {
      const result = await sendSignal(body);
      response.status(200).json(result);
      return;
    }

    if (action === "leave") {
      const result = await leaveRoom(body);
      response.status(200).json(result);
      return;
    }

    response.status(400).json({ error: "지원하지 않는 action입니다." });
  } catch (error) {
    response.status(500).json({ error: error instanceof Error ? error.message : String(error) });
  }
};

async function heartbeat(body) {
  const room = normalizeRoom(body.room);
  const device = normalizeDevice(body.device);
  const now = Date.now();
  const roomKey = keyRoom(room);
  const roomState = await readRoom(roomKey);

  roomState.devices[device.id] = {
    ...device,
    lastSeen: now,
  };
  pruneDevices(roomState, now);
  await writeRoom(roomKey, roomState);

  const inboxKey = keyInbox(room, device.id);
  const messages = await cacheGet(inboxKey) || [];
  await cacheDelete(inboxKey);

  return {
    ok: true,
    room,
    now,
    devices: Object.values(roomState.devices).sort((a, b) => b.lastSeen - a.lastSeen),
    messages,
  };
}

async function sendSignal(body) {
  const room = normalizeRoom(body.room);
  const from = normalizeDevice(body.from);
  const to = String(body.to || "").trim();
  const payload = body.payload;

  if (!to) {
    throw new Error("대상 디바이스가 없습니다.");
  }

  if (!payload || typeof payload !== "object") {
    throw new Error("payload가 없습니다.");
  }

  const inboxKey = keyInbox(room, to);
  const current = await cacheGet(inboxKey) || [];
  current.push({
    id: randomUUID(),
    room,
    from,
    to,
    payload,
    createdAt: Date.now(),
  });
  await cacheSet(inboxKey, current.slice(-20), {
    ttl: MESSAGE_TTL_SECONDS,
    tags: [`room:${room}`, `device:${to}`],
  });

  return { ok: true };
}

async function leaveRoom(body) {
  const room = normalizeRoom(body.room);
  const device = normalizeDevice(body.device);
  const roomKey = keyRoom(room);
  const roomState = await readRoom(roomKey);
  delete roomState.devices[device.id];
  await writeRoom(roomKey, roomState);
  return { ok: true };
}

async function readRoom(roomKey) {
  return await cacheGet(roomKey) || { devices: {} };
}

async function writeRoom(roomKey, roomState) {
  await cacheSet(roomKey, roomState, {
    ttl: ROOM_TTL_SECONDS,
    tags: [roomKey],
  });
}

async function cacheGet(key) {
  const memoryValue = readMemory(key);
  const runtimeValue = await cache.get(key);
  return runtimeValue === undefined ? memoryValue : runtimeValue;
}

async function cacheSet(key, value, options) {
  writeMemory(key, value, options.ttl);
  await cache.set(key, value, options);
}

async function cacheDelete(key) {
  memoryCache.delete(key);
  await cache.delete(key);
}

function readMemory(key) {
  const entry = memoryCache.get(key);
  if (!entry) {
    return undefined;
  }

  if (Date.now() > entry.expiresAt) {
    memoryCache.delete(key);
    return undefined;
  }

  return entry.value;
}

function writeMemory(key, value, ttlSeconds) {
  memoryCache.set(key, {
    value,
    expiresAt: Date.now() + ttlSeconds * 1000,
  });
}

function pruneDevices(roomState, now) {
  for (const [id, device] of Object.entries(roomState.devices)) {
    if (now - device.lastSeen > DEVICE_STALE_MS) {
      delete roomState.devices[id];
    }
  }
}

async function readJson(request) {
  if (Buffer.isBuffer(request.body)) {
    return JSON.parse(request.body.toString("utf8"));
  }

  if (typeof request.body === "string") {
    return request.body ? JSON.parse(request.body) : {};
  }

  if (request.body && typeof request.body === "object") {
    return request.body;
  }

  const chunks = [];
  for await (const chunk of request) {
    chunks.push(Buffer.from(chunk));
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}

function normalizeRoom(room) {
  const value = String(room || "").trim().toLowerCase().replace(/[^a-z0-9_-]/g, "");
  if (value.length < 3 || value.length > 32) {
    throw new Error("방 코드는 3~32자의 영문/숫자/_/-만 사용할 수 있습니다.");
  }
  return value;
}

function normalizeDevice(device) {
  if (!device || typeof device !== "object") {
    throw new Error("디바이스 정보가 없습니다.");
  }

  const id = String(device.id || "").trim();
  const name = String(device.name || "Web Device").trim().slice(0, 40);
  if (!id) {
    throw new Error("디바이스 ID가 없습니다.");
  }

  return { id, name };
}

function keyRoom(room) {
  return `room:${room}`;
}

function keyInbox(room, deviceId) {
  return `inbox:${room}:${deviceId}`;
}
