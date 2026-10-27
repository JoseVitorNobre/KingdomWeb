/*
 * LÓGICA DO JOGO
 * Este arquivo roda no navegador (modo local) e no servidor Node (modo online).
 * Não use document/canvas aqui: só simulação.
 *
 * ESTADO GLOBAL (variável G)
 *   G.players      jogadores (monarcas a cavalo): x, coins, input, target...
 *   G.peasants     camponeses e suas profissões (ver abaixo)
 *   G.vagrants     vagabundos nos acampamentos (recrutáveis por 1 moeda)
 *   G.greeds       monstros que saem dos portais à noite (kind: normal, big, flyer, jumper, charger)
 *   G.groundCoins  moedas no chão        G.chests  baús (somem depois de abertos)
 *   G.trees        árvores (mark = marcada p/ cortar; site = ponto de obra escondido)
 *   G.stumps       tocos das árvores cortadas (permanentes)
 *   G.slots        pontos de construção: muros ('wall'), torres ('bow') e fazendas ('farm')
 *   G.castle       sede (lvl, hp, max)   G.tools  ferramentas nas bancadas {ham, bow, farm}
 *   G.farmStandX   x da bancada do fazendeiro (null até uma muralha ser expandida)
 *   G.effects      efeitos visuais temporários (poeira, brilho de compra)
 *   G.arrows       flechas em voo: saem em linha reta (visão livre) ou em parábola (muro no caminho)
 *   G.time         relógio: parte inteira = dia, parte decimal = hora do dia
 *
 * CAMPOS DE UM CAMPONÊS (peasant)
 *   isBuilder / isArcher / isFarmer   profissão (todas falsas = camponês comum)
 *   farm                   fazenda (slot do tipo 'farm') onde o fazendeiro trabalha
 *   farmDays               amanheceres já passados na fazenda (rende a partir de 1)
 *   job                    1 quando o arqueiro está ocupando uma torre (q.s = torre)
 *   goal                   'ham' ou 'bow' enquanto caminha até a bancada
 *   work                   obra (slot) ou árvore que o construtor está fazendo
 *   workTime               segundos já trabalhados em 'work'
 *   archerSide             lado (-1 esquerda, 1 direita) onde o arqueiro livre fica
 *
 * COMO ADICIONAR COISAS: veja README.md
 */
// ----- Configuração do mundo (ajuste o equilíbrio aqui) -----
// WW largura do mundo | CX posição da sede | NIGHTS dias/noites para vencer | DAY_LENGTH_* duração do dia+noite (encurta ao longo do jogo)
const WW = 3200,
  CX = 1600,
  NIGHTS = 32,
  DAY_LENGTH_START = 160, // segundos do dia completo (claro + noite) no 1º dia
  DAY_LENGTH_MIN = 90; // duração mínima, atingida no último dia
