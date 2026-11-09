// =============================================================================
// INOVATECH TURBO DRIFT - MOTOR DE ÁUDIO PROCEDURAL (WEB AUDIO API)
// 100% sintetizado em tempo real no navegador, sem dependência de arquivos externos
// =============================================================================

class GameAudioEngine {
  constructor() {
    this.ctx = null;
    this.muted = localStorage.getItem('inova_sound_muted') === 'true';
    this.masterGain = null;
    this.engineOsc = null;
    this.engineGain = null;
    this.isEngineRunning = false;
  }

  init() {
    if (this.ctx) return;
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;

    this.ctx = new AudioCtx();
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.setValueAtTime(this.muted ? 0 : 0.6, this.ctx.currentTime);
    this.masterGain.connect(this.ctx.destination);
  }

  ensureContext() {
    this.init();
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  toggleMute() {
    this.muted = !this.muted;
    localStorage.setItem('inova_sound_muted', this.muted);
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setValueAtTime(this.muted ? 0 : 0.6, this.ctx.currentTime);
    }
    return this.muted;
  }

  // Som contínuo de motor que varia a frequência de acordo com a velocidade
  startEngine() {
    if (this.muted || !this.ctx || this.isEngineRunning) return;
    try {
      this.engineOsc = this.ctx.createOscillator();
      this.engineGain = this.ctx.createGain();

      this.engineOsc.type = 'sawtooth';
      this.engineOsc.frequency.setValueAtTime(55, this.ctx.currentTime);

      // Filtro passa-baixa para dar peso de motor de corrida
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(350, this.ctx.currentTime);

      this.engineGain.gain.setValueAtTime(0.08, this.ctx.currentTime);

      this.engineOsc.connect(filter);
      filter.connect(this.engineGain);
      this.engineGain.connect(this.masterGain);

      this.engineOsc.start();
      this.isEngineRunning = true;
    } catch (e) {
      // AudioContext fallback
    }
  }

  updateEnginePitch(speedRatio) {
    if (!this.isEngineRunning || !this.engineOsc || !this.ctx) return;
    // Frequência varia de 55Hz (parado) até 240Hz (velocidade máxima)
    const baseFreq = 55 + Math.min(1, Math.max(0, speedRatio)) * 185;
    this.engineOsc.frequency.setTargetAtTime(baseFreq, this.ctx.currentTime, 0.05);
  }

  stopEngine() {
    if (this.engineOsc) {
      try {
        this.engineOsc.stop();
        this.engineOsc.disconnect();
      } catch (e) {}
      this.engineOsc = null;
    }
    this.isEngineRunning = false;
  }

  // Efeito sonoro de contagem regressiva (3, 2, 1, GO!)
  playCountdown(isGo = false) {
    this.ensureContext();
    if (this.muted || !this.ctx) return;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = isGo ? 'triangle' : 'sine';
    const freq = isGo ? 880 : 440; // Lá 4 ou Lá 5

    osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
    if (isGo) {
      osc.frequency.exponentialRampToValueAtTime(1320, this.ctx.currentTime + 0.35);
    }

    gain.gain.setValueAtTime(0.3, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + (isGo ? 0.6 : 0.25));

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start();
    osc.stop(this.ctx.currentTime + (isGo ? 0.65 : 0.28));
  }

  // Efeito ao pegar Caixa Misteriosa de Item
  playItemBoxPickup() {
    this.ensureContext();
    if (this.muted || !this.ctx) return;

    // Arpeggio brilhante de 3 notas rápidas
    const notes = [523.25, 659.25, 783.99, 1046.5]; // C5, E5, G5, C6
    notes.forEach((freq, idx) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      const startTime = this.ctx.currentTime + idx * 0.05;

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, startTime);

      gain.gain.setValueAtTime(0.18, startTime);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.12);

      osc.connect(gain);
      gain.connect(this.masterGain);

