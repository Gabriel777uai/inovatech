# INOVATECH TURBO DRIFT

Minigame arcade de corrida multiplayer, criado para a Feira de Inovação Tecnológica. O navegador apresenta a interface e desenha a pista; um servidor Node.js mantém as salas, simula a corrida e transmite o estado dos jogadores em tempo real.

## Visão geral

- Até quatro pessoas podem competir na mesma sala, em computadores ou celulares.
- Uma sala é criada por um anfitrião e pode ser compartilhada por código, link ou QR Code.
- O anfitrião escolhe o número de voltas e se a corrida será completada com bots.
- A simulação aceita controles de teclado e toque, itens, obstáculos, nitro, escudo e vácuo (slipstream).
- A tela de pódio compara as estatísticas da corrida. O histórico pessoal é armazenado no navegador do próprio jogador.

## Tecnologias e bibliotecas

### Servidor (Node.js)

| Biblioteca ou módulo | Uso no sistema |
| --- | --- |
| [Express](https://expressjs.com/) | Servidor HTTP, rotas de saúde e QR Code, e publicação dos arquivos estáticos. |
| [Socket.IO](https://socket.io/) | Comunicação bidirecional entre navegador e servidor: salas, configurações, controles e atualizações da partida. O servidor também disponibiliza o cliente Socket.IO em `/socket.io/socket.io.js`. |
| [qrcode](https://www.npmjs.com/package/qrcode) | Converte o link de convite de uma sala em uma imagem Data URL, retornada pela API. |
| `node:http` | Cria o servidor HTTP compartilhado pelo Express e pelo Socket.IO. |
| `node:path` | Monta caminhos para os arquivos servidos pelo Express. |
| `node:os` | Descobre os endereços IPv4 locais exibidos ao iniciar o servidor. |

As dependências de terceiros do servidor estão declaradas em `package.json` e fixadas para instalação reproduzível em `package-lock.json`. O projeto requer Node.js 18 ou superior.

### Navegador

| Biblioteca ou API | Uso no sistema |
| --- | --- |
| Chart.js 4 | Desenha o gráfico de comparação do pódio, a evolução dos resultados e a distribuição de posições. A distribuição local é carregada pelo arquivo `js/chart.umd.min.js`. |
| Socket.IO Client | Conecta a interface ao servidor. Primeiro é carregado de `/socket.io/socket.io.js`; se não estiver disponível, a página tenta usar a cópia 4.8.1 do CDN. |
| HTML5 Canvas 2D | `GameRenderer` desenha a estrada, os carros, os itens, os efeitos e as partículas no elemento `gameCanvas`. |
| Web Audio API | `GameAudioEngine` sintetiza sons no navegador, incluindo motor, contagem regressiva, itens e colisões; não usa arquivos de áudio. |
| `localStorage` | Guarda nickname, preferência de som e estatísticas pessoais no dispositivo. |
| Fetch API | Solicita ao servidor a imagem do QR Code do link da sala. |
| `requestAnimationFrame` | Atualiza a apresentação visual de forma fluida, interpolando os estados recebidos do servidor. |

### Recursos externos da interface

- Google Fonts fornece Montserrat e Rubik.
- Font Awesome 6.5.1 fornece os ícones.
- O cliente Socket.IO possui um fallback via CDN.

Esses recursos externos dependem de conexão com a internet. Chart.js, estilos, lógica do jogo, renderizador e áudio procedural são servidos pelos arquivos locais.

## Como o sistema funciona

### Componentes

1. **`server.js`** inicia Express e Socket.IO no mesmo servidor HTTP. Publica os arquivos da pasta `public/`, mantém as salas em memória e simula as corridas.
2. **`public/index.html`** define as telas da aplicação de página única: início, lobby, corrida, pódio e histórico/ajuda.
3. **`js/main.js`** controla as telas, coleta os comandos, conversa com o servidor, atualiza o HUD e o histórico e solicita os gráficos.
4. **`js/renderer.js`** implementa `GameRenderer`, que transforma o estado do jogo em quadros no Canvas 2D.
5. **`js/audio.js`** implementa `GameAudioEngine`, que sintetiza e controla os sons da partida.
6. **`js/chart.umd.min.js`** contém a distribuição UMD do Chart.js usada pela interface.
7. **`public/css/style.css`** define o layout, os controles responsivos e o tema visual.

### Ciclo de uma partida

1. Ao conectar, o cliente recebe a lista de salas abertas. O jogador cria uma sala ou entra com um código.
2. O servidor atribui um código de quatro caracteres, registra os jogadores e notifica os clientes daquela sala.
3. O anfitrião inicia a corrida. O servidor prepara a pista, adiciona bots conforme a configuração e envia a contagem regressiva.
4. Durante a corrida, o navegador envia os comandos do jogador. O servidor valida o jogador e atualiza física, posições, itens, colisões, bots e classificação.
5. O servidor transmite o estado da partida pelo evento `game_tick` aproximadamente 30 vezes por segundo. O cliente interpola e prevê visualmente os movimentos entre atualizações para desenhar a corrida com mais fluidez.
6. Ao terminar, o servidor envia o pódio e as estatísticas. Cada navegador grava o resultado do seu jogador no histórico local e desenha os gráficos correspondentes.
7. Os jogadores podem solicitar uma revanche, que reinicia a sala no lobby.

O servidor é a fonte do estado de jogo compartilhado; a previsão do cliente serve para suavizar a exibição, não para substituir a simulação da partida.

### Eventos Socket.IO principais

| Direção | Eventos | Finalidade |
| --- | --- | --- |
| Cliente → servidor | `create_room`, `join_room` | Criar ou entrar em uma sala. |
| Cliente → servidor | `toggle_ready`, `update_room_settings`, `start_race_request` | Atualizar prontidão/configuração e iniciar a corrida como anfitrião. |
| Cliente → servidor | `player_input` | Enviar direção, aceleração, freio, nitro e uso de item. |
| Cliente → servidor | `rematch_request` | Retornar a sala ao lobby para outra corrida. |
| Servidor → cliente | `room_created`, `room_joined`, `player_list_updated`, `room_settings_updated` | Atualizar estado e interface do lobby. |
| Servidor → cliente | `race_starting`, `countdown_tick`, `game_tick` | Preparar e sincronizar a corrida. |
| Servidor → cliente | `item_collected`, `item_activated`, `obstacle_hit`, `car_bump`, `boost_hit`, `oil_slip`, `missile_exploded`, `shield_blocked` | Notificar eventos e efeitos de jogo. |
| Servidor → cliente | `player_finished`, `race_game_over`, `returned_to_lobby` | Encerrar a corrida, exibir o resultado ou reabrir o lobby. |
| Servidor → todos | `public_rooms_list` | Atualizar a lista de salas abertas no lobby. |

## Recursos do jogo

- **Bots:** podem completar a corrida até quatro participantes. A lógica da IA busca itens e pads de turbo e reage aos demais pilotos.
- **Itens:** turbo, escudo, óleo, pulso EMP e míssil teleguiado. Caixas de item são distribuídas pela pista.
- **Pista:** obstáculos, pads de turbo, caixas de itens e perigos ativos aparecem durante a simulação.
- **Vácuo:** seguir outro carro pode conceder ganho de velocidade.
- **Controles:** no teclado, use `W/A/S/D` ou as setas, `Espaço` para usar item e `Shift` para nitro. No celular, use os botões de toque na tela.
- **Estatísticas da corrida:** tempo, colocação, colisões, itens usados e velocidade máxima.

## Gráficos e histórico

O Chart.js é configurado no `main.js` com cores e tipografia compatíveis com o tema da interface. As instâncias de gráficos são destruídas antes de serem recriadas, evitando sobreposição ao reabrir as telas.

- **Comparação do pódio:** barras para tempo, colisões, itens usados e velocidade máxima; a velocidade usa um segundo eixo.
- **Evolução pessoal:** linha com os tempos das corridas recentes.
- **Distribuição de posições:** gráfico de rosca com a proporção de resultados em 1º, 2º, 3º e demais lugares.

As estatísticas ficam no `localStorage` do navegador (chave `inovatech_personal_stats`); o nickname e a preferência de áudio também são guardados localmente. O histórico mantém até 20 resultados recentes. Não há banco de dados nem sincronização das estatísticas entre dispositivos.

**Comportamento atual da demonstração:** se o histórico ainda não tiver corridas, abrir a tela de histórico grava dados de exemplo no navegador para a apresentação. Apagar o histórico e abrir essa tela novamente volta a inserir os dados de demonstração.

## Estrutura do repositório

```text
.
├── server.js                 # Aplicação HTTP, API do QR Code e servidor do jogo
├── package.json              # Dependências, versão do Node e comandos npm
├── package-lock.json         # Versões resolvidas das dependências
├── iniciar_jogo.bat          # Inicialização rápida no Windows
├── index.html                # Redirecionamento para public/index.html
├── manutencao.html           # Redirecionamento para index.html
├── public/
│   ├── index.html            # Interface servida pelo Express
│   ├── css/style.css         # Estilos da interface
│   └── js/
│       ├── main.js           # Fluxo da aplicação e integração Socket.IO
│       ├── renderer.js       # Desenho da corrida em Canvas
│       ├── audio.js          # Áudio procedural
│       └── chart.umd.min.js  # Biblioteca Chart.js
├── js/                       # Cópias dos scripts também servidos como fallback
└── css/                      # Cópia dos estilos também servida como fallback
```

O Express tenta primeiro servir conteúdo de `public/` e depois da raiz do projeto. Atualmente, `js/` e `css/` na raiz são cópias idênticas às respectivas pastas em `public/`; ao alterar esses arquivos, mantenha as cópias sincronizadas para evitar diferenças quando o fallback for usado. A página principal é `public/index.html`.

## Instalação e execução

### Requisitos

- Node.js 18 ou superior
- npm
- Navegador moderno com suporte a Canvas 2D, Web Audio API e WebSockets

### Via terminal

Na raiz do projeto:

```bash
npm install
npm start
```

Abra `http://localhost:3000`. Para conectar dispositivos na mesma rede Wi-Fi, use o endereço IP mostrado no terminal, por exemplo `http://192.168.0.10:3000`. O servidor escuta em `0.0.0.0` e usa a porta 3000 por padrão.

### Windows

Execute `iniciar_jogo.bat`. O arquivo inicia `node server.js` e abre `http://localhost:3000` no navegador após dois segundos.

### Configuração

- `PORT`: porta HTTP do servidor. Se não estiver definida, o valor padrão é `3000`.
- `/healthz`: endpoint de saúde que responde `OK`.
- `/api/qrcode?url=<URL-ENCODED>`: retorna JSON com a propriedade `qrcode`, contendo a imagem do QR Code em formato Data URL. A rota retorna HTTP 400 se `url` não for informado.

Se os arquivos forem publicados em um servidor estático separado (por exemplo, Apache/WAMP), o servidor Node continua necessário para Socket.IO e para `/api/qrcode`. O cliente tenta conectar o Socket.IO à porta 3000 quando detecta o projeto servido localmente sob `/inovatech`; a chamada do QR Code, por outro lado, usa a origem da página. Nesse cenário, configure um proxy/encaminhamento para a API ou abra a aplicação servida pelo Node.

## Estado, persistência e operação

- As salas, jogadores e estado das corridas ficam em memória no processo Node. Reiniciar o servidor encerra as salas existentes.
- Estatísticas, nickname e preferência de áudio não são enviados para o servidor; são locais a cada navegador.
- O endpoint `/healthz` permite verificações básicas de disponibilidade.
- O servidor configura CORS do Socket.IO para aceitar qualquer origem. Em uma implantação pública, revise essa política e as regras de rede conforme o ambiente.
- Não há autenticação, banco de dados, sistema de contas ou mecanismo de recuperação de partida.
- Não existe suíte de testes automatizados configurada neste repositório. O script `npm test` informa que não há testes especificados.

## Limitações e diagnóstico

- **Não conecta à partida:** confirme que `npm start` está ativo, que a porta está acessível e, ao usar outro dispositivo, que ambos estão na mesma rede.
- **QR Code ausente em hospedagem separada:** confirme que `/api/qrcode` está sendo encaminhado para o servidor Node, não apenas para o servidor estático.
- **Fontes ou ícones ausentes:** confira o acesso à internet e aos CDNs do Google Fonts e Font Awesome.
- **Som não inicia:** navegadores normalmente exigem uma interação do usuário antes de liberar o áudio; toque ou clique na página e confira o botão de som.
- **Histórico não parece vazio:** a tela de histórico insere dados de demonstração automaticamente quando não há partidas registradas.