// X dos acampamentos de vagabundos.
// Cada acampamento começa o jogo cheio (VAGRANTS_PER_CAMP) e ganha 1 vagabundo por amanhecer até voltar ao limite.
const CAMPS = [CX - 1400, CX - 900, CX + 900, CX + 1400];
const VAGRANTS_PER_CAMP = 3;
// ----- Estações e Lua de Sangue -----
// O jogo é dividido em 4 estações de mesmo tamanho (a última é o inverno): SEASON_LEN dias cada.
// Cada estação tem BLOOD_MOONS_PER_SEASON Luas de Sangue (no meio e no fim dela): Greed mais fortes e rápidos.
const BLOOD_MOONS_PER_SEASON = 2;
const SEASON_LEN = NIGHTS / 4;
const SEASON_NAMES = ['Primavera', 'Verão', 'Outono', 'Inverno'];
const BLOOD_DAMAGE = 2; // multiplicador do dano dos Greed na Lua de Sangue
const BLOOD_SPEED = 1.5; // multiplicador da velocidade dos Greed na Lua de Sangue
// Sem limite de monstros por noite. O intervalo entre dois nascimentos cai de SPAWN_INTERVAL_START (dia 1) até
// SPAWN_INTERVAL_MIN (último dia). Vida e velocidade iniciais já vêm multiplicadas (balanceamento).
const SPAWN_INTERVAL_START = 0.7;
const SPAWN_INTERVAL_MIN = 0.05;
const START_HP_MULT = 2; // vida inicial dos monstros x2
const START_SPEED_MULT = 1.5 * 0.85; // velocidade inicial dos monstros: x1,5 e depois -15%
const START_DMG_MULT = 0.85; // dano inicial dos monstros -15%
const BLOOD_COUNT = 2; // Lua de Sangue: quantidade de monstros x2
const BLOOD_SPECIAL_CHANCE = 2; // Lua de Sangue: chance dos monstros especiais x2 (só dos já liberados no dia)
const MAX_GREED_SPEED = 120; // limite da velocidade base dos Greed (antes do multiplicador da Lua de Sangue)
// ----- Cavalo: stamina -----
// Shift = correr (SPRINT_MULT x mais rápido) gastando stamina. Ao zerar, o cavalo fica EXAUSTO: não corre e anda
// 5% mais devagar até a barra encher por completo. Parado, a stamina recarrega 2x mais rápido.
const PLAYER_SPEED = 70; // px/s andando (correndo = x SPRINT_MULT)
const SPRINT_MULT = 1.8;
const STAMINA_MAX = 100;
const STAMINA_DRAIN = 30; // por segundo correndo (~3,3 s de corrida)
const STAMINA_REGEN_MOVING = 12; // por segundo andando
const STAMINA_REGEN_STILL = 24; // por segundo parado (2x)
const EXHAUSTED_SLOW = 0.95;
// ----- Monstros: evolução e variações -----
// A cada TIER_DAYS dias os Greed sobem de nível: +TIER_HP de vida, +TIER_DMG de dano e +TIER_SPEED de velocidade por nível.
const TIER_DAYS = 4;
const TIER_HP = 0.35;
const TIER_DMG = 0.2;
const TIER_SPEED = 0.06;
const FLY_HEIGHT = 26; // altura (px) em que os voadores voam: passam por cima dos muros
const RAM_WINDUP = 2.2; // segundos que o Investidor leva para preparar cada investida contra um muro
const RAM_MULT = 8; // dano da investida = dano normal x RAM_MULT
// Tipos de Greed (valores base, antes do nível). from = a partir de qual dia aparece, chance = probabilidade por Greed.
//  normal: anda e ataca | big: grande e resistente | flyer: voa por cima dos muros
//  jumper: pula os muros | charger: investida que causa muito dano nos muros
const GREED_KINDS = {
  normal: { hp: 2, sp: 38, dmg: 1, w: 8 },
  big: { hp: 6, sp: 28, dmg: 2, w: 14, from: 4, chance: 0.15 },
  flyer: { hp: 2, sp: 54, dmg: 1, w: 8, from: 6, chance: 0.15, air: true },
  jumper: { hp: 3, sp: 44, dmg: 1, w: 8, from: 10, chance: 0.12 },
  charger: { hp: 5, sp: 32, dmg: 1, w: 12, from: 14, chance: 0.1 },
};
// ----- Tempo de obra -----
// Segundos para concluir cada nível, com 1 construtor (ajudantes aceleram: ver helpBoost). A sede é instantânea.
const BUILD_TIME = { wall: [10, 25, 60], bow: [10, 25, 60], farm: [10, 25] };
const TREE_TIME = 20; // segundos para derrubar uma árvore
const TREE_COINS = 2; // moedas que uma árvore derrubada solta
// ----- Fazendeiros -----
// A bancada e as fazendas só aparecem com a sede no nível 2 e uma muralha expandida: ver checkFarmUnlock().
const FARMC = [4, 8]; // custo da fazenda (nível 1) e da melhoria para o nível 2 (precisam de construtor)
const FARM_CAPACITY = [0, 8, 12]; // fazendeiros que cabem na fazenda, por nível dela
const FARM_SITES = 3; // quantos terrenos de fazenda surgem, em posições aleatórias perto da sede
const FARM_YIELD = 3; // moedas que CADA fazendeiro gera por amanhecer (soltas na fazenda)
// Um fazendeiro só rende depois de passar 1 amanhecer inteiro na fazenda, ou seja, a partir do 2º dia.
// Preço da ferramenta de cada bancada (a ferramenta vira a profissão quando um camponês a pega).
const TOOL_COST = { ham: 3, bow: 2, farm: 4 };
// ----- Flechas -----
// Alturas (px acima do chão) de onde a flecha sai e onde atinge. Usadas na linha de visão (clearShot).
const ARROW_TOWER_H = 22; // arqueiro na plataforma da torre
const ARROW_GROUND_H = 8; // arqueiro no chão
const ARROW_TARGET_H = 4; // corpo do Greed
const ARROW_TOWER_RANGE = 135; // alcance de detecção de um arqueiro na torre (px)
const ARROW_GROUND_RANGE = 115; // alcance de um arqueiro no chão (px)
const ARROW_TOWER_COOLDOWN = 1.8; // segundos entre flechas (torre)
const ARROW_GROUND_COOLDOWN = 2.0; // segundos entre flechas (chão)
const ARROW_DAMAGE = 1.25; // dano de cada flecha (antes 1; +25%)
// ----- Monstros contra pessoas -----
// Monstros atacam trabalhadores e aldeões contratados (nunca vagabundos). Trabalhador atingido perde a profissão e
// larga a ferramenta; aldeão atingido derruba a moeda da contratação. O Greed 'normal' rouba o item e foge para o
// portal (se morrer, o item cai no chão). Os outros tipos só derrubam o item. Quem é atacado fica protegido HURT_TIME s.
const REACH = 12; // alcance (px) do ataque dos Greed contra pessoas
const HURT_TIME = 4;
// ----- Ajuda dos construtores -----
// Construtores ociosos ajudam nas obras e no corte de árvores, mas só quando não há mais nada para fazer. O 1º ajudante dobra a velocidade (HELP_FIRST); cada ajudante seguinte
// multiplica por um fator HELP_DECAY (25%) menor que o anterior: 2x, 1,5x, 1,125x... (nunca abaixo de 1x).
const HELP_FIRST = 2;
const HELP_DECAY = 0.25;
const FARM_STAND_GAP = 30; // distância da bancada do fazendeiro à frente do muro mais interno
// X das bancadas fixas (ham = construtor, bow = arqueiro). A do fazendeiro é decidida durante o jogo: G.farmStandX.
const STANDS = { ham: CX - 64, bow: CX + 64 };
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
const WALLHP = [0, 10, 20, 32.5],
  WALLC = [2, 4, 7],
  BOWC = [3, 5, 8],
  CENC = [5, 9];
