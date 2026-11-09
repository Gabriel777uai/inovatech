// =============================================================================
// INOVATECH TURBO DRIFT - RENDERIZADOR CANVAS 2D CIBERNÉTICO (60/120 FPS FLUIDO)
// Com curvas dinâmicas, inclinação dos carros (banking) e partículas de drift
// =============================================================================

class GameRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.particles = [];
    this.floatingTexts = [];
    this.skidSparks = [];
    this.screenShake = 0;
    this.cubeRotation = 0;
    this.finishLineDistance = 0;

    // Escala física: 1 metro de distância = 1.0 pixel na tela
    this.distanceScale = 1.0;
    this.roadWidth = 420;
    this.viewWidth = 640;
    this.viewHeight = 720;
    this.cameraPan = 0;
  }

  resize() {
    const parent = this.canvas.parentElement;
    if (!parent) return;
    const rect = parent.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;

    const w = rect.width > 0 ? rect.width : 640;
    const h = rect.height > 0 ? rect.height : 720;

    this.canvas.width = w * dpr;
    this.canvas.height = h * dpr;
    this.ctx.resetTransform();
    this.ctx.scale(dpr, dpr);

    this.viewWidth = w;
    this.viewHeight = h;

    this.roadWidth = Math.min(460, Math.max(310, w * 0.92));
  }

  triggerShake(amount = 10) {
    this.screenShake = amount;
  }

  // Curvatura procedural contínua da rodovia estilo arcade
  getCurveAt(dist) {
    return Math.sin(dist * 0.0026) * 65 + Math.sin(dist * 0.0013) * 35;
  }

  addSpark(x, y, color = '#00f5d4', count = 10) {
    for (let i = 0; i < count; i++) {
      this.particles.push({
        x,
        y,
        vx: (Math.random() - 0.5) * 6,
        vy: (Math.random() - 0.5) * 6 - 1,
        color,
        size: Math.random() * 3 + 1.5,
        alpha: 1,
        decay: Math.random() * 0.03 + 0.02
      });
    }
  }

  addDriftSparks(x, y, color) {
    for (let i = 0; i < 2; i++) {
      this.skidSparks.push({
        x: x + (Math.random() - 0.5) * 20,
        y: y + 20,
        vx: (Math.random() - 0.5) * 3,
        vy: 2 + Math.random() * 3,
        color: Math.random() > 0.4 ? color : '#ffffff',
        size: Math.random() * 2.5 + 1,
        alpha: 0.85,
        decay: 0.05
      });
    }
  }

  addFloatingText(x, y, text, color = '#00f5d4') {
    this.floatingTexts.push({
      x,
      y,
      text,
      color,
      alpha: 1,
      vy: -1.2
    });
  }

  // Desenho principal do frame
  render(gameState, localPlayerId, totalLaps, trackLength) {
    const ctx = this.ctx;
    const w = this.viewWidth;
    const h = this.viewHeight;
    const centerX = w / 2;

    this.finishLineDistance = totalLaps * trackLength;

    ctx.save();
    if (this.screenShake > 0) {
      const shakeX = (Math.random() - 0.5) * this.screenShake;
      const shakeY = (Math.random() - 0.5) * this.screenShake;
      ctx.translate(shakeX, shakeY);
      this.screenShake *= 0.85;
      if (this.screenShake < 0.5) this.screenShake = 0;
    }

    // Fundo escuro cibernético
    ctx.fillStyle = '#060a12';
    ctx.fillRect(0, 0, w, h);

    const localPlayer = gameState.players.find(p => p.id === localPlayerId) || gameState.players[0];
    const localDistance = localPlayer ? localPlayer.distance : 0;
    const localSpeed = localPlayer ? localPlayer.speed : 0;

    this.cubeRotation += 0.04;

    // Suavização do movimento de câmera nas curvas
    const targetCameraPan = localPlayer ? -localPlayer.x * 0.12 : 0;
    this.cameraPan += (targetCameraPan - this.cameraPan) * 0.1;

    ctx.translate(this.cameraPan, 0);

    // 1. Estrada Cibernética com Curvas Fluidas em Tempo Real
    this.drawRoadWithCurves(centerX, h, localDistance);

    // 2. Linhas de Chegada e Checkpoints
    this.drawFinishLines(centerX, h, localDistance, trackLength, totalLaps);

    // 3. Entidades da Pista (Caixas de itens, pads de turbo, obstáculos)
    if (gameState.trackEntities) {
      this.drawTrackEntities(centerX, h, localDistance, gameState.trackEntities);
    }

    // 4. Armadilhas e Projéteis Ativos (Óleo, Mísseis)
    if (gameState.hazards) {
      this.drawHazards(centerX, h, localDistance, gameState.hazards);
    }

    // 5. Todos os Veículos com Inclinação Dinâmica (Banking) e Drift
    this.drawPlayers(centerX, h, localPlayer, gameState.players);

    // 6. Faixas de Velocidade (Speed Lines) em alta aceleração ou nitro
    if (localPlayer && (localPlayer.nitroActive || localSpeed > 9.5)) {
      this.drawSpeedLines(w, h);
    }

    // 7. Partículas e Textos
    this.drawSkidSparks();
    this.drawParticles();
    this.drawFloatingTexts();

    ctx.restore();
  }

  // Desenho da rodovia neon com curvas dinâmicas contínuas
  drawRoadWithCurves(centerX, h, localDistance) {
    const ctx = this.ctx;
    const halfRoad = this.roadWidth / 2;
    const playerY = h * 0.76;
    const baseCurve = this.getCurveAt(localDistance);

    // Renderiza a estrada em faixas horizontais conectadas para criar o traçado sinuoso
    const step = 20;
    const segments = Math.ceil(h / step) + 1;

    // 1. Asfalto principal
    ctx.fillStyle = '#0b1324';
    ctx.beginPath();
    for (let i = 0; i <= segments; i++) {
      const y = i * step;
      const distAtY = localDistance + (playerY - y) * this.distanceScale;
      const curveOffset = this.getCurveAt(distAtY) - baseCurve;
      const leftX = centerX - halfRoad + curveOffset;
      if (i === 0) ctx.moveTo(leftX, y);
      else ctx.lineTo(leftX, y);
    }
    for (let i = segments; i >= 0; i--) {
      const y = i * step;
      const distAtY = localDistance + (playerY - y) * this.distanceScale;
      const curveOffset = this.getCurveAt(distAtY) - baseCurve;
      const rightX = centerX + halfRoad + curveOffset;
      ctx.lineTo(rightX, y);
    }
    ctx.closePath();
    ctx.fill();

    // 2. Barreiras laterais neon brilhantes
    ctx.save();
    ctx.lineWidth = 4;
    ctx.strokeStyle = '#00f5d4';
    ctx.shadowColor = '#00f5d4';
    ctx.shadowBlur = 10;

    // Barreira Esquerda
    ctx.beginPath();
    for (let i = 0; i <= segments; i++) {
      const y = i * step;
      const distAtY = localDistance + (playerY - y) * this.distanceScale;
      const curveOffset = this.getCurveAt(distAtY) - baseCurve;
      const leftX = centerX - halfRoad + curveOffset;
      if (i === 0) ctx.moveTo(leftX, y);
      else ctx.lineTo(leftX, y);
    }
    ctx.stroke();

    // Barreira Direita
    ctx.beginPath();
    for (let i = 0; i <= segments; i++) {
      const y = i * step;
      const distAtY = localDistance + (playerY - y) * this.distanceScale;
      const curveOffset = this.getCurveAt(distAtY) - baseCurve;
      const rightX = centerX + halfRoad + curveOffset;
      if (i === 0) ctx.moveTo(rightX, y);
      else ctx.lineTo(rightX, y);
    }
    ctx.stroke();

    // 3. Zebrados externos
    const roadScrollY = (localDistance * this.distanceScale) % 40;
    ctx.lineWidth = 5;
    ctx.strokeStyle = 'rgba(236, 72, 153, 0.45)';
    ctx.setLineDash([18, 14]);
    ctx.lineDashOffset = -roadScrollY;

    // Zebrado Esquerdo
    ctx.beginPath();
    for (let i = 0; i <= segments; i++) {
      const y = i * step;
      const distAtY = localDistance + (playerY - y) * this.distanceScale;
      const curveOffset = this.getCurveAt(distAtY) - baseCurve;
      const leftX = centerX - halfRoad - 5 + curveOffset;
      if (i === 0) ctx.moveTo(leftX, y);
      else ctx.lineTo(leftX, y);
    }
    ctx.stroke();

    // Zebrado Direito
    ctx.beginPath();
    for (let i = 0; i <= segments; i++) {
      const y = i * step;
      const distAtY = localDistance + (playerY - y) * this.distanceScale;
      const curveOffset = this.getCurveAt(distAtY) - baseCurve;
      const rightX = centerX + halfRoad + 5 + curveOffset;
      if (i === 0) ctx.moveTo(rightX, y);
      else ctx.lineTo(rightX, y);
    }
    ctx.stroke();
    ctx.restore();

    // 4. Linhas divisórias das 4 faixas com curvas sincronizadas
    const divOffsets = [-this.roadWidth * 0.24, 0, this.roadWidth * 0.24];
    ctx.save();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.22)';
    ctx.lineWidth = 2.5;
    ctx.setLineDash([22, 18]);
    ctx.lineDashOffset = -roadScrollY;

    divOffsets.forEach(divOff => {
      ctx.beginPath();
      for (let i = 0; i <= segments; i++) {
        const y = i * step;
        const distAtY = localDistance + (playerY - y) * this.distanceScale;
        const curveOffset = this.getCurveAt(distAtY) - baseCurve;
        const x = centerX + divOff + curveOffset;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    });
    ctx.restore();
  }

  // Linhas de chegada e checkpoints
  drawFinishLines(centerX, h, localDist, trackLength, totalLaps) {
    const ctx = this.ctx;
    const playerY = h * 0.76;
    const baseCurve = this.getCurveAt(localDist);

    for (let lap = 1; lap <= totalLaps; lap++) {
      const lapDist = lap * trackLength;
      const screenY = playerY - (lapDist - localDist) * this.distanceScale;

      if (screenY > -80 && screenY < h + 80) {
        ctx.save();
        const halfRoad = this.roadWidth / 2;
        const isFinal = lap === totalLaps;
        const curveOffset = this.getCurveAt(lapDist) - baseCurve;
        const roadMidX = centerX + curveOffset;

        const blockW = 20;
        const numBlocks = Math.ceil(this.roadWidth / blockW);
        for (let i = 0; i < numBlocks; i++) {
          ctx.fillStyle = (i % 2 === 0) ? '#ffffff' : (isFinal ? '#ef4444' : '#10b981');
          ctx.fillRect(roadMidX - halfRoad + i * blockW, screenY - 10, blockW, 20);
        }

        ctx.font = 'bold 15px "Montserrat", sans-serif';
        ctx.fillStyle = isFinal ? '#facc15' : '#ffffff';
        ctx.textAlign = 'center';
        ctx.shadowColor = '#000000';
        ctx.shadowBlur = 6;
        ctx.fillText(
          isFinal ? '🏁 LINHA DE CHEGADA 🏁' : `VOLTA ${lap} / ${totalLaps}`,
          roadMidX,
          screenY - 16
        );
        ctx.restore();
      }
    }
  }

  // Entidades da pista
  drawTrackEntities(centerX, h, localDist, entities) {
    const playerY = h * 0.76;
    const baseCurve = this.getCurveAt(localDist);

    entities.forEach(ent => {
      const screenY = playerY - (ent.distance - localDist) * this.distanceScale;
      if (screenY < -80 || screenY > h + 80) return;

      const curveOffset = this.getCurveAt(ent.distance) - baseCurve;
      const screenX = centerX + ent.x + curveOffset;

      if (ent.type === 'item_box') {
        this.drawItemBox(screenX, screenY);
      } else if (ent.type === 'boost_pad') {
        this.drawBoostPad(screenX, screenY);
      } else if (ent.type === 'obstacle') {
        this.drawObstacle(screenX, screenY, ent.subType);
      }
    });
  }

  // Caixa misteriosa [?]
  drawItemBox(x, y) {
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(x, y);

    ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
    ctx.beginPath();
    ctx.ellipse(0, 15, 14, 5, 0, 0, Math.PI * 2);
    ctx.fill();

    const hoverY = Math.sin(this.cubeRotation * 2) * 4;
    ctx.translate(0, hoverY);

    ctx.shadowColor = '#f59e0b';
    ctx.shadowBlur = 14;

    ctx.rotate(this.cubeRotation);
    ctx.fillStyle = 'rgba(245, 158, 11, 0.4)';
    ctx.strokeStyle = '#fbbf24';
    ctx.lineWidth = 2.5;

    ctx.fillRect(-13, -13, 26, 26);
    ctx.strokeRect(-13, -13, 26, 26);

    ctx.rotate(-this.cubeRotation);
    ctx.font = 'bold 16px "Rubik", sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('?', 0, 0);

    ctx.restore();
  }

  // Pad de Turbo no Asfalto
  drawBoostPad(x, y) {
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(x, y);

    ctx.shadowColor = '#00f5d4';
    ctx.shadowBlur = 12;

    const offset = (Date.now() / 90) % 18;
    ctx.fillStyle = 'rgba(0, 245, 212, 0.35)';
    ctx.fillRect(-18, -22, 36, 44);

    ctx.strokeStyle = '#00f5d4';
    ctx.lineWidth = 3;

    for (let i = -12; i <= 12; i += 12) {
      const chevronY = i - offset;
      ctx.beginPath();
      ctx.moveTo(-14, chevronY + 6);
      ctx.lineTo(0, chevronY - 5);
      ctx.lineTo(14, chevronY + 6);
      ctx.stroke();
    }

    ctx.restore();
  }

  // Obstáculos da pista
  drawObstacle(x, y, subType) {
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(x, y);

    if (subType === 'cone') {
      ctx.shadowColor = '#f97316';
      ctx.shadowBlur = 10;

      ctx.fillStyle = '#1e293b';
      ctx.fillRect(-12, 8, 24, 4);

      ctx.fillStyle = '#f97316';
      ctx.beginPath();
      ctx.moveTo(0, -12);
      ctx.lineTo(10, 8);
      ctx.lineTo(-10, 8);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.moveTo(-4, -2);
      ctx.lineTo(4, -2);
      ctx.lineTo(5, 3);
      ctx.lineTo(-5, 3);
      ctx.closePath();
      ctx.fill();
    } else if (subType === 'barrier') {
      ctx.shadowColor = '#ef4444';
      ctx.shadowBlur = 12;

      ctx.fillStyle = '#0f172a';
      ctx.fillRect(-20, -7, 40, 14);
      ctx.strokeStyle = '#ef4444';
      ctx.lineWidth = 2;
      ctx.strokeRect(-20, -7, 40, 14);

      ctx.fillStyle = '#ef4444';
      for (let i = -16; i < 16; i += 9) {
        ctx.fillRect(i, -5, 4, 10);
      }
    } else {
      ctx.shadowColor = '#a855f7';
      ctx.shadowBlur = 10;

      ctx.fillStyle = '#1e1b4b';
      ctx.beginPath();
      ctx.arc(0, 0, 11, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#c084fc';
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.fillStyle = '#ef4444';
      ctx.beginPath();
      ctx.arc(0, 0, 3.5, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }

  // Armadilhas ativas
  drawHazards(centerX, h, localDist, hazards) {
    const ctx = this.ctx;
    const playerY = h * 0.76;
    const baseCurve = this.getCurveAt(localDist);

    hazards.forEach(hazard => {
      const screenY = playerY - (hazard.distance - localDist) * this.distanceScale;
      if (screenY < -80 || screenY > h + 80) return;

      const curveOffset = this.getCurveAt(hazard.distance) - baseCurve;
      const screenX = centerX + hazard.x + curveOffset;

      if (hazard.type === 'oil') {
        ctx.save();
        ctx.translate(screenX, screenY);
        ctx.shadowColor = '#a855f7';
        ctx.shadowBlur = 12;

        ctx.fillStyle = 'rgba(147, 51, 234, 0.45)';
        ctx.strokeStyle = '#c084fc';
        ctx.lineWidth = 2;

        ctx.beginPath();
        ctx.ellipse(0, 0, 18, 11, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      } else if (hazard.type === 'missile') {
        ctx.save();
        ctx.translate(screenX, screenY);
        ctx.shadowColor = '#ef4444';
        ctx.shadowBlur = 14;

        ctx.fillStyle = '#ef4444';
        ctx.beginPath();
        ctx.moveTo(0, -14);
        ctx.lineTo(5, 10);
        ctx.lineTo(-5, 10);
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = '#f59e0b';
        ctx.beginPath();
        ctx.moveTo(-3, 10);
        ctx.lineTo(0, 18 + Math.random() * 6);
        ctx.lineTo(3, 10);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
    });
  }

  // Desenha todos os competidores com inclinação de curva (Tilt/Banking)
  drawPlayers(centerX, h, localPlayer, allPlayers) {
    const playerY = h * 0.76;
    const localDist = localPlayer ? localPlayer.distance : 0;
    const baseCurve = this.getCurveAt(localDist);

    const sorted = [...allPlayers].sort((a, b) => b.distance - a.distance);

    sorted.forEach(player => {
      const isLocal = localPlayer && player.id === localPlayer.id;
      const screenY = isLocal ? playerY : playerY - (player.distance - localDist) * this.distanceScale;

      const curveOffset = this.getCurveAt(player.distance) - baseCurve;
      const screenX = centerX + player.x + curveOffset;

      if (screenY < -40 || screenY > h + 60) {
        if (!isLocal) {
          this.drawOffscreenIndicator(screenX, screenY < 0 ? 25 : h - 25, player, screenY < 0);
        }
        return;
      }

      // Ângulo de inclinação do carro na curva
      const tiltAngle = player.tilt || (player.steerDir ? player.steerDir * 0.18 : 0);

      if (Math.abs(tiltAngle) > 0.08 && player.speed > 3) {
        this.addDriftSparks(screenX, screenY, player.color);
      }

      this.drawVehicle(screenX, screenY, player, isLocal, tiltAngle);
    });
  }

  // Veículo Neon com inclinação esportiva (Banking)
  drawVehicle(x, y, player, isLocal, tiltAngle = 0) {
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(x, y);

    // Pisca semitransparente se estiver invulnerável
    if (player.invulnerableTimer > 0) {
      ctx.globalAlpha = 0.5 + Math.sin(Date.now() / 40) * 0.35;
    }

    if (player.spunTimer > 0) {
      const angle = (player.spunTimer * 0.5) % (Math.PI * 2);
      ctx.rotate(angle);
    } else {
      // Inclina o carro naturalmente na direção da curva (efeito profissional)
      ctx.rotate(tiltAngle);
    }

    // Efeito de Vácuo (Slipstream)
    if (player.draftActive) {
      ctx.save();
      ctx.strokeStyle = 'rgba(0, 245, 212, 0.6)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-18, -10);
      ctx.lineTo(-24, 35);
      ctx.moveTo(18, -10);
      ctx.lineTo(24, 35);
      ctx.stroke();
      ctx.restore();
    }

    // Fogo de Nitro
    if (player.nitroActive) {
      ctx.save();
      ctx.shadowColor = '#00f5d4';
      ctx.shadowBlur = 16;
      ctx.fillStyle = '#00f5d4';
      const flameLen = 18 + Math.random() * 14;

      ctx.beginPath();
      ctx.moveTo(-8, 24);
      ctx.lineTo(-5, 24 + flameLen);
      ctx.lineTo(-2, 24);
      ctx.closePath();
      ctx.fill();

      ctx.beginPath();
      ctx.moveTo(2, 24);
      ctx.lineTo(5, 24 + flameLen);
      ctx.lineTo(8, 24);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    // Neon do chassi
    ctx.shadowColor = player.color;
    ctx.shadowBlur = 14;

    // Rodas (4 pneus estilizados)
    const wheelW = 5;
    const wheelH = 12;
    ctx.fillStyle = '#020617';
    ctx.strokeStyle = player.color;
    ctx.lineWidth = 1.4;

    ctx.fillRect(-20, -18, wheelW, wheelH);
    ctx.strokeRect(-20, -18, wheelW, wheelH);
    ctx.fillRect(15, -18, wheelW, wheelH);
    ctx.strokeRect(15, -18, wheelW, wheelH);
    ctx.fillRect(-20, 8, wheelW, wheelH);
    ctx.strokeRect(-20, 8, wheelW, wheelH);
    ctx.fillRect(15, 8, wheelW, wheelH);
    ctx.strokeRect(15, 8, wheelW, wheelH);

    // Chassi aerodinâmico
    ctx.fillStyle = '#0a0f1d';
    ctx.strokeStyle = player.color;
    ctx.lineWidth = 2.5;

    ctx.beginPath();
    ctx.moveTo(-15, -20);
    ctx.lineTo(15, -20);
    ctx.lineTo(16, 18);
    ctx.lineTo(-16, 18);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Faixa da equipe
    ctx.fillStyle = player.color;
    ctx.fillRect(-5, -17, 10, 32);

    // Para-brisa
    ctx.fillStyle = 'rgba(56, 189, 248, 0.45)';
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-8, -12);
    ctx.lineTo(8, -12);
    ctx.lineTo(6, -2);
    ctx.lineTo(-6, -2);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Faróis dianteiros (LED)
    ctx.shadowColor = '#ffffff';
    ctx.shadowBlur = 8;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(-13, -21, 4, 2);
    ctx.fillRect(9, -21, 4, 2);

    // Lanternas traseiras
    ctx.shadowColor = '#ef4444';
    ctx.shadowBlur = 8;
    ctx.fillStyle = '#ef4444';
    ctx.fillRect(-14, 17, 5, 2);
    ctx.fillRect(9, 17, 5, 2);

    // Aerofólio
    ctx.fillStyle = '#0f172a';
    ctx.strokeStyle = player.color;
    ctx.lineWidth = 1.8;
    ctx.fillRect(-18, 20, 36, 3);
    ctx.strokeRect(-18, 20, 36, 3);

    // Escudo Protetor
    if (player.shieldActive) {
      ctx.save();
      ctx.shadowColor = '#38bdf8';
      ctx.shadowBlur = 18;
      ctx.strokeStyle = '#38bdf8';
      ctx.fillStyle = 'rgba(56, 189, 248, 0.2)';
      ctx.lineWidth = 2.2;

      ctx.beginPath();
      ctx.arc(0, 0, 32, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }

    // Efeito elétrico EMP
    if (player.empTimer > 0) {
      ctx.save();
      ctx.strokeStyle = '#a855f7';
      ctx.lineWidth = 1.8;
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        const randX = (Math.random() - 0.5) * 36;
        const randY = (Math.random() - 0.5) * 36;
        ctx.moveTo(randX, randY);
        ctx.lineTo(randX + (Math.random() - 0.5) * 16, randY + (Math.random() - 0.5) * 16);
        ctx.stroke();
      }
      ctx.restore();
    }

    ctx.restore();

    // Placa de Identificação do Jogador
    ctx.save();
    ctx.font = 'bold 11px "Montserrat", sans-serif';
    ctx.textAlign = 'center';

    const rankText = player.liveRank ? `${player.liveRank}º ` : '';
    const label = `${rankText}${player.name}${isLocal ? ' (VOCÊ)' : ''}`;

    ctx.fillStyle = 'rgba(6, 10, 18, 0.82)';
    const textMetrics = ctx.measureText(label);
    ctx.fillRect(x - textMetrics.width / 2 - 5, y - 38, textMetrics.width + 10, 16);

    ctx.fillStyle = player.color;
    ctx.shadowColor = player.color;
    ctx.shadowBlur = 4;
    ctx.fillText(label, x, y - 26);
    ctx.restore();
  }

  // Linhas de velocidade nas bordas da tela (Warp effect)
  drawSpeedLines(w, h) {
    const ctx = this.ctx;
    ctx.save();
    ctx.strokeStyle = 'rgba(0, 245, 212, 0.25)';
    ctx.lineWidth = 2;

    for (let i = 0; i < 6; i++) {
      const leftY = Math.random() * h;
      const len = 30 + Math.random() * 50;
      ctx.beginPath();
      ctx.moveTo(10 + Math.random() * 25, leftY);
      ctx.lineTo(10 + Math.random() * 25, leftY + len);
      ctx.stroke();

      const rightY = Math.random() * h;
      ctx.beginPath();
      ctx.moveTo(w - 10 - Math.random() * 25, rightY);
      ctx.lineTo(w - 10 - Math.random() * 25, rightY + len);
      ctx.stroke();
    }
    ctx.restore();
  }

  drawOffscreenIndicator(x, y, player, isAhead) {
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(x, y);

    ctx.fillStyle = player.color;
    ctx.shadowColor = player.color;
    ctx.shadowBlur = 8;

    ctx.beginPath();
    if (isAhead) {
      ctx.moveTo(0, -8);
      ctx.lineTo(6, 5);
      ctx.lineTo(-6, 5);
    } else {
      ctx.moveTo(0, 8);
      ctx.lineTo(6, -5);
      ctx.lineTo(-6, -5);
    }
    ctx.closePath();
    ctx.fill();

    ctx.font = 'bold 10px "Montserrat", sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.fillText(player.name.substring(0, 6), 0, isAhead ? 16 : -12);

    ctx.restore();
  }

  drawSkidSparks() {
    const ctx = this.ctx;
    for (let i = this.skidSparks.length - 1; i >= 0; i--) {
      const s = this.skidSparks[i];
      s.x += s.vx;
      s.y += s.vy;
      s.alpha -= s.decay;

      if (s.alpha <= 0) {
        this.skidSparks.splice(i, 1);
        continue;
      }

      ctx.save();
      ctx.globalAlpha = s.alpha;
      ctx.fillStyle = s.color;
      ctx.shadowColor = s.color;
      ctx.shadowBlur = 4;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.size, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  drawParticles() {
    const ctx = this.ctx;
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.alpha -= p.decay;

      if (p.alpha <= 0) {
        this.particles.splice(i, 1);
        continue;
      }

      ctx.save();
      ctx.globalAlpha = p.alpha;
      ctx.shadowColor = p.color;
      ctx.shadowBlur = 5;
      ctx.fillStyle = p.color;

      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  drawFloatingTexts() {
    const ctx = this.ctx;
    for (let i = this.floatingTexts.length - 1; i >= 0; i--) {
      const t = this.floatingTexts[i];
      t.y += t.vy;
      t.alpha -= 0.02;

      if (t.alpha <= 0) {
        this.floatingTexts.splice(i, 1);
        continue;
      }

      ctx.save();
      ctx.globalAlpha = t.alpha;
      ctx.font = 'bold 15px "Montserrat", sans-serif';
      ctx.fillStyle = t.color;
      ctx.shadowColor = t.color;
      ctx.shadowBlur = 6;
      ctx.textAlign = 'center';
      ctx.fillText(t.text, t.x, t.y);
      ctx.restore();
    }
  }
}
