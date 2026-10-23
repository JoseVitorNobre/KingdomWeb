/*
 * LÓGICA DO JOGO
 * Este arquivo roda no navegador (modo local) e no servidor Node (modo online).
 * Não use document/canvas aqui: só simulação.
 *
 * ESTADO GLOBAL (variável G)
 *   G.players      jogadores (monarcas a cavalo): x, coins, input, target...
 *   G.peasants     camponeses e suas profissões (ver abaixo)
 *   G.vagrants     vagabundos nos acampamentos (recrutáveis por 1 moeda)
 *   G.greeds       monstros que saem dos portais à noite
 *   G.groundCoins  moedas no chão        G.chests  baús (somem depois de abertos)
 *   G.trees        árvores (mark = marcada p/ cortar; site = ponto de obra escondido)
 *   G.stumps       tocos das árvores cortadas (permanentes)
 *   G.slots        pontos de construção: muros ('wall') e torres ('bow')
 *   G.castle       sede (lvl, hp, max)   G.tools  ferramentas nas bancadas {ham, bow}
 *   G.effects      efeitos visuais temporários (flechas, poeira)
 *   G.time         relógio: parte inteira = dia, parte decimal = hora do dia
 *
 * CAMPOS DE UM CAMPONÊS (peasant)
 *   isBuilder / isArcher   profissão (ambos falsos = camponês comum)
 *   job                    1 quando o arqueiro está ocupando uma torre (q.s = torre)
 *   goal                   'ham' ou 'bow' enquanto caminha até a bancada
 *   work                   obra (slot) ou árvore que o construtor está fazendo
 *   workTime               segundos já trabalhados em 'work'
 *   archerSide             lado (-1 esquerda, 1 direita) onde o arqueiro livre fica
 *
 * COMO ADICIONAR COISAS: veja README.md
 */
// ----- Configuração do mundo (ajuste o equilíbrio aqui) -----
// WW largura do mundo | CX posição da sede | NIGHTS noites para vencer | DAYLEN segundos de um dia+noite
const WW = 3200,
  CX = 1600,
  NIGHTS = 8,
  DAYLEN = 120;
// X dos acampamentos: um vagabundo nasce em cada um a cada amanhecer.
const CAMPS = [CX - 1400, CX - 900, CX + 900, CX + 1400];
// Pontos de construção da sede: [distância da sede, tipo, nível da sede exigido].
const SL = [
  [-110, 'bow', 1],
  [110, 'bow', 1],
  [-220, 'wall', 1],
  [220, 'wall', 1],
  [-360, 'bow', 2],
  [360, 'bow', 2],
  [-470, 'wall', 2],
  [470, 'wall', 2],
  [-640, 'wall', 3],
  [640, 'wall', 3],
];
// Vida dos muros por nível | custo de cada nível de muro | de torre | de melhoria da sede.
const WALLHP = [0, 8, 16, 26],
  WALLC = [2, 4, 7],
  BOWC = [3, 5, 8],
  CENC = [5, 9];
// Teclas dos jogadores locais (modo tela dividida).
const K = [
  { l: 'KeyA', r: 'KeyD', d: 'KeyS' },
  { l: 'ArrowLeft', r: 'ArrowRight', d: 'ArrowDown' },
];
// Utilitários
const rnd = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
const rgb = (a) => `rgb(${a[0]},${a[1]},${a[2]})`;
// Estado do jogo atual (ver legenda no topo).
let G = null;
// Cria um jogador (monarca a cavalo). input = estado das teclas: l, r e d (d = pediu para pagar).
function mk(px, i) {
  return {
    x: px,
    id: i,
    coins: 6,
    input: { l: 0, r: 0, d: 0 },
    face: 1,
    mv: 0,
    t: 0,
    flash: 0,
    cam: px - 200,
    tg: null,
  };
}