// Teclas dos jogadores locais (modo tela dividida).
const K = [
  { l: 'KeyA', r: 'KeyD', d: 'KeyS', s: 'ShiftLeft' },
  { l: 'ArrowLeft', r: 'ArrowRight', d: 'ArrowDown', s: 'ShiftRight' },
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
    input: { l: 0, r: 0, d: 0, s: 0 }, // s = shift (correr)
    stamina: STAMINA_MAX,
    exhausted: false,
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
    })).concat(mkFarms()),
    peasants: [
      { x: CX - 30, tx: CX - 30, job: 0 },
      { x: CX + 30, tx: CX + 30, job: 0 },
    ],
    nextId: 0,
    tools: { ham: 0, bow: 0, farm: 0 },
    farmStandX: null,
    vagrants: [],
    greeds: [],
    groundCoins: Array.from({ length: 10 }, (_, i) => ({ x: CX - 36 + i * 8 })),
    effects: [],
    arrows: [],
    toolDrops: [], // ferramentas caídas no chão: { x, tool }
    trees: mkTrees(),
    stumps: [],
    chests: mkChests(),
  };
  CAMPS.forEach((c) => {
    for (let i = 0; i < VAGRANTS_PER_CAMP; i++) G.vagrants.push(newVagrant(c, (i - 1) * 24));
  });
}
// Cria um vagabundo no acampamento de posição camp (offset = deslocamento inicial em x).
function newVagrant(camp, offset = rnd(-30, 30)) {
  const x = camp + offset;
  return { id: (G.nextId = (G.nextId || 0) + 1), x, tx: x, w: 0, home: camp };
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
  const table = { wall: WALLC, bow: BOWC, farm: FARMC }[s.t];
  return s.lvl < table.length ? table[s.lvl] : 0;
}
// Fazendas liberadas? Sim depois que a bancada do fazendeiro foi posicionada (checkFarmUnlock).
function farmUnlocked() {
  return G.farmStandX != null;
}
// X da bancada de uma profissão ('ham', 'bow' ou 'farm'); null se a do fazendeiro ainda não existe.
function standX(k) {
  return k === 'farm' ? G.farmStandX : STANDS[k];
}
// Muralha expandida = sede nível 2 e, em algum lado, pelo menos 2 muros construídos (a muralha ganhou
// território novo). A bancada do fazendeiro nasce logo à frente (para fora) do muro mais interno
// desse lado, dentro da área recém-protegida, e a posição fica fixa depois disso.
function checkFarmUnlock() {
  if (G.farmStandX != null || G.castle.lvl < 2) return;
  for (const side of [-1, 1]) {
    const walls = G.slots.filter((s) => s.t === 'wall' && s.lvl >= 1 && s.side === side);
    if (walls.length < 2) continue;
    const inner = walls.reduce((a, b) => (Math.abs(a.x - CX) < Math.abs(b.x - CX) ? a : b));
    G.farmStandX = inner.x + side * FARM_STAND_GAP;
    return;
  }
}
// Sorteia os terrenos de fazenda (visíveis desde o início, o jogador escolhe onde construir): entre 150 e 650 da sede, sem encostar em muros/torres nem entre si.
function mkFarms() {
  const taken = SL.map(([o]) => CX + o).concat([CX - 250, CX + 250]),
    farms = [],
    first = Math.random() < 0.5 ? -1 : 1;
  while (farms.length < FARM_SITES) {
    const side = farms.length % 2 ? -first : first, // alterna os lados: sempre há terrenos dos dois lados
      x = Math.round(CX + side * rnd(150, 650));
    if (taken.every((t) => Math.abs(t - x) > 40)) {
      taken.push(x);
      farms.push({ x, t: 'farm', req: 0, lvl: 0, hp: 0, ar: null, cd: 0, side });
    }
  }
  return farms;
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
      STANDS.ham,
      TOOL_COST.ham,
      () => {
        G.tools.ham++;
      },
      'ham',
    );
  if (G.tools.bow < 4)
    cand(
      STANDS.bow,
      TOOL_COST.bow,
      () => {
        G.tools.bow++;
      },
      'arc',
    );
  // Melhoria da sede (níveis 1 -> 2 -> 3): paga no centro da sede.
  if (G.castle.lvl < 3)
    cand(
      CX,
      CENC[G.castle.lvl - 1],
      () => {
        G.castle.lvl++;
        G.castle.max += 8;
        G.castle.hp = G.castle.max;
      },
      'home',
    );
  if (G.tools.farm < 4 && farmUnlocked())
    cand(
      G.farmStandX,
      TOOL_COST.farm,
      () => {
        G.tools.farm++;
      },
      'farm',
    );
  return best;
}

