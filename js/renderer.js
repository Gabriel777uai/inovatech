// =============================================================================
// INOVATECH TURBO DRIFT - RENDERIZADOR CANVAS 2D CIBERNÉTICO (60 FPS)
// =============================================================================

class GameRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.roadOffset = 0;
    this.particles = [];
    this.floatingTexts = [];
    this.screenShake = 0;
    this.cubeRotation = 0;
    this.finishLineDistance = 0;

    // Dimensões base virtuais da pista
    this.baseWidth = 640;
    this.baseHeight = 720;
    this.roadWidth = 460;
  }

  resize() {
    const parent = this.canvas.parentElement;
    if (!parent) return;
    const rect = parent.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;

    // Ajusta resolução do canvas para alta densidade de pixels
    this.canvas.width = rect.width * dpr;
    this.canvas.height = rect.height * dpr;
    this.ctx.resetTransform();
    this.ctx.scale(dpr, dpr);

    this.viewWidth = rect.width;
    this.viewHeight = rect.height;
  }

  triggerShake(amount = 12) {
    this.screenShake = amount;
  }

  addSpark(x, y, color = '#00f5d4', count = 12) {
    for (let i = 0; i < count; i++) {
      this.particles.push({
        x,
        y,
        vx: (Math.random() - 0.5) * 8,
        vy: (Math.random() - 0.5) * 8 - 1,
        color,
        size: Math.random() * 3.5 + 1.5,
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
      vy: -1.4
    });
  }

  // Desenho principal do frame
  render(gameState, localPlayerId, totalLaps, trackLength) {
    const ctx = this.ctx;
    const w = this.viewWidth;
    const h = this.viewHeight;
    const centerX = w / 2;

    this.finishLineDistance = totalLaps * trackLength;

    // Efeito de tremor de tela (Screen Shake)
    ctx.save();
    if (this.screenShake > 0) {
      const shakeX = (Math.random() - 0.5) * this.screenShake;
      const shakeY = (Math.random() - 0.5) * this.screenShake;
      ctx.translate(shakeX, shakeY);
      this.screenShake *= 0.85;
      if (this.screenShake < 0.5) this.screenShake = 0;
    }

    // Limpa fundo escuro cibernético
    ctx.fillStyle = '#060a12';
    ctx.fillRect(0, 0, w, h);

    // Encontra jogador local
    const localPlayer = gameState.players.find(p => p.id === localPlayerId) || gameState.players[0];
    const localDistance = localPlayer ? localPlayer.distance : 0;
    const localSpeed = localPlayer ? localPlayer.speed : 0;

    // Atualiza rotação contínua para caixas misteriosas
    this.cubeRotation += 0.04;

    // 1. Desenhar Estrada Cibernética e Faixas
    this.drawRoad(centerX, h, localSpeed);

    // 2. Linha de Chegada (se estiver dentro do campo de visão)
    this.drawFinishLines(centerX, h, localDistance, trackLength, totalLaps);

    // 3. Desenhar Entidades da Pista (Caixas de itens, pads de turbo, cones)
    if (gameState.trackEntities) {
      this.drawTrackEntities(centerX, h, localDistance, gameState.trackEntities);
    }

    // 4. Desenhar Armadilhas e Projéteis Ativos (Óleo, Mísseis)
    if (gameState.hazards) {
      this.drawHazards(centerX, h, localDistance, gameState.hazards);
    }

    // 5. Desenhar Todos os Jogadores (Inimigos e Jogador Local)
    this.drawPlayers(centerX, h, localPlayer, gameState.players);

    // 6. Atualizar e Desenhar Partículas e Textos Flutuantes
    this.drawParticles();
    this.drawFloatingTexts();

    ctx.restore();
  }

  // Desenho da rodovia neon com 4 faixas
  drawRoad(centerX, h, speed) {
    const ctx = this.ctx;
    const halfRoad = this.roadWidth / 2;

    // Asfalto escuro
    ctx.fillStyle = '#0b1324';
    ctx.fillRect(centerX - halfRoad, 0, this.roadWidth, h);

    // Barreiras laterais brilhantes (Neon Verde/Ciano)
    ctx.save();
    ctx.lineWidth = 5;
    ctx.strokeStyle = '#00f5d4';
    ctx.shadowColor = '#00f5d4';
    ctx.shadowBlur = 12;

    ctx.beginPath();
    ctx.moveTo(centerX - halfRoad, 0);
    ctx.lineTo(centerX - halfRoad, h);
    ctx.moveTo(centerX + halfRoad, 0);
    ctx.lineTo(centerX + halfRoad, h);
    ctx.stroke();

    // Faixas zebradas externas
    const stripeOffset = (this.roadOffset) % 40;
    ctx.lineWidth = 8;
    ctx.strokeStyle = 'rgba(236, 72, 153, 0.4)';
    ctx.setLineDash([20, 20]);
    ctx.lineDashOffset = -stripeOffset;

    ctx.beginPath();
    ctx.moveTo(centerX - halfRoad - 8, 0);
    ctx.lineTo(centerX - halfRoad - 8, h);
    ctx.moveTo(centerX + halfRoad + 8, 0);
    ctx.lineTo(centerX + halfRoad + 8, h);
    ctx.stroke();
    ctx.restore();

    // Rolagem das linhas divisórias da pista
    this.roadOffset = (this.roadOffset + speed * 1.5) % 60;

    // 3 Linhas tracejadas que dividem as 4 faixas
    // Faixas: -130, -45, +45, +130
    // Divisores: -87.5, 0, +87.5
    const dividers = [-87.5, 0, 87.5];
    ctx.save();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.lineWidth = 3;
    ctx.setLineDash([25, 25]);
    ctx.lineDashOffset = -this.roadOffset;

    dividers.forEach(divX => {
      ctx.beginPath();
      ctx.moveTo(centerX + divX, 0);
      ctx.lineTo(centerX + divX, h);
      ctx.stroke();
    });
    ctx.restore();
  }

  // Linha de chegada ou checkpoints de volta
  drawFinishLines(centerX, h, localDist, trackLength, totalLaps) {
    const ctx = this.ctx;
    const playerY = h * 0.76;
    const distanceScale = 2.4; // pixels por metro na tela

    for (let lap = 1; lap <= totalLaps; lap++) {
      const lapDist = lap * trackLength;
      const screenY = playerY - (lapDist - localDist) * distanceScale;

      if (screenY > -100 && screenY < h + 100) {
        ctx.save();
        const halfRoad = this.roadWidth / 2;
        const isFinal = lap === totalLaps;

        // Banner zebrado quadriculado
        const blockW = 20;
        const numBlocks = Math.ceil(this.roadWidth / blockW);
        for (let i = 0; i < numBlocks; i++) {
          ctx.fillStyle = (i % 2 === 0) ? '#ffffff' : (isFinal ? '#ef4444' : '#10b981');
          ctx.fillRect(centerX - halfRoad + i * blockW, screenY - 10, blockW, 20);
        }

        // Texto do Checkpoint / Chegada
        ctx.font = 'bold 16px "Montserrat", sans-serif';
        ctx.fillStyle = isFinal ? '#facc15' : '#ffffff';
        ctx.textAlign = 'center';
        ctx.shadowColor = '#000000';
        ctx.shadowBlur = 6;
        ctx.fillText(
          isFinal ? '🏁 LINHA DE CHEGADA FINAL 🏁' : `VOLTA ${lap} / ${totalLaps}`,
          centerX,
          screenY - 18
        );
        ctx.restore();
      }
    }
  }

  // Desenha entidades estáticas da pista (caixas, pads, obstáculos)
  drawTrackEntities(centerX, h, localDist, entities) {
    const ctx = this.ctx;
    const playerY = h * 0.76;
    const distanceScale = 2.4;

    entities.forEach(ent => {
      const screenY = playerY - (ent.distance - localDist) * distanceScale;
      // Só desenha se estiver visível na tela
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

  // Caixa misteriosa holográfica [?]
  drawItemBox(x, y) {
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(x, y);

    // Sombra no chão
    ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
    ctx.beginPath();
    ctx.ellipse(0, 16, 16, 6, 0, 0, Math.PI * 2);
    ctx.fill();

    // Efeito de levitação
    const hoverY = Math.sin(this.cubeRotation * 2) * 5;
    ctx.translate(0, hoverY);

    // Brilho Neon Amarelo / Dourado
    ctx.shadowColor = '#f59e0b';
    ctx.shadowBlur = 16;

    // Cubo holográfico rotacionando
    ctx.rotate(this.cubeRotation);
    ctx.fillStyle = 'rgba(245, 158, 11, 0.35)';
    ctx.strokeStyle = '#fbbf24';
    ctx.lineWidth = 2.5;

    ctx.fillRect(-14, -14, 28, 28);
    ctx.strokeRect(-14, -14, 28, 28);

    // Ponto de interrogação central
    ctx.rotate(-this.cubeRotation);
    ctx.font = 'bold 18px "Rubik", sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('?', 0, 0);

    ctx.restore();
  }

  // Faixa de Turbo no Asfalto (Boost Pad)
  drawBoostPad(x, y) {
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(x, y);

    ctx.shadowColor = '#00f5d4';
    ctx.shadowBlur = 14;

    // Chevrons luminosos animados apontando para frente
    const offset = (Date.now() / 80) % 20;
    ctx.fillStyle = 'rgba(0, 245, 212, 0.35)';
    ctx.fillRect(-20, -25, 40, 50);

    ctx.strokeStyle = '#00f5d4';
    ctx.lineWidth = 3.5;

    for (let i = -15; i <= 15; i += 15) {
      const chevronY = i - offset;
      ctx.beginPath();
      ctx.moveTo(-16, chevronY + 8);
      ctx.lineTo(0, chevronY - 6);
      ctx.lineTo(16, chevronY + 8);
      ctx.stroke();
    }

    ctx.restore();
  }

  // Obstáculos da Pista (Cones, Barricadas, Drones)
  drawObstacle(x, y, subType) {
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(x, y);

    if (subType === 'cone') {
      // Cone de trânsito neon laranja
      ctx.shadowColor = '#f97316';
      ctx.shadowBlur = 10;

      // Base preta
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(-14, 8, 28, 5);

      // Corpo cônico
      ctx.fillStyle = '#f97316';
      ctx.beginPath();
      ctx.moveTo(0, -14);
      ctx.lineTo(11, 8);
      ctx.lineTo(-11, 8);
      ctx.closePath();
      ctx.fill();

      // Faixa branca reflexiva
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.moveTo(-4, -2);
      ctx.lineTo(4, -2);
      ctx.lineTo(6, 3);
      ctx.lineTo(-6, 3);
      ctx.closePath();
      ctx.fill();
    } else if (subType === 'barrier') {
      // Barreira laser vermelha
      ctx.shadowColor = '#ef4444';
      ctx.shadowBlur = 12;

      ctx.fillStyle = '#0f172a';
      ctx.fillRect(-22, -8, 44, 16);
      ctx.strokeStyle = '#ef4444';
      ctx.lineWidth = 2;
      ctx.strokeRect(-22, -8, 44, 16);

      // Listras de advertência
      ctx.fillStyle = '#ef4444';
      for (let i = -18; i < 18; i += 10) {
        ctx.fillRect(i, -6, 5, 12);
      }
    } else {
      // Drone cibernético flutuante
      ctx.shadowColor = '#a855f7';
      ctx.shadowBlur = 12;

      ctx.fillStyle = '#1e1b4b';
      ctx.beginPath();
      ctx.arc(0, 0, 12, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#c084fc';
      ctx.lineWidth = 2;
      ctx.stroke();

      // Olho luminoso central
      ctx.fillStyle = '#ef4444';
      ctx.beginPath();
      ctx.arc(0, 0, 4, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }

  // Desenha armadilhas ativas (Óleo, Mísseis)
  drawHazards(centerX, h, localDist, hazards) {
    const ctx = this.ctx;
    const playerY = h * 0.76;
    const distanceScale = 2.4;

    hazards.forEach(hazard => {
      const screenY = playerY - (hazard.distance - localDist) * distanceScale;
      if (screenY < -100 || screenY > h + 100) return;

      const screenX = centerX + hazard.x;

      if (hazard.type === 'oil') {
        // Mancha de óleo holográfica púrpura
        ctx.save();
        ctx.translate(screenX, screenY);
        ctx.shadowColor = '#a855f7';
        ctx.shadowBlur = 14;

        ctx.fillStyle = 'rgba(147, 51, 234, 0.45)';
        ctx.strokeStyle = '#c084fc';
        ctx.lineWidth = 2;

        ctx.beginPath();
        ctx.ellipse(0, 0, 20, 13, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        ctx.restore();
      } else if (hazard.type === 'missile') {
        // Míssil teleguiado voando
        ctx.save();
        ctx.translate(screenX, screenY);
        ctx.shadowColor = '#ef4444';
        ctx.shadowBlur = 16;

        // Foguete corpo
        ctx.fillStyle = '#ef4444';
        ctx.beginPath();
        ctx.moveTo(0, -16);
        ctx.lineTo(6, 12);
        ctx.lineTo(-6, 12);
        ctx.closePath();
        ctx.fill();

        // Rastro de fogo na cauda
        ctx.fillStyle = '#f59e0b';
        ctx.beginPath();
        ctx.moveTo(-4, 12);
        ctx.lineTo(0, 22 + Math.random() * 8);
        ctx.lineTo(4, 12);
        ctx.closePath();
        ctx.fill();

        ctx.restore();
      }
    });
  }

  // Desenha todos os carros dos jogadores
  drawPlayers(centerX, h, localPlayer, allPlayers) {
    const ctx = this.ctx;
    const playerY = h * 0.76;
    const distanceScale = 2.4;
    const localDist = localPlayer ? localPlayer.distance : 0;

    // Ordena para que quem está mais atrás seja desenhado por último (sobreposição correta)
    const sorted = [...allPlayers].sort((a, b) => b.distance - a.distance);

    sorted.forEach(player => {
      const isLocal = localPlayer && player.id === localPlayer.id;
      const screenY = isLocal ? playerY : playerY - (player.distance - localDist) * distanceScale;

      // Se estiver muito fora da tela (muito à frente ou muito atrás), desenha indicador na borda
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

  // Desenha um carro específico
  drawVehicle(x, y, player, isLocal) {
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(x, y);

    // Efeito de rodopio ao ser atingido por óleo/míssil
    if (player.spunTimer > 0) {
      const angle = (player.spunTimer * 0.5) % (Math.PI * 2);
      ctx.rotate(angle);
    }

    // Se estiver no vácuo (Slipstream), rastro de vento aerodinâmico
    if (player.draftActive) {
      ctx.save();
      ctx.strokeStyle = 'rgba(0, 245, 212, 0.6)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-20, -10);
      ctx.lineTo(-26, 40);
      ctx.moveTo(20, -10);
      ctx.lineTo(26, 40);
      ctx.stroke();
      ctx.restore();
    }

    // Se o Nitro estiver ativo, fogo de exaustão
    if (player.nitroActive) {
      ctx.save();
      ctx.shadowColor = '#00f5d4';
      ctx.shadowBlur = 18;
      ctx.fillStyle = '#00f5d4';
      const flameLen = 22 + Math.random() * 14;

      ctx.beginPath();
      ctx.moveTo(-9, 28);
      ctx.lineTo(-6, 28 + flameLen);
      ctx.lineTo(-3, 28);
      ctx.closePath();
      ctx.fill();

      ctx.beginPath();
      ctx.moveTo(3, 28);
      ctx.lineTo(6, 28 + flameLen);
      ctx.lineTo(9, 28);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    // Brilho de neon do chassi
    ctx.shadowColor = player.color;
    ctx.shadowBlur = 16;

    // Rodas (4 pneus pretos com bordas neon)
    const wheelW = 6;
    const wheelH = 14;
    ctx.fillStyle = '#020617';
    ctx.strokeStyle = player.color;
    ctx.lineWidth = 1.5;

    // Dianteiras
    ctx.fillRect(-22, -22, wheelW, wheelH);
    ctx.strokeRect(-22, -22, wheelW, wheelH);
    ctx.fillRect(16, -22, wheelW, wheelH);
    ctx.strokeRect(16, -22, wheelW, wheelH);
    // Traseiras
    ctx.fillRect(-22, 10, wheelW, wheelH);
    ctx.strokeRect(-22, 10, wheelW, wheelH);
    ctx.fillRect(16, 10, wheelW, wheelH);
    ctx.strokeRect(16, 10, wheelW, wheelH);

    // Chassi Principal do Carro Cyberpunk
    ctx.fillStyle = '#0a0f1d';
    ctx.strokeStyle = player.color;
    ctx.lineWidth = 2.8;

    ctx.beginPath();
    ctx.moveTo(-16, -24);
    ctx.lineTo(16, -24);
    ctx.lineTo(18, 22);
    ctx.lineTo(-18, 22);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Faixas decorativas de cor da equipe
    ctx.fillStyle = player.color;
    ctx.fillRect(-6, -20, 12, 38);

    // Para-brisa dianteiro tecnológico
    ctx.fillStyle = 'rgba(56, 189, 248, 0.45)';
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(-10, -14);
    ctx.lineTo(10, -14);
    ctx.lineTo(8, -2);
    ctx.lineTo(-8, -2);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Faróis dianteiros (LED Branco/Ciano)
    ctx.shadowColor = '#ffffff';
    ctx.shadowBlur = 10;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(-14, -25, 5, 3);
    ctx.fillRect(9, -25, 5, 3);

    // Lanternas traseiras (LED Vermelho)
    ctx.shadowColor = '#ef4444';
    ctx.shadowBlur = 8;
    ctx.fillStyle = '#ef4444';
    ctx.fillRect(-15, 21, 6, 3);
    ctx.fillRect(9, 21, 6, 3);

    // Aerofólio esportivo traseiro
    ctx.fillStyle = '#0f172a';
    ctx.strokeStyle = player.color;
    ctx.lineWidth = 2;
    ctx.fillRect(-20, 24, 40, 4);
    ctx.strokeRect(-20, 24, 40, 4);

    // Escudo Protetor (se ativo)
    if (player.shieldActive) {
      ctx.save();
      ctx.shadowColor = '#38bdf8';
      ctx.shadowBlur = 20;
      ctx.strokeStyle = '#38bdf8';
      ctx.fillStyle = 'rgba(56, 189, 248, 0.2)';
      ctx.lineWidth = 2.5;

      ctx.beginPath();
      ctx.arc(0, 0, 36, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }

    // Efeito de EMP (Glitch elétrico)
    if (player.empTimer > 0) {
      ctx.save();
      ctx.strokeStyle = '#a855f7';
      ctx.lineWidth = 2;
      for (let i = 0; i < 4; i++) {
        ctx.beginPath();
        const randX = (Math.random() - 0.5) * 40;
        const randY = (Math.random() - 0.5) * 40;
        ctx.moveTo(randX, randY);
        ctx.lineTo(randX + (Math.random() - 0.5) * 20, randY + (Math.random() - 0.5) * 20);
        ctx.stroke();
      }
      ctx.restore();
    }

    ctx.restore(); // Fecha matriz do carro

    // Placa de Identificação do Jogador flutuando acima do carro
    ctx.save();
    ctx.font = 'bold 12px "Montserrat", sans-serif';
    ctx.textAlign = 'center';

    const rankText = player.liveRank ? `${player.liveRank}º ` : '';
    const label = `${rankText}${player.name}${isLocal ? ' (VOCÊ)' : ''}`;

    // Fundo semitransparente da tag
    ctx.fillStyle = 'rgba(6, 10, 18, 0.75)';
    const textMetrics = ctx.measureText(label);
    ctx.fillRect(x - textMetrics.width / 2 - 6, y - 44, textMetrics.width + 12, 18);

    ctx.fillStyle = player.color;
    ctx.shadowColor = player.color;
    ctx.shadowBlur = 6;
    ctx.fillText(label, x, y - 30);
    ctx.restore();
  }

  // Indicador de rival fora de tela (flecha na borda)
  drawOffscreenIndicator(x, y, player, isAhead) {
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(x, y);

    ctx.fillStyle = player.color;
    ctx.shadowColor = player.color;
    ctx.shadowBlur = 10;

    ctx.beginPath();
    if (isAhead) {
      ctx.moveTo(0, -10);
      ctx.lineTo(8, 6);
      ctx.lineTo(-8, 6);
    } else {
      ctx.moveTo(0, 10);
      ctx.lineTo(8, -6);
      ctx.lineTo(-8, -6);
    }
    ctx.closePath();
    ctx.fill();

    ctx.font = 'bold 10px "Montserrat", sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.fillText(player.name.substring(0, 6), 0, isAhead ? 18 : -14);

    ctx.restore();
  }

  // Partículas gerais (fogo, faíscas, nitro)
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
      ctx.shadowBlur = 6;
      ctx.fillStyle = p.color;

      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  // Textos flutuantes de alerta ("+TURBO!", "EMP HIT!")
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
      ctx.font = 'bold 16px "Montserrat", sans-serif';
      ctx.fillStyle = t.color;
      ctx.shadowColor = t.color;
      ctx.shadowBlur = 8;
      ctx.textAlign = 'center';
      ctx.fillText(t.text, t.x, t.y);
      ctx.restore();
    }
  }
}
