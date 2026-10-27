// server.js - RoWorld Zero-Dependency Local Multiplayer Game Server
// Operates 100% offline. Zero npm packages needed. Pure Node.js.

const http = require('node:http');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

// Import Map Definition
const { PROVINCES, CONTINENTS, areNeighbors, areSeaConnected } = require('./public/mapData.js');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');

// MIME Types
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

// ---------------------------------------------------------------------------
// Local IP Detection
// ---------------------------------------------------------------------------
function getLocalIPAddresses() {
  const interfaces = os.networkInterfaces();
  const ips = [];
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        ips.push({ name, ip: iface.address });
      }
    }
  }
  return ips;
}

// ---------------------------------------------------------------------------
// Lightweight RFC 6455 WebSocket Implementation
// ---------------------------------------------------------------------------
class WSClient {
  constructor(socket, req) {
    this.socket = socket;
    this.req = req;
    this.isAlive = true;
    this.buffer = Buffer.alloc(0);

    this.onMessage = null;
    this.onClose = null;

    this.socket.on('data', chunk => this.handleData(chunk));
    this.socket.on('close', () => this.handleClose());
    this.socket.on('error', () => this.handleClose());
  }

  handleData(chunk) {
    this.buffer = Buffer.concat([this.buffer, chunk]);

    while (this.buffer.length >= 2) {
      const firstByte = this.buffer[0];
      const secondByte = this.buffer[1];

      const fin = (firstByte & 0x80) !== 0;
      const opcode = firstByte & 0x0f;
      const isMasked = (secondByte & 0x80) !== 0;
      let payloadLength = secondByte & 0x7f;
      let headerSize = 2;

      if (payloadLength === 126) {
        if (this.buffer.length < 4) return;
        payloadLength = this.buffer.readUInt16BE(2);
        headerSize = 4;
      } else if (payloadLength === 127) {
        if (this.buffer.length < 10) return;
        payloadLength = Number(this.buffer.readBigUInt64BE(2));
        headerSize = 10;
      }

      const maskSize = isMasked ? 4 : 0;
      const totalFrameSize = headerSize + maskSize + payloadLength;

      if (this.buffer.length < totalFrameSize) {
        return; // Wait for full frame
      }

      let payload = this.buffer.slice(headerSize + maskSize, totalFrameSize);

      if (isMasked) {
        const maskKey = this.buffer.slice(headerSize, headerSize + 4);
        const unmasked = Buffer.alloc(payload.length);
        for (let i = 0; i < payload.length; i++) {
          unmasked[i] = payload[i] ^ maskKey[i % 4];
        }
        payload = unmasked;
      }

      this.buffer = this.buffer.slice(totalFrameSize);

      // Handle Opcode
      if (opcode === 0x08) {
        // Close frame
        this.socket.end();
        this.handleClose();
        return;
      } else if (opcode === 0x09) {
        // Ping -> respond with Pong
        this.sendRaw(payload, 0x0a);
      } else if (opcode === 0x0a) {
        // Pong
        this.isAlive = true;
      } else if (opcode === 0x01 || opcode === 0x02) {
        // Text or Binary
        const text = payload.toString('utf8');
        if (this.onMessage) {
          try {
            const data = JSON.parse(text);
            this.onMessage(data);
          } catch (e) {
            console.error('WS JSON parse error:', e.message);
          }
        }
      }
    }
  }

  send(data) {
    const text = typeof data === 'string' ? data : JSON.stringify(data);
    const payload = Buffer.from(text, 'utf8');
    this.sendRaw(payload, 0x01);
  }

  sendRaw(payload, opcode) {
    if (this.socket.destroyed) return;
    const length = payload.length;
    let header;

    if (length < 126) {
      header = Buffer.alloc(2);
      header[0] = 0x80 | opcode;
      header[1] = length; // Unmasked
    } else if (length < 65536) {
      header = Buffer.alloc(4);
      header[0] = 0x80 | opcode;
      header[1] = 126;
      header.writeUInt16BE(length, 2);
    } else {
      header = Buffer.alloc(10);
      header[0] = 0x80 | opcode;
      header[1] = 127;
      header.writeBigUInt64BE(BigInt(length), 2);
    }

    try {
      this.socket.write(Buffer.concat([header, payload]));
    } catch (e) {
      this.handleClose();
    }
  }