// Cria um mundo novo. n = jogadores iniciais (o servidor online usa 0 e adiciona conforme conectam).
function newGame(n) {
  G = {
    numPlayers: n,
    time: 0,
    lastDawn: 0,
    day: 1,
    nightStarted: 0,
    greedsLeft: 0,
    spawnTimer: 0,
    over: null,
    players: Array.from({ length: n }, (_, i) => mk(CX - 40 + i * 80, i)),
    castle: { lvl: 1, hp: 14, max: 14, cd: 0 },
    slots: SL.map(([o, t, r]) => ({
      x: CX + o,
      t,
      req: r,
      lvl: 0,
      hp: 0,
      ar: null,
      cd: 0,
      side: Math.sign(o),
    })),
    peasants: [
      { x: CX - 30, tx: CX - 30, job: 0 },
      { x: CX + 30, tx: CX + 30, job: 0 },
    ],
    nextId: 4,
    tools: { ham: 0, bow: 0 },
    vagrants: CAMPS.map((c, i) => ({ id: i + 1, x: c, tx: c, w: 0, home: c })),
    greeds: [],
    groundCoins: Array.from({ length: 10 }, (_, i) => ({ x: CX - 36 + i * 8 })),
    effects: [],
    trees: mkTrees(),
    stumps: [],
    chests: mkChests(),
  };
}

// 12 árvores comuns + 6 árvores com placa (3 por lado) que viram pontos de muro/torre quando cortadas.
function mkTrees() {
  const a = [];
  while (a.length < 12) {
    const t = rnd(160, WW - 160);
    if (Math.abs(t - CX) > 200) a.push({ x: t, mark: 0, v: a.length % 2 });
  }
  for (const sg of [-1, 1])
    ['wall', 'bow', 'wall'].forEach((st, i) =>
      a.push({ x: CX + sg * (760 + i * 260), mark: 0, v: i % 2, site: st }),
    );
  return a;
}
// Sorteia 7 baús afastados da sede e entre si.
function mkChests() {
  const a = [];
  while (a.length < 7) {
    const t = rnd(200, WW - 200);
    if (Math.abs(t - CX) > 260 && a.every((c) => Math.abs(c.x - t) > 150)) a.push({ x: t });
  }
  return a;
}
// Custo do PRÓXIMO nível de um ponto de construção (0 = já está no nível máximo).
function cost(s) {
  return s.lvl < 3 ? (s.t === 'bow' ? BOWC : WALLC)[s.lvl] : 0;
}
// Sobe um nível do ponto de construção. Chamado quando o construtor termina a obra.
function build(s) {
  s.lvl++;
  if (s.t === 'wall') s.hp = WALLHP[s.lvl];
}

// Alvo de interação mais próximo do jogador p (a menos de 40px), ou null.
// Cada alvo: { x, cost (moedas), fn (o que acontece ao pagar), ic (ícone mostrado) }.
// PARA ADICIONAR UMA NOVA COMPRA: crie outro cand(...) aqui.
function targetFor(p) {
  let best = null,
    bd = 40;
  const cand = (tx, c, fn, ic) => {
    const d = Math.abs(tx - p.x);
    if (d < bd) {
      bd = d;
      best = { x: tx, cost: c, fn, ic };
    }
  };
  G.vagrants.forEach((v) =>
    cand(
      v.x,
      1,
      () => {
        G.vagrants.splice(G.vagrants.indexOf(v), 1);
        G.peasants.push({ x: v.x, tx: v.x, job: 0 });
      },
      'per',
    ),
  );
  G.slots.forEach((s) => {
    if (G.castle.lvl < s.req || s.pend) return;
    const c = cost(s);
    if (c)
      cand(
        s.x,
        c,
        () => {
          s.pend = 1;
        },
        s.t,
      );
  });
  G.trees.forEach((t) => {
    if (!t.mark)
      cand(
        t.x,
        1,
        () => {
          t.mark = 1;
        },
        'axe',
      );
  });
  if (G.tools.ham < 4)
    cand(
      CX - 64,
      2,
      () => {
        G.tools.ham++;
      },
      'ham',
    );
  if (G.tools.bow < 4)
    cand(
      CX + 64,
      2,
      () => {
        G.tools.bow++;
      },
      'arc',
    );
  return best;
}

// Escuridão do céu: 0 = dia, 1 = noite, com transições. Baseada em G.time.
function dark() {
  const p = G.time % 1;
  return p < 0.55 ? 0 : p < 0.65 ? (p - 0.55) / 0.1 : p < 0.92 ? 1 : 1 - (p - 0.92) / 0.08;
}

// Remove um Greed morto; 50% de chance de soltar uma moeda.
function kill(g) {
  G.greeds.splice(G.greeds.indexOf(g), 1);
  if (Math.random() < 0.5) G.groundCoins.push({ x: g.x });
  G.effects.push({ k: 'puff', x: g.x, l: 0.4 });
}