// Escuridão do céu: 0 = dia, 1 = noite, com transições. Baseada em G.time.
function dark() {
  const p = G.time % 1;
  return p < 0.55 ? 0 : p < 0.65 ? (p - 0.55) / 0.1 : p < 0.92 ? 1 : 1 - (p - 0.92) / 0.08;
}

// Duração (s) do dia completo em um dia do jogo: diminui linearmente de DAY_LENGTH_START até DAY_LENGTH_MIN.
function dayLength(day) {
  const u = Math.min(1, Math.max(0, (day - 1) / (NIGHTS - 1)));
  return DAY_LENGTH_START + (DAY_LENGTH_MIN - DAY_LENGTH_START) * u;
}
// Índice da estação (0 a 3) de um dia (1 a NIGHTS).
function seasonIndex(day) {
  return Math.min(3, Math.floor((day - 1) / SEASON_LEN));
}
// Inverno = última estação: nada se cultiva, as fazendas não rendem.
function isWinter() {
  return seasonIndex(G.day) === 3;
}
// O dia d tem Lua de Sangue na sua noite? Dias múltiplos de SEASON_LEN / BLOOD_MOONS_PER_SEASON (4, 8, 12... com 32 dias).
function isBloodDay(d) {
  return d >= 1 && d % (SEASON_LEN / BLOOD_MOONS_PER_SEASON) === 0;
}
// Lua de Sangue: é noite de um dia de sangue.
function isBloodMoon() {
  return isBloodDay(G.day) && G.time % 1 >= 0.6;
}
// Lua Roxa: a noite seguinte a uma Lua de Sangue. Nenhum monstro nasce e os construtores trabalham livremente.
function isPurpleMoon() {
  return isBloodDay(G.day - 1) && G.time % 1 >= 0.6;
}
// Intervalo (s) entre dois nascimentos em um dia: cai linearmente de SPAWN_INTERVAL_START até SPAWN_INTERVAL_MIN.
function spawnInterval(day) {
  const u = Math.min(1, Math.max(0, (day - 1) / (NIGHTS - 1)));
  return SPAWN_INTERVAL_START + (SPAWN_INTERVAL_MIN - SPAWN_INTERVAL_START) * u;
}
// Multiplicador de velocidade de uma obra com n ajudantes presentes: 0 -> 1x, 1 -> 2x, 2 -> 3x, 3 -> 3,375x...
function helpBoost(n) {
  let boost = 1,
    f = HELP_FIRST;
  for (let i = 0; i < n && f > 1; i++) {
    boost *= f;
    f *= 1 - HELP_DECAY;
  }
  return boost;
}
// A obra (slot) ou árvore w ainda precisa de trabalho? (árvore cortada sai de G.trees)
function jobActive(w) {
  return w.t ? !!w.pend : !!w.mark && G.trees.includes(w);
}
// Quantos construtores ajudantes já chegaram perto da obra site.
function helpersAt(site) {
  return G.peasants.filter((o) => o.isBuilder && o.helping === site && Math.abs(o.x - site.x) < 16)
    .length;
}
// Atualiza a stamina do cavalo h e devolve a velocidade (px/s) neste quadro.
// Usada pelo servidor e também pelo cliente (predição), por isso precisa ser idêntica nos dois.
function horseStep(h, moving, wantSprint, dt) {
  const sprinting = moving && wantSprint && !h.exhausted && h.stamina > 0;
  if (sprinting) {
    h.stamina = Math.max(0, h.stamina - STAMINA_DRAIN * dt);
    if (h.stamina <= 0) h.exhausted = true; // acabou: só corre de novo com a barra cheia
  } else {
    h.stamina = Math.min(
      STAMINA_MAX,
      h.stamina + (moving ? STAMINA_REGEN_MOVING : STAMINA_REGEN_STILL) * dt,
    );
    if (h.exhausted && h.stamina >= STAMINA_MAX) h.exhausted = false;
  }
  return PLAYER_SPEED * (h.exhausted ? EXHAUSTED_SLOW : 1) * (sprinting ? SPRINT_MULT : 1);
}
// Nível dos Greed de um dia (0, 1, 2...): sobe a cada TIER_DAYS dias.
function greedTier(day) {
  return Math.floor((day - 1) / TIER_DAYS);
}
// Sorteia o tipo de um Greed novo conforme o dia (cada tipo tem um dia de estreia e uma chance).
function pickGreedKind(day, blood) {
  let roll = Math.random();
  for (const k of ['charger', 'jumper', 'flyer', 'big']) {
    const d = GREED_KINDS[k];
    if (day < d.from) continue;
    const chance = d.chance * (blood ? BLOOD_SPECIAL_CHANCE : 1);
    if (roll < chance) return k;
    roll -= chance;
  }
  return 'normal';
}
// Dano em um muro; se a vida acabar o muro cai (volta ao nível 0).
function hitWall(w, dmg) {
  w.hp -= dmg;
  G.effects.push({ k: 'puff', x: w.x, l: 0.2 });
  if (w.hp <= 0) {
    w.hp = 0;
    w.lvl = 0;
  }
}
// Altura (px) de um muro construído de nível lvl. Igual à usada no desenho.
function wallHeight(lvl) {
  return 10 + lvl * 5;
}
// Linha de visão: a reta de (ax, ha) até (tx, th) passa por cima de TODOS os muros entre os dois?
function clearShot(ax, ha, tx, th) {
  return !G.slots.some((w) => {
    if (w.t !== 'wall' || !w.lvl || w.hp <= 0) return false;
    if ((w.x - ax) * (w.x - tx) >= 0) return false; // este muro não está entre o arqueiro e o alvo
    const lineY = ha + ((th - ha) * (w.x - ax)) / (tx - ax);
    return lineY < wallHeight(w.lvl);
  });
}
// Dispara uma flecha de q (saindo da altura ha) contra o Greed target.
//  - Linha de visão livre: tiro RETO, rápido e preciso (torres costumam conseguir).
//  - Muro no caminho: tiro em PARÁBOLA, passa por cima do muro, mas é mais lento e pode errar.
// O acerto é decidido na chegada (updateArrows): vale o Greed que estiver no ponto de queda.
function fireArrow(q, target, ha) {
  const dist = Math.abs(target.x - q.x);
  const th = target.air ? FLY_HEIGHT : ARROW_TARGET_H; // altura do alvo (voadores estão no alto)
  const direct = clearShot(q.x, ha, target.x, th);
  const T = direct ? dist / 900 + 0.05 : 0.35 + dist / 700; // tempo de voo (s)
  const lead = target.mv ? -target.side * target.sp * T : 0; // mira à frente de um alvo em movimento
  const spread = direct ? 1.5 + dist * 0.015 : 5 + dist * 0.09; // erro máximo em px (cresce com a distância)
  const err = ((rnd(-1, 1) + rnd(-1, 1)) / 2) * spread; // erros pequenos são mais comuns
  G.arrows.push({
    x0: q.x,
    y0: ha,
    x1: target.x + lead + err,
    y1: th,
    t: 0,
    T,
    peak: direct ? 0 : 18 + dist * 0.12, // altura extra do arco
  });
}
// Avança as flechas em voo; na chegada acerta o Greed mais próximo do ponto de queda ou erra.
function updateArrows(dt) {
  G.arrows = G.arrows.filter((a) => {
    a.t += dt;
    if (a.t < a.T) return true;
    let hit = null,
      bd = 1e9;
    G.greeds.forEach((g) => {
      const d = Math.abs(g.x - a.x1);
      if (!g.fl && d < g.w / 2 + 3 && d < bd) {
        bd = d;
        hit = g;
      }
    });
    if (hit) {
      hit.hp -= ARROW_DAMAGE;
      G.effects.push({ k: 'puff', x: a.x1, l: 0.4 });
      if (hit.hp <= 0) kill(hit);
    } else G.effects.push({ k: 'dust', x: a.x1, l: 0.3 });
    return false;
  });
}
// Remove um Greed morto; 50% de chance de soltar uma moeda.
function kill(g) {
  G.greeds.splice(G.greeds.indexOf(g), 1);
  if (Math.random() < 0.5) G.groundCoins.push({ x: g.x });
  if (g.loot) dropLoot(g.loot, g.x); // ladrão morto devolve o que roubou
  G.effects.push({ k: 'puff', x: g.x, l: 0.4 });
}

