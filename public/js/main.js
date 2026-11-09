// =============================================================================
// INOVATECH TURBO DRIFT - CLIENTE SOCKET.IO E CONTROLADOR PRINCIPAL
// =============================================================================

// Detecção dinâmica de conexão Socket.IO (funciona via Node direto ou Apache WAMP)
const socketUrl = window.location.port === '3000' 
  ? window.location.origin 
  : `${window.location.protocol}//${window.location.hostname}:3000`;

const socket = io(socketUrl, {
  transports: ['websocket', 'polling']
});

// Elementos da interface
const screens = {
  home: document.getElementById('screen-home'),
  lobby: document.getElementById('screen-lobby'),
  game: document.getElementById('screen-game'),
  podium: document.getElementById('screen-podium')
};

// Estado local da aplicação
const appState = {
  nickname: localStorage.getItem('inova_nickname') || 'Piloto-' + Math.floor(Math.random() * 900 + 100),
  color: '#00f5d4',
  roomCode: null,
  isHost: false,
  myId: null,
  totalLaps: 3,
  trackLength: 2200,
  gameState: null,
  localInputs: {
    left: false,
    right: false,
    up: true, // Aceleração suave contínua estilo arcade
    down: false,
    nitro: false,
    useItem: false
  }
};

// Canvas e Renderizador
const canvas = document.getElementById('gameCanvas');
const renderer = new GameRenderer(canvas);

// Inicializar redimensionamento
window.addEventListener('resize', () => renderer.resize());
window.addEventListener('orientationchange', () => setTimeout(() => renderer.resize(), 200));

// =============================================================================
// TROCA DE TELAS (SPA)
// =============================================================================
function showScreen(screenName) {
  Object.keys(screens).forEach(name => {
    if (screens[name]) {
      screens[name].classList.toggle('active', name === screenName);
    }
  });

  if (screenName === 'game') {
    renderer.resize();
    gameAudio.ensureContext();
    gameAudio.startEngine();
  } else {
    gameAudio.stopEngine();
  }
}

// =============================================================================
// CONFIGURAÇÃO INICIAL E SELEÇÃO DE CORES
// =============================================================================
const nickInput = document.getElementById('input-nickname');
nickInput.value = appState.nickname;
nickInput.addEventListener('input', e => {
  appState.nickname = e.target.value.trim() || 'Piloto';
  localStorage.setItem('inova_nickname', appState.nickname);
});

// Color picker buttons
const colorButtons = document.querySelectorAll('.color-option');
colorButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    colorButtons.forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');
    appState.color = btn.getAttribute('data-color');
  });
});

// Checar parâmetro da URL (?room=XYZ)
const urlParams = new URLSearchParams(window.location.search);
const roomParam = urlParams.get('room');
if (roomParam) {
  document.getElementById('input-room-code').value = roomParam.toUpperCase();
}

// Botões da Tela Inicial
document.getElementById('btn-create-room').addEventListener('click', () => {
  gameAudio.ensureContext();
  socket.emit('create_room', {
    nickname: appState.nickname,
    color: appState.color,
    laps: 3,
    fillBots: true
  });
});

document.getElementById('btn-join-room').addEventListener('click', () => {
  gameAudio.ensureContext();
  const code = document.getElementById('input-room-code').value.trim();
  if (!code) {
    alert('Digite o código da sala!');
    return;
  }
  socket.emit('join_room', {
    roomCode: code,
    nickname: appState.nickname,
    color: appState.color
  });
});

