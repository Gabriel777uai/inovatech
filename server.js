const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const os = require('os');
const QRCode = require('qrcode');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

const PORT = process.env.PORT || 3000;

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
    mode: 'race', // 'race' | 'survival'
    totalLaps: 3,
    trackLength: 2200, // metros por volta
    status: 'lobby', // 'lobby' | 'starting' | 'racing' | 'podium'
    countdown: 3,
    fillBots: true, // Preenche vagas vazias com Bots para sempre ter 4 carros
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
          // Física e posição na pista (-180 a +180 no eixo X)
          x: -60,
          y: 0,
          targetX: -60,
          distance: 0,
          speed: 0,
          maxSpeed: 17,
          accel: 0.22,
          steerSpeed: 4.5,
          nitroRemaining: 100,
          nitroActive: false,
          nitroTimer: 0,
          shieldActive: false,
          shieldTimer: 0,
          spunTimer: 0,
          empTimer: 0,
          draftTimer: 0,
          draftActive: false,
          item: null,
          lapsCompleted: 0,
          finished: false,
          finishTime: null,
          finishRank: 0,
          score: 0,
          inputs: { left: false, right: false, up: false, down: false, nitro: false, useItem: false }
        }
      ]
    ]),
    trackEntities: [], // Caixas de itens, pads de turbo, obstáculos
    activeHazards: [], // Manchas de óleo e mísseis em trânsito
    raceStartTime: 0,
    finishers: [],
    gameLoopInterval: null,
    createdAt: Date.now()
  };
}

// Inicializa a pista (obstáculos, itens, pads de turbo)
function buildTrackEntities(trackLength, totalLaps) {
  const entities = [];
  const fullDistance = trackLength * totalLaps;
  const laneOffsets = [-130, -45, 45, 130]; // 4 pistas distintas

  // Gera caixas de itens a cada 180-260 metros
  for (let d = 160; d < fullDistance - 150; d += 210 + Math.random() * 60) {
    // 2 a 3 caixas em faixas aleatórias
    const usedLanes = [...laneOffsets].sort(() => Math.random() - 0.5).slice(0, 2);
    usedLanes.forEach(xPos => {
      entities.push({
        id: 'box_' + Math.floor(d) + '_' + xPos,
        type: 'item_box',
        distance: d,
        x: xPos,
        width: 32,
        height: 32,
        collectedBy: null,
        respawnTimer: 0
      });
    });
  }

  // Gera pads de turbo (Boost Strips)
  for (let d = 260; d < fullDistance - 100; d += 280 + Math.random() * 80) {
    const lane = laneOffsets[Math.floor(Math.random() * laneOffsets.length)];
    entities.push({
      id: 'boost_' + Math.floor(d) + '_' + lane,
      type: 'boost_pad',
      distance: d,
      x: lane,
      width: 40,
      height: 48
    });
  }

  // Gera obstáculos (cones, barreiras cibernéticas, drones)
  for (let d = 200; d < fullDistance - 80; d += 140 + Math.random() * 90) {
    const lane = laneOffsets[Math.floor(Math.random() * laneOffsets.length)];
    const obsTypes = ['cone', 'barrier', 'drone'];
    const type = obsTypes[Math.floor(Math.random() * obsTypes.length)];
    entities.push({
      id: 'obs_' + Math.floor(d) + '_' + lane,
      type: 'obstacle',
      subType: type,
      distance: d,
      x: lane + (Math.random() * 20 - 10),
      width: type === 'barrier' ? 44 : 28,
      height: 28
    });
  }

  return entities;
}

