# Dois Reinos

Jogo 2D de defesa estilo Kingdom Two Crowns, com modo local (tela dividida) e online.

## Rodar

- Local (1 ou 2 jogadores, no mesmo teclado): `python3 -m http.server 8000` e abra a porta 8000. Tecla `1` ou `2`.
- Online: `npm install` e `node server.js`. Abra a porta 3000 (no Codespaces: aba Ports, visibilidade Public) e aperte `3`.
- Ajustes do servidor: `PORT`, `TICK_HZ` (60), `SEND_HZ` (60).

## Controles

A/D ou setas para mover. S ou seta para baixo para pagar/construir perto de um alvo.
Jogador 2 local: setas.

## Arquivos

| Arquivo | O que faz |
|---|---|
| `game.js` | Toda a lógica (simulação). Roda no navegador e no servidor. Não usa canvas. |
| `render.js` | Desenho: sprites (mapas de texto), cenário, HUD. Não altera o estado. |
| `client.js` | Canvas, teclado, menu, modo local e online (predição e suavização). |
| `server.js` | Servidor online (HTTP + WebSocket), roda `game.js`. |
| `index.html` | Página: carrega game.js, render.js e client.js. |

A legenda de todos os campos do estado (`G.players`, `G.peasants`...) está no topo de `game.js`.

## Onde mexer

- **Equilíbrio** (preços, vida dos muros, duração do dia, nº de noites): constantes no topo de `game.js` e `cost`.
- **Novo item comprável**: adicione um `cand(...)` em `targetFor` (game.js). Ele define posição, custo, o que acontece e o ícone.
- **Novo inimigo**: no bloco "2. Surgimento dos Greed" crie o objeto com seus campos (vida, velocidade, dano); o comportamento fica no bloco "7. Greed". Para aparecer na tela, desenhe-o em `view` (render.js) e inclua os campos usados no desenho em `snap` (game.js).
- **Stamina do cavalo**: constantes `STAMINA_*`, `SPRINT_MULT` no topo de `game.js`; função `horseStep` (usada também na predição do cliente).
- **Monstros**: `GREED_KINDS`, `TIER_*`, `RAM_*` no topo de `game.js`; spawn no bloco 2, comportamento no bloco 7; sprites `FLY_A/FLY_B/CHG` em `render.js`.
- **Ajuda dos construtores / alcance dos arqueiros**: `HELP_FIRST`, `HELP_DECAY` e `ARROW_*_RANGE` no topo de `game.js`; lógica em `helpBoost` e no bloco 5b2.
- **Estações e Lua de Sangue**: constantes `SEASON_*`, `BLOOD_*` e `MAX_GREED*` no topo de `game.js`; funções `seasonIndex`, `isWinter`, `isBloodMoon`; cores por estação em `SEASON_LOOK` (render.js).
- **Fazendeiros**: constantes `FARM*`, `TOOL_COST` e `STANDS` no topo de `game.js`; liberação em `checkFarmUnlock()`; lógica no bloco 5e (`isFarmer`); desenho em `farm()` e `stand()` (render.js).
- **Nova profissão**: um campo no camponês (como `isBuilder`), uma bancada em `stand`/`targetFor`, a lógica no bloco "5" e o campo em `snap`.
- **Novo sprite**: crie o mapa de texto em `render.js` (letras = cores da paleta, `.` = transparente) e desenhe com `spr(mapa, paleta, x, altura, espelhar)`.
- **Dado novo que o cliente precisa ver no online**: adicione em `snap()` (game.js). O que não estiver em `snap` não chega ao navegador dos outros jogadores.

## Teste rápido de sintaxe

`node --check game.js && node --check server.js`
