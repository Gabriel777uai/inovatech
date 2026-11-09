const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const os = require('os');
const QRCode = require('qrcode');

const app = express();
app.set('trust proxy', 1);

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

const PORT = process.env.PORT || 3000;

// Health check para serviços em nuvem (Render, Railway, etc.)
app.get('/healthz', (req, res) => res.status(200).send('OK'));

// Servir arquivos estáticos da pasta public e da raiz
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.static(__dirname));

// Rota raiz e atalho para manutencao.html redirecionar para o jogo
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/manutencao.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Endpoint para gerar QR Code de uma sala
app.get('/api/qrcode', async (req, res) => {
  try {
    const text = req.query.url;
    if (!text) return res.status(400).send('URL necessária');
    const qrData = await QRCode.toDataURL(text, {
      margin: 1,
      color: {
        dark: '#00f5d4',
        light: '#0a0e17'
      },
      width: 240
    });
    res.json({ qrcode: qrData });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Coletar endereços IP locais
function getLocalIpAddresses() {
  const interfaces = os.networkInterfaces();
  const addresses = [];
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        addresses.push(iface.address);
      }
    }
  }
  return addresses;
}

// =============================================================================
// GERENCIAMENTO DE SALAS E MULTIPLAYER (SOCKET.IO)
// =============================================================================
const rooms = new Map();

const AVAILABLE_COLORS = [
  '#00f5d4', // Cyan Neon
  '#10b981', // Bio Green
  '#ec4899', // Hot Pink
  '#f59e0b', // Solar Amber
  '#3b82f6', // Cyber Blue
  '#a855f7'  // Synth Purple
];

const BOT_NAMES = ['CyberBot-01', 'NeonRacer-AI', 'Quantum-X', 'TurboByte'];

// 4 Faixas bem definidas e centradas
const LANE_OFFSETS = [-130, -45, 45, 130];

function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 4; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return rooms.has(code) ? generateRoomCode() : code;
}

// Cria uma sala com estado inicial
function createRoom(code, hostSocketId, hostName, hostColor) {
  return {
    code,
    hostId: hostSocketId,
    mode: 'race',
    totalLaps: 3,
    trackLength: 1600, // calibrado para corridas dinâmicas e equilibradas
    status: 'lobby',
    countdown: 3,
    fillBots: true,
    difficulty: 'normal',
    players: new Map([
      [
        hostSocketId,
        {
          id: hostSocketId,
          name: hostName || 'Piloto 1',
          color: hostColor || AVAILABLE_COLORS[0],
          isHost: true,
          isBot: false,
          ready: false,
          x: -45,
          y: 0,
          targetX: -45,
          distance: 0,
          speed: 0,
          maxSpeed: 6.8, // Velocidade calibrada para controle arcade preciso
          accel: 0.15,
          steerSpeed: 4.8,
          nitroRemaining: 100,
          nitroActive: false,
          nitroTimer: 0,
          shieldActive: false,
          shieldTimer: 0,
          spunTimer: 0,
          empTimer: 0,
          draftTimer: 0,
          draftActive: false,
          invulnerableTimer: 0,
          item: null,
          lapsCompleted: 0,
          finished: false,
          finishTime: null,
          finishRank: 0,
          crashesCount: 0,
          itemsUsedCount: 0,
          topSpeed: 0,
          score: 0,
          inputs: { left: false, right: false, up: false, down: false, nitro: false, useItem: false }
        }
      ]
    ]),
    trackEntities: [],
    activeHazards: [],
    raceStartTime: 0,
    finishers: [],
    gameLoopInterval: null,
    createdAt: Date.now()
  };
}

