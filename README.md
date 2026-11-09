# 🏎️ INOVATECH TURBO DRIFT (Arcade Multiplayer 2026)

Minigame Arcade retrofuturista desenvolvido especialmente para apresentação na **Feira de Inovação Tecnológica da Faculdade**.

Utiliza **Node.js**, **Express**, **Socket.IO** e **HTML5 Canvas 2D** para criar uma experiência multiplayer em tempo real, onde de **1 até 4 jogadores** podem disputar corridas na mesma sala, conectando pelo computador ou diretamente pelo **celular** (através de QR Code).

---

## 🌟 Principais Destaques para a Feira

- 👥 **Multiplayer em Tempo Real (Socket.IO)**: Suporta até **4 jogadores simultâneos por sala**.
- 📱 **Conecte com Celulares via QR Code**: Ao criar uma sala, um QR Code exclusivo é gerado na tela. Qualquer visitante da feira pode apontar a câmera do celular para entrar na corrida em segundos!
- 🎮 **Controles Responsivos**:
  - **No Computador / Notebook**: Teclas `W/A/S/D` ou Setas, `Espaço` para Usar Item e `Shift` para Turbo.
  - **No Smartphone / Tablet**: Gamepad Touch virtual na tela (Direcionais, Turbo, Item e Freio).
- 🎁 **Itens Especiais Inspirados em Clássicos (Mario Kart / Crash Team Racing)**:
  - ⚡ **Turbo Nitro**: Explosão de velocidade com chamas de escape ciano.
  - 🛡️ **Escudo Cibernético**: Bolha de força que bloqueia 1 colisão ou ataque rival.
  - 🛢️ **Mancha de Óleo Glitch**: Armadilha solta na pista que faz o carro de trás rodar 360°!
  - ⚡ **Pulso EMP**: Onda de choque eletromagnética que desacelera todos os rivais próximos.
  - 🚀 **Míssil Teleguiado**: Foguete de precisão que persegue o piloto que estiver à sua frente.
- 💨 **Efeito Vácuo (Slipstream / Drafting)**: Ficar alinhado logo atrás de um adversário gera um impulso aerodinâmico para ultrapassá-lo!
- 🤖 **Bots de IA Inteligentes**: Se apenas 1 ou 2 pessoas entrarem na sala, o sistema pode preencher automaticamente as vagas restantes com Bots de Inteligência Artificial para garantir sempre um grid cheio e eletrizante com 4 competidores!
- 🎵 **Áudio Sintetizado em Tempo Real (Web Audio API)**: Motor que varia o som conforme a aceleração, sirenes, batidas, explosões e fanfarra de vitória sem depender de arquivos externos.
- 🏆 **Pódio dos Campeões**: Telas com classificação final (1º, 2º, 3º e 4º lugares), tempos de volta e botão de revanche rápida.

---

## 🚀 Como Iniciar o Jogo

### Modo 1: Início Rápido (1 Clique no Windows)
Basta dar um duplo clique no arquivo:
```
iniciar_jogo.bat
```
Ele iniciará o servidor Socket.IO e abrirá automaticamente o navegador em `http://localhost:3000`.

---

### Modo 2: Via Terminal (Node.js)
1. Abra o terminal na pasta do projeto:
```bash
cd c:\wamp64\www\inovatech
```
2. Inicie o servidor:
```bash
npm start
# ou
node server.js
```
3. O terminal exibirá os links de acesso local e na rede Wi-Fi:
```
📡 Localhost:     http://localhost:3000
📱 Rede Wi-Fi/IP: http://10.1.1.133:3000
```

---

## 📲 Como Jogar com Várias Pessoas na Feira

1. Conecte o computador da apresentação e os celulares dos visitantes na **mesma rede Wi-Fi**.
2. No computador principal, crie uma sala.
3. Peça para os outros participantes:
   - **Opção A**: Apontar a câmera do celular para o **QR Code** exibido na tela da sala.
   - **Opção B**: Acessar o endereço de IP exibido no terminal (ex: `http://10.1.1.133:3000`) e digitar o código de 4 letras da sala (ex: `TECH`).
4. Cada jogador escolhe seu nickname e a cor do seu carro neon.
5. O anfitrião clica em **"INICIAR CORRIDA"** e a disputa começa!

---

## 🛠️ Tecnologias Utilizadas

- **Backend**: Node.js, Express, Socket.IO, qrcode
- **Frontend**: HTML5 Canvas 2D, JavaScript (ES6+), CSS3 (Flexbox/Grid/Glassmorphism)
- **Áudio**: Web Audio API (Sintetizador Procedural nativo)
- **Design**: Cyberpunk Neon Retrofuturista
