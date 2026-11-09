// =============================================================================
// INOVATECH TURBO DRIFT - CLIENTE SOCKET.IO E CONTROLADOR PRINCIPAL
// Com análise estatística gráfica (Chart.js) para apresentação acadêmica
// =============================================================================

// Conexão dinâmica Socket.IO (funciona via Node direto na porta 3000 ou Apache WAMP)
const socketUrl = window.location.port === '3000' 
  ? window.location.origin 
  : `${window.location.protocol}//${window.location.hostname}:3000`;

const socket = io(socketUrl, {
  transports: ['websocket', 'polling']
});

// Configuração estética global do Chart.js para tema Cyberpunk Neon
if (typeof Chart !== 'undefined') {
  Chart.defaults.color = '#94a3b8';
  Chart.defaults.borderColor = 'rgba(0, 245, 212, 0.12)';
  Chart.defaults.font.family = "'Rubik', sans-serif";
  Chart.defaults.plugins.tooltip.backgroundColor = 'rgba(6, 10, 18, 0.95)';
  Chart.defaults.plugins.tooltip.borderColor = '#00f5d4';
  Chart.defaults.plugins.tooltip.borderWidth = 1;
}

// Instâncias globais de gráficos para destruição/atualização segura
let podiumChartInstance = null;
let historyEvolutionChartInstance = null;
let historyDistributionChartInstance = null;
let lastPodiumData = null;

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
  trackLength: 1600,
  gameState: null,
  localInputs: {
    left: false,
    right: false,
    up: true,
    down: false,
    nitro: false,
    useItem: false
  }
};

// Canvas e Renderizador
const canvas = document.getElementById('gameCanvas');
const renderer = new GameRenderer(canvas);

window.addEventListener('resize', () => renderer.resize());
window.addEventListener('orientationchange', () => setTimeout(() => renderer.resize(), 200));

// =============================================================================
// GERENCIADOR DE HISTÓRICO PESSOAL (LOCAL STORAGE)
// =============================================================================
const STORAGE_KEY = 'inovatech_personal_stats';

function getPersonalHistory() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return {
      totalRaces: 0,
      wins: 0,
      podiums: 0,
      bestTime: null,
      totalCrashes: 0,
      recentRaces: []
    };
  }
  try {
    return JSON.parse(raw);
  } catch (e) {
    return { totalRaces: 0, wins: 0, podiums: 0, bestTime: null, totalCrashes: 0, recentRaces: [] };
  }
}

function savePersonalRaceStats(myResult, totalLaps) {
  if (!myResult) return;
  const history = getPersonalHistory();

  history.totalRaces++;
  if (myResult.rank === 1) history.wins++;
  if (myResult.rank <= 3) history.podiums++;

  if (myResult.time && myResult.time !== 'DNF') {
    const numTime = parseFloat(myResult.time);
    if (!history.bestTime || numTime < history.bestTime) {
      history.bestTime = numTime;
    }
  }

  const crashes = myResult.crashes || 0;
  history.totalCrashes += crashes;

  const now = new Date();
  const timeFormatted = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

  const entry = {
    id: 'race_' + Date.now(),
    timeLabel: timeFormatted,
    rank: myResult.rank,
    time: myResult.time,
    crashes: crashes,
    itemsUsed: myResult.itemsUsed || 0,
    topSpeed: myResult.topSpeed || 0,
    laps: totalLaps
  };

  history.recentRaces.unshift(entry);
  if (history.recentRaces.length > 20) {
    history.recentRaces = history.recentRaces.slice(0, 20);
  }

  localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
}

// Inserir dados de demonstração para a banca/professores na feira
function loadSampleDataForDemo() {
  const sample = {
    totalRaces: 8,
    wins: 3,
    podiums: 6,
    bestTime: 31.8,
    totalCrashes: 12,
    recentRaces: [
      { id: '1', timeLabel: '14:10', rank: 1, time: '31.8', crashes: 1, itemsUsed: 4, topSpeed: 215, laps: 3 },
      { id: '2', timeLabel: '14:02', rank: 2, time: '33.2', crashes: 2, itemsUsed: 3, topSpeed: 198, laps: 3 },
      { id: '3', timeLabel: '13:50', rank: 1, time: '32.1', crashes: 0, itemsUsed: 5, topSpeed: 218, laps: 3 },
      { id: '4', timeLabel: '13:38', rank: 3, time: '36.4', crashes: 3, itemsUsed: 2, topSpeed: 185, laps: 3 },
      { id: '5', timeLabel: '13:25', rank: 1, time: '32.5', crashes: 1, itemsUsed: 4, topSpeed: 212, laps: 3 },
      { id: '6', timeLabel: '13:12', rank: 2, time: '34.9', crashes: 2, itemsUsed: 3, topSpeed: 192, laps: 3 },
      { id: '7', timeLabel: '12:55', rank: 4, time: '39.8', crashes: 4, itemsUsed: 1, topSpeed: 175, laps: 3 }
    ]
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(sample));
  renderPersonalHistoryModal();
}

