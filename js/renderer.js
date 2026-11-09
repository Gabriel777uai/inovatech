// =============================================================================
// INOVATECH TURBO DRIFT - RENDERIZADOR CANVAS 2D CIBERNÉTICO (60 FPS)
// =============================================================================

class GameRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.particles = [];
    this.floatingTexts = [];
    this.screenShake = 0;
    this.cubeRotation = 0;
    this.finishLineDistance = 0;

    // Escala física: 1 metro de distância = 1.0 pixel na tela
    this.distanceScale = 1.0;
    this.roadWidth = 420;
    this.viewWidth = 640;
    this.viewHeight = 720;
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

    // Adapta largura da estrada dinamicamente para caber perfeitamente no celular ou desktop
    this.roadWidth = Math.min(460, Math.max(310, w * 0.92));
  }

  triggerShake(amount = 10) {
    this.screenShake = amount;
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

    // 1. Estrada Cibernética com Sincronização Perfeita à Distância Real
    this.drawRoad(centerX, h, localDistance);

    // 2. Linhas de Chegada e Checkpoints de Volta
    this.drawFinishLines(centerX, h, localDistance, trackLength, totalLaps);

    // 3. Entidades da Pista (Caixas de itens, pads de turbo, obstáculos)
    if (gameState.trackEntities) {
      this.drawTrackEntities(centerX, h, localDistance, gameState.trackEntities);
    }

    // 4. Armadilhas e Projéteis Ativos (Óleo, Mísseis)
    if (gameState.hazards) {
      this.drawHazards(centerX, h, localDistance, gameState.hazards);
    }

    // 5. Todos os Veículos (Jogadores e Bots)
    this.drawPlayers(centerX, h, localPlayer, gameState.players);

    // 6. Partículas e Textos
    this.drawParticles();
    this.drawFloatingTexts();

    ctx.restore();
  }

  // Desenho da rodovia neon sincronizada 100% com a distância do jogador
  drawRoad(centerX, h, localDistance) {
    const ctx = this.ctx;
    const halfRoad = this.roadWidth / 2;

    // Asfalto
    ctx.fillStyle = '#0b1324';
    ctx.fillRect(centerX - halfRoad, 0, this.roadWidth, h);

    // Barreiras laterais neon
    ctx.save();
    ctx.lineWidth = 4;
    ctx.strokeStyle = '#00f5d4';
    ctx.shadowColor = '#00f5d4';
    ctx.shadowBlur = 10;

    ctx.beginPath();
    ctx.moveTo(centerX - halfRoad, 0);
    ctx.lineTo(centerX - halfRoad, h);
    ctx.moveTo(centerX + halfRoad, 0);
    ctx.lineTo(centerX + halfRoad, h);
    ctx.stroke();

    // Faixas zebradas externas com deslocamento 100% atrelado à física
    const roadScrollY = (localDistance * this.distanceScale) % 50;
    ctx.lineWidth = 6;
    ctx.strokeStyle = 'rgba(236, 72, 153, 0.45)';
    ctx.setLineDash([20, 15]);
    ctx.lineDashOffset = -roadScrollY;

    ctx.beginPath();
    ctx.moveTo(centerX - halfRoad - 6, 0);
    ctx.lineTo(centerX - halfRoad - 6, h);
    ctx.moveTo(centerX + halfRoad + 6, 0);
    ctx.lineTo(centerX + halfRoad + 6, h);
    ctx.stroke();
    ctx.restore();

    // 3 Linhas tracejadas que dividem as 4 faixas
    // Divisores proporcionais à largura da estrada
    const divOffsets = [-this.roadWidth * 0.24, 0, this.roadWidth * 0.24];
    ctx.save();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.22)';
    ctx.lineWidth = 2.5;
    ctx.setLineDash([24, 20]);
    ctx.lineDashOffset = -roadScrollY;

    divOffsets.forEach(offset => {
      ctx.beginPath();
      ctx.moveTo(centerX + offset, 0);
      ctx.lineTo(centerX + offset, h);
      ctx.stroke();
    });
    ctx.restore();
  }

  // Linhas de chegada e checkpoints
  drawFinishLines(centerX, h, localDist, trackLength, totalLaps) {
    const ctx = this.ctx;
    const playerY = h * 0.76;

    for (let lap = 1; lap <= totalLaps; lap++) {
      const lapDist = lap * trackLength;
      const screenY = playerY - (lapDist - localDist) * this.distanceScale;

      if (screenY > -80 && screenY < h + 80) {
        ctx.save();
        const halfRoad = this.roadWidth / 2;
        const isFinal = lap === totalLaps;

        const blockW = 20;
        const numBlocks = Math.ceil(this.roadWidth / blockW);
        for (let i = 0; i < numBlocks; i++) {
          ctx.fillStyle = (i % 2 === 0) ? '#ffffff' : (isFinal ? '#ef4444' : '#10b981');
          ctx.fillRect(centerX - halfRoad + i * blockW, screenY - 10, blockW, 20);
        }

        ctx.font = 'bold 15px "Montserrat", sans-serif';
        ctx.fillStyle = isFinal ? '#facc15' : '#ffffff';
        ctx.textAlign = 'center';
        ctx.shadowColor = '#000000';
        ctx.shadowBlur = 6;
        ctx.fillText(
          isFinal ? '🏁 LINHA DE CHEGADA 🏁' : `VOLTA ${lap} / ${totalLaps}`,
          centerX,
          screenY - 16
        );
        ctx.restore();
      }
    }
  }

  // Entidades da pista
  drawTrackEntities(centerX, h, localDist, entities) {
    const playerY = h * 0.76;

    entities.forEach(ent => {
      const screenY = playerY - (ent.distance - localDist) * this.distanceScale;
      if (screenY < -80 || screenY > h + 80) return;

      const screenX = centerX + ent.x;

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

  // Obstáculos da pista com alinhamento visual preciso
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

    hazards.forEach(hazard => {
      const screenY = playerY - (hazard.distance - localDist) * this.distanceScale;
      if (screenY < -80 || screenY > h + 80) return;

      const screenX = centerX + hazard.x;

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

  // Desenha todos os competidores
  drawPlayers(centerX, h, localPlayer, allPlayers) {
    const playerY = h * 0.76;
    const localDist = localPlayer ? localPlayer.distance : 0;

    const sorted = [...allPlayers].sort((a, b) => b.distance - a.distance);

    sorted.forEach(player => {
      const isLocal = localPlayer && player.id === localPlayer.id;
      const screenY = isLocal ? playerY : playerY - (player.distance - localDist) * this.distanceScale;

      if (screenY < -40 || screenY > h + 60) {
        if (!isLocal) {
          this.drawOffscreenIndicator(centerX + player.x, screenY < 0 ? 25 : h - 25, player, screenY < 0);
        }
        return;
      }

      const screenX = centerX + player.x;
      this.drawVehicle(screenX, screenY, player, isLocal);
    });
  }

  // Veículo Neon
  drawVehicle(x, y, player, isLocal) {
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(x, y);

    // Pisca semitransparente se estiver no período de invulnerabilidade pós-batida
    if (player.invulnerableTimer > 0) {
      ctx.globalAlpha = 0.5 + Math.sin(Date.now() / 40) * 0.35;
    }

    if (player.spunTimer > 0) {
      const angle = (player.spunTimer * 0.5) % (Math.PI * 2);
      ctx.rotate(angle);
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
      const flameLen = 18 + Math.random() * 12;

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

    // Rodas
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

    // Chassi
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

    ctx.fillStyle = 'rgba(6, 10, 18, 0.8)';
    const textMetrics = ctx.measureText(label);
    ctx.fillRect(x - textMetrics.width / 2 - 5, y - 38, textMetrics.width + 10, 16);

    ctx.fillStyle = player.color;
    ctx.shadowColor = player.color;
    ctx.shadowBlur = 4;
    ctx.fillText(label, x, y - 26);
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
