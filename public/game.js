// game.js - RoWorld Canvas Engine, Touch Controller & Network Client

(function () {
  'use strict';

  // State
  let ws = null;
  let offlineEngine = null;
  let isOfflineMode = false;

  let myPlayerId = null;
  let myPlayer = null;
  let currentRoomId = 'DUNYA';
  let gameState = 'MENU'; // MENU, LOBBY, PLAYING, ENDED

  let players = [];
  let provincesState = {};
  let marchers = [];
  let nukes = [];
  let selectedRatio = 50;

  // Selection
  let selectedSourceId = null;
  let selectedTargetId = null;

  // Viewport / Camera Pan & Zoom
  const camera = {
    x: 0,
    y: 0,
    zoom: 1.0,
    minZoom: 0.6,
    maxZoom: 2.8,
    isDragging: false,
    dragStartX: 0,
    dragStartY: 0,
    lastTouchDist: 0
  };

  // Screen shake effect for nukes
  let screenShake = 0;

  // Canvas & Context
  const canvas = document.getElementById('game-canvas');
  const ctx = canvas.getContext('2d');

  // DOM Elements
  const screenMenu = document.getElementById('menu-screen');
  const screenLobby = document.getElementById('lobby-screen');
  const screenGame = document.getElementById('game-screen');

  const inputName = document.getElementById('player-name-input');
  const inputRoom = document.getElementById('room-code-input');
  const btnJoinRoom = document.getElementById('btn-join-room');
  const btnOfflineMode = document.getElementById('btn-offline-mode');

  const lobbyRoomName = document.getElementById('lobby-room-name');
  const lobbyPlayersList = document.getElementById('lobby-players-list');
  const btnAddBot = document.getElementById('btn-add-bot');
  const btnLeaveLobby = document.getElementById('btn-leave-lobby');
  const btnStartGame = document.getElementById('btn-start-game');

  const hudGold = document.getElementById('hud-gold');
  const hudTerritories = document.getElementById('hud-territories');
  const hudTroops = document.getElementById('hud-troops');
  const leaderboardItems = document.getElementById('leaderboard-items');
  const selectionBanner = document.getElementById('selection-banner');
  const eventAlert = document.getElementById('event-alert');

  const qrModal = document.getElementById('qr-modal');
  const qrCanvas = document.getElementById('qr-canvas');
  const qrLinkText = document.getElementById('qr-link-text');
  const btnShowQr = document.getElementById('btn-show-qr');
  const btnGameQr = document.getElementById('btn-game-qr');
  const btnCloseQr = document.getElementById('btn-close-qr');

  const victoryModal = document.getElementById('victory-modal');
  const victoryTitle = document.getElementById('victory-title');
  const victoryDesc = document.getElementById('victory-desc');
  const btnRestart = document.getElementById('btn-restart');

  // Init Saved Name
  const savedName = localStorage.getItem('roworld_player_name');
  if (savedName) inputName.value = savedName;

  // -------------------------------------------------------------------------
  // Resize Canvas
  // -------------------------------------------------------------------------
  function resizeCanvas() {
    const dpr = window.devicePixelRatio || 1;
    canvas.width = window.innerWidth * dpr;
    canvas.height = window.innerHeight * dpr;
    canvas.style.width = window.innerWidth + 'px';
    canvas.style.height = window.innerHeight + 'px';
    ctx.scale(dpr, dpr);

    // Initial camera center
    if (camera.zoom === 1.0 && camera.x === 0 && camera.y === 0) {
      centerMap();
    }
  }

  function centerMap() {
    const scaleX = window.innerWidth / MAP_WIDTH;
    const scaleY = window.innerHeight / MAP_HEIGHT;
    camera.zoom = Math.min(scaleX, scaleY) * 0.95;
    camera.x = (window.innerWidth - MAP_WIDTH * camera.zoom) / 2;
    camera.y = (window.innerHeight - MAP_HEIGHT * camera.zoom) / 2;
  }

  window.addEventListener('resize', resizeCanvas);
  resizeCanvas();

  // -------------------------------------------------------------------------
  // Networking & Offline Handlers
  // -------------------------------------------------------------------------
  function getWebSocketUrl() {
    // Check URL query param or localStorage (useful when frontend is on Vercel and backend is on Render)
    const urlParams = new URLSearchParams(window.location.search);
    let customServer = urlParams.get('server') || localStorage.getItem('roworld_server_url');

    if (customServer) {
      customServer = customServer.replace(/^https?:\/\//, '').replace(/^wss?:\/\//, '').replace(/\/$/, '');
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      return `${protocol}//${customServer}`;
    }

    // Default: Same host (Render or Localhost)
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${protocol}//${window.location.host}`;
  }

  function connectWebSocket(roomId, playerName) {
    const wsUrl = getWebSocketUrl();

    try {
      ws = new WebSocket(wsUrl);
    } catch (e) {
      console.error('WS Connection failed, switching to offline mode:', e);
      startOfflineMatch(playerName);
      return;
    }

    ws.onerror = (err) => {
      console.warn('WS Error:', err);
      // If hosted on Vercel without Render backend
      if (window.location.hostname.includes('vercel.app')) {
        const renderUrl = prompt('Vercel serverless ortamda calisiyor. Render sunucu adresini gir (Orn: roworld-game.onrender.com) veya Cevrimdisi Oyna:', localStorage.getItem('roworld_server_url') || '');
        if (renderUrl) {
          localStorage.setItem('roworld_server_url', renderUrl.trim());
          location.reload();
          return;
        }
      }
    };

    ws.onopen = () => {
      ws.send(JSON.stringify({
        type: 'JOIN_ROOM',
        roomId,
        playerName
      }));
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        handleServerMessage(msg);
      } catch (e) {
        console.error('Error parsing WS message:', e);
      }
    };

    ws.onclose = () => {
      if (gameState === 'PLAYING') {
        showEventBanner('Sunucu bağlantısı koptu!');
      }
    };
  }

  function handleServerMessage(msg) {
    switch (msg.type) {
      case 'JOINED_SUCCESS': {
        myPlayerId = msg.playerId;
        myPlayer = msg.player;
        if (msg.room && msg.room.state === 'PLAYING') {
          enterGameScreen();
        } else {
          enterLobbyScreen(msg.room ? msg.room.roomId : currentRoomId);
        }
        break;
      }

      case 'LOBBY_UPDATE': {
        updateLobby(msg);
        break;
      }

      case 'GAME_STARTED': {
        enterGameScreen();
        if (window.soundEngine) soundEngine.playVictory();
        break;
      }

      case 'STATE_UPDATE': {
        provincesState = msg.provinces || {};
        marchers = msg.marchers || [];
        nukes = msg.nukes || [];
        players = msg.players || [];
        updateHUD();
        break;
      }

      case 'GAME_EVENT': {
        handleGameEvent(msg.event);
        break;
      }

      case 'GAME_OVER': {
        showVictoryScreen(msg.winner);
        break;
      }

      case 'ACTION_FAILED': {
        showEventBanner(msg.reason || 'İşlem başarısız');
        break;
      }

      case 'CHAT_MESSAGE': {
        displayChatBubble(msg.sender, msg.color, msg.text);
        break;
      }
    }
  }

  function sendAction(actionData) {
    if (isOfflineMode && offlineEngine) {
      switch (actionData.type) {
        case 'SEND_TROOPS':
          offlineEngine.sendTroops(myPlayerId, actionData.fromId, actionData.toId, actionData.percentage);
          break;
        case 'BUILD':
          offlineEngine.buildStructure(myPlayerId, actionData.provinceId, actionData.structureType);
          break;
        case 'LAUNCH_NUKE':
          offlineEngine.launchNuke(myPlayerId, actionData.fromId, actionData.toId);
          break;
      }
    } else if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(actionData));
    }
  }

  // -------------------------------------------------------------------------
  // Screens Transitions
  // -------------------------------------------------------------------------
  function enterLobbyScreen(roomId) {
    gameState = 'LOBBY';
    currentRoomId = roomId;
    lobbyRoomName.textContent = `ODA: ${roomId}`;
    screenMenu.classList.add('hidden');
    screenLobby.classList.remove('hidden');
    screenGame.classList.add('hidden');
  }

  function enterGameScreen() {
    gameState = 'PLAYING';
    screenMenu.classList.add('hidden');
    screenLobby.classList.add('hidden');
    screenGame.classList.remove('hidden');
    resizeCanvas();
    centerMap();
  }

  function updateLobby(data) {
    lobbyPlayersList.innerHTML = '';
    (data.players || []).forEach(p => {
      const row = document.createElement('div');
      row.className = 'player-row';
      row.style.borderLeftColor = p.color ? p.color.hex : '#38bdf8';

      row.innerHTML = `
        <div class="player-info">
          <span class="color-dot" style="color: ${p.color ? p.color.hex : '#fff'}; background: ${p.color ? p.color.hex : '#fff'};"></span>
          <span class="player-name">${p.name} ${p.id === myPlayerId ? '(Sen)' : ''}</span>
        </div>
        <div>
          ${p.isBot ? '<span class="player-tag">BOT</span>' : ''}
        </div>
      `;
      lobbyPlayersList.appendChild(row);
    });
  }

  function startOfflineMatch(playerName) {
    isOfflineMode = true;
    currentRoomId = 'ÇEVRİMDIŞI';
    offlineEngine = new OfflineGameEngine((msg) => handleServerMessage(msg));
    offlineEngine.start(playerName);
  }

  // -------------------------------------------------------------------------
  // HUD & Event Banner
  // -------------------------------------------------------------------------
  function updateHUD() {
    if (!myPlayerId) return;

    const me = players.find(p => p.id === myPlayerId);
    if (me) {
      hudGold.textContent = `$${me.gold}`;
      const totalProvinces = PROVINCES.length;
      const myCount = Object.values(provincesState).filter(p => p.ownerId === myPlayerId).length;
      const pct = Math.round((myCount / totalProvinces) * 100);
      hudTerritories.textContent = `${pct}%`;

      let totalTroops = 0;
      for (const p of Object.values(provincesState)) {
        if (p.ownerId === myPlayerId) totalTroops += p.troops;
      }
      hudTroops.textContent = totalTroops;
    }

    // Leaderboard
    leaderboardItems.innerHTML = '';
    const sorted = [...players].sort((a, b) => (b.territories || 0) - (a.territories || 0));
    sorted.slice(0, 5).forEach((p, idx) => {
      const row = document.createElement('div');
      row.className = 'leader-item';
      const pct = Math.round(((p.territories || 0) / PROVINCES.length) * 100);
      row.innerHTML = `
        <div style="display: flex; align-items: center; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
          <span class="leader-color" style="background: ${p.color ? p.color.hex : '#fff'};"></span>
          <span>${idx + 1}. ${p.name}</span>
        </div>
        <span style="font-weight: 700; color: #fff; margin-left: 6px;">${pct}%</span>
      `;
      leaderboardItems.appendChild(row);
    });
  }

  function showEventBanner(text) {
    eventAlert.textContent = text;
    eventAlert.classList.remove('hidden');
    clearTimeout(eventAlert._timer);
    eventAlert._timer = setTimeout(() => {
      eventAlert.classList.add('hidden');
    }, 2800);
  }

  function handleGameEvent(evt) {
    if (!evt) return;
    if (evt.type === 'NUKE_LAUNCHED') {
      showEventBanner(`⚠️ NÜKLEER ALARMI! ${evt.launcherName} füze fırlattı!`);
      if (window.soundEngine) soundEngine.playNukeAlarm();
    } else if (evt.type === 'NUKE_DETONATION') {
      screenShake = 22; // trigger screen shake
      if (window.soundEngine) soundEngine.playNukeDetonation();
      const pDef = getProvince(evt.targetId);
      showEventBanner(`💥 NÜKLEER PATLAMA! ${pDef ? pDef.name : ''} haritadan silindi!`);
    } else if (evt.type === 'TERRITORY_CONQUERED') {
      if (evt.newOwnerId === myPlayerId) {
        if (window.soundEngine) soundEngine.playCombat();
      }
    }
  }

  function showVictoryScreen(winner) {
    gameState = 'ENDED';
    const isMe = winner && winner.id === myPlayerId;
    victoryTitle.textContent = isMe ? '🏆 ZAFER KAZANDIN!' : 'DÜNYA ELE GEÇİRİLDİ!';
    victoryTitle.style.color = isMe ? 'var(--accent-gold)' : 'var(--accent-red)';
    victoryDesc.textContent = `${winner.name} dünya topraklarının %${winner.percentage} kısmını fethederek mutlak hakim oldu!`;
    victoryModal.classList.remove('hidden');
    if (window.soundEngine) {
      if (isMe) soundEngine.playVictory();
      else soundEngine.playDefeat();
    }
  }

  function displayChatBubble(sender, color, text) {
    const container = document.getElementById('chat-messages');
    const bubble = document.createElement('div');
    bubble.className = 'chat-bubble';
    bubble.innerHTML = `<strong style="color: ${color}">${sender}:</strong> ${text}`;
    container.appendChild(bubble);
    setTimeout(() => bubble.remove(), 4000);
  }

  // -------------------------------------------------------------------------
  // Canvas Rendering Loop (60 FPS)
  // -------------------------------------------------------------------------
  function render() {
    requestAnimationFrame(render);
    if (gameState !== 'PLAYING') return;

    ctx.save();
    ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);

    // Apply Screen Shake
    if (screenShake > 0) {
      const sx = (Math.random() - 0.5) * screenShake;
      const sy = (Math.random() - 0.5) * screenShake;
      ctx.translate(sx, sy);
      screenShake *= 0.9;
      if (screenShake < 0.5) screenShake = 0;
    }

    // Apply Camera Transform
    ctx.translate(camera.x, camera.y);
    ctx.scale(camera.zoom, camera.zoom);

    // 1. Draw Ocean Grid Lines
    drawOceanGrid();

    // 2. Draw Sea Lanes (Naval Connections)
    drawSeaLanes();

    // 3. Draw Provinces (Polygons, Borders, Fills)
    drawProvinces();

    // 4. Draw Marching Armies
    drawMarchers();

    // 5. Draw Nukes
    drawNukes();

    ctx.restore();
  }

  function drawOceanGrid() {
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.04)';
    ctx.lineWidth = 1;
    const step = 80;
    for (let x = 0; x <= MAP_WIDTH; x += step) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, MAP_HEIGHT);
      ctx.stroke();
    }
    for (let y = 0; y <= MAP_HEIGHT; y += step) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(MAP_WIDTH, y);
      ctx.stroke();
    }
  }

  function drawSeaLanes() {
    ctx.save();
    ctx.setLineDash([5, 8]);
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.35)';
    ctx.lineWidth = 1.5;

    const drawnPairs = new Set();
    for (const p of PROVINCES) {
      for (const targetId of p.seaLanes) {
        const pairKey = [p.id, targetId].sort().join(':');
        if (!drawnPairs.has(pairKey)) {
          drawnPairs.add(pairKey);
          const target = getProvince(targetId);
          if (target) {
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(target.x, target.y);
            ctx.stroke();
          }
        }
      }
    }
    ctx.restore();
  }

  function drawProvinces() {
    const time = Date.now() * 0.003;

    for (const p of PROVINCES) {
      const state = provincesState[p.id] || { troops: 10, ownerId: null, buildings: {} };
      const owner = state.ownerId ? players.find(pl => pl.id === state.ownerId) : null;
      const ownerColor = owner ? owner.color.hex : '#1e293b';

      const isSource = selectedSourceId === p.id;
      const isTarget = selectedTargetId === p.id;
      const isMyTerritory = state.ownerId === myPlayerId;

      // Draw Polygon
      if (p.poly && p.poly.length > 2) {
        ctx.beginPath();
        ctx.moveTo(p.poly[0][0], p.poly[0][1]);
        for (let i = 1; i < p.poly.length; i++) {
          ctx.lineTo(p.poly[i][0], p.poly[i][1]);
        }
        ctx.closePath();

        // Fill with owner tint
        if (state.ownerId) {
          ctx.fillStyle = ownerColor + '55'; // Transparent tint
        } else {
          ctx.fillStyle = '#0f172a'; // Neutral dark
        }
        ctx.fill();

        // Border outline
        if (isSource) {
          ctx.strokeStyle = '#00f0ff';
          ctx.lineWidth = 3.5;
          ctx.shadowColor = '#00f0ff';
          ctx.shadowBlur = 12 + Math.sin(time * 3) * 6;
        } else if (isTarget) {
          ctx.strokeStyle = '#ef4444';
          ctx.lineWidth = 3.5;
          ctx.shadowColor = '#ef4444';
          ctx.shadowBlur = 12;
        } else {
          ctx.strokeStyle = state.ownerId ? ownerColor : 'rgba(255, 255, 255, 0.15)';
          ctx.lineWidth = 1.2;
          ctx.shadowBlur = 0;
        }
        ctx.stroke();
        ctx.shadowBlur = 0; // reset
      }

      // Draw Province Center Badge
      drawProvinceBadge(p, state, owner, isSource, isTarget);
    }
  }

  function drawProvinceBadge(p, state, owner, isSource, isTarget) {
    const bx = p.x;
    const by = p.y;
    const badgeW = 68;
    const badgeH = 26;

    // Badge Background Pill
    ctx.save();
    ctx.fillStyle = 'rgba(11, 15, 25, 0.9)';
    ctx.strokeStyle = owner ? owner.color.hex : '#64748b';
    ctx.lineWidth = isSource ? 2.5 : 1.2;

    // Rounded rect
    const r = 6;
    ctx.beginPath();
    ctx.roundRect(bx - badgeW / 2, by - badgeH / 2, badgeW, badgeH, r);
    ctx.fill();
    ctx.stroke();

    // Troop Count
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 12px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(state.troops || '0', bx, by + 1);

    // Province Name (tiny label above badge)
    ctx.font = '9px sans-serif';
    ctx.fillStyle = '#94a3b8';
    ctx.fillText(p.name, bx, by - badgeH / 2 - 6);

    // Building Icons (below badge)
    let iconStr = '';
    if (state.buildings) {
      if (state.buildings.city > 0) iconStr += '🏛️' + (state.buildings.city > 1 ? state.buildings.city : '');
      if (state.buildings.factory > 0) iconStr += '🏭';
      if (state.buildings.port > 0) iconStr += '⚓';
      if (state.buildings.fort > 0) iconStr += '🛡️';
    }
    if (iconStr) {
      ctx.font = '10px sans-serif';
      ctx.fillText(iconStr, bx, by + badgeH / 2 + 8);
    }

    ctx.restore();
  }

  function drawMarchers() {
    for (const m of marchers) {
      const fromP = getProvince(m.fromId);
      const toP = getProvince(m.toId);
      if (!fromP || !toP) continue;

      const t = m.progress / m.totalSteps;
      const curX = fromP.x + (toP.x - fromP.x) * t;
      const curY = fromP.y + (toP.y - fromP.y) * t;

      const owner = players.find(p => p.id === m.ownerId);
      const color = owner ? owner.color.hex : '#ffffff';

      ctx.save();

      // Motion Trail
      ctx.beginPath();
      ctx.moveTo(fromP.x, fromP.y);
      ctx.lineTo(curX, curY);
      ctx.strokeStyle = color + '66';
      ctx.lineWidth = 2.5;
      ctx.stroke();

      // Moving Troop Badge
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(curX, curY, 11, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Troop Number
      ctx.fillStyle = '#000000';
      ctx.font = 'bold 9px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(m.troops, curX, curY);

      ctx.restore();
    }
  }

  function drawNukes() {
    for (const n of nukes) {
      const fromP = getProvince(n.fromId);
      const toP = getProvince(n.toId);
      if (!fromP || !toP) continue;

      const t = n.progress / n.totalSteps;
      // Parabolic flight arc
      const curX = fromP.x + (toP.x - fromP.x) * t;
      const arcHeight = 120 * Math.sin(t * Math.PI);
      const curY = (fromP.y + (toP.y - fromP.y) * t) - arcHeight;

      ctx.save();
      // Smoke Trail
      ctx.beginPath();
      ctx.moveTo(fromP.x, fromP.y);
      ctx.quadraticCurveTo((fromP.x + toP.x) / 2, Math.min(fromP.y, toP.y) - 120, curX, curY);
      ctx.strokeStyle = 'rgba(239, 68, 68, 0.7)';
      ctx.lineWidth = 3;
      ctx.stroke();

      // Warhead
      ctx.fillStyle = '#ef4444';
      ctx.beginPath();
      ctx.arc(curX, curY, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowColor = '#f59e0b';
      ctx.shadowBlur = 15;
      ctx.restore();
    }
  }

  // -------------------------------------------------------------------------
  // Interaction & Input Handling (Mouse + Touch Drag/Pinch)
  // -------------------------------------------------------------------------
  function screenToWorld(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const x = (clientX - rect.left - camera.x) / camera.zoom;
    const y = (clientY - rect.top - camera.y) / camera.zoom;
    return { x, y };
  }

  function findProvinceAt(worldX, worldY) {
    // 1. Check badge hit radius
    for (const p of PROVINCES) {
      const dist = Math.hypot(p.x - worldX, p.y - worldY);
      if (dist <= 38) return p;
    }
    // 2. Check polygon containment
    for (const p of PROVINCES) {
      if (p.poly && isPointInPolygon(worldX, worldY, p.poly)) {
        return p;
      }
    }
    return null;
  }

  function isPointInPolygon(x, y, poly) {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const xi = poly[i][0], yi = poly[i][1];
      const xj = poly[j][0], yj = poly[j][1];
      const intersect = ((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
      if (intersect) inside = !inside;
    }
    return inside;
  }

  function handleProvinceClick(p) {
    const pState = provincesState[p.id];
    const isMine = pState && pState.ownerId === myPlayerId;

    if (!selectedSourceId) {
      // First click: Must be own territory to attack or manage
      if (isMine) {
        selectedSourceId = p.id;
        selectionBanner.textContent = `🎯 Seçilen: ${p.name} (${pState.troops} Asker) -> Hedef bölgeye tıkla!`;
        if (window.soundEngine) soundEngine.playSelect();
      } else {
        selectionBanner.textContent = `ℹ️ ${p.name} - Sahip: ${getOwnerName(pState ? pState.ownerId : null)} (${pState ? pState.troops : 0} Asker)`;
      }
    } else {
      // Second click: Target chosen!
      if (p.id === selectedSourceId) {
        // Deselect
        selectedSourceId = null;
        selectionBanner.textContent = 'Bir bölge seç ve komşu bölgeye asker gönder';
      } else {
        // Check connection
        const isLand = areNeighbors(selectedSourceId, p.id);
        const isSea = areSeaConnected(selectedSourceId, p.id);
        const sourceState = provincesState[selectedSourceId];

        if (!isLand && !isSea) {
          showEventBanner('Bu iki bölge arasında kara veya deniz sınırı yok!');
          return;
        }
        if (isSea && (!sourceState.buildings || sourceState.buildings.port <= 0)) {
          showEventBanner('Deniz aşırı intikal için çıkış noktasında Liman gereklidir!');
          return;
        }

        // Send attack or transfer troops!
        sendAction({
          type: 'SEND_TROOPS',
          fromId: selectedSourceId,
          toId: p.id,
          percentage: selectedRatio
        });

        if (window.soundEngine) soundEngine.playTroopSend();

        // Keep selection or deselect
        selectedSourceId = null;
        selectionBanner.textContent = `⚔️ ${p.name} üzerine asker sevk edildi!`;
      }
    }
  }

  function getOwnerName(ownerId) {
    if (!ownerId) return 'Tarafsız Savunmacılar';
    const player = players.find(p => p.id === ownerId);
    return player ? player.name : 'Bilinmeyen';
  }

  // Pointer / Mouse Events
  let pointerDownTime = 0;
  let pointerDownPos = { x: 0, y: 0 };

  canvas.addEventListener('mousedown', (e) => {
    camera.isDragging = true;
    camera.dragStartX = e.clientX - camera.x;
    camera.dragStartY = e.clientY - camera.y;
    pointerDownTime = Date.now();
    pointerDownPos = { x: e.clientX, y: e.clientY };
  });

  window.addEventListener('mousemove', (e) => {
    if (camera.isDragging) {
      camera.x = e.clientX - camera.dragStartX;
      camera.y = e.clientY - camera.dragStartY;
    }
  });

  window.addEventListener('mouseup', (e) => {
    if (camera.isDragging) {
      camera.isDragging = false;
      const moved = Math.hypot(e.clientX - pointerDownPos.x, e.clientY - pointerDownPos.y);
      if (moved < 8 && (Date.now() - pointerDownTime) < 300) {
        const world = screenToWorld(e.clientX, e.clientY);
        const hit = findProvinceAt(world.x, world.y);
        if (hit) handleProvinceClick(hit);
      }
    }
  });

  // Wheel Zoom
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const zoomFactor = e.deltaY < 0 ? 1.12 : 0.89;
    const newZoom = Math.min(camera.maxZoom, Math.max(camera.minZoom, camera.zoom * zoomFactor));

    // Zoom towards cursor
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    camera.x = mouseX - (mouseX - camera.x) * (newZoom / camera.zoom);
    camera.y = mouseY - (mouseY - camera.y) * (newZoom / camera.zoom);
    camera.zoom = newZoom;
  }, { passive: false });

  // Touch Events (Mobile Drag & Pinch)
  canvas.addEventListener('touchstart', (e) => {
    if (e.touches.length === 1) {
      camera.isDragging = true;
      camera.dragStartX = e.touches[0].clientX - camera.x;
      camera.dragStartY = e.touches[0].clientY - camera.y;
      pointerDownTime = Date.now();
      pointerDownPos = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    } else if (e.touches.length === 2) {
      camera.isDragging = false;
      camera.lastTouchDist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
    }
  }, { passive: true });

  canvas.addEventListener('touchmove', (e) => {
    if (e.touches.length === 1 && camera.isDragging) {
      camera.x = e.touches[0].clientX - camera.dragStartX;
      camera.y = e.touches[0].clientY - camera.dragStartY;
    } else if (e.touches.length === 2) {
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      if (camera.lastTouchDist > 0) {
        const factor = dist / camera.lastTouchDist;
        const newZoom = Math.min(camera.maxZoom, Math.max(camera.minZoom, camera.zoom * factor));
        camera.zoom = newZoom;
      }
      camera.lastTouchDist = dist;
    }
  }, { passive: true });

  canvas.addEventListener('touchend', (e) => {
    if (e.touches.length === 0 && camera.isDragging) {
      camera.isDragging = false;
      const moved = Math.hypot(e.changedTouches[0].clientX - pointerDownPos.x, e.changedTouches[0].clientY - pointerDownPos.y);
      if (moved < 12 && (Date.now() - pointerDownTime) < 320) {
        const world = screenToWorld(e.changedTouches[0].clientX, e.changedTouches[0].clientY);
        const hit = findProvinceAt(world.x, world.y);
        if (hit) handleProvinceClick(hit);
      }
    }
  });

  // -------------------------------------------------------------------------
  // Bottom Controls & Tactical Buttons
  // -------------------------------------------------------------------------
  document.querySelectorAll('.ratio-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.ratio-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      selectedRatio = parseInt(btn.dataset.ratio, 10);
      if (window.soundEngine) soundEngine.playClick();
    });
  });

  function triggerBuild(type) {
    if (!selectedSourceId) {
      showEventBanner('Önce inşaat yapmak istediğin kendi bölgene tıkla!');
      return;
    }
    sendAction({
      type: 'BUILD',
      provinceId: selectedSourceId,
      structureType: type
    });
    if (window.soundEngine) soundEngine.playBuild();
  }

  document.getElementById('btn-build-city').addEventListener('click', () => triggerBuild('city'));
  document.getElementById('btn-build-factory').addEventListener('click', () => triggerBuild('factory'));
  document.getElementById('btn-build-port').addEventListener('click', () => triggerBuild('port'));
  document.getElementById('btn-build-fort').addEventListener('click', () => triggerBuild('fort'));

  document.getElementById('btn-launch-nuke').addEventListener('click', () => {
    if (!selectedSourceId) {
      showEventBanner('Önce fırlatma üssü olarak kendi bölgene tıkla!');
      return;
    }
    const targetProvName = prompt('Nükleer hedefi (Örn: Moskova, New York, Almanya, Çin, Türkiye) veya hedef bölge ID:');
    if (!targetProvName) return;

    const clean = targetProvName.toLowerCase().trim();
    const target = PROVINCES.find(p => p.id === clean || p.name.toLowerCase().includes(clean));
    if (!target) {
      showEventBanner('Hedef bölge bulunamadı!');
      return;
    }

    sendAction({
      type: 'LAUNCH_NUKE',
      fromId: selectedSourceId,
      toId: target.id
    });
  });

  // Audio Toggle
  let audioMuted = false;
  document.getElementById('btn-sound-toggle').addEventListener('click', (e) => {
    audioMuted = !audioMuted;
    if (window.soundEngine) soundEngine.enabled = !audioMuted;
    e.target.textContent = audioMuted ? '🔇' : '🔊';
  });

  // -------------------------------------------------------------------------
  // QR Code & Room Invitation
  // -------------------------------------------------------------------------
  async function showQRCodeModal() {
    let joinUrl = window.location.href;

    // Try fetching local Wi-Fi IP from server info
    try {
      const res = await fetch('/api/info');
      const data = await res.json();
      if (data.ips && data.ips.length > 0) {
        joinUrl = `http://${data.ips[0].ip}:${data.port}/`;
      }
    } catch (e) {
      // Keep current window.location.href
    }

    qrLinkText.textContent = joinUrl;
    new QRCode(qrCanvas, {
      text: joinUrl,
      width: 190,
      height: 190,
      colorDark: '#00f0ff',
      colorLight: '#0b0f19'
    });

    qrModal.classList.remove('hidden');
    if (window.soundEngine) soundEngine.playClick();
  }

  btnShowQr.addEventListener('click', showQRCodeModal);
  btnGameQr.addEventListener('click', showQRCodeModal);
  btnCloseQr.addEventListener('click', () => qrModal.classList.add('hidden'));

  // -------------------------------------------------------------------------
  // Menu Buttons
  // -------------------------------------------------------------------------
  btnJoinRoom.addEventListener('click', () => {
    const name = inputName.value.trim() || 'Komutan';
    const room = inputRoom.value.trim().toUpperCase() || 'DUNYA';
    localStorage.setItem('roworld_player_name', name);
    if (window.soundEngine) soundEngine.playClick();
    connectWebSocket(room, name);
  });

  btnOfflineMode.addEventListener('click', () => {
    const name = inputName.value.trim() || 'Komutan';
    localStorage.setItem('roworld_player_name', name);
    if (window.soundEngine) soundEngine.playClick();
    startOfflineMatch(name);
  });

  btnAddBot.addEventListener('click', () => {
    if (isOfflineMode) return;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'ADD_BOT' }));
      if (window.soundEngine) soundEngine.playClick();
    }
  });

  btnLeaveLobby.addEventListener('click', () => {
    if (ws) ws.close();
    location.reload();
  });

  btnStartGame.addEventListener('click', () => {
    if (isOfflineMode) return;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'START_GAME' }));
      if (window.soundEngine) soundEngine.playClick();
    }
  });

  btnRestart.addEventListener('click', () => {
    location.reload();
  });

  // Start Rendering Loop
  requestAnimationFrame(render);
})();