// =============================================================================
// LOBBY DA SALA
// =============================================================================
function updateLobbyUI(room) {
  document.getElementById('display-room-code').textContent = room.code;

  // Atualiza link de compartilhamento
  const shareUrl = `${window.location.protocol}//${window.location.host}${window.location.pathname}?room=${room.code}`;
  document.getElementById('share-room-link').value = shareUrl;

  // Carrega QR Code da sala via API do servidor
  fetch(`/api/qrcode?url=${encodeURIComponent(shareUrl)}`)
    .then(res => res.json())
    .then(data => {
      if (data.qrcode) {
        document.getElementById('lobby-qrcode-img').src = data.qrcode;
      }
    })
    .catch(() => {});

  // Renderizar slots de jogadores (até 4)
  const slotsContainer = document.getElementById('lobby-players-list');
  slotsContainer.innerHTML = '';

  const humans = room.players.filter(p => !p.isBot);
  for (let i = 0; i < 4; i++) {
    const player = humans[i];
    const slotCard = document.createElement('div');
    slotCard.className = `player-slot ${player ? 'filled' : 'empty'}`;

    if (player) {
      const isMe = player.id === appState.myId;
      slotCard.innerHTML = `
        <div class="player-color-indicator" style="background: ${player.color}; box-shadow: 0 0 10px ${player.color}"></div>
        <div class="player-info">
          <span class="player-name">${player.name} ${isMe ? '<small>(Você)</small>' : ''}</span>
          <span class="player-role">${player.isHost ? '👑 Anfitrião' : (player.ready ? '✅ Pronto' : '⏳ Aguardando')}</span>
        </div>
      `;
    } else {
      slotCard.innerHTML = `
        <div class="player-empty-icon"><i class="fas fa-user-plus"></i></div>
        <div class="player-info">
          <span class="player-name text-muted">Vaga Livre</span>
          <span class="player-role text-muted">Aguardando...</span>
        </div>
      `;
    }
    slotsContainer.appendChild(slotCard);
  }

  // Controles do Host
  const isHost = room.hostId === appState.myId;
  appState.isHost = isHost;

  const hostControls = document.getElementById('host-controls-panel');
  const btnStart = document.getElementById('btn-start-race');
  const btnReady = document.getElementById('btn-toggle-ready');

  if (isHost) {
    hostControls.style.display = 'block';
    btnStart.style.display = 'inline-block';
    btnReady.style.display = 'none';
  } else {
    hostControls.style.display = 'none';
    btnStart.style.display = 'none';
    btnReady.style.display = 'inline-block';
  }
}

// Botão Copiar Link
document.getElementById('btn-copy-link').addEventListener('click', () => {
  const linkInput = document.getElementById('share-room-link');
  linkInput.select();
  navigator.clipboard.writeText(linkInput.value);
  const copyBtn = document.getElementById('btn-copy-link');
  copyBtn.innerHTML = '<i class="fas fa-check"></i> Copiado!';
  setTimeout(() => {
    copyBtn.innerHTML = '<i class="fas fa-copy"></i> Copiar';
  }, 2000);
});

// Ações do Host
document.getElementById('select-laps').addEventListener('change', e => {
  if (appState.isHost) {
    socket.emit('update_room_settings', {
      laps: e.target.value
    });
  }
});

document.getElementById('checkbox-fill-bots').addEventListener('change', e => {
  if (appState.isHost) {
    socket.emit('update_room_settings', {
      fillBots: e.target.checked
    });
  }
});

document.getElementById('btn-start-race').addEventListener('click', () => {
  gameAudio.ensureContext();
  socket.emit('start_race_request');
});

document.getElementById('btn-toggle-ready').addEventListener('click', () => {
  gameAudio.ensureContext();
  socket.emit('toggle_ready');
});

document.getElementById('btn-leave-lobby').addEventListener('click', () => {
  window.location.href = window.location.pathname;
});

// =============================================================================
// CONTROLE DE TECLADO E TOQUE (MOBILE GAMEPAD)
// =============================================================================
const keyMap = {
  ArrowLeft: 'left',
  KeyA: 'left',
  ArrowRight: 'right',
  KeyD: 'right',
  ArrowUp: 'up',
  KeyW: 'up',
  ArrowDown: 'down',
  KeyS: 'down',
  Space: 'useItem',
  ShiftLeft: 'nitro',
  ShiftRight: 'nitro'
};

window.addEventListener('keydown', e => {
  const action = keyMap[e.code];
  if (action) {
    appState.localInputs[action] = true;
    sendInputs();
    if (e.code === 'Space') e.preventDefault();
  }
});

window.addEventListener('keyup', e => {
  const action = keyMap[e.code];
  if (action) {
    appState.localInputs[action] = false;
    sendInputs();
  }
});

function sendInputs() {
  socket.emit('player_input', appState.localInputs);
}