// Avança a simulação em dt segundos. Dividido em seções numeradas.
function update(dt) {
  // ===== 1. Relógio e amanhecer (novo dia, moedas dos camponeses, novos vagabundos) =====
  G.time += dt / DAYLEN;
  const pr = G.time % 1,
    nd = Math.floor(G.time);
  // amanhecer
  if (nd > G.lastDawn) {
    G.lastDawn = nd;
    G.day++;
    G.nightStarted = 0;
    G.greeds.forEach((g) => G.effects.push({ k: 'puff', x: g.x, l: 0.4 }));
    G.greeds = [];
    G.groundCoins.push({ x: CX });
    G.peasants.forEach((q) => G.groundCoins.push({ x: q.x + rnd(-6, 6) }));
    CAMPS.forEach((c) => {
      if (!G.vagrants.some((v) => v.home === c))
        G.vagrants.push({ id: (G.nextId = (G.nextId || 0) + 1), x: c, tx: c, w: 0, home: c });
    });
    if (G.day > NIGHTS) {
      G.over = 'win';
      return;
    }
  }
  // ===== 2. Surgimento dos Greed durante a noite =====
  if (pr >= 0.6 && !G.nightStarted) {
    G.nightStarted = 1;
    G.greedsLeft = 4 + 3 * G.day;
  }
  if (G.nightStarted && G.greedsLeft > 0) {
    G.spawnTimer -= dt;
    if (G.spawnTimer <= 0) {
      const side = Math.random() < 0.5 ? -1 : 1,
        big = G.day >= 4 && Math.random() < 0.2;
      G.greeds.push({
        id: (G.nextId = (G.nextId || 0) + 1),
        x: side < 0 ? 70 : WW - 70,
        side,
        hp: big ? 6 : 2,
        sp: big ? 28 : 38 + G.day * 2,
        dmg: big ? 2 : 1,
        w: big ? 14 : 8,
        big,
        cd: 1,
        t: 0,
        fl: 0,
      });
      G.greedsLeft--;
      G.spawnTimer = Math.max(0.7, 1.6 - 0.07 * G.day);
    }
  }
  // ===== 3. Vagabundos andam perto do próprio acampamento =====
  G.vagrants.forEach((v) => {
    v.w -= dt;
    if (v.w <= 0) {
      v.tx = clamp(v.x + rnd(-40, 40), v.home - 45, v.home + 45);
      v.w = rnd(2, 5);
    }
    const d = v.tx - v.x;
    if (Math.abs(d) > 1) v.x += Math.sign(d) * Math.min(Math.abs(d), 18 * dt);
  });
  // ===== 4. Jogadores: movimento, pegar moedas/baús, pagar e construir =====
  G.players.forEach((p, i) => {
    const l = p.input.l,
      r = p.input.r,
      dp = p.input.d;
    p.input.d = 0;
    p.mv = (r ? 1 : 0) - (l ? 1 : 0);
    if (p.mv) p.face = p.mv;
    p.x = clamp(p.x + p.mv * 105 * dt, 60, WW - 60);
    p.t += p.mv ? dt : 0;
    p.flash = Math.max(0, p.flash - dt);
    G.groundCoins = G.groundCoins.filter((c) => {
      if (Math.abs(c.x - p.x) < 12) {
        p.coins++;
        return false;
      }
      return true;
    });
    G.chests = G.chests.filter((c) => {
      if (Math.abs(c.x - p.x) < 12) {
        const n = 4 + Math.floor(Math.random() * 4);
        for (let i = 0; i < n; i++) G.groundCoins.push({ x: c.x + rnd(-14, 14) });
        G.effects.push({ k: 'pop', x: c.x, l: 0.3 });
        return false;
      }
      return true;
    });
    p.target = targetFor(p);
    if (dp && p.target) {
      if (p.coins >= p.target.cost) {
        p.coins -= p.target.cost;
        p.target.fn();
        G.effects.push({ k: 'pop', x: p.target.x, l: 0.3 });
      } else p.flash = 0.5;
    }
  });
  // ===== 5. Camponeses: construtores (obras e árvores), bancadas e posições dos arqueiros =====
  // 5a. Zona protegida: entre os muros construídos mais externos. À noite, construtores só trabalham aqui.
  const nt = dark() > 0.5;
  const bw = G.slots.filter((s) => s.t === 'wall' && s.lvl && s.hp > 0).map((s) => s.x);
  const wl = bw.filter((v) => v < CX),
    wr = bw.filter((v) => v > CX);
  const zl = wl.length ? Math.min(...wl) + 12 : CX - 150,
    zr = wr.length ? Math.max(...wr) - 12 : CX + 150;
  const bl = G.peasants.filter((q) => q.isBuilder);
  const ins = (v) => v >= zl - 14 && v <= zr + 14;
  bl.forEach((q) => {
    if (q.work && (!(q.work.pend || q.work.mark) || (nt && !ins(q.work.x)))) q.work = null;
  });
  {
    // 5b. Cada obra pendente / árvore marcada vai para o construtor livre MAIS PRÓXIMO.
    G.slots
      .filter((s) => s.pend)
      .concat(G.trees.filter((t) => t.mark))
      .forEach((w) => {
        if (bl.some((q) => q.work === w) || (nt && !ins(w.x))) return;
        let bq = null,
          bd = 1e9;
        bl.forEach((q) => {
          if (!q.work) {
            const d = Math.abs(q.x - w.x);
            if (d < bd) {
              bd = d;
              bq = q;
            }
          }
        });
        if (bq) {
          bq.work = w;
          bq.workTime = 0;
        }
      });
  }
  bl.forEach((q, i) => {
    q.home = zl + ((i + 1) / (bl.length + 1)) * (zr - zl);
  });
  // 5c. Camponeses ociosos vão buscar ferramentas disponíveis nas bancadas (uma reservada por camponês).
  [
    ['ham', CX - 64],
    ['bow', CX + 64],
  ].forEach(([k, sx]) => {
    let av = G.tools[k] - G.peasants.filter((q) => q.goal === k).length;
    while (av > 0) {
      let bq = null,
        bd = 1e9;
      G.peasants.forEach((q) => {
        if (!q.job && !q.isBuilder && !q.isArcher && !q.goal) {
          const d = Math.abs(q.x - sx);
          if (d < bd) {
            bd = d;
            bq = q;
          }
        }
      });
      if (!bq) break;
      bq.goal = k;
      av--;
    }
  });
  // 5d. Arqueiros sem torre se espalham atrás do muro mais externo do seu lado.
  const cnt = { '-1': 0, 1: 0 };
  G.peasants.forEach((q) => {
    if (q.isArcher && !q.job) q.k = cnt[q.archerSide]++;
  });
  // 5e. Ação de cada camponês: pegar ferramenta > trabalhar > ficar na zona (construtor/arqueiro) > vagar.
  G.peasants.forEach((q) => {
    if (q.goal) {
      q.tx = q.goal === 'ham' ? CX - 64 : CX + 64;
      if (Math.abs(q.x - q.tx) < 4) {
        const k = q.goal;
        q.goal = null;
        if (G.tools[k] > 0) {
          G.tools[k]--;
          if (k === 'ham') q.isBuilder = 1;
          else {
            q.archerSide = G.peasants.filter((o) => o.isArcher).length % 2 ? 1 : -1;
            q.isArcher = 1;
          }
        }
      }
    } else if (q.work) {
      q.tx = q.work.x;
      if (Math.abs(q.x - q.tx) < 4) {
        q.workTime += dt;
        q.hit = 1;
        const w = q.work,
          need = w.t ? 3 + 2 * w.lvl : 3;
        if (q.workTime >= need) {
          if (w.t) {
            w.pend = 0;
            build(w);
          } else {
            G.trees.splice(G.trees.indexOf(w), 1);
            G.stumps.push({ x: w.x });
            if (w.site)
              G.slots.push({
                x: w.x,
                t: w.site,
                req: 0,
                lvl: 0,
                hp: 0,
                ar: null,
                cd: 0,
                side: Math.sign(w.x - CX),
              });
            for (let i = 0; i < 3; i++) G.groundCoins.push({ x: w.x + rnd(-12, 12) });
            G.effects.push({ k: 'puff', x: w.x, l: 0.4 });
          }
          q.work = null;
          q.hit = 0;
        }
      } else q.hit = 0;
    } else if (q.isBuilder) {
      q.hit = 0;
      q.w = (q.w || 0) - dt;
      if (q.w <= 0 || q.tx === undefined) {
        q.tx = clamp(q.home + rnd(-14, 14), zl, zr);
        q.w = rnd(2, 5);
      }
    } else if (q.isArcher && !q.job) {
      const ws = bw.filter((v) => (v - CX) * q.archerSide > 0);
      const ow = ws.length
        ? q.archerSide < 0
          ? Math.min(...ws)
          : Math.max(...ws)
        : CX + q.archerSide * 100;
      q.tx = ow - q.archerSide * (14 + (q.k % 4) * 9);
    } else if (!q.job) {
      q.hit = 0;
      q.w = (q.w || 0) - dt;
      if (q.w <= 0) {
        q.tx = CX + rnd(-110, 110);
        q.w = rnd(2, 5);
      }
    } else q.tx = q.s.x + (q.s.ars.indexOf(q) - (q.s.lvl - 1) / 2) * 8;
    const d = q.tx - q.x;
    q.m = Math.abs(d) > 1;
    if (q.m) {
      q.x += Math.sign(d) * Math.min(Math.abs(d), 45 * dt);
      q.f = d < 0;
    }
  });
  // ===== 6. Torres e arqueiros livres atiram nos Greed =====
  G.slots.forEach((s) => {
    if (s.t !== 'bow' || !s.lvl) return;
    s.ars = s.ars || [];
    while (s.ars.length < s.lvl) {
      let q = null,
        qd = 1e9;
      G.peasants.forEach((o) => {
        if (o.isArcher && !o.job) {
          const d = Math.abs(o.x - s.x);
          if (d < qd) {
            qd = d;
            q = o;
          }
        }
      });
      if (!q) break;
      q.job = 1;
      q.s = s;
      s.ars.push(q);
    }
    s.ars.forEach((q) => {
      if (!(Math.abs(q.x - q.tx) < 3)) return;
      q.cd = (q.cd || 0) - dt;
      if (q.cd > 0) return;
      let t = null,
        bd = 270;
      G.greeds.forEach((g) => {
        const d = Math.abs(g.x - q.x);
        if (d < bd && !g.fl) {
          bd = d;
          t = g;
        }
      });
      if (t) {
        t.hp--;
        q.cd = 1.1;
        q.f = t.x < q.x;
        G.effects.push({ k: 'arrow', x: q.x, y: 22, x2: t.x, y2: 4, l: 0.15 });
        if (t.hp <= 0) kill(t);
      }
    });
  });
  G.peasants.forEach((q) => {
    if (!q.isArcher || q.job) return;
    q.cd = (q.cd || 0) - dt;
    if (q.cd > 0) return;
    let t = null,
      bd = 230;
    G.greeds.forEach((g) => {
      const d = Math.abs(g.x - q.x);
      if (d < bd && !g.fl) {
        bd = d;
        t = g;
      }
    });
    if (t) {
      t.hp--;
      q.cd = 1.3;
      q.f = t.x < q.x;
      G.effects.push({ k: 'arrow', x: q.x, y: 8, x2: t.x, y2: 4, l: 0.15 });
      if (t.hp <= 0) kill(t);
    }
  });
  // ===== 7. Greed: andam até a sede, atacam muros/sede e roubam moedas de jogadores =====
  [...G.greeds].forEach((g) => {
    g.t += dt;
    if (g.fl) {
      g.x -= g.side * 0 + -g.side * 0;
      g.x += g.side * g.sp * 1.5 * dt;
      if (g.x < 20 || g.x > WW - 20) G.greeds.splice(G.greeds.indexOf(g), 1);
      return;
    }
    const dir = -g.side;
    G.players.forEach((p) => {
      if (!g.fl && p.coins > 0 && Math.abs(p.x - g.x) < 10) {
        for (let i = 0; i < p.coins; i++) G.groundCoins.push({ x: p.x + rnd(-16, 16) });
        p.coins = 0;
        p.flash = 0.9;
        g.fl = 1;
      }
    });
    if (g.fl) return;
    const blk = G.slots.find(
      (s) =>
        s.t === 'wall' &&
        s.lvl &&
        s.hp > 0 &&
        s.side == g.side &&
        Math.abs(s.x - g.x) < g.w / 2 + 5 &&
        (s.x - g.x) * dir > -3,
    );
    if (blk) {
      g.cd -= dt;
      if (g.cd <= 0) {
        g.cd = 1;
        blk.hp -= g.dmg;
        G.effects.push({ k: 'puff', x: blk.x, l: 0.2 });
        if (blk.hp <= 0) {
          blk.hp = 0;
          blk.lvl = 0;
        }
      }
    } else if (Math.abs(g.x - CX) < 24) {
      g.cd -= dt;
      if (g.cd <= 0) {
        g.cd = 1.2;
        G.castle.hp -= g.dmg;
        if (G.castle.hp <= 0) {
          G.over = 'lose';
        }
      }
    } else g.x += dir * g.sp * dt;
  });
  G.effects.forEach((f) => (f.l -= dt));
  G.effects = G.effects.filter((f) => f.l > 0);
}