// Inicializa a pista garantindo faixas livres e boa jogabilidade
function buildTrackEntities(trackLength, totalLaps) {
  const entities = [];
  const fullDistance = trackLength * totalLaps;

  // Caixas de itens a cada 240-320 metros
  for (let d = 180; d < fullDistance - 150; d += 260 + Math.random() * 60) {
    const usedLanes = [...LANE_OFFSETS].sort(() => Math.random() - 0.5).slice(0, 2);
    usedLanes.forEach(xPos => {
      entities.push({
        id: 'box_' + Math.floor(d) + '_' + xPos,
        type: 'item_box',
        distance: d,
        x: xPos,
        width: 32,
        height: 32,
        respawnTimer: 0
      });
    });
  }

  // Pads de Turbo no chão a cada 320-420 metros
  for (let d = 280; d < fullDistance - 120; d += 360 + Math.random() * 80) {
    const lane = LANE_OFFSETS[Math.floor(Math.random() * LANE_OFFSETS.length)];
    entities.push({
      id: 'boost_' + Math.floor(d) + '_' + lane,
      type: 'boost_pad',
      distance: d,
      x: lane,
      width: 42,
      height: 48
    });
  }

  // Obstáculos espaçados com pelo menos 2 faixas sempre livres para desvio
  for (let d = 220; d < fullDistance - 80; d += 190 + Math.random() * 70) {
    const obsLanes = [...LANE_OFFSETS].sort(() => Math.random() - 0.5).slice(0, 1 + (Math.random() > 0.6 ? 1 : 0));
    obsLanes.forEach(lane => {
      const obsTypes = ['cone', 'barrier', 'drone'];
      const type = obsTypes[Math.floor(Math.random() * obsTypes.length)];
      entities.push({
        id: 'obs_' + Math.floor(d) + '_' + lane,
        type: 'obstacle',
        subType: type,
        distance: d,
        x: lane,
        width: type === 'barrier' ? 44 : 30,
        height: 28,
        respawnTimer: 0
      });
    });
  }

  return entities;
}

// Preenche vagas restantes na sala com Bots
function populateBots(room) {
  for (const [id, player] of room.players.entries()) {
    if (player.isBot) room.players.delete(id);
  }

  if (!room.fillBots) return;

  const currentCount = room.players.size;
  const needed = Math.max(0, 4 - currentCount);

  for (let i = 0; i < needed; i++) {
    const botId = 'bot_' + i + '_' + Date.now();
    const botColor = AVAILABLE_COLORS[(currentCount + i) % AVAILABLE_COLORS.length];
    const botName = BOT_NAMES[i % BOT_NAMES.length];

    room.players.set(botId, {
      id: botId,
      name: botName,
      color: botColor,
      isHost: false,
      isBot: true,
      ready: true,
      x: LANE_OFFSETS[(currentCount + i) % 4],
      targetX: LANE_OFFSETS[(currentCount + i) % 4],
      distance: 0,
      speed: 0,
      maxSpeed: 6.5 + Math.random() * 0.5,
      accel: 0.14 + Math.random() * 0.02,
      steerSpeed: 4.4,
      nitroRemaining: 100,
      nitroActive: false,
      nitroTimer: 0,
      shieldActive: false,
      shieldTimer: 0,
      spunTimer: 0,
      empTimer: 0,
      draftTimer: 0,
      draftActive: false,
      invulnerableTimer: 0,
      item: null,
      lapsCompleted: 0,
      finished: false,
      finishTime: null,
      finishRank: 0,
      crashesCount: 0,
      itemsUsedCount: 0,
      topSpeed: 0,
      score: 0,
      botReactionTimer: 0,
      inputs: { left: false, right: false, up: true, down: false, nitro: false, useItem: false }
    });
  }
}

// Inicia a corrida da sala
function startRoomRace(room) {
  room.status = 'starting';
  room.countdown = 3;
  room.finishers = [];
  room.activeHazards = [];
  room.trackEntities = buildTrackEntities(room.trackLength, room.totalLaps);

  populateBots(room);

  let idx = 0;
  for (const player of room.players.values()) {
    player.distance = 0;
    player.speed = 0;
    player.x = LANE_OFFSETS[idx % 4];
    player.targetX = player.x;
    player.nitroRemaining = 100;
    player.nitroActive = false;
    player.nitroTimer = 0;
    player.shieldActive = false;
    player.shieldTimer = 0;
    player.spunTimer = 0;
    player.empTimer = 0;
    player.draftTimer = 0;
    player.draftActive = false;
    player.invulnerableTimer = 0;
    player.item = null;
    player.finished = false;
    player.finishTime = null;
    player.finishRank = 0;
    player.lapsCompleted = 0;
    player.crashesCount = 0;
    player.itemsUsedCount = 0;
    player.topSpeed = 0;
    idx++;
  }

  io.to(room.code).emit('race_starting', {
    countdown: room.countdown,
    players: Array.from(room.players.values()),
    trackLength: room.trackLength,
    totalLaps: room.totalLaps,
    mode: room.mode
  });

  const countdownInterval = setInterval(() => {
    room.countdown--;
    if (room.countdown > 0) {
      io.to(room.code).emit('countdown_tick', { countdown: room.countdown });
    } else if (room.countdown === 0) {
      io.to(room.code).emit('countdown_tick', { countdown: 0 });
      room.status = 'racing';
      room.raceStartTime = Date.now();
      clearInterval(countdownInterval);
      launchGameLoop(room);
    }
  }, 1000);
}