// Botões Touch no Celular
function setupTouchButton(btnId, action) {
  const btn = document.getElementById(btnId);
  if (!btn) return;

  const startAction = e => {
    e.preventDefault();
    gameAudio.ensureContext();
    appState.localInputs[action] = true;
    sendInputs();
    btn.classList.add('active');
  };

  const endAction = e => {
    e.preventDefault();
    appState.localInputs[action] = false;
    sendInputs();
    btn.classList.remove('active');
  };

  btn.addEventListener('touchstart', startAction, { passive: false });
  btn.addEventListener('touchend', endAction, { passive: false });
  btn.addEventListener('mousedown', startAction);
  btn.addEventListener('mouseup', endAction);
  btn.addEventListener('mouseleave', endAction);
}

setupTouchButton('btn-touch-left', 'left');
setupTouchButton('btn-touch-right', 'right');
setupTouchButton('btn-touch-nitro', 'nitro');
setupTouchButton('btn-touch-item', 'useItem');
setupTouchButton('btn-touch-brake', 'down');

// =============================================================================
// HUD E ATUALIZAÇÃO DO JOGO
// =============================================================================
const itemIcons = {
  boost: { icon: 'fa-bolt', name: 'TURBO NITRO', color: '#00f5d4' },
  shield: { icon: 'fa-shield-halved', name: 'ESCUDO', color: '#38bdf8' },
  oil: { icon: 'fa-oil-can', name: 'ÓLEO GLITCH', color: '#a855f7' },
  emp: { icon: 'fa-radiation', name: 'PULSO EMP', color: '#ec4899' },
  missile: { icon: 'fa-rocket', name: 'MÍSSIL CYBER', color: '#ef4444' }
};

function updateHUD(localPlayer, allPlayers) {
  if (!localPlayer) return;

  // Velocímetro digital
  const speedKmH = Math.round(localPlayer.speed * 12);
  document.getElementById('hud-speed-value').textContent = speedKmH;

  // Barra de Nitro
  const nitroPct = Math.round(localPlayer.nitroRemaining || 0);
  document.getElementById('hud-nitro-fill').style.width = `${nitroPct}%`;

  // Volta Atual
  const curLap = Math.min(appState.totalLaps, localPlayer.lapsCompleted || 1);
  document.getElementById('hud-lap-text').textContent = `${curLap}/${appState.totalLaps}`;

  // Posição Atual (1º, 2º, 3º, 4º)
  const rank = localPlayer.liveRank || 1;
  document.getElementById('hud-rank-text').textContent = `${rank}º`;

  // Item Armazenado
  const itemSlot = document.getElementById('hud-item-slot');
  if (localPlayer.item && itemIcons[localPlayer.item]) {
    const itemData = itemIcons[localPlayer.item];
    itemSlot.innerHTML = `<i class="fas ${itemData.icon}" style="color: ${itemData.color}"></i>`;
    itemSlot.classList.add('has-item');
    document.getElementById('hud-item-label').textContent = itemData.name;
  } else {
    itemSlot.innerHTML = `<i class="fas fa-question text-muted"></i>`;
    itemSlot.classList.remove('has-item');
    document.getElementById('hud-item-label').textContent = 'SEM ITEM';
  }

  // Minimapa de Progresso da Corrida
  updateMinimap(allPlayers);

  // Áudio do motor dinâmico
  const speedRatio = localPlayer.speed / 28;
  gameAudio.updateEnginePitch(speedRatio);
}

// Atualiza marcadores coloridos de cada carro no minimapa
function updateMinimap(players) {
  const minimapTrack = document.getElementById('minimap-track-line');
  if (!minimapTrack) return;

  const totalTrackDistance = appState.trackLength * appState.totalLaps;
  minimapTrack.innerHTML = '';

  players.forEach(p => {
    const progress = Math.min(1, Math.max(0, p.distance / totalTrackDistance));
    const dot = document.createElement('div');
    dot.className = 'minimap-dot';
    dot.style.left = `${progress * 100}%`;
    dot.style.background = p.color;
    dot.style.boxShadow = `0 0 8px ${p.color}`;
    if (p.id === appState.myId) {
      dot.classList.add('is-local');
    }
    minimapTrack.appendChild(dot);
  });
}

// Botão de Áudio Mute
const btnAudioToggle = document.getElementById('btn-audio-toggle');
btnAudioToggle.addEventListener('click', () => {
  const isMuted = gameAudio.toggleMute();
  btnAudioToggle.innerHTML = isMuted 
    ? '<i class="fas fa-volume-xmark"></i>' 
    : '<i class="fas fa-volume-high"></i>';
});