// =============================================================================
// RENDERIZADOR DE GRÁFICOS (CHART.JS)
// =============================================================================

// 1. Gráfico Comparativo entre os 4 Pilotos da Corrida Atual (Pódio)
function renderPodiumComparisonChart(podiumList) {
  if (!podiumList || typeof Chart === 'undefined') return;
  const ctx = document.getElementById('podiumComparisonChart');
  if (!ctx) return;

  if (podiumChartInstance) {
    podiumChartInstance.destroy();
  }

  const labels = podiumList.map(p => p.name + (p.isBot ? ' [BOT]' : ''));
  const times = podiumList.map(p => p.time !== 'DNF' ? parseFloat(p.time) : 0);
  const crashes = podiumList.map(p => p.crashes || 0);
  const items = podiumList.map(p => p.itemsUsed || 0);
  const topSpeeds = podiumList.map(p => p.topSpeed || 0);

  podiumChartInstance = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [
        {
          label: 'Tempo de Corrida (s)',
          data: times,
          backgroundColor: 'rgba(0, 245, 212, 0.75)',
          borderColor: '#00f5d4',
          borderWidth: 1.5,
          yAxisID: 'y'
        },
        {
          label: 'Batidas (Colisões)',
          data: crashes,
          backgroundColor: 'rgba(239, 68, 68, 0.75)',
          borderColor: '#ef4444',
          borderWidth: 1.5,
          yAxisID: 'y'
        },
        {
          label: 'Itens Usados',
          data: items,
          backgroundColor: 'rgba(245, 158, 11, 0.75)',
          borderColor: '#f59e0b',
          borderWidth: 1.5,
          yAxisID: 'y'
        },
        {
          label: 'Vel. Máxima (KM/H)',
          data: topSpeeds,
          backgroundColor: 'rgba(168, 85, 247, 0.75)',
          borderColor: '#a855f7',
          borderWidth: 1.5,
          yAxisID: 'y1'
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'top',
          labels: { boxWidth: 12, font: { size: 11 } }
        }
      },
      scales: {
        y: {
          type: 'linear',
          display: true,
          position: 'left',
          title: { display: true, text: 'Tempo (s) / Qtd', font: { size: 10 } },
          grid: { color: 'rgba(0, 245, 212, 0.08)' }
        },
        y1: {
          type: 'linear',
          display: true,
          position: 'right',
          title: { display: true, text: 'Velocidade (KM/H)', font: { size: 10 } },
          grid: { drawOnChartArea: false }
        },
        x: {
          grid: { color: 'rgba(255, 255, 255, 0.05)' }
        }
      }
    }
  });
}

