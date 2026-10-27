// offlineEngine.js - In-Browser Local Game Engine for 100% Offline Singleplayer
// Allows playing against smart AI bots with zero server or network required.

class OfflineGameEngine {
  constructor(onMessage) {
    this.onMessage = onMessage;
    this.provinces = {};
    this.marchers = [];
    this.nukes = [];
    this.marchCounter = 0;
    this.nukeCounter = 0;
    this.tickTimer = null;
    this.playerId = 'player_local';
    this.state = 'PLAYING';

    this.players = [
      { id: 'player_local', name: 'Komutan (Sen)', color: { id: 'cyan', hex: '#00f0ff' }, isBot: false, gold: 350 },
      { id: 'bot_red', name: 'Kızıl İmparatorluk', color: { id: 'red', hex: '#ef4444' }, isBot: true, gold: 350 },
      { id: 'bot_gold', name: 'Altın Hanedanlık', color: { id: 'gold', hex: '#f59e0b' }, isBot: true, gold: 350 },
      { id: 'bot_emerald', name: 'Zümrüt Birliği', color: { id: 'emerald', hex: '#10b981' }, isBot: true, gold: 350 }
    ];
  }

  start(playerName) {
    if (playerName) this.players[0].name = playerName;

    // Init Provinces
    this.provinces = {};
    for (const p of PROVINCES) {
      this.provinces[p.id] = {
        id: p.id,
        ownerId: null,
        troops: Math.floor(Math.random() * 8) + 12,
        buildings: {
          city: 0,
          factory: 0,
          port: p.seaLanes.length > 0 ? 1 : 0,
          fort: 0
        }
      };
    }

    // Assign starting lands
    const list = Object.values(this.provinces).sort(() => Math.random() - 0.5);
    let pIdx = 0;
    for (const player of this.players) {
      for (let i = 0; i < 3; i++) {
        const prov = list[pIdx++];
        if (prov) {
          prov.ownerId = player.id;
          prov.troops = 35;
          prov.buildings.city = 1;
          prov.buildings.factory = 1;
        }
      }
    }

    if (this.tickTimer) clearInterval(this.tickTimer);
    this.tickTimer = setInterval(() => this.tick(), 500);

    this.onMessage({
      type: 'JOINED_SUCCESS',
      playerId: this.playerId,
      player: this.players[0],
      room: { state: 'PLAYING', roomId: 'ÇEVRİMDIŞI' }
    });

    this.onMessage({
      type: 'GAME_STARTED'
    });
  }

  stop() {
    if (this.tickTimer) clearInterval(this.tickTimer);
  }

  tick() {
    if (this.state !== 'PLAYING') return;

    // Economy & Troops
    for (const p of Object.values(this.provinces)) {
      if (p.ownerId) {
        const owner = this.players.find(pl => pl.id === p.ownerId);
        if (owner) {
          if (p.buildings.factory > 0) owner.gold += p.buildings.factory * 4;
          if (p.buildings.port > 0) owner.gold += 3;
          owner.gold += 1;

          if (Math.random() < 0.6) {
            p.troops += 1 + (p.buildings.city * 2);
          }
        }
      } else {
        if (p.troops < 30 && Math.random() < 0.15) p.troops += 1;
      }
    }

    // Marchers
    const remainingM = [];
    for (const m of this.marchers) {
      m.progress++;
      if (m.progress >= m.totalSteps) {
        this.resolveCombat(m);
      } else {
        remainingM.push(m);
      }
    }
    this.marchers = remainingM;

    // Nukes
    const remainingN = [];
    for (const n of this.nukes) {
      n.progress++;
      if (n.progress >= n.totalSteps) {
        this.resolveNuke(n);
      } else {
        remainingN.push(n);
      }
    }
    this.nukes = remainingN;

    // AI Moves
    this.processAI();

    // Victory Check
    this.checkVictory();

    // Broadcast State
    this.onMessage({
      type: 'STATE_UPDATE',
      state: this.state,
      provinces: this.provinces,
      marchers: this.marchers,
      nukes: this.nukes,
      players: this.players.map(p => ({
        id: p.id,
        name: p.name,
        color: p.color,
        gold: p.gold,
        territories: Object.values(this.provinces).filter(pr => pr.ownerId === p.id).length
      }))
    });
  }

  sendTroops(playerId, fromId, toId, percentage) {
    const fromP = this.provinces[fromId];
    const toP = this.provinces[toId];
    if (!fromP || !toP || fromP.ownerId !== playerId) return;

    const isLand = areNeighbors(fromId, toId);
    const isSea = areSeaConnected(fromId, toId) && fromP.buildings.port > 0;
    if (!isLand && !isSea) return;

    const available = Math.max(0, fromP.troops - 2);
    const sendCount = Math.floor(available * (percentage / 100));
    if (sendCount <= 0) return;

    fromP.troops -= sendCount;
    this.marchCounter++;
    this.marchers.push({
      id: 'om_' + this.marchCounter,
      fromId,
      toId,
      ownerId: playerId,
      troops: sendCount,
      progress: 0,
      totalSteps: isSea ? 8 : 5
    });
  }