  handleClose() {
    if (!this.closed) {
      this.closed = true;
      if (this.onClose) this.onClose();
    }
  }
}

// ---------------------------------------------------------------------------
// RoWorld Game Engine
// ---------------------------------------------------------------------------
const PLAYER_COLORS = [
  { id: 'crimson', name: 'Kızıl İmparatorluk', hex: '#ef4444' },
  { id: 'azure', name: 'Mavi Federasyon', hex: '#3b82f6' },
  { id: 'emerald', name: 'Zümrüt Cumhuriyeti', hex: '#10b981' },
  { id: 'gold', name: 'Altın Hanedanlık', hex: '#f59e0b' },
  { id: 'amethyst', name: 'Mor Birlik', hex: '#8b5cf6' },
  { id: 'cyan', name: 'Siyan Koalisyonu', hex: '#06b6d4' },
  { id: 'coral', name: 'Mercan Devleti', hex: '#fb7185' },
  { id: 'lime', name: 'Yeşil Lejyon', hex: '#84cc16' }
];

const BUILD_COSTS = {
  city: 150,     // +2 Asker/tick
  factory: 200,  // +$15 Altın/tick
  port: 250,     // Deniz aşırı intikal + $10 Altın/tick
  fort: 120,     // Savunmada +%50 direnç
  nuke: 1000     // Bölgeyi ve komşularını yok eder
};

class GameRoom {
  constructor(roomId) {
    this.roomId = roomId;
    this.players = new Map(); // id -> { id, name, color, ws, isBot, gold, ready, nukesReady }
    this.state = 'WAITING';   // 'WAITING', 'PLAYING', 'ENDED'
    this.provinces = {};      // id -> { id, ownerId, troops, buildings: { city, factory, port, fort } }
    this.marchers = [];       // array of { id, fromId, toId, ownerId, troops, progress, totalSteps }
    this.nukes = [];          // array of { id, fromId, toId, ownerId, progress, totalSteps }
    this.alliances = new Map(); // 'p1:p2' -> true
    this.tickTimer = null;
    this.winner = null;
    this.marchCounter = 0;
    this.nukeCounter = 0;
    this.chatLog = [];

    this.initMap();
  }

  initMap() {
    this.provinces = {};
    for (const p of PROVINCES) {
      this.provinces[p.id] = {
        id: p.id,
        ownerId: null, // Neutral
        troops: Math.floor(Math.random() * 8) + 12, // 12-20 neutral defenders
        buildings: {
          city: 0,
          factory: 0,
          port: p.seaLanes.length > 0 ? 1 : 0, // Natural port regions
          fort: 0
        }
      };
    }
  }

  addPlayer(id, name, ws, isBot = false) {
    // Pick first unused color
    const usedColors = new Set([...this.players.values()].map(p => p.color.id));
    const availableColor = PLAYER_COLORS.find(c => !usedColors.has(c.id)) || PLAYER_COLORS[0];

    const player = {
      id,
      name: name || (isBot ? 'Yapay Zeka ' + (this.players.size + 1) : 'Komutan ' + (this.players.size + 1)),
      color: availableColor,
      ws,
      isBot,
      gold: 300,
      ready: isBot, // Bots are always ready
      nukeCooldown: 0
    };

    this.players.set(id, player);
    this.broadcastLobby();
    return player;
  }

  removePlayer(id) {
    const player = this.players.get(id);
    if (!player) return;

    this.players.delete(id);

    if (this.state === 'PLAYING') {
      // Turn remaining player territories into neutral rebels
      for (const p of Object.values(this.provinces)) {
        if (p.ownerId === id) {
          p.ownerId = null;
        }
      }
      this.broadcastState();
    } else {
      this.broadcastLobby();
    }
  }