// 2. Gráficos do Histórico Pessoal (Linha de Evolução e Rosca de Pódios)
function renderHistoryCharts(history) {
  if (typeof Chart === 'undefined') return;

  // A. Gráfico de Evolução Temporal do Tempo de Volta
  const evolutionCtx = document.getElementById('chartHistoryEvolution');
  if (evolutionCtx) {
    if (historyEvolutionChartInstance) historyEvolutionChartInstance.destroy();

    const chronological = [...history.recentRaces].reverse();
    const raceLabels = chronological.map((r, idx) => `#${idx + 1} (${r.timeLabel})`);
    const raceTimes = chronological.map(r => r.time !== 'DNF' ? parseFloat(r.time) : null);

    historyEvolutionChartInstance = new Chart(evolutionCtx, {
      type: 'line',
      data: {
        labels: raceLabels.length > 0 ? raceLabels : ['Nenhuma corrida'],
        datasets: [
          {
            label: 'Tempo da Corrida (s)',
            data: raceTimes.length > 0 ? raceTimes : [0],
            borderColor: '#00f5d4',
            backgroundColor: 'rgba(0, 245, 212, 0.15)',
            borderWidth: 2.5,
            fill: true,
            tension: 0.35,
            pointBackgroundColor: '#00f5d4',
            pointBorderColor: '#ffffff',
            pointRadius: 4,
            pointHoverRadius: 6
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false }
        },
        scales: {
          y: {
            title: { display: true, text: 'Segundos (s)', font: { size: 10 } },
            grid: { color: 'rgba(0, 245, 212, 0.08)' }
          },
          x: {
            grid: { color: 'rgba(255, 255, 255, 0.05)' },
            ticks: { font: { size: 9 } }
          }
        }
      }
    });
  }

  // B. Gráfico Donut de Distribuição de Posições
  const distributionCtx = document.getElementById('chartHistoryDistribution');
  if (distributionCtx) {
    if (historyDistributionChartInstance) historyDistributionChartInstance.destroy();

    let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
    history.recentRaces.forEach(r => {
      if (r.rank === 1) pos1++;
      else if (r.rank === 2) pos2++;
      else if (r.rank === 3) pos3++;
      else pos4++;
    });

    const hasData = history.recentRaces.length > 0;

    historyDistributionChartInstance = new Chart(distributionCtx, {
      type: 'doughnut',
      data: {
        labels: ['1º Lugar', '2º Lugar', '3º Lugar', '4º Lugar'],
        datasets: [
          {
            data: hasData ? [pos1, pos2, pos3, pos4] : [0, 0, 0, 1],
            backgroundColor: [
              '#facc15', // Ouro
              '#cbd5e1', // Prata
              '#f97316', // Bronze
              '#64748b'  // Cinza
            ],
            borderColor: '#0a101c',
            borderWidth: 2
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'bottom',
            labels: { boxWidth: 10, font: { size: 10 } }
          }
        },
        cutout: '65%'
      }
    });
  }
}

function renderPersonalHistoryModal() {
  let history = getPersonalHistory();

  // Se não tiver corridas gravadas ainda, inicializa com demonstração para a apresentação
  if (history.totalRaces === 0) {
    loadSampleDataForDemo();
    history = getPersonalHistory();
  }

  document.getElementById('hist-total-races').textContent = history.totalRaces;
  const winRate = history.totalRaces > 0 ? Math.round((history.wins / history.totalRaces) * 100) : 0;
  document.getElementById('hist-wins').textContent = `${history.wins} (${winRate}%)`;
  document.getElementById('hist-best-time').textContent = history.bestTime ? `${history.bestTime}s` : '--';
  const avgCrashes = history.totalRaces > 0 ? (history.totalCrashes / history.totalRaces).toFixed(1) : '0.0';
  document.getElementById('hist-avg-crashes').textContent = avgCrashes;

  const tbody = document.getElementById('history-table-body');
  tbody.innerHTML = '';

  if (history.recentRaces.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" style="padding: 14px; color: var(--text-muted);">Nenhuma corrida registrada ainda neste aparelho.</td></tr>';
  } else {
    history.recentRaces.forEach(r => {
      const row = document.createElement('tr');
      const rankClass = r.rank === 1 ? 'rank-badge-1' : (r.rank === 2 ? 'rank-badge-2' : (r.rank === 3 ? 'rank-badge-3' : 'rank-badge-4'));
      const trophy = r.rank === 1 ? '🥇 ' : (r.rank === 2 ? '🥈 ' : (r.rank === 3 ? '🥉 ' : '🏁 '));

      row.innerHTML = `
        <td>${r.timeLabel}</td>
        <td class="${rankClass}">${trophy}${r.rank}º</td>
        <td><strong>${r.time !== 'DNF' ? `${r.time}s` : 'DNF'}</strong></td>
        <td><span style="color: ${r.crashes > 0 ? '#ef4444' : '#10b981'}; font-weight: bold;">${r.crashes}</span></td>
        <td>${r.itemsUsed}</td>
        <td>${r.topSpeed} KM/H</td>
      `;
      tbody.appendChild(row);
    });
  }

  // Renderizar gráficos estatísticos do histórico
  renderHistoryCharts(history);
}

function clearPersonalHistory() {
  if (confirm('Tem certeza que deseja apagar seu histórico pessoal de corridas deste aparelho?')) {
    localStorage.removeItem(STORAGE_KEY);
    renderPersonalHistoryModal();
  }
}

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
    setTimeout(() => renderer.resize(), 50);
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