  resolveCombat(m) {
    const dest = this.provinces[m.toId];
    if (!dest) return;

    if (dest.ownerId === m.ownerId) {
      dest.troops += m.troops;
      return;
    }

    const defenseMultiplier = dest.buildings.fort > 0 ? 1.5 : 1.0;
    const effectiveDefense = dest.troops * defenseMultiplier;
    const attackRoll = m.troops * (0.85 + Math.random() * 0.3);
    const defenseRoll = effectiveDefense * (0.85 + Math.random() * 0.3);

    if (attackRoll > defenseRoll) {
      const casualtiesRatio = defenseRoll / (attackRoll + 0.1);
      dest.ownerId = m.ownerId;
      dest.troops = Math.max(1, Math.round(m.troops * (1 - casualtiesRatio * 0.6)));
      if (dest.buildings.fort > 0) dest.buildings.fort = 0;

      this.onMessage({
        type: 'GAME_EVENT',
        event: {
          type: 'TERRITORY_CONQUERED',
          provinceId: dest.id,
          newOwnerId: m.ownerId,
          conquerorName: this.players.find(p => p.id === m.ownerId)?.name || 'Bilinmeyen'
        }
      });
    } else {
      const attackCasualties = attackRoll / (defenseRoll + 0.1);
      dest.troops = Math.max(1, Math.round(dest.troops * (1 - attackCasualties * 0.6)));
    }
  }

  buildStructure(playerId, provinceId, structureType) {
    const player = this.players.find(p => p.id === playerId);
    const p = this.provinces[provinceId];
    if (!player || !p || p.ownerId !== playerId) return;

    const costs = { city: 150, factory: 200, port: 250, fort: 120, nuke: 1000 };
    const cost = costs[structureType];
    if (!cost || player.gold < cost) return;

    if (structureType === 'city' && p.buildings.city >= 3) return;
    if (structureType === 'factory' && p.buildings.factory >= 2) return;
    if (structureType === 'port' && p.buildings.port >= 1) return;
    if (structureType === 'fort' && p.buildings.fort >= 1) return;

    player.gold -= cost;
    p.buildings[structureType] = (p.buildings[structureType] || 0) + 1;
  }

  launchNuke(playerId, fromId, toId) {
    const player = this.players.find(p => p.id === playerId);
    const fromP = this.provinces[fromId];
    const toP = this.provinces[toId];
    if (!player || !fromP || !toP || fromP.ownerId !== playerId || player.gold < 1000) return;

    player.gold -= 1000;
    this.nukeCounter++;
    this.nukes.push({
      id: 'on_' + this.nukeCounter,
      fromId,
      toId,
      ownerId: playerId,
      progress: 0,
      totalSteps: 12
    });

    this.onMessage({
      type: 'GAME_EVENT',
      event: {
        type: 'NUKE_LAUNCHED',
        fromId,
        toId,
        launcherName: player.name
      }
    });
  }

  resolveNuke(nuke) {
    const target = this.provinces[nuke.toId];
    if (!target) return;

    target.troops = Math.max(1, Math.floor(target.troops * 0.15));
    target.buildings.city = 0;
    target.buildings.factory = 0;
    target.buildings.fort = 0;

    const targetDef = PROVINCES.find(p => p.id === nuke.toId);
    if (targetDef) {
      for (const nId of targetDef.neighbors) {
        const neighbor = this.provinces[nId];
        if (neighbor) {
          neighbor.troops = Math.max(1, Math.floor(neighbor.troops * 0.6));
        }
      }
    }

    this.onMessage({
      type: 'GAME_EVENT',
      event: {
        type: 'NUKE_DETONATION',
        targetId: nuke.toId,
        launcherId: nuke.ownerId
      }
    });
  }

  processAI() {
    for (const player of this.players) {
      if (!player.isBot) continue;

      if (player.gold >= 400 && Math.random() < 0.3) {
        const owned = Object.values(this.provinces).filter(p => p.ownerId === player.id);
        if (owned.length > 0) {
          const targetP = owned[Math.floor(Math.random() * owned.length)];
          if (targetP.buildings.city < 2) this.buildStructure(player.id, targetP.id, 'city');
          else if (targetP.buildings.factory < 1) this.buildStructure(player.id, targetP.id, 'factory');
        }
      }

      if (Math.random() < 0.25) {
        const owned = Object.values(this.provinces).filter(p => p.ownerId === player.id && p.troops >= 20);
        if (owned.length === 0) continue;

        const source = owned[Math.floor(Math.random() * owned.length)];
        const sourceDef = PROVINCES.find(p => p.id === source.id);
        if (!sourceDef) continue;

        const targets = [...sourceDef.neighbors, ...(source.buildings.port > 0 ? sourceDef.seaLanes : [])];
        let bestTarget = null;
        let minTroops = Infinity;

        for (const tId of targets) {
          const tP = this.provinces[tId];
          if (tP && tP.ownerId !== player.id) {
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

  checkVictory() {
    const totalCount = PROVINCES.length;
    const counts = {};
    for (const p of Object.values(this.provinces)) {
      if (p.ownerId) counts[p.ownerId] = (counts[p.ownerId] || 0) + 1;
    }

    for (const [pId, count] of Object.entries(counts)) {
      const ratio = count / totalCount;
      if (ratio >= 0.75) {
        this.state = 'ENDED';
        this.stop();
        const winner = this.players.find(p => p.id === pId);
        this.onMessage({
          type: 'GAME_OVER',
          winner: {
            id: pId,
            name: winner ? winner.name : 'Bilinmeyen',
            color: winner ? winner.color : { hex: '#fff' },
            percentage: Math.round(ratio * 100)
          }
        });
        break;
      }
    }
  }
}