// Itens sorteados aleatoriamente
const ITEM_POOL = ['boost', 'shield', 'oil', 'emp', 'missile'];

function getRandomItem() {
  return ITEM_POOL[Math.floor(Math.random() * ITEM_POOL.length)];
}

// Usa o item do jogador
function executeItemUse(room, player) {
  if (!player.item) return;
  const itemType = player.item;
  player.item = null;
  player.itemsUsedCount = (player.itemsUsedCount || 0) + 1;

  io.to(room.code).emit('item_activated', {
    playerId: player.id,
    type: itemType,
    playerName: player.name
  });

  if (itemType === 'boost') {
    player.nitroActive = true;
    player.nitroTimer = 75; // ~2.5s a 30fps
  } else if (itemType === 'shield') {
    player.shieldActive = true;
    player.shieldTimer = 300;
  } else if (itemType === 'oil') {
    room.activeHazards.push({
      id: 'hazard_oil_' + Date.now() + '_' + Math.random(),
      type: 'oil',
      x: player.x,
      distance: Math.max(0, player.distance - 20),
      ownerId: player.id,
      lifetime: 500
    });
  } else if (itemType === 'emp') {
    for (const other of room.players.values()) {
      if (other.id !== player.id && !other.finished) {
        const distDiff = Math.abs(other.distance - player.distance);
        if (distDiff < 160) {
          if (other.shieldActive) {
            other.shieldActive = false;
            other.shieldTimer = 0;
            io.to(room.code).emit('shield_blocked', { playerId: other.id });
          } else {
            other.empTimer = 65;
            other.crashesCount = (other.crashesCount || 0) + 1;
          }
        }
      }
    }
  } else if (itemType === 'missile') {
    let target = null;
    let minForwardDist = Infinity;
    for (const other of room.players.values()) {
      if (other.id !== player.id && !other.finished && other.distance > player.distance) {
        const diff = other.distance - player.distance;
        if (diff < minForwardDist) {
          minForwardDist = diff;
          target = other;
        }
      }
    }

    room.activeHazards.push({
      id: 'hazard_missile_' + Date.now(),
      type: 'missile',
      x: player.x,
      distance: player.distance + 15,
      speed: 18,
      targetId: target ? target.id : null,
      ownerId: player.id,
      lifetime: 140
    });
  }
}

