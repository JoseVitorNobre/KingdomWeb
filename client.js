/*
 * CLIENTE (navegador): canvas, teclado, menu, modo local e modo online.
 * Depende de game.js (lógica) e render.js (desenho), carregados antes no index.html.
 */
const cv = document.getElementById('c'),
  x = cv.getContext('2d'),
  ov = document.getElementById('ov');
let W, H;
// Ajusta o canvas ao tamanho da janela.
function rs() {
  cv.width = W = innerWidth;
  cv.height = H = innerHeight;
  x.imageSmoothingEnabled = false;
}
addEventListener('resize', rs);
rs();

const keys = {},
  pressed = {};
let FDT = 1 / 60,
  last = 0,
  pred = { x: undefined, face: 1, t: 0 },
  online = false,
  ws = null,
  myId = -1,
  ocam,
  lastK = '';

addEventListener('keydown', (e) => {
  if (e.code.startsWith('Arrow')) e.preventDefault();
  if (!keys[e.code]) pressed[e.code] = 1;
  keys[e.code] = 1;
  if (ov.style.display !== 'none') {
    if (e.code === 'Digit1') start(1);
    if (e.code === 'Digit2') start(2);
    if (e.code === 'Digit3') goOnline();
  }
});
addEventListener('keyup', (e) => (keys[e.code] = 0));

// Mostra a tela de menu/mensagem. Teclas 1, 2 e 3 escolhem o modo.
function menu(msg) {
  ov.style.display = 'flex';
  ov.innerHTML = `<h1>DOIS REINOS</h1>${msg ? `<p><b>${msg}</b></p>` : ''}
  <p>Sobreviva a ${NIGHTS} noites. Os Greed saem dos portais à noite e atacam muros e a sede.</p>
  <p><b>A / D</b> ou <b>←/→</b> mover · <b>S</b> ou <b>↓</b> pagar/construir (perto de um alvo)</p>
  <p>Jogador 2: <b>←/→/↓</b>. Tela dividida em cima/baixo.</p>
  <p>Recrute vagabundos (1 moeda): cada acampamento guarda até 3 e ganha 1 novo a cada amanhecer. Ao lado da sede há duas bancadas com até 4 ferramentas cada: pague para colocar uma ferramenta (martelo 3, arco 2, enxada 4); um camponês ocioso vai até a bancada, pega a ferramenta e vira <b>construtor</b> (martelo, esquerda) ou <b>arqueiro</b> (arco, direita). À noite, construtores só trabalham dentro das muralhas, a menos que todos os monstros da noite já tenham sido mortos. Arqueiros ocupam torres livres; sem torre, guardam atrás do muro mais externo e atiram. Muros (2/4/7) só sobem se um construtor trabalhar neles. Pague 1 em uma árvore para marcá-la: o construtor a derruba (permanente) e ela gera moedas. Árvores com placa liberam um ponto de muro ou de arco ao caírem. Passe sobre baús para abri-los. Torres de arco custam 3/5/8, exigem construtor e cada nível comporta um arqueiro a mais; a sede sobe por 5/9. Terrenos de fazenda (placa amarela, 4 moedas, construtor necessário) estão disponíveis desde o início, em ambos os lados: escolha onde construir. Com a sede no nível 2 e uma muralha expandida (dois muros construídos no mesmo lado), surge a bancada de enxada logo à frente do muro mais interno. As fazendas comportam até 8 fazendeiros; cada um rende 3 moedas por amanhecer a partir do segundo dia, e trabalha à noite se a fazenda estiver dentro das muralhas. Camponeses geram moedas ao amanhecer. Greed que tocam você roubam todas as moedas.</p>
  <p>Online: o servidor (<b>node server.js</b>) permite até 6 jogadores no mesmo reino.</p>
  <p>Pressione <b>1</b> (1 jogador), <b>2</b> (2 locais) ou <b>3</b> (online)</p>`;
}