  startGame() {
    if (this.players.size === 0) return;
    this.state = 'PLAYING';
    this.initMap();

    // Distribute starting territories fairly
    const provinceList = Object.values(this.provinces);
    // Shuffle provinces
    provinceList.sort(() => Math.random() - 0.5);

    const playerList = [...this.players.values()];
    const perPlayer = Math.min(3, Math.floor(provinceList.length / (playerList.length + 1)));

    let pIdx = 0;
    for (const player of playerList) {
      player.gold = 350;
      for (let i = 0; i < perPlayer; i++) {
        const prov = provinceList[pIdx++];
        if (prov) {
          prov.ownerId = player.id;
          prov.troops = 35; // Starting garrison
          prov.buildings.city = 1;
          prov.buildings.factory = 1;
        }
      }
    }

    // Start 500ms Game Loop
    if (this.tickTimer) clearInterval(this.tickTimer);
    this.tickTimer = setInterval(() => this.tick(), 500);

    this.broadcast({
      type: 'GAME_STARTED',
      room: this.serialize()
    });
  }

  tick() {
    if (this.state !== 'PLAYING') return;

    // 1. Economy & Troop Generation Ticks
    for (const p of Object.values(this.provinces)) {
      if (p.ownerId) {
        const owner = this.players.get(p.ownerId);
        if (owner) {
          // Factory income
          if (p.buildings.factory > 0) {
            owner.gold += p.buildings.factory * 4;
          }
          // Port income
          if (p.buildings.port > 0) {
            owner.gold += 3;
          }
          // Basic province tax
          owner.gold += 1;

          // City troop generation (every tick slight chance or fractional accumulator)
          const growth = 1 + (p.buildings.city * 2);
          if (Math.random() < 0.6) {
            p.troops += growth;
          }
        }
      } else {
        // Neutral slow passive growth up to 30
        if (p.troops < 30 && Math.random() < 0.15) {
          p.troops += 1;
        }
      }
    }

    // 2. Marching Armies Movement & Combat
    const remainingMarchers = [];
    for (const m of this.marchers) {
      m.progress += 1;
      if (m.progress >= m.totalSteps) {
        // Arrival & Battle Resolution!
        this.resolveCombat(m);
      } else {
        remainingMarchers.push(m);
      }
    }
    this.marchers = remainingMarchers;

    // 3. Nukes Movement & Blast Resolution
    const remainingNukes = [];
    for (const n of this.nukes) {
      n.progress += 1;
      if (n.progress >= n.totalSteps) {
        this.resolveNuke(n);
      } else {
        remainingNukes.push(n);
      }
    }
    this.nukes = remainingNukes;

    // 4. AI Bot Actions
    this.processAITurns();

    // 5. Check Victory Conditions
    this.checkVictory();

    // 6. Broadcast Delta
    this.broadcastState();
  }

  sendTroops(playerId, fromId, toId, percentage) {
    if (this.state !== 'PLAYING') return { success: false, reason: 'Oyun henüz başlamadı' };
    const fromP = this.provinces[fromId];
    const toP = this.provinces[toId];

    if (!fromP || !toP) return { success: false, reason: 'Geçersiz bölge' };
    if (fromP.ownerId !== playerId) return { success: false, reason: 'Bu bölge sana ait değil' };

    // Check connectivity
    const isLand = areNeighbors(fromId, toId);
    const isSea = areSeaConnected(fromId, toId) && fromP.buildings.port > 0;

    if (!isLand && !isSea) {
      return { success: false, reason: 'Bölgeler bağlantılı değil veya liman eksik!' };
    }

    // Calculate troops
    const available = Math.max(0, fromP.troops - 2); // Leave at least 2 guards
    const sendCount = Math.floor(available * (percentage / 100));

    if (sendCount <= 0) return { success: false, reason: 'Yetersiz asker' };

    fromP.troops -= sendCount;

    // Create marching unit
    this.marchCounter++;
    this.marchers.push({
      id: 'm_' + this.marchCounter,
      fromId,
      toId,
      ownerId: playerId,
      troops: sendCount,
      progress: 0,
      totalSteps: isSea ? 8 : 5 // Sea lanes take slightly longer
    });

    return { success: true };
  }