// Loop de física e sincronização a 30 FPS
function launchGameLoop(room) {
  if (room.gameLoopInterval) clearInterval(room.gameLoopInterval);

  room.gameLoopInterval = setInterval(() => {
    if (room.status !== 'racing') {
      clearInterval(room.gameLoopInterval);
      return;
    }

    const playersList = Array.from(room.players.values());
    const totalTrackDistance = room.trackLength * room.totalLaps;

    // 1. Atualizar IA dos Bots
    playersList.forEach(player => {
      if (player.isBot && !player.finished) {
        updateBotAI(player, room, playersList);
      }
    });

    // 2. Atualizar física de cada jogador
    playersList.forEach(player => {
      if (player.finished) {
        player.speed = Math.max(0, player.speed - 0.15);
        player.distance += player.speed * 0.4;
        return;
      }

      // Temporizadores de efeitos
      if (player.spunTimer > 0) {
        player.spunTimer--;
        player.speed = Math.max(1.8, player.speed - 0.3);
      }
      if (player.empTimer > 0) {
        player.empTimer--;
      }
      if (player.invulnerableTimer > 0) {
        player.invulnerableTimer--;
      }
      if (player.shieldTimer > 0) {
        player.shieldTimer--;
        if (player.shieldTimer <= 0) player.shieldActive = false;
      }
      if (player.nitroTimer > 0) {
        player.nitroTimer--;
        if (player.nitroTimer <= 0) player.nitroActive = false;
      }

      // Velocidade máxima atual
      let currentMaxSpeed = player.maxSpeed;
      if (player.nitroActive) {
        currentMaxSpeed = player.maxSpeed * 1.55;
      } else if (player.draftActive) {
        currentMaxSpeed = player.maxSpeed * 1.20;
      }

      if (player.empTimer > 0) {
        currentMaxSpeed *= 0.55;
      }
      if (player.spunTimer > 0) {
        currentMaxSpeed = Math.min(currentMaxSpeed, 2.5);
      }

      // Aceleração / Frenagem
      const isAccelerating = player.inputs.up || player.isBot;
      const isBraking = player.inputs.down;

      if (isAccelerating && player.spunTimer <= 0) {
        if (player.speed < currentMaxSpeed) {
          player.speed += player.accel * (player.nitroActive ? 2.0 : 1.0);
        } else {
          player.speed = Math.max(currentMaxSpeed, player.speed - 0.08);
        }
      } else if (isBraking) {
        player.speed = Math.max(0, player.speed - 0.35);
      } else {
        player.speed = Math.max(0, player.speed - 0.08);
      }

      // Direção lateral (limites: -175 a +175)
      if (player.spunTimer <= 0) {
        if (player.inputs.left) {
          player.x = Math.max(-175, player.x - player.steerSpeed);
        }
        if (player.inputs.right) {
          player.x = Math.min(175, player.x + player.steerSpeed);
        }
      }

      // Avanço longitudinal na pista
      player.distance += player.speed;

      // Registrar velocidade máxima para as estatísticas
      player.topSpeed = Math.max(player.topSpeed || 0, player.speed);

      // Volta atual
      const currentLap = Math.min(
        room.totalLaps,
        Math.floor(player.distance / room.trackLength) + 1
      );
      player.lapsCompleted = currentLap;

      // Uso de itens
      if (player.inputs.useItem && player.item) {
        executeItemUse(room, player);
        player.inputs.useItem = false;
      }

      // Ativação manual de nitro
      if (player.inputs.nitro && player.nitroRemaining > 25 && !player.nitroActive) {
        player.nitroActive = true;
        player.nitroTimer = 45;
        player.nitroRemaining = Math.max(0, player.nitroRemaining - 30);
      }

      // Regeneração de nitro
      if (!player.nitroActive && player.nitroRemaining < 100) {
        player.nitroRemaining = Math.min(100, player.nitroRemaining + 0.18);
      }

      // Linha de Chegada
      if (player.distance >= totalTrackDistance && !player.finished) {
        player.finished = true;
        player.finishTime = ((Date.now() - room.raceStartTime) / 1000).toFixed(2);
        player.finishRank = room.finishers.length + 1;
        room.finishers.push({
          id: player.id,
          name: player.name,
          color: player.color,
          isBot: player.isBot,
          time: player.finishTime,
          rank: player.finishRank,
          crashes: player.crashesCount || 0,
          itemsUsed: player.itemsUsedCount || 0,
          topSpeed: Math.round((player.topSpeed || player.speed) * 22)
        });

        io.to(room.code).emit('player_finished', {
          playerId: player.id,
          rank: player.finishRank,
          time: player.finishTime,
          name: player.name
        });

        if (room.finishers.length === 1 && playersList.length > 1) {
          setTimeout(() => {
            if (room.status === 'racing') {
              finalizeRace(room);
            }
          }, 15000);
        }
      }
    });

    // 3. Vácuo (Slipstream)
    for (let i = 0; i < playersList.length; i++) {
      const p1 = playersList[i];
      if (p1.finished) continue;
      p1.draftActive = false;

      for (let j = 0; j < playersList.length; j++) {
        if (i === j) continue;
        const p2 = playersList[j];
        const distDiff = p2.distance - p1.distance;
        const lateralDiff = Math.abs(p2.x - p1.x);

        if (distDiff > 14 && distDiff < 65 && lateralDiff < 34) {
          p1.draftTimer += 1;
          if (p1.draftTimer > 20) {
            p1.draftActive = true;
          }
          break;
        }
      }
      if (!p1.draftActive && p1.draftTimer > 0) {
        p1.draftTimer = Math.max(0, p1.draftTimer - 2);
      }
    }

    // 4. Colisões entre jogadores (Bump)
    for (let i = 0; i < playersList.length; i++) {
      for (let j = i + 1; j < playersList.length; j++) {
        const a = playersList[i];
        const b = playersList[j];
        if (a.finished || b.finished) continue;

        const distDiff = Math.abs(a.distance - b.distance);
        const latDiff = Math.abs(a.x - b.x);

        if (distDiff < 26 && latDiff < 28) {
          const push = 10;
          if (a.x < b.x) {
            a.x = Math.max(-175, a.x - push);
            b.x = Math.min(175, b.x + push);
          } else {
            a.x = Math.min(175, a.x + push);
            b.x = Math.max(-175, b.x - push);
          }
          io.to(room.code).emit('car_bump', {
            x: (a.x + b.x) / 2,
            distance: (a.distance + b.distance) / 2
          });
        }
      }
    }

    // 5. Interação com Entidades da Pista com Detecção de Colisão Precisa
    room.trackEntities.forEach(entity => {
      if (entity.respawnTimer > 0) {
        entity.respawnTimer--;
        return;
      }

      playersList.forEach(player => {
        if (player.finished) return;

        // O parachoque dianteiro do carro fica em player.distance + 18
        // O parachoque traseiro fica em player.distance - 20
        const relDist = entity.distance - player.distance;
        const latDiff = Math.abs(player.x - entity.x);

        // Caixa de colisão calibrada para o momento exato do impacto visual
        if (relDist <= 22 && relDist >= -16 && latDiff < 30) {
          if (entity.type === 'item_box') {
            if (!player.item) {
              player.item = getRandomItem();
              entity.respawnTimer = 180;
              io.to(room.code).emit('item_collected', {
                boxId: entity.id,
                playerId: player.id,
                item: player.item
              });
            }
          } else if (entity.type === 'boost_pad') {
            player.speed = Math.min(player.maxSpeed * 1.5, player.speed + 3.5);
            player.nitroActive = true;
            player.nitroTimer = 40;
            io.to(room.code).emit('boost_hit', {
              playerId: player.id,
              padId: entity.id
            });
          } else if (entity.type === 'obstacle') {
            if (player.invulnerableTimer > 0) return;

            if (player.shieldActive) {
              player.shieldActive = false;
              player.shieldTimer = 0;
              player.invulnerableTimer = 25;
              entity.respawnTimer = 80;
              io.to(room.code).emit('shield_blocked', { playerId: player.id });
            } else {
              player.crashesCount = (player.crashesCount || 0) + 1;
              player.speed = Math.max(1.8, player.speed * 0.4);
              player.spunTimer = 22;
              player.invulnerableTimer = 35; // Evita múltiplas batidas no mesmo obstáculo
              entity.respawnTimer = 80;
              io.to(room.code).emit('obstacle_hit', {
                playerId: player.id,
                obsId: entity.id,
                x: player.x,
                distance: player.distance
              });
            }
          }
        }
      });
    });

    // 6. Projéteis e Armadilhas
    for (let i = room.activeHazards.length - 1; i >= 0; i--) {
      const h = room.activeHazards[i];
      h.lifetime--;

      if (h.type === 'missile') {
        h.distance += h.speed;

        let hit = false;
        playersList.forEach(player => {
          if (player.id !== h.ownerId && !player.finished) {
            const dDiff = Math.abs(player.distance - h.distance);
            const lDiff = Math.abs(player.x - h.x);
            if (dDiff < 24 && lDiff < 30) {
              hit = true;
              if (player.shieldActive) {
                player.shieldActive = false;
                player.shieldTimer = 0;
                player.invulnerableTimer = 25;
                io.to(room.code).emit('shield_blocked', { playerId: player.id });
              } else {
                player.crashesCount = (player.crashesCount || 0) + 1;
                player.spunTimer = 35;
                player.invulnerableTimer = 35;
                player.speed = Math.max(1.5, player.speed * 0.3);
              }
              io.to(room.code).emit('missile_exploded', {
                x: player.x,
                distance: player.distance,
                targetId: player.id
              });
            }
          }
        });

        if (hit || h.lifetime <= 0) {
          room.activeHazards.splice(i, 1);
        }
      } else if (h.type === 'oil') {
        let stepped = false;
        playersList.forEach(player => {
          if (!player.finished && player.invulnerableTimer <= 0) {
            const dDiff = Math.abs(player.distance - h.distance);
            const lDiff = Math.abs(player.x - h.x);
            if (dDiff < 18 && lDiff < 24) {
              stepped = true;
              if (player.shieldActive) {
                player.shieldActive = false;
                player.shieldTimer = 0;
                player.invulnerableTimer = 25;
                io.to(room.code).emit('shield_blocked', { playerId: player.id });
              } else {
                player.crashesCount = (player.crashesCount || 0) + 1;
                player.spunTimer = 30;
                player.invulnerableTimer = 35;
                player.speed = Math.max(1.5, player.speed * 0.35);
              }
              io.to(room.code).emit('oil_slip', {
                playerId: player.id,
                x: player.x,
                distance: player.distance
              });
            }
          }
        });

        if (stepped || h.lifetime <= 0) {
          room.activeHazards.splice(i, 1);
        }
      }
    }

    // 7. Ordenar posições na corrida
    const sorted = [...playersList].sort((a, b) => {
      if (a.finished && b.finished) return a.finishRank - b.finishRank;
      if (a.finished) return -1;
      if (b.finished) return 1;
      return b.distance - a.distance;
    });

    sorted.forEach((p, index) => {
      p.liveRank = index + 1;
    });

    // 8. Enviar estado para a sala
    io.to(room.code).emit('game_tick', {
      players: playersList.map(p => ({
        id: p.id,
        name: p.name,
        color: p.color,
        isBot: p.isBot,
        x: p.x,
        distance: p.distance,
        speed: p.speed,
        nitroRemaining: p.nitroRemaining,
        nitroActive: p.nitroActive,
        shieldActive: p.shieldActive,
        spunTimer: p.spunTimer,
        empTimer: p.empTimer,
        draftActive: p.draftActive,
        invulnerableTimer: p.invulnerableTimer,
        item: p.item,
        lapsCompleted: p.lapsCompleted,
        crashesCount: p.crashesCount,
        finished: p.finished,
        finishRank: p.finishRank,
        liveRank: p.liveRank
      })),
      hazards: room.activeHazards,
      trackEntities: room.trackEntities.filter(e => e.respawnTimer <= 0)
    });

    const activeHumans = playersList.filter(p => !p.isBot);
    const allFinished = playersList.every(p => p.finished);
    const allHumansFinished = activeHumans.every(p => p.finished);

    if (allFinished || (activeHumans.length > 0 && allHumansFinished)) {
      finalizeRace(room);
    }
  }, 33);
}