const colorButtons = document.querySelectorAll('.color-option');
colorButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    colorButtons.forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');
    appState.color = btn.getAttribute('data-color');
  });
});

const urlParams = new URLSearchParams(window.location.search);
const roomParam = urlParams.get('room');
if (roomParam) {
  document.getElementById('input-room-code').value = roomParam.toUpperCase();
}

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

  const shareUrl = `${window.location.protocol}//${window.location.host}${window.location.pathname}?room=${room.code}`;
  document.getElementById('share-room-link').value = shareUrl;

  fetch(`/api/qrcode?url=${encodeURIComponent(shareUrl)}`)
    .then(res => res.json())
    .then(data => {
      if (data.qrcode) {
        document.getElementById('lobby-qrcode-img').src = data.qrcode;
      }
    })
    .catch(() => {});

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
// CONTROLES DE TECLADO E TOQUE (MOBILE GAMEPAD)
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

  const speedKmH = Math.round(localPlayer.speed * 22);
  document.getElementById('hud-speed-value').textContent = speedKmH;

  const nitroPct = Math.round(localPlayer.nitroRemaining || 0);
  document.getElementById('hud-nitro-fill').style.width = `${nitroPct}%`;

  const curLap = Math.min(appState.totalLaps, localPlayer.lapsCompleted || 1);
  document.getElementById('hud-lap-text').textContent = `${curLap}/${appState.totalLaps}`;

  const rank = localPlayer.liveRank || 1;
  document.getElementById('hud-rank-text').textContent = `${rank}º`;

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

  updateMinimap(allPlayers);

  const speedRatio = localPlayer.speed / 11;
  gameAudio.updateEnginePitch(speedRatio);
}

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
    renderer.triggerShake(12);
    renderer.addSpark(renderer.viewWidth / 2, renderer.viewHeight * 0.76, '#f97316', 16);
    renderer.addFloatingText(renderer.viewWidth / 2, renderer.viewHeight * 0.7, 'BATIDA!', '#ef4444');
  }
});