// =============================================================================
// EVENTOS RECEBIDOS DO SERVIDOR (SOCKET.IO)
// =============================================================================
socket.on('connect', () => {
  appState.myId = socket.id;
  document.getElementById('server-status-pill').textContent = 'ONLINE';
  document.getElementById('server-status-pill').classList.add('online');
});

socket.on('disconnect', () => {
  document.getElementById('server-status-pill').textContent = 'OFFLINE';
  document.getElementById('server-status-pill').classList.remove('online');
});

socket.on('error_message', data => {
  alert(data.message);
});

socket.on('room_created', data => {
  appState.roomCode = data.code;
  showScreen('lobby');
  updateLobbyUI(data.room);
});

socket.on('room_joined', data => {
  appState.roomCode = data.code;
  showScreen('lobby');
  updateLobbyUI(data.room);
});

socket.on('player_list_updated', data => {
  const currentRoom = {
    code: appState.roomCode,
    hostId: appState.isHost ? appState.myId : null,
    players: data.players
  };
  updateLobbyUI(currentRoom);
});

socket.on('room_settings_updated', data => {
  if (data.totalLaps) {
    document.getElementById('select-laps').value = data.totalLaps;
  }
  if (data.fillBots !== undefined) {
    document.getElementById('checkbox-fill-bots').checked = data.fillBots;
  }
});

// Início da Corrida
socket.on('race_starting', data => {
  appState.totalLaps = data.totalLaps;
  appState.trackLength = data.trackLength;
  showScreen('game');

  // Mostra overlay de contagem
  const countdownOverlay = document.getElementById('countdown-overlay');
  countdownOverlay.classList.add('active');
  document.getElementById('countdown-number').textContent = data.countdown;
  gameAudio.playCountdown(false);
});

socket.on('countdown_tick', data => {
  const countdownNumber = document.getElementById('countdown-number');
  if (data.countdown > 0) {
    countdownNumber.textContent = data.countdown;
    countdownNumber.className = 'countdown-num pulse';
    gameAudio.playCountdown(false);
  } else {
    countdownNumber.textContent = 'VAI!';
    countdownNumber.className = 'countdown-num go';
    gameAudio.playCountdown(true);
    setTimeout(() => {
      document.getElementById('countdown-overlay').classList.remove('active');
    }, 900);
  }
});

// Loop principal de renderização a 60 FPS
let currentTickData = null;
socket.on('game_tick', data => {
  currentTickData = data;
  const localPlayer = data.players.find(p => p.id === appState.myId);
  updateHUD(localPlayer, data.players);
});

function gameLoopAnimation() {
  if (screens.game.classList.contains('active') && currentTickData) {
    renderer.render(currentTickData, appState.myId, appState.totalLaps, appState.trackLength);
  }
  requestAnimationFrame(gameLoopAnimation);
}
requestAnimationFrame(gameLoopAnimation);

// Efeitos de Gameplay recebidos do Servidor
socket.on('item_collected', data => {
  if (data.playerId === appState.myId) {
    gameAudio.playItemBoxPickup();
    renderer.addFloatingText(renderer.viewWidth / 2, renderer.viewHeight * 0.7, '+ITEM!', '#f59e0b');
  }
});

socket.on('boost_hit', data => {
  if (data.playerId === appState.myId) {
    gameAudio.playBoost();
    renderer.addFloatingText(renderer.viewWidth / 2, renderer.viewHeight * 0.7, 'TURBO PAD!', '#00f5d4');
  }
});

socket.on('obstacle_hit', data => {
  if (data.playerId === appState.myId) {
    gameAudio.playOilSpin();
    renderer.triggerShake(14);
    renderer.addSpark(renderer.viewWidth / 2, renderer.viewHeight * 0.7, '#f97316', 20);
    renderer.addFloatingText(renderer.viewWidth / 2, renderer.viewHeight * 0.7, 'BATIDA!', '#ef4444');
  }
});

socket.on('car_bump', () => {
  gameAudio.playBump();
  renderer.addSpark(renderer.viewWidth / 2, renderer.viewHeight * 0.7, '#facc15', 10);
});

socket.on('item_activated', data => {
  if (data.type === 'boost') {
    if (data.playerId === appState.myId) gameAudio.playBoost();
  } else if (data.type === 'shield') {
    if (data.playerId === appState.myId) gameAudio.playShield();
  } else if (data.type === 'emp') {
    gameAudio.playEmp();
    renderer.triggerShake(10);
  } else if (data.type === 'missile') {
    gameAudio.playMissileLaunch();
  }
});