  resolveCombat(m) {
    const dest = this.provinces[m.toId];
    if (!dest) return;

    // If destination belongs to same player: Transfer reinforcement!
    if (dest.ownerId === m.ownerId) {
      dest.troops += m.troops;
      return;
    }

    // Check alliance
    if (dest.ownerId && this.areAllies(m.ownerId, dest.ownerId)) {
      // Cannot attack ally! Troops return or stay as garrison
      dest.troops += m.troops;
      return;
    }

    // Hostile Combat Resolution
    // Fort gives +50% defense power
    const defenseMultiplier = dest.buildings.fort > 0 ? 1.5 : 1.0;
    const effectiveDefense = dest.troops * defenseMultiplier;

    // Dice variance factor (0.85 - 1.15)
    const attackRoll = m.troops * (0.85 + Math.random() * 0.3);
    const defenseRoll = effectiveDefense * (0.85 + Math.random() * 0.3);

    if (attackRoll > defenseRoll) {
      // Attacker Wins! Territory Conquered!
      const casualtiesRatio = defenseRoll / (attackRoll + 0.1);
      const remainingTroops = Math.max(1, Math.round(m.troops * (1 - casualtiesRatio * 0.6)));

      dest.ownerId = m.ownerId;
      dest.troops = remainingTroops;

      // Damage fort on conquest
      if (dest.buildings.fort > 0) dest.buildings.fort = 0;

      // Broadcast battle event
      this.broadcastEvent({
        type: 'TERRITORY_CONQUERED',
        provinceId: dest.id,
        newOwnerId: m.ownerId,
        conquerorName: this.players.get(m.ownerId)?.name || 'Bilinmeyen'
      });
    } else {
      // Defender Holds!
      const attackCasualties = attackRoll / (defenseRoll + 0.1);
      const remainingDefenders = Math.max(1, Math.round(dest.troops * (1 - attackCasualties * 0.6)));
      dest.troops = remainingDefenders;
    }
  }

  buildStructure(playerId, provinceId, structureType) {
    if (this.state !== 'PLAYING') return { success: false, reason: 'Oyun devam etmiyor' };
    const player = this.players.get(playerId);
    const p = this.provinces[provinceId];

    if (!player || !p) return { success: false, reason: 'Geçersiz parametre' };
    if (p.ownerId !== playerId) return { success: false, reason: 'Bölge senin kontrolünde değil' };

    const cost = BUILD_COSTS[structureType];
    if (!cost) return { success: false, reason: 'Geçersiz yapı tipi' };
    if (player.gold < cost) return { success: false, reason: 'Yetersiz altın ($' + cost + ' gerekli)' };

    // Limits
    if (structureType === 'city' && p.buildings.city >= 3) {
      return { success: false, reason: 'Şehir seviyesi maksimumda (Seviye 3)' };
    }
    if (structureType === 'factory' && p.buildings.factory >= 2) {
      return { success: false, reason: 'Fabrika limiti dolu' };
    }
    if (structureType === 'port') {
      const def = PROVINCES.find(pr => pr.id === provinceId);
      if (!def || def.seaLanes.length === 0) {
        return { success: false, reason: 'Bu bölgenin denize kıyısı yok!' };
      }
      if (p.buildings.port >= 1) return { success: false, reason: 'Liman zaten var' };
    }
    if (structureType === 'fort' && p.buildings.fort >= 1) {
      return { success: false, reason: 'Tahkimat zaten mevcut' };
    }

    // Deduct cost and apply
    player.gold -= cost;
    p.buildings[structureType] = (p.buildings[structureType] || 0) + 1;

    return { success: true };
  }

  launchNuke(playerId, fromId, toId) {
    if (this.state !== 'PLAYING') return { success: false, reason: 'Oyun devam etmiyor' };
    const player = this.players.get(playerId);
    const fromP = this.provinces[fromId];
    const toP = this.provinces[toId];

    if (!player || !fromP || !toP) return { success: false, reason: 'Geçersiz bölge' };
    if (fromP.ownerId !== playerId) return { success: false, reason: 'Fırlatma üssü senin değil' };
    if (player.gold < BUILD_COSTS.nuke) return { success: false, reason: 'Yetersiz bütçe ($1000 Altın gerekli)' };

    player.gold -= BUILD_COSTS.nuke;

    this.nukeCounter++;
    this.nukes.push({
      id: 'n_' + this.nukeCounter,
      fromId,
      toId,
      ownerId: playerId,
      progress: 0,
      totalSteps: 12 // 6 seconds flight time
    });

    this.broadcastEvent({
      type: 'NUKE_LAUNCHED',
      fromId,
      toId,
      launcherName: player.name
    });

    return { success: true };
  }