// Inicia o jogo local com n jogadores (1 ou 2, tela dividida).
function start(n) {
  online = false;
  if (ws) {
    ws.onclose = null;
    ws.close();
    ws = null;
  }
  ov.style.display = 'none';
  newGame(n);
}
// Conecta ao servidor (mesmo endereço da página) e entra no reino compartilhado.
function goOnline() {
  ov.style.display = 'none';
  online = true;
  G = null;
  ocam = undefined;
  ws = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host);
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.me !== undefined) myId = m.me;
    if (m.s) applySnap(m.s);
  };
  ws.onclose = () => {
    online = false;
    ws = null;
    G = null;
    menu('Sem conexão com o servidor. Inicie com: node server.js');
  };
}
addEventListener('keydown', () => {
  if (online) sendIn();
});
addEventListener('keyup', () => {
  if (online) sendIn();
});
// Online: suaviza posições recebidas e avança o relógio entre mensagens do servidor.
function smooth(dt) {
  const k = 1 - Math.exp(-dt * 20);
  [G.players, G.peasants, G.vagrants, G.greeds].forEach((a) =>
    a.forEach((e) => {
      if (a === G.players && e.id === myId) return;
      if (e.sx !== undefined) e.x += (e.sx - e.x) * k;
    }),
  );
  G.time = G.timeAtSnap + Math.min(0.3, (performance.now() - G.receivedAt) / 1000) / DAYLEN;
}
// Online: move o seu cavalo na hora (sem esperar o servidor) e corrige se divergir muito.
function predict(dt) {
  const me = G.players.find((p) => p.id === myId);
  if (!me) return;
  if (pred.x === undefined || Math.abs(me.sx - pred.x) > 60) pred.x = me.sx;
  const v = +!!(keys.KeyD || keys.ArrowRight) - +!!(keys.KeyA || keys.ArrowLeft);
  pred.x = clamp(pred.x + v * 105 * dt, 60, WW - 60);
  if (!v) pred.x += (me.sx - pred.x) * Math.min(1, dt * 6);
  else {
    pred.face = v;
    pred.t += dt;
  }
  me.x = pred.x;
  me.face = pred.face;
  me.mv = v;
  me.t = pred.t;
}
// Online: envia ao servidor as teclas (esquerda, direita, pagar) somente quando mudam.
function sendIn() {
  if (!ws || ws.readyState !== 1) return;
  const l = +!!(keys.KeyA || keys.ArrowLeft),
    r = +!!(keys.KeyD || keys.ArrowRight),
    d = +!!(pressed.KeyS || pressed.ArrowDown),
    k = l + ',' + r;
  if (d || k !== lastK) {
    lastK = k;
    ws.send(JSON.stringify({ l, r, d }));
    if (d) {
      delete pressed.KeyS;
      delete pressed.ArrowDown;
    }
  }
}

// Laço principal, uma vez por quadro: lê entradas, atualiza (local) ou suaviza (online), desenha.
function frame(ts) {
  const dt = Math.min(0.05, (ts - last) / 1000 || 0);
  last = ts;
  FDT = dt || 1 / 60;
  if (G && online) {
    smooth(dt);
    predict(dt);
  }
  if (G && !online) {
    G.players.forEach((p, i) => {
      const o = G.numPlayers == 1;
      p.input.l = +!!(keys[K[i].l] || (o && keys.ArrowLeft));
      p.input.r = +!!(keys[K[i].r] || (o && keys.ArrowRight));
      if (pressed[K[i].d] || (o && pressed.ArrowDown)) p.input.d = 1;
    });
    if (!G.over) update(dt);
  }
  x.fillStyle = '#000';
  x.fillRect(0, 0, W, H);
  if (G) {
    if (online) {
      const me = G.players.find((p) => p.id === myId);
      if (me) {
        me.cam = ocam !== undefined ? ocam : me.x - 200;
        view(0, 0, W, H, me);
        ocam = me.cam;
      }
    } else if (G.numPlayers == 1) view(0, 0, W, H, G.players[0]);
    else {
      view(0, 0, W, Math.floor(H / 2) - 2, G.players[0]);
      view(0, Math.floor(H / 2) + 2, W, Math.floor(H / 2) - 2, G.players[1]);
    }
    if (online) {
      x.textAlign = 'left';
      x.textBaseline = 'top';
      x.font = '12px "Courier New",monospace';
      G.players.forEach((p, i) => {
        x.fillStyle = CLOAK[p.id % 6];
        x.fillRect(W - 150, 12 + i * 18, 10, 10);
        x.fillStyle = '#f2e6c4';
        x.fillText(
          `J${p.id + 1}${p.id === myId ? ' (você)' : ''}  ${p.coins}`,
          W - 134,
          11 + i * 18,
        );
      });
    }
    // HUD global
    const night = dark() > 0.5;
    x.textAlign = 'center';
    x.textBaseline = 'top';
    x.font = 'bold 18px "Courier New",monospace';
    x.fillStyle = 'rgba(0,0,0,.45)';
    x.fillRect(W / 2 - 130, 6, 260, 48);
    x.fillStyle = night ? '#c9b8ff' : '#ffe27a';
    x.fillText(`${night ? 'Noite' : 'Dia'} ${Math.min(G.day, NIGHTS)}/${NIGHTS}`, W / 2, 10);
    x.fillStyle = '#400';
    x.fillRect(W / 2 - 110, 34, 220, 10);
    x.fillStyle = '#d9534f';
    x.fillRect(W / 2 - 110, 34, (220 * Math.max(0, G.castle.hp)) / G.castle.max, 10);
    x.font = '11px "Courier New",monospace';
    x.fillStyle = '#f2e6c4';
    x.fillText(`Sede nv ${G.castle.lvl}`, W / 2, 36);
  }
  if (G && G.over) {
    if (online) {
      x.fillStyle = 'rgba(0,0,0,.6)';
      x.fillRect(0, H / 2 - 40, W, 80);
      x.fillStyle = '#ffd35a';
      x.textAlign = 'center';
      x.textBaseline = 'middle';
      x.font = 'bold 28px "Courier New",monospace';
      x.fillText(
        G.over === 'win' ? 'Vitória! Reiniciando...' : 'Derrota. Reiniciando...',
        W / 2,
        H / 2,
      );
    } else if (ov.style.display === 'none')
      menu(G.over === 'win' ? 'Vitória: o reino sobreviveu.' : 'Derrota: a sede caiu.');
  }
  if (online) sendIn();
  for (const k in pressed) delete pressed[k];
  requestAnimationFrame(frame);
}
menu();
requestAnimationFrame(frame);