socket.on('missile_exploded', data => {
  gameAudio.playExplosion();
  if (data.targetId === appState.myId) {
    renderer.triggerShake(18);
    renderer.addFloatingText(renderer.viewWidth / 2, renderer.viewHeight * 0.7, 'ATINGIDO POR MÍSSIL!', '#ef4444');
  }
});

socket.on('shield_blocked', data => {
  if (data.playerId === appState.myId) {
    gameAudio.playShieldBreak();
    renderer.addFloatingText(renderer.viewWidth / 2, renderer.viewHeight * 0.7, 'ESCUDO BLOQUEOU!', '#38bdf8');
  }
});

socket.on('oil_slip', data => {
  if (data.playerId === appState.myId) {
    gameAudio.playOilSpin();
    renderer.triggerShake(10);
    renderer.addFloatingText(renderer.viewWidth / 2, renderer.viewHeight * 0.7, 'DERRAPOU NO ÓLEO!', '#a855f7');
  }
});

socket.on('player_finished', data => {
  if (data.playerId === appState.myId) {
    gameAudio.playVictory();
    renderer.addFloatingText(renderer.viewWidth / 2, renderer.viewHeight * 0.5, `🏁 CHEGOU EM ${data.rank}º LUGAR! 🏁`, '#facc15');
  }
});

// Fim de Partida e Pódio
socket.on('race_game_over', data => {
  showScreen('podium');
  gameAudio.playVictory();

  const podiumList = document.getElementById('podium-results-list');
  podiumList.innerHTML = '';

  const trophyIcons = ['🥇', '🥈', '🥉', '🏁'];
  const rankClasses = ['gold', 'silver', 'bronze', 'fourth'];

  data.podium.forEach((player, index) => {
    const isMe = player.id === appState.myId;
    const card = document.createElement('div');
    card.className = `podium-card ${rankClasses[index] || ''} ${isMe ? 'is-me' : ''}`;
    card.innerHTML = `
      <div class="podium-rank-icon">${trophyIcons[index] || `${index + 1}º`}</div>
      <div class="podium-player-color" style="background: ${player.color}; box-shadow: 0 0 12px ${player.color}"></div>
      <div class="podium-player-info">
        <span class="podium-player-name">${player.name} ${isMe ? '<strong>(Você)</strong>' : ''} ${player.isBot ? '<small class="badge-bot">BOT</small>' : ''}</span>
        <span class="podium-player-time">Tempo: ${player.time !== 'DNF' ? `${player.time}s` : 'DNF (Não terminou)'}</span>
      </div>
      <div class="podium-rank-badge">${index + 1}º Lugar</div>
    `;
    podiumList.appendChild(card);
  });
});

// Botão Jogar Novamente
document.getElementById('btn-podium-rematch').addEventListener('click', () => {
  socket.emit('rematch_request');
});

socket.on('returned_to_lobby', data => {
  showScreen('lobby');
  updateLobbyUI(data.room);
});

// Botão Sair para o Menu
document.getElementById('btn-podium-home').addEventListener('click', () => {
  window.location.href = window.location.pathname;
});

// Lista de salas públicas no menu
socket.on('public_rooms_list', list => {
  const container = document.getElementById('public-rooms-container');
  if (!container) return;

  if (list.length === 0) {
    container.innerHTML = '<p class="text-muted small text-center">Nenhuma outra sala pública aberta no momento. Crie a sua!</p>';
    return;
  }

  container.innerHTML = '';
  list.forEach(r => {
    const item = document.createElement('div');
    item.className = 'public-room-item';
    item.innerHTML = `
      <div>
        <strong>Sala ${r.code}</strong>
        <span class="badge">${r.playersCount}/${r.maxPlayers} Jogadores</span>
      </div>
      <button class="btn btn-sm btn-outline-cyan" onclick="joinSpecificRoom('${r.code}')">Entrar</button>
    `;
    container.appendChild(item);
  });
});

window.joinSpecificRoom = function(code) {
  gameAudio.ensureContext();
  socket.emit('join_room', {
    roomCode: code,
    nickname: appState.nickname,
    color: appState.color
  });
};