  resolveNuke(nuke) {
    const target = this.provinces[nuke.toId];
    if (!target) return;

    // Ground Zero devastation: 85% troop death, destroy buildings
    target.troops = Math.max(1, Math.floor(target.troops * 0.15));
    target.buildings.city = 0;
    target.buildings.factory = 0;
    target.buildings.fort = 0;

    // Blast wave hits neighbors
    const targetDef = PROVINCES.find(p => p.id === nuke.toId);
    if (targetDef) {
      for (const nId of targetDef.neighbors) {
        const neighbor = this.provinces[nId];
        if (neighbor) {
          neighbor.troops = Math.max(1, Math.floor(neighbor.troops * 0.6));
        }
      }
    }

    this.broadcastEvent({
      type: 'NUKE_DETONATION',
      targetId: nuke.toId,
      launcherId: nuke.ownerId
    });
  }

  processAITurns() {
    for (const player of this.players.values()) {
      if (!player.isBot) continue;

      // 1. Build infrastructure if rich
      if (player.gold >= 400 && Math.random() < 0.3) {
        const owned = Object.values(this.provinces).filter(p => p.ownerId === player.id);
        if (owned.length > 0) {
          const targetP = owned[Math.floor(Math.random() * owned.length)];
          if (targetP.buildings.city < 2) {
            this.buildStructure(player.id, targetP.id, 'city');
          } else if (targetP.buildings.factory < 1) {
            this.buildStructure(player.id, targetP.id, 'factory');
          }
        }
      }

      // 2. Launch Attack
      if (Math.random() < 0.25) {
        const owned = Object.values(this.provinces).filter(p => p.ownerId === player.id && p.troops >= 20);
        if (owned.length === 0) continue;

        const source = owned[Math.floor(Math.random() * owned.length)];
        const sourceDef = PROVINCES.find(p => p.id === source.id);
        if (!sourceDef) continue;

        // Find weakest neighbor
        const targets = [...sourceDef.neighbors, ...(source.buildings.port > 0 ? sourceDef.seaLanes : [])];
        let bestTarget = null;
        let minTroops = Infinity;

        for (const tId of targets) {
          const tP = this.provinces[tId];
          if (tP && tP.ownerId !== player.id && !this.areAllies(player.id, tP.ownerId)) {
            if (tP.troops < minTroops) {
              minTroops = tP.troops;
              bestTarget = tId;
            }
          }
        }

        if (bestTarget && source.troops > minTroops * 1.1) {
          this.sendTroops(player.id, source.id, bestTarget, 60);
        }
      }
    }
  }

  areAllies(p1, p2) {
    if (p1 === p2) return true;
    const key1 = `${p1}:${p2}`;
    const key2 = `${p2}:${p1}`;
    return this.alliances.has(key1) || this.alliances.has(key2);
  }

  toggleAlliance(p1, p2) {
    const key1 = `${p1}:${p2}`;
    const key2 = `${p2}:${p1}`;
    if (this.alliances.has(key1) || this.alliances.has(key2)) {
      this.alliances.delete(key1);
      this.alliances.delete(key2);
      return false; // Broken
    } else {
      this.alliances.set(key1, true);
      return true; // Formed
    }
  }

  checkVictory() {
    const totalCount = PROVINCES.length;
    const counts = {};

    for (const p of Object.values(this.provinces)) {
      if (p.ownerId) {
        counts[p.ownerId] = (counts[p.ownerId] || 0) + 1;
      }
    }

    for (const [pId, count] of Object.entries(counts)) {
      const ratio = count / totalCount;
      if (ratio >= 0.75) { // 75%+ world dominance
        this.state = 'ENDED';
        this.winner = this.players.get(pId) || { name: 'Bilinmeyen Fatih' };
        if (this.tickTimer) clearInterval(this.tickTimer);

        this.broadcast({
          type: 'GAME_OVER',
          winner: {
            id: pId,
            name: this.winner.name,
            color: this.winner.color,
            percentage: Math.round(ratio * 100)
          }
        });
        break;
      }
    }
  }