// Lógica de piloto automático para os Bots
function updateBotAI(bot, room, allPlayers) {
  bot.botReactionTimer = (bot.botReactionTimer || 0) + 1;

  if (bot.botReactionTimer % 8 === 0) {
    const lookAheadDist = 140;
    const nearbyHazard = room.trackEntities.find(
      e => e.type === 'obstacle' && e.distance > bot.distance && e.distance < bot.distance + lookAheadDist && Math.abs(e.x - bot.x) < 38
    );

    if (nearbyHazard) {
      const altLanes = LANE_OFFSETS.filter(l => Math.abs(l - nearbyHazard.x) > 55);
      bot.targetX = altLanes[Math.floor(Math.random() * altLanes.length)] || 0;
    } else {
      const goodTarget = room.trackEntities.find(
        e => (e.type === 'item_box' || e.type === 'boost_pad') && e.distance > bot.distance && e.distance < bot.distance + 180
      );
      if (goodTarget && Math.random() > 0.3) {
        bot.targetX = goodTarget.x;
      }
    }
  }

  if (bot.targetX !== undefined) {
    const diff = bot.targetX - bot.x;
    if (Math.abs(diff) > 4) {
      bot.inputs.left = diff < 0;
      bot.inputs.right = diff > 0;
    } else {
      bot.inputs.left = false;
      bot.inputs.right = false;
    }
  }

  if (bot.item && Math.random() < 0.05) {
    if (bot.item === 'boost' || bot.item === 'shield') {
      executeItemUse(room, bot);
    } else if (bot.item === 'missile') {
      const someoneAhead = allPlayers.some(p => p.id !== bot.id && p.distance > bot.distance && p.distance < bot.distance + 280);
      if (someoneAhead) executeItemUse(room, bot);
    } else if (bot.item === 'oil' || bot.item === 'emp') {
      const someoneBehind = allPlayers.some(p => p.id !== bot.id && Math.abs(p.distance - bot.distance) < 70);
      if (someoneBehind) executeItemUse(room, bot);
    }
  }

  if (bot.nitroRemaining > 80 && Math.random() < 0.03) {
    bot.nitroActive = true;
    bot.nitroTimer = 40;
    bot.nitroRemaining -= 30;
  }
}