// Adiciona um jogador ao mundo (id opcional; sem id usa o menor livre).
function addPlayer(id) {
  if (id === undefined) {
    const u = new Set(G.players.map((p) => p.id));
    id = 0;
    while (u.has(id)) id++;
  }
  const p = mk(CX + rnd(-40, 40), id);
  G.players.push(p);
  return p;
}
// Foto do estado para enviar aos clientes. full = incluir também dados que mudam pouco (muros, árvores, baús).
function snap(full) {
  const si = (o) => G.slots.indexOf(o),
    ti = (o) => G.trees.indexOf(o);
  const d = {
    time: G.time,
    day: G.day,
    over: G.over,
    castle: G.castle,
    tools: G.tools,
    players: G.players.map((p) => ({
      x: p.x,
      id: p.id,
      coins: p.coins,
      face: p.face,
      mv: p.mv,
      t: p.t,
      flash: p.flash,
      target: p.target ? { x: p.target.x, cost: p.target.cost, ic: p.target.ic } : null,
    })),
    peasants: G.peasants.map((q) => ({
      x: q.x,
      tx: q.tx,
      f: q.f,
      m: q.m,
      isArcher: q.isArcher,
      isBuilder: q.isBuilder,
      job: q.job,
      hit: q.hit,
      workTime: q.workTime,
      wk: !q.work ? null : q.work.t ? 's' + si(q.work) : 't' + ti(q.work),
    })),
    vagrants: G.vagrants.map((v) => ({ id: v.id, x: v.x, tx: v.tx })),
    greeds: G.greeds.map((g) => ({ id: g.id, x: g.x, fl: g.fl, big: g.big, t: g.t })),
    groundCoins: G.groundCoins,
    effects: G.effects,
  };
  if (full) {
    d.slots = G.slots.map((s) => ({
      x: s.x,
      t: s.t,
      req: s.req,
      lvl: s.lvl,
      hp: s.hp,
      pend: s.pend,
    }));
    d.trees = G.trees;
    d.stumps = G.stumps;
    d.chests = G.chests;
  }
  return d;
}
// Cliente: copia a posição já exibida da foto anterior, para a animação continuar suave.
function carry(a, b, k) {
  const m = new Map((b || []).map((e, i) => [k(e, i), e]));
  a.forEach((e, i) => {
    e.sx = e.x;
    const p = m.get(k(e, i));
    if (p && p.x !== undefined) e.x = p.x;
  });
}
// Cliente: recebe a foto do servidor e a transforma em G.
function applySnap(d) {
  const o = G;
  if (!d.slots) {
    if (!o || !o.slots) return;
    d.slots = o.slots;
    d.trees = o.trees;
    d.stumps = o.stumps;
    d.chests = o.chests;
  }
  d.numPlayers = 1;
  d.timeAtSnap = d.time;
  d.receivedAt = performance.now();
  carry(d.players, o && o.players, (e) => e.id);
  carry(d.peasants, o && o.peasants, (e, i) => i);
  carry(d.vagrants, o && o.vagrants, (e) => e.id);
  carry(d.greeds, o && o.greeds, (e) => e.id);
  G = d;
  G.peasants.forEach((q) => {
    q.work = !q.wk ? null : q.wk[0] === 's' ? G.slots[+q.wk.slice(1)] : G.trees[+q.wk.slice(1)];
  });
}
if (typeof module !== 'undefined')
  module.exports = { newGame, update, snap, addPlayer, getG: () => G };