      osc.start(startTime);
      osc.stop(startTime + 0.14);
    });
  }

  // Efeito sonoro de Nitro Turbo
  playBoost() {
    this.ensureContext();
    if (this.muted || !this.ctx) return;

    // Onda quadrada ascendente rápida + ruído
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(150, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(800, this.ctx.currentTime + 0.4);

    gain.gain.setValueAtTime(0.25, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.55);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start();
    osc.stop(this.ctx.currentTime + 0.6);
  }

  // Efeito sonoro de ativação do Escudo Cibernético
  playShield() {
    this.ensureContext();
    if (this.muted || !this.ctx) return;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(300, this.ctx.currentTime);
    osc.frequency.linearRampToValueAtTime(600, this.ctx.currentTime + 0.2);
    osc.frequency.linearRampToValueAtTime(450, this.ctx.currentTime + 0.4);

    gain.gain.setValueAtTime(0.2, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.45);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start();
    osc.stop(this.ctx.currentTime + 0.48);
  }

  // Efeito sonoro de Escudo Bloqueando Impacto
  playShieldBreak() {
    this.ensureContext();
    if (this.muted || !this.ctx) return;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'square';
    osc.frequency.setValueAtTime(800, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(120, this.ctx.currentTime + 0.25);

    gain.gain.setValueAtTime(0.25, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.3);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start();
    osc.stop(this.ctx.currentTime + 0.32);
  }

  // Efeito de derrapagem no óleo (Slip / Skid)
  playOilSpin() {
    this.ensureContext();
    if (this.muted || !this.ctx) return;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(900, this.ctx.currentTime);
    osc.frequency.linearRampToValueAtTime(400, this.ctx.currentTime + 0.15);
    osc.frequency.linearRampToValueAtTime(750, this.ctx.currentTime + 0.3);

    gain.gain.setValueAtTime(0.22, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.38);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start();
    osc.stop(this.ctx.currentTime + 0.4);
  }

  // Efeito de Pulso Eletromagnético (EMP)
  playEmp() {
    this.ensureContext();
    if (this.muted || !this.ctx) return;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(450, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(40, this.ctx.currentTime + 0.5);

    gain.gain.setValueAtTime(0.35, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.55);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start();
    osc.stop(this.ctx.currentTime + 0.6);
  }

  // Lançamento de Míssil
  playMissileLaunch() {
    this.ensureContext();
    if (this.muted || !this.ctx) return;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(220, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(1100, this.ctx.currentTime + 0.3);

    gain.gain.setValueAtTime(0.2, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.35);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start();
    osc.stop(this.ctx.currentTime + 0.38);
  }

  // Explosão (Míssil acertando alvo ou colisão)
  playExplosion() {
    this.ensureContext();
    if (this.muted || !this.ctx) return;

    // Simula ruído com frequências baixas moduladas
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'square';
    osc.frequency.setValueAtTime(140, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(30, this.ctx.currentTime + 0.45);

    gain.gain.setValueAtTime(0.4, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.5);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start();
    osc.stop(this.ctx.currentTime + 0.52);
  }

  // Batida leve entre carros
  playBump() {
    this.ensureContext();
    if (this.muted || !this.ctx) return;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(220, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(60, this.ctx.currentTime + 0.1);

    gain.gain.setValueAtTime(0.2, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.12);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start();
    osc.stop(this.ctx.currentTime + 0.14);
  }

  // Fanfarra de vitória (quando cruza a linha de chegada)
  playVictory() {
    this.ensureContext();
    if (this.muted || !this.ctx) return;

    const melody = [
      { note: 523.25, dur: 0.12 }, // C5
      { note: 523.25, dur: 0.12 }, // C5
      { note: 523.25, dur: 0.12 }, // C5
      { note: 659.25, dur: 0.35 }, // E5
      { note: 587.33, dur: 0.20 }, // D5
      { note: 659.25, dur: 0.20 }, // E5
      { note: 783.99, dur: 0.60 }  // G5
    ];

    let t = this.ctx.currentTime;
    melody.forEach(step => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(step.note, t);

      gain.gain.setValueAtTime(0.25, t);
      gain.gain.exponentialRampToValueAtTime(0.01, t + step.dur);

      osc.connect(gain);
      gain.connect(this.masterGain);

      osc.start(t);
      osc.stop(t + step.dur + 0.05);

      t += step.dur;
    });
  }
}

// Instância global de áudio
const gameAudio = new GameAudioEngine();