// Item (moeda ou ferramenta) solto no chão em x.
function dropLoot(loot, x) {
  if (loot.type === 'coin') G.groundCoins.push({ x });
  else G.toolDrops.push({ x, tool: loot.tool });
}
// A pessoa q pode ser atacada pelo Greed g? (vagabundos nem entram em G.peasants; arqueiro na torre só sofre com voadores)
function vulnerable(q, g) {
  return !(q.hurt > 0) && !(q.job && !g.air);
}
// O Greed g ataca a pessoa q. Trabalhador: perde a profissão e larga a ferramenta. Aldeão: derruba a moeda da contratação.
// O Greed 'normal' fica com o item e foge para o portal; os outros tipos deixam o item cair no chão.
function hitPerson(g, q) {
  q.hurt = HURT_TIME;
  G.effects.push({ k: 'puff', x: q.x, l: 0.3 });
  const tool = q.isBuilder ? 'ham' : q.isArcher ? 'bow' : q.isFarmer ? 'farm' : null;
  let loot = null;
  if (tool) {
    if (q.job && q.s && q.s.ars) q.s.ars = q.s.ars.filter((o) => o !== q); // sai da torre
    q.isBuilder = q.isArcher = q.isFarmer = 0;
    q.job = 0;
    q.s = null;
    q.work = null;
    q.helping = null;
    q.farm = null;
    q.goal = null;
    q.hit = 0;
    loot = { type: 'tool', tool };
  } else if (q.hasCoin !== false) {
    q.hasCoin = false;
    loot = { type: 'coin' };
  }
  if (!loot) return;
  if (g.kind === 'normal') {
    g.loot = loot;
    g.fl = 1;
  } else dropLoot(loot, q.x);
}
// Avança a simulação em dt segundos. Dividido em seções numeradas.
function update(dt) {
  // ===== 1. Relógio e amanhecer (novo dia, moedas dos camponeses, novos vagabundos) =====
  G.time += dt / dayLength(G.day);
  checkFarmUnlock();
  const pr = G.time % 1,
    nd = Math.floor(G.time);
  // amanhecer
  if (nd > G.lastDawn) {
    G.lastDawn = nd;
    G.day++;
    G.nightStarted = 0;
    G.greeds.forEach((g) => G.effects.push({ k: 'puff', x: g.x, l: 0.4 }));
    G.greeds = [];
    // Amanheceu: a sede e todos os muros se recuperam por completo.
    G.castle.hp = G.castle.max;
    G.slots.forEach((s) => {
      if (s.t === 'wall' && s.lvl) s.hp = WALLHP[s.lvl];
    });
    G.groundCoins.push({ x: CX });
    G.peasants.forEach((q) => G.groundCoins.push({ x: q.x + rnd(-6, 6) }));
    // Fazendeiros: 1º amanhecer na fazenda = só aprende o serviço; a partir do 2º, rende FARM_YIELD moedas cada.
    G.peasants.forEach((q) => {
      if (!q.isFarmer || !q.farm) return;
      if (q.farmDays >= 1 && !isWinter()) {
        for (let i = 0; i < FARM_YIELD; i++) G.groundCoins.push({ x: q.farm.x + rnd(-14, 14) });
        G.effects.push({ k: 'pop', x: q.farm.x, l: 0.3 });
      }
      q.farmDays = (q.farmDays || 0) + 1;
    });
    CAMPS.forEach((c) => {
      if (G.vagrants.filter((v) => v.home === c).length < VAGRANTS_PER_CAMP)
        G.vagrants.push(newVagrant(c));
    });
    if (G.day > NIGHTS) {
      G.over = 'win';
      return;
    }
  }
  // ===== 2. Surgimento dos Greed durante a noite =====
  if (pr >= 0.6 && !G.nightStarted) {
    G.nightStarted = 1;
    // Lua Roxa: ninguém nasce. Lua de Sangue: o dobro de monstros. Sem limite de quantidade.
    G.greedsLeft = isPurpleMoon() ? 0 : (4 + 3 * G.day) * (isBloodMoon() ? BLOOD_COUNT : 1);
  }
  if (G.nightStarted && G.greedsLeft > 0) {
    G.spawnTimer -= dt;
    if (G.spawnTimer <= 0) {
      const side = Math.random() < 0.5 ? -1 : 1,
        blood = isBloodMoon(),
        kind = pickGreedKind(G.day, blood),
        b = GREED_KINDS[kind],
        tier = greedTier(G.day);
      G.greeds.push({
        id: (G.nextId = (G.nextId || 0) + 1),
        x: side < 0 ? 70 : WW - 70,
        side,
        kind,
        hp: Math.ceil(b.hp * START_HP_MULT * (1 + TIER_HP * tier)),
        sp:
          Math.min(MAX_GREED_SPEED, b.sp * START_SPEED_MULT * (1 + TIER_SPEED * tier)) *
          (blood ? BLOOD_SPEED : 1),
        dmg: b.dmg * START_DMG_MULT * (1 + TIER_DMG * tier) * (blood ? BLOOD_DAMAGE : 1),
        w: b.w,
        big: kind === 'big',
        air: !!b.air,
        jumper: kind === 'jumper',
        charger: kind === 'charger',
        jy: b.air ? FLY_HEIGHT : 0, // altura atual (voadores e pulos)
        charge: 0, // progresso (0 a 1) da investida
        cd: 1,
        t: 0,
        fl: 0,
      });
      G.greedsLeft--;
      G.spawnTimer = spawnInterval(G.day);
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
    const speed = horseStep(p, p.mv !== 0, p.input.s, dt);
    p.x = clamp(p.x + p.mv * speed * dt, 60, WW - 60);
    p.t += p.mv ? (dt * speed) / PLAYER_SPEED : 0; // animação mais rápida correndo
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
    // ferramenta caída: ao passar por cima ela volta para o estoque da bancada
    G.toolDrops = G.toolDrops.filter((d) => {
      if (Math.abs(d.x - p.x) < 12 && G.tools[d.tool] < 4) {
        G.tools[d.tool]++;
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
  // Noite sem nenhum Greed vivo e nenhum por surgir: construtores podem trabalhar até fora das muralhas.
  const safe = G.greeds.length === 0 && G.greedsLeft === 0;
  // Lado sem nenhuma muralha construída: não há onde se proteger, então os construtores se arriscam e trabalham lá à noite.
  const undefended = (v) => (v < CX ? wl : wr).length === 0;
  const canWork = (v) => !nt || safe || ins(v) || undefended(v);
  bl.forEach((q) => {
    if (q.work && (!(q.work.pend || q.work.mark) || !canWork(q.work.x))) q.work = null;
  });
  {
    // 5b. Cada obra pendente / árvore marcada vai para o construtor livre MAIS PRÓXIMO.
    G.slots
      .filter((s) => s.pend)
      .concat(G.trees.filter((t) => t.mark))
      .forEach((w) => {
        if (bl.some((q) => q.work === w) || !canWork(w.x)) return;
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
          bq.helping = null;
        }
      });
  }
  // 5b2. Construtores ociosos ajudam obras que já têm um construtor principal (ver helpBoost).
  // Ajudar só vale se não sobrou nada para fazer: obras/árvores sem construtor já foram dadas no bloco 5b
  // (inclusive aos ajudantes, que contam como livres). Aqui o ajudante também larga a ajuda se a tarefa acabou.
  bl.forEach((q) => {
    const h = q.helping;
    if (h && (q.work || !jobActive(h) || !canWork(h.x) || !bl.some((o) => o.work === h)))
      q.helping = null;
  });
  bl.forEach((q) => {
    if (q.work || q.helping) return;
    let bs = null,
      bd = 1e9;
    G.slots
      .filter((s) => s.pend)
      .concat(G.trees.filter((t) => t.mark))
      .forEach((s) => {
        if (!canWork(s.x) || !bl.some((o) => o.work === s)) return;
        const d = Math.abs(s.x - q.x);
        if (d < bd) {
          bd = d;
          bs = s;
        }
      });
    q.helping = bs;
  });
  bl.forEach((q, i) => {
    q.home = zl + ((i + 1) / (bl.length + 1)) * (zr - zl);
  });
  // 5c. Camponeses ociosos vão buscar ferramentas disponíveis nas bancadas (uma reservada por camponês).
  ['ham', 'bow', 'farm'].forEach((k) => {
    const sx = standX(k);
    if (sx == null) return;
    let av = G.tools[k] - G.peasants.filter((q) => q.goal === k).length;
    while (av > 0) {
      let bq = null,
        bd = 1e9;
      G.peasants.forEach((q) => {
        if (!q.job && !q.isBuilder && !q.isArcher && !q.isFarmer && !q.goal) {
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
    if (q.hurt > 0) q.hurt -= dt;
    if (q.goal) {
      q.tx = standX(q.goal);
      if (Math.abs(q.x - q.tx) < 4) {
        const k = q.goal;
        q.goal = null;
        if (G.tools[k] > 0) {
          G.tools[k]--;
          if (k === 'ham') q.isBuilder = 1;
          else if (k === 'farm') q.isFarmer = 1;
          else {
            q.archerSide = G.peasants.filter((o) => o.isArcher).length % 2 ? 1 : -1;
            q.isArcher = 1;
          }
        }
      }
    } else if (q.work) {
      q.tx = q.work.x;
      if (Math.abs(q.x - q.tx) < 4) {
        q.workTime += dt * helpBoost(helpersAt(q.work)); // obras e árvores aceleram com ajudantes
        q.hit = 1;
        const w = q.work,
          need = w.t ? BUILD_TIME[w.t][w.lvl] : TREE_TIME;
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
            for (let i = 0; i < TREE_COINS; i++) G.groundCoins.push({ x: w.x + rnd(-12, 12) });
            G.effects.push({ k: 'puff', x: w.x, l: 0.4 });
          }
          q.work = null;
          q.hit = 0;
        }
      } else q.hit = 0;
    } else if (q.isBuilder && q.helping) {
      // Ajudante: vai até a obra e martela ao lado do construtor principal (acelera a obra).
      const hs = bl.filter((o) => o.helping === q.helping),
        idx = hs.indexOf(q);
      q.tx = q.helping.x + (idx % 2 ? 1 : -1) * (6 + Math.floor(idx / 2) * 6);
      q.hit = Math.abs(q.x - q.tx) < 4 ? 1 : 0;
    } else if (q.isFarmer) {
      // Fazendeiro: escolhe uma fazenda construída com vaga (até FARM_CAPACITY[nível] por fazenda) e fica nela.
      // De dia trabalha sempre; à noite só continua se a fazenda estiver dentro das muralhas.
      // O pagamento acontece no amanhecer (bloco 1).
      if (!q.farm) {
        let bf = null,
          bd = 1e9;
        G.slots.forEach((f) => {
          if (f.t !== 'farm' || !f.lvl) return;
          if (G.peasants.filter((o) => o.farm === f).length >= FARM_CAPACITY[f.lvl]) return;
          const d = Math.abs(f.x - q.x);
          if (d < bd) {
            bd = d;
            bf = f;
          }
        });
        q.farm = bf;
        q.farmDays = 0;
      }
      if (q.farm && (!nt || ins(q.farm.x))) {
        // os fazendeiros da mesma fazenda se espalham pelo terreno
        const mates = G.peasants.filter((o) => o.farm === q.farm);
        q.tx = q.farm.x + (mates.indexOf(q) - (mates.length - 1) / 2) * 3;
        q.hit = Math.abs(q.x - q.tx) < 4 ? 1 : 0;
      } else {
        // à noite com a fazenda fora das muralhas (ou sem fazenda livre): volta para a zona protegida
        q.hit = 0;
        q.w = (q.w || 0) - dt;
        if (q.w <= 0) {
          q.tx = clamp(CX + rnd(-110, 110), zl, zr);
          q.w = rnd(2, 5);
        }
      }
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
  G.slots.forEach((f) => {
    if (f.t === 'farm') f.workers = G.peasants.filter((q) => q.farm === f).length;
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
        bd = ARROW_TOWER_RANGE;
      G.greeds.forEach((g) => {
        const d = Math.abs(g.x - q.x);
        if (d < bd && !g.fl) {
          bd = d;
          t = g;
        }
      });
      if (t) {
        q.cd = ARROW_TOWER_COOLDOWN;
        q.f = t.x < q.x;
        fireArrow(q, t, ARROW_TOWER_H);
      }
    });
  });
  G.peasants.forEach((q) => {
    if (!q.isArcher || q.job) return;
    q.cd = (q.cd || 0) - dt;
    if (q.cd > 0) return;
    let t = null,
      bd = ARROW_GROUND_RANGE;
    G.greeds.forEach((g) => {
      const d = Math.abs(g.x - q.x);
      if (d < bd && !g.fl) {
        bd = d;
        t = g;
      }
    });
    if (t) {
      q.cd = ARROW_GROUND_COOLDOWN;
      q.f = t.x < q.x;
      fireArrow(q, t, ARROW_GROUND_H);
    }
  });
  // ===== 6b. Flechas em voo: acertam ou erram ao chegar =====
  updateArrows(dt);
  // ===== 7. Greed: andam até a sede, atacam muros/sede e roubam moedas de jogadores =====
  [...G.greeds].forEach((g) => {
    g.t += dt;
    g.mv = 0; // vira 1 se o Greed andou neste quadro (usado na mira dos arqueiros)
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
    if (g.jump) {
      // Saltador no ar: voa em arco por cima do muro e depois segue andando.
      g.jump.t += dt;
      const u = Math.min(1, g.jump.t / g.jump.T);
      g.x = g.jump.x0 + (g.jump.x1 - g.jump.x0) * u;
      g.jy = 4 * g.jump.peak * u * (1 - u);
      g.mv = 1;
      if (u >= 1) {
        g.jump = null;
        g.jy = 0;
      }
      return;
    }
    // Ataque a pessoas (não a vagabundos): ver hitPerson. O ladrão sai de cena (g.fl) e foge para o portal.
    const victim = G.peasants.find((q) => Math.abs(q.x - g.x) < REACH && vulnerable(q, g));
    if (victim) hitPerson(g, victim);
    if (g.fl) return;
    const blk = g.air
      ? null
      : G.slots.find(
          // voadores ignoram os muros
          (s) =>
            s.t === 'wall' &&
            s.lvl &&
            s.hp > 0 &&
            s.side == g.side &&
            Math.abs(s.x - g.x) < g.w / 2 + 5 &&
            (s.x - g.x) * dir > -3,
        );
    if (!blk || !g.charger) g.charge = 0;
    if (blk && g.jumper) {
      // Saltador: em vez de atacar, pula o muro (arco mais alto que o muro) e cai do outro lado.
      g.jump = {
        t: 0,
        T: 0.7,
        x0: g.x,
        x1: blk.x + dir * (g.w / 2 + 10),
        peak: wallHeight(blk.lvl) + 8,
      };
    } else if (blk && g.charger) {
      // Investidor: prepara a investida (RAM_WINDUP s, recuando) e então bate com RAM_MULT x o dano.
      g.charge += dt / RAM_WINDUP;
      if (g.charge >= 1) {
        g.charge = 0;
        hitWall(blk, g.dmg * RAM_MULT);
      }
    } else if (blk) {
      g.cd -= dt;
      if (g.cd <= 0) {
        g.cd = 1;
        hitWall(blk, g.dmg);
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
    } else {
      g.x += dir * g.sp * dt;
      g.mv = 1;
    }
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
    farmStandX: G.farmStandX,
    players: G.players.map((p) => ({
      x: p.x,
      id: p.id,
      coins: p.coins,
      face: p.face,
      mv: p.mv,
      t: p.t,
      flash: p.flash,
      stamina: p.stamina,
      exhausted: p.exhausted,
      target: p.target ? { x: p.target.x, cost: p.target.cost, ic: p.target.ic } : null,
    })),
    peasants: G.peasants.map((q) => ({
      x: q.x,
      tx: q.tx,
      f: q.f,
      m: q.m,
      isArcher: q.isArcher,
      isBuilder: q.isBuilder,
      isFarmer: q.isFarmer,
      hurt: q.hurt > 0 ? 1 : 0,
      job: q.job,
      hit: q.hit,
      workTime: q.workTime,
      wk: !q.work ? null : q.work.t ? 's' + si(q.work) : 't' + ti(q.work),
    })),
    vagrants: G.vagrants.map((v) => ({ id: v.id, x: v.x, tx: v.tx })),
    greeds: G.greeds.map((g) => ({
      id: g.id,
      x: g.x,
      fl: g.fl,
      big: g.big,
      t: g.t,
      kind: g.kind,
      side: g.side,
      jy: g.jy,
      charge: g.charge,
      loot: g.loot ? (g.loot.type === 'coin' ? 'coin' : g.loot.tool) : null,
    })),
    groundCoins: G.groundCoins,
    effects: G.effects,
    toolDrops: G.toolDrops,
    arrows: G.arrows.map((a) => ({
      x0: a.x0,
      y0: a.y0,
      x1: a.x1,
      y1: a.y1,
      t: a.t,
      T: a.T,
      peak: a.peak,
    })),
  };
  if (full) {
    d.slots = G.slots.map((s) => ({
      x: s.x,
      t: s.t,
      req: s.req,
      lvl: s.lvl,
      hp: s.hp,
      pend: s.pend,
      workers: s.workers,
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