  broadcast(message) {
    const text = JSON.stringify(message);
    for (const p of this.players.values()) {
      if (p.ws && !p.isBot) {
        p.ws.send(text);
      }
    }
  }

  broadcastLobby() {
    this.broadcast({
      type: 'LOBBY_UPDATE',
      roomId: this.roomId,
      state: this.state,
      players: [...this.players.values()].map(p => ({
        id: p.id,
        name: p.name,
        color: p.color,
        isBot: p.isBot,
        ready: p.ready
      }))
    });
  }

  broadcastState() {
    const statePayload = {
      type: 'STATE_UPDATE',
      state: this.state,
      provinces: this.provinces,
      marchers: this.marchers,
      nukes: this.nukes,
      players: [...this.players.values()].map(p => ({
        id: p.id,
        name: p.name,
        color: p.color,
        gold: p.gold,
        territories: Object.values(this.provinces).filter(pr => pr.ownerId === p.id).length
      }))
    };
    this.broadcast(statePayload);
  }

  broadcastEvent(eventData) {
    this.broadcast({
      type: 'GAME_EVENT',
      event: eventData
    });
  }

  serialize() {
    return {
      roomId: this.roomId,
      state: this.state,
      players: [...this.players.values()].map(p => ({
        id: p.id,
        name: p.name,
        color: p.color,
        gold: p.gold
      })),
      provinces: this.provinces,
      marchers: this.marchers,
      nukes: this.nukes
    };
  }
}

// Room Registry
const rooms = new Map();

function getOrCreateRoom(roomId) {
  const cleanId = (roomId || 'DUNYA').toUpperCase().trim();
  if (!rooms.has(cleanId)) {
    rooms.set(cleanId, new GameRoom(cleanId));
  }
  return rooms.get(cleanId);
}

// ---------------------------------------------------------------------------
// HTTP Static Server & API
// ---------------------------------------------------------------------------
const server = http.createServer((req, res) => {
  // CORS Headers for seamless local LAN access
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = parsedUrl.pathname;

  // API: Get Server Status & IPs
  if (pathname === '/api/info') {
    const ips = getLocalIPAddresses();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'ONLINE',
      port: PORT,
      ips,
      activeRooms: rooms.size
    }));
    return;
  }

  // Static File Serving
  let filePath = path.join(PUBLIC_DIR, pathname === '/' ? 'index.html' : pathname);

  // Security: Prevent directory traversal
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    res.end('Access Denied');
    return;
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      // Fallback to index.html for SPA routing
      filePath = path.join(PUBLIC_DIR, 'index.html');
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    fs.readFile(filePath, (readErr, content) => {
      if (readErr) {
        res.writeHead(500);
        res.end('Internal Server Error');
        return;
      }
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content);
    });
  });
});