// Finaliza a corrida e envia pódio com todas as estatísticas detalhadas
function finalizeRace(room) {
  if (room.status === 'podium') return;
  room.status = 'podium';
  if (room.gameLoopInterval) clearInterval(room.gameLoopInterval);

  const playersList = Array.from(room.players.values());
  const unfinished = playersList.filter(p => !p.finished).sort((a, b) => b.distance - a.distance);

  unfinished.forEach(p => {
    room.finishers.push({
      id: p.id,
      name: p.name,
      color: p.color,
      isBot: p.isBot,
      time: 'DNF',
      rank: room.finishers.length + 1,
      crashes: p.crashesCount || 0,
      itemsUsed: p.itemsUsedCount || 0,
      topSpeed: Math.round((p.topSpeed || p.speed || 0) * 22)
    });
  });

  io.to(room.code).emit('race_game_over', {
    podium: room.finishers,
    totalLaps: room.totalLaps
  });
}

// =============================================================================
// CONEXÕES SOCKET.IO
// =============================================================================
io.on('connection', socket => {
  let currentRoomCode = null;

  socket.on('create_room', data => {
    const code = generateRoomCode();
    const room = createRoom(code, socket.id, data.nickname, data.color);
    if (data.mode) room.mode = data.mode;
    if (data.laps) room.totalLaps = parseInt(data.laps, 10);
    if (data.fillBots !== undefined) room.fillBots = data.fillBots;

    rooms.set(code, room);
    socket.join(code);
    currentRoomCode = code;

    socket.emit('room_created', {
      code,
      player: room.players.get(socket.id),
      room: {
        code,
        hostId: room.hostId,
        mode: room.mode,
        totalLaps: room.totalLaps,
        fillBots: room.fillBots,
        players: Array.from(room.players.values())
      }
    });

    emitPublicRooms();
  });

  socket.on('join_room', data => {
    const code = (data.roomCode || '').toUpperCase().trim();
    const room = rooms.get(code);

    if (!room) {
      return socket.emit('error_message', { message: 'Sala não encontrada. Verifique o código!' });
    }

    if (room.status !== 'lobby') {
      return socket.emit('error_message', { message: 'Esta partida já começou!' });
    }

    const humanCount = Array.from(room.players.values()).filter(p => !p.isBot).length;
    if (humanCount >= 4) {
      return socket.emit('error_message', { message: 'Esta sala já está cheia (máximo 4 jogadores)!' });
    }

    let chosenColor = data.color || AVAILABLE_COLORS[room.players.size % AVAILABLE_COLORS.length];

    const newPlayer = {
      id: socket.id,
      name: data.nickname || `Piloto ${room.players.size + 1}`,
      color: chosenColor,
      isHost: false,
      isBot: false,
      ready: false,
      x: LANE_OFFSETS[room.players.size % 4],
      targetX: LANE_OFFSETS[room.players.size % 4],
      distance: 0,
      speed: 0,
      maxSpeed: 6.8,
      accel: 0.15,
      steerSpeed: 4.8,
      nitroRemaining: 100,
      nitroActive: false,
      nitroTimer: 0,
      shieldActive: false,
      shieldTimer: 0,
      spunTimer: 0,
      empTimer: 0,
      draftTimer: 0,
      draftActive: false,
      invulnerableTimer: 0,
      item: null,
      lapsCompleted: 0,
      finished: false,
      finishTime: null,
      finishRank: 0,
      crashesCount: 0,
      itemsUsedCount: 0,
      topSpeed: 0,
      score: 0,
      inputs: { left: false, right: false, up: false, down: false, nitro: false, useItem: false }
    };

    room.players.set(socket.id, newPlayer);
    socket.join(code);
    currentRoomCode = code;

    socket.emit('room_joined', {
      code,
      player: newPlayer,
      room: {
        code,
        hostId: room.hostId,
        mode: room.mode,
        totalLaps: room.totalLaps,
        fillBots: room.fillBots,
        players: Array.from(room.players.values())
      }
    });

    io.to(code).emit('player_list_updated', {
      players: Array.from(room.players.values())
    });

    emitPublicRooms();
  });

  socket.on('toggle_ready', () => {
    if (!currentRoomCode) return;
    const room = rooms.get(currentRoomCode);
    if (!room) return;

    const player = room.players.get(socket.id);
    if (player) {
      player.ready = !player.ready;
      io.to(currentRoomCode).emit('player_list_updated', {
        players: Array.from(room.players.values())
      });
    }
  });

  socket.on('update_room_settings', data => {
    if (!currentRoomCode) return;
    const room = rooms.get(currentRoomCode);
    if (!room || room.hostId !== socket.id) return;

    if (data.mode) room.mode = data.mode;
    if (data.laps) room.totalLaps = parseInt(data.laps, 10);
    if (data.fillBots !== undefined) room.fillBots = data.fillBots;

    io.to(currentRoomCode).emit('room_settings_updated', {
      mode: room.mode,
      totalLaps: room.totalLaps,
      fillBots: room.fillBots
    });
  });

  socket.on('start_race_request', () => {
    if (!currentRoomCode) return;
    const room = rooms.get(currentRoomCode);
    if (!room || room.hostId !== socket.id) return;
    if (room.status !== 'lobby') return;

    startRoomRace(room);
  });

  socket.on('player_input', inputs => {
    if (!currentRoomCode) return;
    const room = rooms.get(currentRoomCode);
    if (!room || room.status !== 'racing') return;

    const player = room.players.get(socket.id);
    if (player && !player.finished) {
      player.inputs = {
        left: !!inputs.left,
        right: !!inputs.right,
        up: !!inputs.up,
        down: !!inputs.down,
        nitro: !!inputs.nitro,
        useItem: !!inputs.useItem
      };
    }
  });

  socket.on('rematch_request', () => {
    if (!currentRoomCode) return;
    const room = rooms.get(currentRoomCode);
    if (!room) return;

    room.status = 'lobby';
    room.finishers = [];
    room.activeHazards = [];
    room.trackEntities = [];

    for (const [id, player] of room.players.entries()) {
      if (player.isBot) {
        room.players.delete(id);
      } else {
        player.ready = false;
        player.finished = false;
        player.finishRank = 0;
        player.distance = 0;
        player.speed = 0;
        player.crashesCount = 0;
        player.itemsUsedCount = 0;
        player.topSpeed = 0;
      }
    }

    io.to(currentRoomCode).emit('returned_to_lobby', {
      room: {
        code: room.code,
        hostId: room.hostId,
        mode: room.mode,
        totalLaps: room.totalLaps,
        fillBots: room.fillBots,
        players: Array.from(room.players.values())
      }
    });
  });

  socket.on('disconnect', () => {
    if (!currentRoomCode) return;
    const room = rooms.get(currentRoomCode);
    if (!room) return;

    room.players.delete(socket.id);

    if (room.hostId === socket.id) {
      const remainingHumans = Array.from(room.players.values()).filter(p => !p.isBot);
      if (remainingHumans.length > 0) {
        remainingHumans[0].isHost = true;
        room.hostId = remainingHumans[0].id;
      }
    }

    const humanCount = Array.from(room.players.values()).filter(p => !p.isBot).length;
    if (humanCount === 0) {
      if (room.gameLoopInterval) clearInterval(room.gameLoopInterval);
      rooms.delete(currentRoomCode);
    } else {
      io.to(currentRoomCode).emit('player_list_updated', {
        players: Array.from(room.players.values())
      });
    }

    emitPublicRooms();
  });
});

function emitPublicRooms() {
  const publicList = [];
  for (const [code, room] of rooms.entries()) {
    if (room.status === 'lobby') {
      const humanPlayers = Array.from(room.players.values()).filter(p => !p.isBot);
      publicList.push({
        code,
        playersCount: humanPlayers.length,
        maxPlayers: 4,
        mode: room.mode,
        laps: room.totalLaps
      });
    }
  }
  io.emit('public_rooms_list', publicList);
}

server.listen(PORT, '0.0.0.0', () => {
  const ips = getLocalIpAddresses();
  console.log('================================================================');
  console.log('🏁 INOVATECH TURBO DRIFT - SERVIDOR INICIADO COM SUCESSO! 🏁');
  console.log('================================================================');
  console.log(`📡 Localhost:     http://localhost:${PORT}`);
  ips.forEach(ip => {
    console.log(`📱 Rede Wi-Fi/IP: http://${ip}:${PORT}`);
  });
  console.log('================================================================');
});