socket.on('car_bump', () => {
  gameAudio.playBump();
  renderer.addSpark(renderer.viewWidth / 2, renderer.viewHeight * 0.76, '#facc15', 8);
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
    renderer.triggerShake(16);
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

// Fim de Partida e Pódio com Estatísticas Detalhadas e Gráficos
socket.on('race_game_over', data => {
  showScreen('podium');
  gameAudio.playVictory();
  lastPodiumData = data.podium;

  const podiumList = document.getElementById('podium-view-list');
  podiumList.innerHTML = '';

  const trophyIcons = ['🥇', '🥈', '🥉', '🏁'];
  const rankClasses = ['gold', 'silver', 'bronze', 'fourth'];

  // Salva no histórico pessoal privado do navegador
  const myResult = data.podium.find(p => p.id === appState.myId);
  if (myResult) {
    savePersonalRaceStats(myResult, data.totalLaps);
  }

  // Preenche cartões do pódio
  data.podium.forEach((player, index) => {
    const isMe = player.id === appState.myId;
    const card = document.createElement('div');
    card.className = `podium-card ${rankClasses[index] || ''} ${isMe ? 'is-me' : ''}`;
    
    const timeDisplay = player.time !== 'DNF' ? `${player.time}s` : 'DNF';
    const crashesDisplay = player.crashes !== undefined ? player.crashes : 0;
    const itemsDisplay = player.itemsUsed !== undefined ? player.itemsUsed : 0;
    const speedDisplay = player.topSpeed ? `${player.topSpeed} KM/H` : '--';

    card.innerHTML = `
      <div class="podium-rank-icon">${trophyIcons[index] || `${index + 1}º`}</div>
      <div class="podium-player-color" style="background: ${player.color}; box-shadow: 0 0 10px ${player.color}"></div>
      <div class="podium-player-info">
        <span class="podium-player-name">${player.name} ${isMe ? '<strong>(Você)</strong>' : ''} ${player.isBot ? '<small class="badge-bot">BOT</small>' : ''}</span>
        <div class="podium-player-stats-row">
          <span class="stat-pill"><i class="fas fa-clock"></i> Tempo: <strong>${timeDisplay}</strong></span>
          <span class="stat-pill"><i class="fas fa-car-burst" style="color: #ef4444;"></i> Batidas: <strong>${crashesDisplay}</strong></span>
          <span class="stat-pill"><i class="fas fa-box" style="color: #f59e0b;"></i> Itens: <strong>${itemsDisplay}</strong></span>
          <span class="stat-pill"><i class="fas fa-bolt" style="color: #00f5d4;"></i> Vel. Máx: <strong>${speedDisplay}</strong></span>
        </div>
      </div>
      <div class="podium-rank-badge">${index + 1}º Lugar</div>
    `;
    podiumList.appendChild(card);
  });

  // Renderizar gráfico comparativo da corrida
  renderPodiumComparisonChart(data.podium);

  // Redefinir para a aba de lista por padrão
  document.getElementById('tab-btn-podium-list').click();
});

// Alternância de Abas na Tela do Pódio
const btnTabPodiumList = document.getElementById('tab-btn-podium-list');
const btnTabPodiumChart = document.getElementById('tab-btn-podium-chart');
const viewPodiumList = document.getElementById('podium-view-list');
const viewPodiumChart = document.getElementById('podium-view-chart');

btnTabPodiumList.addEventListener('click', () => {
  btnTabPodiumList.classList.add('active');
  btnTabPodiumChart.classList.remove('active');
  viewPodiumList.style.display = 'flex';
  viewPodiumChart.style.display = 'none';
});

btnTabPodiumChart.addEventListener('click', () => {
  btnTabPodiumChart.classList.add('active');
  btnTabPodiumList.classList.remove('active');
  viewPodiumList.style.display = 'none';
  viewPodiumChart.style.display = 'block';
  if (lastPodiumData) {
    renderPodiumComparisonChart(lastPodiumData);
  }
});

// Ações do Pódio
document.getElementById('btn-podium-rematch').addEventListener('click', () => {
  socket.emit('rematch_request');
});

socket.on('returned_to_lobby', data => {
  showScreen('lobby');
  updateLobbyUI(data.room);
});

document.getElementById('btn-podium-home').addEventListener('click', () => {
  window.location.href = window.location.pathname;
});

// Salas Públicas
socket.on('public_rooms_list', list => {
  const container = document.getElementById('public-rooms-container');
  if (!container) return;

  if (list.length === 0) {
    container.innerHTML = '<p class="text-muted small text-center" style="color: var(--text-muted); font-size: 0.8rem;">Nenhuma outra sala aberta no momento. Crie a sua!</p>';
    return;
  }

  container.innerHTML = '';
  list.forEach(r => {
    const item = document.createElement('div');
    item.className = 'public-room-item';
    item.innerHTML = `
      <div>
        <strong>Sala ${r.code}</strong>
        <span class="badge" style="margin-left: 6px; font-size: 0.75rem; color: var(--primary-cyan);">${r.playersCount}/${r.maxPlayers} Jogadores</span>
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

// =============================================================================
// MODAL DE HISTÓRICO PESSOAL & ABAS DE GRÁFICOS
// =============================================================================
const modalHistory = document.getElementById('modal-history');
const btnTabHistCharts = document.getElementById('tab-btn-hist-charts');
const btnTabHistTable = document.getElementById('tab-btn-hist-table');
const viewHistCharts = document.getElementById('hist-view-charts');
const viewHistTable = document.getElementById('hist-view-table');

btnTabHistCharts.addEventListener('click', () => {
  btnTabHistCharts.classList.add('active');
  btnTabHistTable.classList.remove('active');
  viewHistCharts.style.display = 'block';
  viewHistTable.style.display = 'none';
  renderHistoryCharts(getPersonalHistory());
});

btnTabHistTable.addEventListener('click', () => {
  btnTabHistTable.classList.add('active');
  btnTabHistCharts.classList.remove('active');
  viewHistCharts.style.display = 'none';
  viewHistTable.style.display = 'block';
});

function openHistoryModal() {
  renderPersonalHistoryModal();
  modalHistory.style.display = 'flex';
  btnTabHistCharts.click();
}

function closeHistoryModal() {
  modalHistory.style.display = 'none';
}

document.getElementById('btn-open-history').addEventListener('click', openHistoryModal);
document.getElementById('btn-podium-view-history').addEventListener('click', openHistoryModal);
document.getElementById('btn-close-history').addEventListener('click', closeHistoryModal);
document.getElementById('btn-clear-history').addEventListener('click', clearPersonalHistory);
modalHistory.addEventListener('click', e => {
  if (e.target === modalHistory) closeHistoryModal();
});