// ---------------------------------------------------------------------------
// WebSocket Handshake & Routing
// ---------------------------------------------------------------------------
server.on('upgrade', (req, socket, head) => {
  if (req.headers['upgrade'] !== 'websocket') {
    socket.destroy();
    return;
  }

  const key = req.headers['sec-websocket-key'];
  if (!key) {
    socket.destroy();
    return;
  }

  const acceptKey = crypto
    .createHash('sha1')
    .update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11')
    .digest('base64');

  const headers = [
    'HTTP/1.1 101 Switching Protocols',
    'Upgrade: websocket',
    'Connection: Upgrade',
    `Sec-WebSocket-Accept: ${acceptKey}`
  ];

  socket.write(headers.join('\r\n') + '\r\n\r\n');

  const ws = new WSClient(socket, req);
  let currentRoom = null;
  let currentPlayerId = null;

  ws.onMessage = data => {
    switch (data.type) {
      case 'JOIN_ROOM': {
        const { roomId, playerName } = data;
        currentRoom = getOrCreateRoom(roomId);
        currentPlayerId = 'p_' + Math.random().toString(36).substring(2, 9);
        const player = currentRoom.addPlayer(currentPlayerId, playerName, ws, false);

        ws.send({
          type: 'JOINED_SUCCESS',
          playerId: currentPlayerId,
          player,
          room: currentRoom.serialize()
        });
        break;
      }

      case 'ADD_BOT': {
        if (!currentRoom) return;
        const botId = 'bot_' + Math.random().toString(36).substring(2, 7);
        currentRoom.addPlayer(botId, null, null, true);
        break;
      }

      case 'START_GAME': {
        if (!currentRoom) return;
        currentRoom.startGame();
        break;
      }

      case 'SEND_TROOPS': {
        if (!currentRoom || !currentPlayerId) return;
        const { fromId, toId, percentage } = data;
        const result = currentRoom.sendTroops(currentPlayerId, fromId, toId, percentage || 50);
        if (!result.success) {
          ws.send({ type: 'ACTION_FAILED', reason: result.reason });
        }
        break;
      }

      case 'BUILD': {
        if (!currentRoom || !currentPlayerId) return;
        const { provinceId, structureType } = data;
        const result = currentRoom.buildStructure(currentPlayerId, provinceId, structureType);
        if (!result.success) {
          ws.send({ type: 'ACTION_FAILED', reason: result.reason });
        }
        break;
      }

      case 'LAUNCH_NUKE': {
        if (!currentRoom || !currentPlayerId) return;
        const { fromId, toId } = data;
        const result = currentRoom.launchNuke(currentPlayerId, fromId, toId);
        if (!result.success) {
          ws.send({ type: 'ACTION_FAILED', reason: result.reason });
        }
        break;
      }

      case 'TOGGLE_ALLIANCE': {
        if (!currentRoom || !currentPlayerId) return;
        const { targetPlayerId } = data;
        const formed = currentRoom.toggleAlliance(currentPlayerId, targetPlayerId);
        currentRoom.broadcastEvent({
          type: formed ? 'ALLIANCE_FORMED' : 'ALLIANCE_BROKEN',
          p1: currentPlayerId,
          p2: targetPlayerId
        });
        break;
      }

      case 'CHAT': {
        if (!currentRoom || !currentPlayerId) return;
        const player = currentRoom.players.get(currentPlayerId);
        currentRoom.broadcast({
          type: 'CHAT_MESSAGE',
          sender: player ? player.name : 'Anonim',
          color: player ? player.color.hex : '#fff',
          text: String(data.text || '').substring(0, 100)
        });
        break;
      }
    }
  };

  ws.onClose = () => {
    if (currentRoom && currentPlayerId) {
      currentRoom.removePlayer(currentPlayerId);
    }
  };
});

// ---------------------------------------------------------------------------
// Server Startup Banner
// ---------------------------------------------------------------------------
server.listen(PORT, '0.0.0.0', () => {
  const ips = getLocalIPAddresses();

  console.log('\n' + '='.repeat(64));
  console.log(' 🌍  ROWORLD - WEB / OKUL / YEREL AĞ SUNUCUSU ÇALIŞIYOR!');
  console.log('='.repeat(64));
  console.log(` 💻  Bu Bilgisayardan Oyna : http://localhost:${PORT}`);
  console.log('\n 📱  Arkadaşların İçin (Telefon / Tablet / Diğer PC):');
  if (ips.length === 0) {
    console.log(`     -> http://localhost:${PORT}`);
  } else {
    for (const { name, ip } of ips) {
      console.log(`     -> http://${ip}:${PORT}  (${name})`);
    }
  }
  console.log('\n 💡  NOT: Okulda internet yoksa biriniz Hotspot (Mobil Erişim Noktası)');
  console.log('     açsın (mobil veriyi açmanıza gerek yok!). Herkes o Wi-Fi\'ye');
  console.log('     bağlanınca yukarıdaki IP adresinden anında beraber oynayabilirsiniz!');
  console.log('='.repeat(64) + '\n');
});
