# 🏎️ INOVATECH TURBO DRIFT (Arcade Multiplayer 2026)

Minigame Arcade retrofuturista desenvolvido para apresentação na **Feira de Inovação Tecnológica da Faculdade**.

Utiliza **Node.js**, **Express**, **Socket.IO**, **HTML5 Canvas 2D** e **Chart.js** para criar uma experiência multiplayer em tempo real, onde de **1 até 4 jogadores** disputam corridas na mesma sala, conectando pelo computador ou celular (via QR Code). Inclui **painel de métricas estatísticas e gráficos analíticos interativos**.

---

## 📊 Módulo Acadêmico de Estatísticas e Análise Gráfica (Chart.js)

Para complementar a matéria da faculdade (Ciência de Dados / Estatística / Engenharia de Software), o jogo inclui **análises gráficas em tempo real**:

1. **Gráfico Comparativo da Partida (Tela do Pódio)**:
   - Gráfico de **Barras Múltiplas com Eixo Y Duplo**:
     - Compara lado a lado os competidores daquela corrida específica em:
       - ⏱️ **Tempo de Corrida** (s)
       - 💥 **Número de Batidas / Colisões**
       - 🎁 **Quantidade de Itens Usados**
       - ⚡ **Velocidade Máxima** (KM/H)
     - Permite avaliar visualmente se uma maior quantidade de batidas impactou o tempo final de cada piloto.

2. **Gráfico de Evolução Temporal (Curva de Aprendizado)**:
   - Gráfico de **Linha com Gradiente Neon**:
     - Mostra a progressão do tempo de volta do piloto ao longo das corridas disputadas no dispositivo (`recentRaces`).
     - Demonstra a redução de tempo e ganho de habilidade à medida que o jogador pratica.

3. **Gráfico de Distribuição de Pódios (Gráfico Donut / Rosca)**:
   - Exibe a proporção percentual de:
     - 🥇 1º Lugar (Ouro)
     - 🥈 2º Lugar (Prata)
     - 🥉 3º Lugar (Bronze)
     - 🏁 4º Lugar
   - Permite o cálculo visual imediato da taxa de vitórias (*Win Rate*).

4. **Armazenamento Privado e Rápido**:
   - Salvo em `localStorage` no próprio aparelho: **apenas aquele jogador vê as suas estatísticas pessoais**, sem risco de vazamento de dados ou lentidão na rede da feira.

---

## 🌟 Principais Recursos do Jogo

- 👥 **Multiplayer em Tempo Real (Socket.IO)**: Até 4 jogadores por sala.
- 📱 **Conecte com Celulares via QR Code**: Aponte a câmera do celular para a tela da sala e entre na hora.
- 🎮 **Controles Responsivos**:
  - **No Computador / Notebook**: `W/A/S/D` ou `Setas`, `Espaço` para Usar Item e `Shift` para Turbo.
  - **No Celular / Tablet**: Gamepad Touch virtual na tela (Direcionais, Turbo, Item e Freio).
- 🎁 **Itens Especiais Inspirados em Clássicos (Mario Kart)**:
  - ⚡ **Turbo Nitro**: Disparo de velocidade com rastro de chamas ciano.
  - 🛡️ **Escudo Cibernético**: Bloqueia 1 impacto sem perder velocidade.
  - 🛢️ **Mancha de Óleo Glitch**: Armadilha que faz o carro de trás rodar 360°!
  - ⚡ **Pulso EMP**: Onda eletromagnética que reduz a velocidade dos rivais próximos.
  - 🚀 **Míssil Teleguiado**: Persegue o piloto à sua frente.
- 💨 **Efeito Vácuo (Slipstream)**: Ganho aerodinâmico ao colar na traseira do rival para ultrapassá-lo.
- 🤖 **Bots de IA Inteligentes**: Preenchimento automático para sempre ter 4 carros na pista.
- 🎵 **Áudio Procedural em Tempo Real (Web Audio API)**: Sons de motor que aceleram em sintonia com o veículo.

---

## 🚀 Como Iniciar

### Modo 1: Duplo Clique (Windows)
```cmd
iniciar_jogo.bat
```
Abre o servidor Socket.IO e o navegador em `http://localhost:3000`.

### Modo 2: Via Terminal
```bash
npm start
```
Conecte celulares ou outros notebooks na mesma rede Wi-Fi usando o IP exibido no terminal (ex: `http://10.1.1.133:3000`).