// Preenche vagas restantes na sala com Bots
function populateBots(room) {
  // Remove bots antigos
  for (const [id, player] of room.players.entries()) {
    if (player.isBot) room.players.delete(id);
  }

  if (!room.fillBots) return;

  const currentCount = room.players.size;
  const needed = Math.max(0, 4 - currentCount);
  const laneOffsets = [-130, -45, 45, 130];

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
      x: laneOffsets[(currentCount + i) % 4],
      targetX: laneOffsets[(currentCount + i) % 4],
      distance: 0,
      speed: 0,
      maxSpeed: 16.5 + Math.random() * 1.2,
      accel: 0.20 + Math.random() * 0.04,
      steerSpeed: 4.0,
      nitroRemaining: 100,
      nitroActive: false,
      nitroTimer: 0,
      shieldActive: false,
      shieldTimer: 0,
      spunTimer: 0,
      empTimer: 0,
      draftTimer: 0,
      draftActive: false,
      item: null,
      lapsCompleted: 0,
      finished: false,
      finishTime: null,
      finishRank: 0,
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

  // Preenche com bots se configurado
  populateBots(room);

  // Posiciona os jogadores no grid de largada
  const startXPositions = [-130, -45, 45, 130];
  let idx = 0;
  for (const player of room.players.values()) {
    player.distance = 0;
    player.speed = 0;
    player.x = startXPositions[idx % 4];
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
    player.item = null;
    player.finished = false;
    player.finishTime = null;
    player.finishRank = 0;
    player.lapsCompleted = 0;
    player.score = 0;
    idx++;
  }

  io.to(room.code).emit('race_starting', {
    countdown: room.countdown,
    players: Array.from(room.players.values()),
    trackLength: room.trackLength,
    totalLaps: room.totalLaps,
    mode: room.mode
  });

  // Contagem regressiva 3, 2, 1, LARGADA!
  const countdownInterval = setInterval(() => {
    room.countdown--;
    if (room.countdown > 0) {
      io.to(room.code).emit('countdown_tick', { countdown: room.countdown });
    } else if (room.countdown === 0) {
      io.to(room.code).emit('countdown_tick', { countdown: 0 }); // 0 = LARGADA / GO!
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

  io.to(room.code).emit('item_activated', {
    playerId: player.id,
    type: itemType,
    playerName: player.name
  });

  if (itemType === 'boost') {
    player.nitroActive = true;
    player.nitroTimer = 85; // ~2.8 segundos a 30fps
  } else if (itemType === 'shield') {
    player.shieldActive = true;
    player.shieldTimer = 300; // 10 segundos ou até quebrar
  } else if (itemType === 'oil') {
    // Solta mancha logo atrás do carro
    room.activeHazards.push({
      id: 'hazard_oil_' + Date.now() + '_' + Math.random(),
      type: 'oil',
      x: player.x,
      distance: Math.max(0, player.distance - 25),
      ownerId: player.id,
      lifetime: 600 // dura 20 segundos
    });
  } else if (itemType === 'emp') {
    // Pulso EMP: afeta rivais em um raio de 180 metros de distância
    for (const other of room.players.values()) {
      if (other.id !== player.id && !other.finished) {
        const distDiff = Math.abs(other.distance - player.distance);
        if (distDiff < 180) {
          if (other.shieldActive) {
            other.shieldActive = false;
            other.shieldTimer = 0;
          } else {
            other.empTimer = 75; // ~2.5s com velocidade reduzida
          }
        }
      }
    }
  } else if (itemType === 'missile') {
    // Encontra o rival mais próximo à frente
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
      speed: 42,
      targetId: target ? target.id : null,
      ownerId: player.id,
      lifetime: 150
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
        // Desacelera gradualmente após cruzar a linha
        player.speed = Math.max(0, player.speed - 0.2);
        player.distance += player.speed * 0.5;
        return;
      }

      // Temporizadores de efeitos negativos
      if (player.spunTimer > 0) {
        player.spunTimer--;
        player.speed = Math.max(3, player.speed - 0.5);
      }
      if (player.empTimer > 0) {
        player.empTimer--;
      }
      if (player.shieldTimer > 0) {
        player.shieldTimer--;
        if (player.shieldTimer <= 0) player.shieldActive = false;
      }

      // Nitro temporizado
      if (player.nitroTimer > 0) {
        player.nitroTimer--;
        if (player.nitroTimer <= 0) player.nitroActive = false;
      }

      // Determina velocidade máxima atual
      let currentMaxSpeed = player.maxSpeed;
      if (player.nitroActive) {
        currentMaxSpeed = player.maxSpeed * 1.55;
      } else if (player.draftActive) {
        currentMaxSpeed = player.maxSpeed * 1.20;
      }

      if (player.empTimer > 0) {
        currentMaxSpeed *= 0.55; // Redução de velocidade por EMP
      }
      if (player.spunTimer > 0) {
        currentMaxSpeed = Math.min(currentMaxSpeed, 5);
      }

      // Aceleração / Frenagem
      const isAccelerating = player.inputs.up || player.isBot;
      const isBraking = player.inputs.down;

      if (isAccelerating && player.spunTimer <= 0) {
        if (player.speed < currentMaxSpeed) {
          player.speed += player.accel * (player.nitroActive ? 2.0 : 1.0);
        } else {
          player.speed = Math.max(currentMaxSpeed, player.speed - 0.1);
        }
      } else if (isBraking) {
        player.speed = Math.max(0, player.speed - 0.45);
      } else {
        // Desaceleração natural
        player.speed = Math.max(0, player.speed - 0.12);
      }

      // Direção lateral (Eixo X entre -175 e +175)
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

      // Calcular volta atual
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
      if (player.inputs.nitro && player.nitroRemaining > 20 && !player.nitroActive) {
        player.nitroActive = true;
        player.nitroTimer = 45;
        player.nitroRemaining = Math.max(0, player.nitroRemaining - 35);
      }

      // Regeneração gradual de nitro
      if (!player.nitroActive && player.nitroRemaining < 100) {
        player.nitroRemaining = Math.min(100, player.nitroRemaining + 0.15);
      }

      // Verificação de Linha de Chegada
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
          rank: player.finishRank
        });

        io.to(room.code).emit('player_finished', {
          playerId: player.id,
          rank: player.finishRank,
          time: player.finishTime,
          name: player.name
        });

        // Se o 1º colocado terminou, agenda o encerramento da corrida em 12 segundos caso outros ainda não terminem
        if (room.finishers.length === 1 && playersList.length > 1) {
          setTimeout(() => {
            if (room.status === 'racing') {
              finalizeRace(room);
            }
          }, 14000);
        }
      }
    });

    // 3. Efeito Vácuo (Slipstream / Drafting)
    for (let i = 0; i < playersList.length; i++) {
      const p1 = playersList[i];
      if (p1.finished) continue;
      p1.draftActive = false;

      for (let j = 0; j < playersList.length; j++) {
        if (i === j) continue;
        const p2 = playersList[j];
        const distDiff = p2.distance - p1.distance;
        const lateralDiff = Math.abs(p2.x - p1.x);

        // Se p2 está logo à frente (entre 18 e 75m) e no mesmo alinhamento
        if (distDiff > 18 && distDiff < 75 && lateralDiff < 36) {
          p1.draftTimer += 1;
          if (p1.draftTimer > 25) {
            p1.draftActive = true;
          }
          break;
        }
      }
      if (!p1.draftActive && p1.draftTimer > 0) {
        p1.draftTimer = Math.max(0, p1.draftTimer - 2);
      }
    }

    // 4. Colisões entre jogadores (Bump & Spark)
    for (let i = 0; i < playersList.length; i++) {
      for (let j = i + 1; j < playersList.length; j++) {
        const a = playersList[i];
        const b = playersList[j];
        if (a.finished || b.finished) continue;

        const distDiff = Math.abs(a.distance - b.distance);
        const latDiff = Math.abs(a.x - b.x);

        if (distDiff < 32 && latDiff < 30) {
          // Empurra lateralmente em direções opostas
          const push = 12;
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

    // 5. Interação com Entidades da Pista (Itens, Boosts, Obstáculos)
    room.trackEntities.forEach(entity => {
      // Reativação de caixas de itens
      if (entity.respawnTimer > 0) {
        entity.respawnTimer--;
        return;
      }

      playersList.forEach(player => {
        if (player.finished) return;
        const distDiff = Math.abs(player.distance - entity.distance);
        const latDiff = Math.abs(player.x - entity.x);

        if (distDiff < 25 && latDiff < 32) {
          if (entity.type === 'item_box' && entity.respawnTimer <= 0) {
            if (!player.item) {
              player.item = getRandomItem();
              entity.respawnTimer = 180; // ~6 segundos para reaparecer
              io.to(room.code).emit('item_collected', {
                boxId: entity.id,
                playerId: player.id,
                item: player.item
              });
            }
          } else if (entity.type === 'boost_pad') {
            player.speed = Math.min(player.maxSpeed * 1.5, player.speed + 6);
            player.nitroActive = true;
            player.nitroTimer = 40;
            io.to(room.code).emit('boost_hit', {
              playerId: player.id,
              padId: entity.id
            });
          } else if (entity.type === 'obstacle') {
            if (player.shieldActive) {
              player.shieldActive = false;
              player.shieldTimer = 0;
              io.to(room.code).emit('shield_blocked', { playerId: player.id });
            } else {
              player.speed = Math.max(3, player.speed * 0.4);
              player.spunTimer = 25; // Roda e perde controle por ~0.8s
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

    // 6. Atualizar Projéteis e Armadilhas (Mísseis e Óleo)
    for (let i = room.activeHazards.length - 1; i >= 0; i--) {
      const h = room.activeHazards[i];
      h.lifetime--;

      if (h.type === 'missile') {
        h.distance += h.speed;

        // Tenta acertar alvo
        let hit = false;
        playersList.forEach(player => {
          if (player.id !== h.ownerId && !player.finished) {
            const dDiff = Math.abs(player.distance - h.distance);
            const lDiff = Math.abs(player.x - h.x);
            if (dDiff < 30 && lDiff < 35) {
              hit = true;
              if (player.shieldActive) {
                player.shieldActive = false;
                player.shieldTimer = 0;
              } else {
                player.spunTimer = 45;
                player.speed = Math.max(2, player.speed * 0.3);
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
        // Verifica se alguém pisou no óleo
        let stepped = false;
        playersList.forEach(player => {
          if (!player.finished) {
            const dDiff = Math.abs(player.distance - h.distance);
            const lDiff = Math.abs(player.x - h.x);
            if (dDiff < 20 && lDiff < 26) {
              stepped = true;
              if (player.shieldActive) {
                player.shieldActive = false;
                player.shieldTimer = 0;
              } else {
                player.spunTimer = 40;
                player.speed = Math.max(2, player.speed * 0.35);
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

    // 7. Ordenar posições na corrida (1º, 2º, 3º, 4º)
    const sorted = [...playersList].sort((a, b) => {
      if (a.finished && b.finished) return a.finishRank - b.finishRank;
      if (a.finished) return -1;
      if (b.finished) return 1;
      return b.distance - a.distance;
    });

    sorted.forEach((p, index) => {
      p.liveRank = index + 1;
    });

    // 8. Enviar estado para todos os clientes da sala
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
        item: p.item,
        lapsCompleted: p.lapsCompleted,
        finished: p.finished,
        finishRank: p.finishRank,
        liveRank: p.liveRank
      })),
      hazards: room.activeHazards,
      trackEntities: room.trackEntities.filter(e => e.respawnTimer <= 0)
    });

    // Se todos terminaram, finalizar corrida
    const activeHumans = playersList.filter(p => !p.isBot);
    const allFinished = playersList.every(p => p.finished);
    const allHumansFinished = activeHumans.every(p => p.finished);

    if (allFinished || (activeHumans.length > 0 && allHumansFinished)) {
      finalizeRace(room);
    }
  }, 33); // ~30 fps
}

// Lógica de piloto automático para os Bots
function updateBotAI(bot, room, allPlayers) {
  bot.botReactionTimer = (bot.botReactionTimer || 0) + 1;
  const laneOffsets = [-130, -45, 45, 130];

  // Desviar de obstáculos e caixas no caminho
  if (bot.botReactionTimer % 10 === 0) {
    const lookAheadDist = 180;
    const nearbyHazard = room.trackEntities.find(
      e => e.type === 'obstacle' && e.distance > bot.distance && e.distance < bot.distance + lookAheadDist && Math.abs(e.x - bot.x) < 40
    );

    if (nearbyHazard) {
      // Escolhe faixa adjacente livre
      const alternativeLanes = laneOffsets.filter(l => Math.abs(l - nearbyHazard.x) > 60);
      bot.targetX = alternativeLanes[Math.floor(Math.random() * alternativeLanes.length)] || 0;
    } else {
      // Mira em caixas de itens ou pads de turbo
      const goodTarget = room.trackEntities.find(
        e => (e.type === 'item_box' || e.type === 'boost_pad') && e.distance > bot.distance && e.distance < bot.distance + 220
      );
      if (goodTarget && Math.random() > 0.3) {
        bot.targetX = goodTarget.x;
      }
    }
  }

  // Suaviza movimentação até a posição alvo
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

  // Uso inteligente de itens pelo Bot
  if (bot.item && Math.random() < 0.05) {
    if (bot.item === 'boost' || bot.item === 'shield') {
      executeItemUse(room, bot);
    } else if (bot.item === 'missile') {
      const someoneAhead = allPlayers.some(p => p.id !== bot.id && p.distance > bot.distance && p.distance < bot.distance + 350);
      if (someoneAhead) executeItemUse(room, bot);
    } else if (bot.item === 'oil' || bot.item === 'emp') {
      const someoneBehind = allPlayers.some(p => p.id !== bot.id && Math.abs(p.distance - bot.distance) < 80);
      if (someoneBehind) executeItemUse(room, bot);
    }
  }

  // Uso inteligente de Nitro
  if (bot.nitroRemaining > 75 && Math.random() < 0.02) {
    bot.nitroActive = true;
    bot.nitroTimer = 45;
    bot.nitroRemaining -= 35;
  }
}

// Finaliza a corrida e envia pódio
function finalizeRace(room) {
  if (room.status === 'podium') return;
  room.status = 'podium';
  if (room.gameLoopInterval) clearInterval(room.gameLoopInterval);

  // Garante que todos que não terminaram recebam uma classificação por distância
  const playersList = Array.from(room.players.values());
  const unfinished = playersList.filter(p => !p.finished).sort((a, b) => b.distance - a.distance);

  unfinished.forEach(p => {
    room.finishers.push({
      id: p.id,
      name: p.name,
      color: p.color,
      isBot: p.isBot,
      time: 'DNF',
      rank: room.finishers.length + 1
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

  // Cria uma nova sala
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

  // Entra em uma sala existente
  socket.on('join_room', data => {
    const code = (data.roomCode || '').toUpperCase().trim();
    const room = rooms.get(code);

    if (!room) {
      return socket.emit('error_message', { message: 'Sala não encontrada. Verifique o código!' });
    }

    if (room.status !== 'lobby') {
      return socket.emit('error_message', { message: 'Esta partida já começou!' });
    }

    // Contar apenas humanos conectados
    const humanCount = Array.from(room.players.values()).filter(p => !p.isBot).length;
    if (humanCount >= 4) {
      return socket.emit('error_message', { message: 'Esta sala já está cheia (máximo 4 jogadores)!' });
    }

    // Escolhe cor não repetida se possível
    let chosenColor = data.color || AVAILABLE_COLORS[room.players.size % AVAILABLE_COLORS.length];

    const newPlayer = {
      id: socket.id,
      name: data.nickname || `Piloto ${room.players.size + 1}`,
      color: chosenColor,
      isHost: false,
      isBot: false,
      ready: false,
      x: 0,
      targetX: 0,
      distance: 0,
      speed: 0,
      maxSpeed: 17,
      accel: 0.22,
      steerSpeed: 4.5,
      nitroRemaining: 100,
      nitroActive: false,
      nitroTimer: 0,
      shieldActive: false,
      shieldTimer: 0,
      spunTimer: 0,
      empTimer: 0,
      draftTimer: 0,
      draftActive: false,
      item: null,
      lapsCompleted: 0,
      finished: false,
      finishTime: null,
      finishRank: 0,
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

  // Alternar status de "Pronto"
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

  // Atualizar configurações da sala pelo Host
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

  // Iniciar partida (Host)
  socket.on('start_race_request', () => {
    if (!currentRoomCode) return;
    const room = rooms.get(currentRoomCode);
    if (!room || room.hostId !== socket.id) return;
    if (room.status !== 'lobby') return;

    startRoomRace(room);
  });

  // Receber comandos de entrada do jogador
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

  // Reiniciar para o Lobby após a partida
  socket.on('rematch_request', () => {
    if (!currentRoomCode) return;
    const room = rooms.get(currentRoomCode);
    if (!room) return;

    room.status = 'lobby';
    room.finishers = [];
    room.activeHazards = [];
    room.trackEntities = [];

    // Remove bots para voltar ao lobby limpo
    for (const [id, player] of room.players.entries()) {
      if (player.isBot) {
        room.players.delete(id);
      } else {
        player.ready = false;
        player.finished = false;
        player.finishRank = 0;
        player.distance = 0;
        player.speed = 0;
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

  // Desconexão
  socket.on('disconnect', () => {
    if (!currentRoomCode) return;
    const room = rooms.get(currentRoomCode);
    if (!room) return;

    room.players.delete(socket.id);

    // Se o host saiu, transfere a liderança para o próximo humano
    if (room.hostId === socket.id) {
      const remainingHumans = Array.from(room.players.values()).filter(p => !p.isBot);
      if (remainingHumans.length > 0) {
        remainingHumans[0].isHost = true;
        room.hostId = remainingHumans[0].id;
      }
    }

    // Se a sala ficou sem humanos, exclui após 30 segundos
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

// Emite lista de salas abertas para quem está no menu
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

// Iniciar servidor HTTP
server.listen(PORT, () => {
  const ips = getLocalIpAddresses();
  console.log('================================================================');
  console.log('🏁 INOVATECH TURBO DRIFT - SERVIDOR INICIADO COM SUCESSO! 🏁');
  console.log('================================================================');
  console.log(`📡 Localhost:     http://localhost:${PORT}`);
  ips.forEach(ip => {
    console.log(`📱 Rede Wi-Fi/IP: http://${ip}:${PORT}`);
  });
  console.log('================================================================');
  console.log('Apresentação para Feira de Inovação Tecnológica pronta!');
  console.log('Conecte computadores ou celulares na mesma rede Wi-Fi.');
  console.log('================================================================');
});
