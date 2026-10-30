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
 *   G.castle       sede (lvl = tier 0 a 3, hp, max)   G.tools  ferramentas nas bancadas {ham, bow, farm}
 *   G.farmStandX   x da bancada do fazendeiro (null até uma muralha ser expandida)
 *   G.effects      efeitos visuais temporários (poeira, brilho de compra)
 *   G.arrows       flechas em voo: saem em linha reta (visão livre) ou em parábola (muro no caminho)
 *   G.time         relógio: parte inteira = dia, parte decimal = hora do dia
 *
 * CAMPOS DE UM CAMPONÊS (peasant)
 *   isBuilder / isArcher / isFarmer / isSpearman   profissão (todas falsas = camponês comum)
 *   farm                   fazenda (slot do tipo 'farm') onde o fazendeiro trabalha
 *   farmDays               amanheceres já passados na fazenda (rende a partir de 1)
 *   job                    1 quando o arqueiro está ocupando uma torre (q.s = torre)
 *   goal                   'ham' ou 'bow' enquanto caminha até a bancada
 *   work                   obra (slot) ou árvore que o construtor está fazendo
 *   (o progresso de uma obra/árvore fica nela mesma: w.progress, em segundos)
 *   archerSide             lado (-1 esquerda, 1 direita) onde o arqueiro livre fica
 *
 * COMO ADICIONAR COISAS: veja README.md
 */
// ----- Configuração do mundo (ajuste o equilíbrio aqui) -----
// WW largura do mundo | CX posição da sede | NIGHTS dias/noites para vencer | DAY_LENGTH_* duração do dia+noite (encurta ao longo do jogo)
const WW = 6400, // largura do mundo (o dobro do original)
  CX = 3200,
  NIGHTS = 32,
  DAY_LENGTH_START = 160, // segundos do dia completo (claro + noite) no 1º dia
  DAY_LENGTH_MIN = 90; // duração mínima, atingida no último dia
// Os acampamentos de vagabundos são sorteados a cada partida (G.camps). Cada um começa cheio (VAGRANTS_PER_CAMP)
// e ganha 1 vagabundo por amanhecer até voltar ao limite.
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
const SPAWN_INTERVAL_START = 1.0;
const SPAWN_INTERVAL_MIN = 0.05;
const SPAWN_LEAD_MAX = 0.45; // os monstros saem, no máximo, 45% do dia antes do anoitecer (ver spawnLead)
const START_HP_MULT = 2; // vida inicial dos monstros x2
const START_SPEED_MULT = 1.0; // velocidade inicial dos monstros (sem multiplicador)
const START_DMG_MULT = 0.85; // dano inicial dos monstros -15%
const BLOOD_COUNT = 1.75; // Lua de Sangue: quantidade de monstros x1,75
const BLOOD_SPECIAL_CHANCE = 2; // Lua de Sangue: chance dos monstros especiais x2 (só dos já liberados no dia)
const MAX_GREED_SPEED = 120; // limite da velocidade base dos Greed (antes do multiplicador da Lua de Sangue)
// ----- Cavalo: stamina -----
// Shift = correr (SPRINT_MULT x mais rápido) gastando stamina. Ao zerar, o cavalo fica EXAUSTO: não corre e anda
// 5% mais devagar até a barra encher por completo. Parado, a stamina recarrega 2x mais rápido.
const PLAYER_SPEED = 70; // px/s andando (correndo = x SPRINT_MULT)
const SPRINT_MULT = 1.8;
const STAMINA_MAX = 100;
const STAMINA_DRAIN = 30; // por segundo correndo (~3,3 s de corrida)
const STAMINA_REGEN_MOVING = 36; // por segundo andando
const STAMINA_REGEN_STILL = 72; // por segundo parado (2x)
const EXHAUSTED_SLOW = 0.95;
// ----- Monstros: evolução e variações -----
// A cada TIER_DAYS dias os Greed sobem de nível: +TIER_HP de vida, +TIER_DMG de dano e +TIER_SPEED de velocidade por nível.
const TIER_DAYS = 4;
const TIER_HP = 0.2;
const TIER_DMG = 0.15;
const TIER_SPEED = 0.4;
const FLY_HEIGHT = 26; // altura (px) em que os voadores voam: passam por cima dos muros
const RAM_WINDUP = 2.2; // segundos que o Investidor leva para preparar cada investida contra um muro
const RAM_MULT = 8; // dano da investida = dano normal x RAM_MULT
// Tipos de Greed (valores base, antes do nível). from = a partir de qual dia aparece, chance = probabilidade por Greed.
//  normal: anda e ataca | big: grande e resistente | flyer: voa por cima dos muros
//  jumper: pula os muros | charger: investida que causa muito dano nos muros
const GREED_KINDS = {
  normal: { hp: 2, sp: 38, dmg: 1, w: 8 },
  big: { hp: 6, sp: 28, dmg: 2, w: 14, from: 8, chance: 0.15 },
  flyer: { hp: 6, sp: 30, dmg: 1, w: 8, from: 12, chance: 0.15, air: true }, // vida do grande, mais lento que o comum (38)
  jumper: { hp: 3, sp: 44, dmg: 1, w: 8, from: 18, chance: 0.12 },
  charger: { hp: 5, sp: 32, dmg: 1, w: 12, from: 26, chance: 0.1 },
};
// ----- Tempo de obra -----
// Segundos para concluir cada nível, com 1 construtor (ajudantes aceleram: ver helpBoost). A sede é instantânea.
const BUILD_TIME = { wall: [10, 25, 60], bow: [10, 25, 60], farm: [10, 25], cata: [10] };
const TREE_TIME = 10; // segundos para derrubar uma árvore (1 construtor)
const TREE_COINS = 2; // moedas que uma árvore derrubada solta
// ----- Lanceiro (bancada liberada no tier 3 da sede) -----
// Fica na ponta da muralha lutando corpo a corpo e, de manhã, pesca na beira da ilha.
const SPEAR_DAMAGE = 2; // dano por golpe
const SPEAR_COOLDOWN = 1.0; // segundos entre golpes
const SPEAR_REACH = 26; // alcance do golpe (px); voadores não são alcançados
const SPEAR_STAND_GAP = 20; // a bancada fica este tanto para dentro da ponta da muralha
const FISH_CHANCE = 0.2; // chance de pescar um peixe (1 moeda) em cada tentativa
const FISH_TRIES_PER_DAY = 2; // tentativas de pesca por dia
const FISH_TIME = 3; // segundos de cada tentativa
const FISH_MORNING = 0.3; // só pesca de manhã: primeiros 30% do ciclo do dia
// ----- Catapulta (cabana atrás da bancada de lança, operada por um construtor) -----
const CATA_BACK_GAP = 30; // a cabana nasce este tanto atrás da bancada de lança (se nada atrapalhar)
const CATA_RANGE = 320; // alcance da catapulta (px)
const CATA_COOLDOWN = 4; // segundos entre disparos
const CATA_MOVE_TIME = 8; // segundos para um construtor mudar a cabana de lugar
const DYNAMITE_COST = 5; // moedas por dinamite (guardadas na cabana, usadas uma atrás da outra)
const DYNAMITE_MAX = 10; // máximo de dinamites guardadas
const STONE_DAMAGE = 4;
const STONE_RADIUS = 14; // dano em área da pedra
const DYN_DAMAGE = 20;
const DYN_RADIUS = 30;
const FIRE_TIME = 5; // segundos que o fogo da dinamite dura
const FIRE_RADIUS = 24;
const FIRE_DPS = 4; // dano por segundo em quem pisa no fogo
// ----- Fazendeiros -----
// A bancada e as fazendas só aparecem com a sede no nível 2 e uma muralha expandida: ver checkFarmUnlock().
const FARMC = [4, 8]; // custo da fazenda (nível 1) e da melhoria para o nível 2 (precisam de construtor)
const FARM_CAPACITY = [0, 8, 12]; // fazendeiros que cabem na fazenda, por nível dela
const FARM_SITES = 12; // terrenos de fazenda no mapa todo, metade em cada lado
const FARM_YIELD = 3; // moedas que CADA fazendeiro gera por amanhecer (soltas na fazenda)
// Um fazendeiro só rende depois de passar 1 amanhecer inteiro na fazenda, ou seja, a partir do 2º dia.
// Preço da ferramenta de cada bancada (a ferramenta vira a profissão quando um camponês a pega).
const TOOL_COST = { ham: 3, bow: 2, farm: 4, spear: 3 };
// ----- Flechas -----
// Alturas (px acima do chão) de onde a flecha sai e onde atinge. Usadas na linha de visão (clearShot).
const ARROW_TOWER_H = 22; // arqueiro na plataforma da torre
const ARROW_GROUND_H = 8; // arqueiro no chão
const ARROW_TARGET_H = 4; // corpo do Greed
const ARROW_TOWER_RANGE = 150; // alcance de detecção de um arqueiro na torre (px)
const TOWER_FORWARD_MULT = 2; // torre fora do muro: alcance só para a frente, com este múltiplo (ver towerExposed)
const ARROW_GROUND_RANGE = 125; // alcance de um arqueiro no chão (px)
const ARROW_TOWER_COOLDOWN = 1.5; // segundos entre flechas (torre)
const ARROW_GROUND_COOLDOWN = 1.75; // segundos entre flechas (chão)
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
// Os ÚNICOS pontos fixos do mundo: a torre e o muro da base, dos dois lados: [distância da sede, tipo].
// Todo o resto (outros muros, torres, fazendas, árvores, baús e acampamentos) é sorteado em mkWorld().
const BASE_SLOTS = [
  [-110, 'bow'],
  [110, 'bow'],
  [-220, 'wall'],
  [220, 'wall'],
];
// ----- Geração do mundo -----
const HALF = WW / 2; // distância da sede até cada ponta do mapa
const WALLS_RANDOM_PER_SIDE = 5; // muros sorteados por lado (além do muro fixo da base): 6 por lado, 12 no mapa
const TOWERS_RANDOM_PER_SIDE = 3; // pontos de torre sorteados por lado (além da torre fixa da base): 4 por lado, 8 no mapa
const TREE_SITES_PER_SIDE = 12; // árvores com placa por lado (viram ponto de muro ou torre ao serem cortadas)
const CELL = 52; // espaçamento da malha de posições candidatas (px); cada ponto sorteado usa uma célula
const JITTER = 5; // desvio aleatório de cada célula (px)
const CAMPS_PER_SIDE = 3; // acampamentos de vagabundos por lado
const COMMON_TREES = 100; // árvores comuns no mapa inteiro (as com placa, 12 por lado, são à parte)
const CHESTS_PER_SIDE = 2; // baús por lado (antes eram 7 no mapa todo, com 4 a 7 moedas)
const CHEST_COINS_MIN = 8; // moedas por baú: mais que antes, para compensar a menor quantidade
const CHEST_COINS_MAX = 14;
// Vida dos muros por nível | custo de cada nível de muro | de torre | de melhoria da sede.
const WALLHP = [0, 10, 20, 32.5],
  WALLC = [2, 4, 7],
  BOWC = [3, 5, 8],
  CENC = [3, 5, 9];
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
  const world = mkWorld();
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
    castle: { lvl: 0, hp: 14, max: 14, cd: 0 }, // lvl = tier da sede (0 a 3)
    slots: world.slots.concat(mkCatas()),
    camps: world.camps, // x de cada acampamento de vagabundos
    peasants: [
      { x: CX - 30, tx: CX - 30, job: 0 },
      { x: CX + 30, tx: CX + 30, job: 0 },
    ],
    nextId: 0,
    tools: { ham: 0, bow: 0, farm: 0, spearL: 0, spearR: 0 },
    farmStandX: null,
    vagrants: [],
    greeds: [],
    groundCoins: Array.from({ length: 10 }, (_, i) => ({ x: CX - 36 + i * 8 })),
    effects: [],
    arrows: [],
    shells: [], // pedras/dinamites da catapulta em voo
    fires: [], // fogo deixado pela dinamite
    toolDrops: [], // ferramentas caídas no chão: { x, tool }
    trees: world.trees,
    stumps: [],
    chests: world.chests,
  };
  G.camps.forEach((c) => {
    for (let i = 0; i < VAGRANTS_PER_CAMP; i++) G.vagrants.push(newVagrant(c, (i - 1) * 24));
  });
}
// Cria um vagabundo no acampamento de posição camp (offset = deslocamento inicial em x).
function newVagrant(camp, offset = rnd(-30, 30)) {
  const x = camp + offset;
  return { id: (G.nextId = (G.nextId || 0) + 1), x, tx: x, w: 0, home: camp };
}

// Sorteia até n posições de um lado da sede (side = -1 ou 1), entre lo e hi de distância dela, com folga mínima
// gap entre elas (lista `group`, que recebe as escolhidas) e avoidGap das posições em `avoid`.
// Devolve as posições do ponto mais perto para o mais longe da sede.
function pickSpots(side, n, lo, hi, gap, group, avoid = [], avoidGap = 0) {
  const out = [];
  for (let tries = 0; out.length < n && tries < 6000; tries++) {
    const x = Math.round(CX + side * rnd(lo, hi));
    if (
      group.every((t) => Math.abs(t - x) >= gap) &&
      avoid.every((t) => Math.abs(t - x) >= avoidGap)
    ) {
      out.push(x);
      group.push(x);
    }
  }
  return out.sort((a, b) => Math.abs(a - CX) - Math.abs(b - CX));
}
// Cria o mundo sorteado: pontos de muro/torre, terrenos de fazenda, árvores (comuns e com placa), baús e acampamentos.
// Só a torre e o muro da base (BASE_SLOTS) têm posição fixa.
// Embaralha uma lista (Fisher–Yates).
function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function buildWorld() {
  const mk = (x, t, req, side) => ({ x, t, req, lvl: 0, hp: 0, ar: null, cd: 0, side }),
    dist = (x) => Math.abs(x - CX),
    byDist = (a, b) => dist(a) - dist(b),
    slots = [],
    trees = [],
    camps = [],
    chests = [];
  // os únicos pontos fixos: a torre e o muro da base
  BASE_SLOTS.forEach(([o, t]) => slots.push(mk(CX + o, t, 0, Math.sign(o))));
  for (const side of [-1, 1]) {
    // acampamentos e baús primeiro; a malha de posições desvia deles
    const sc = pickSpots(side, CAMPS_PER_SIDE, 500, HALF - 250, 350, []),
      sb = pickSpots(side, CHESTS_PER_SIDE, 300, HALF - 200, 500, []);
    camps.push(...sc);
    sb.forEach((x) => chests.push({ x }));
    // malha de posições candidatas: uma a cada CELL px, com pequeno desvio aleatório. Muros, torres, fazendas e árvores
    // com placa ocupam células sorteadas (nunca duas na mesma), então nada se sobrepõe nem fica apertado demais.
    let cells = [];
    for (let d = 300; d <= HALF - 150; d += CELL) {
      const x = Math.round(CX + side * (d + rnd(-JITTER, JITTER)));
      if (sc.every((c) => Math.abs(c - x) >= 62) && sb.every((c) => Math.abs(c - x) >= 40))
        cells.push(x);
    }
    // garantia: um ponto de muro e uma torre vizinha logo depois da base (a menos de 650 da sede)
    const near = cells.filter((x) => dist(x) < 650),
      w1 = near[Math.floor(Math.random() * near.length)];
    cells = cells.filter((x) => x !== w1);
    const t1 = cells.reduce((a, b) => (Math.abs(a - w1) <= Math.abs(b - w1) ? a : b));
    cells = shuffle(cells.filter((x) => x !== t1));
    const take = (k) => cells.splice(0, k);
    // árvores com placa só longe da base (a partir de 700)
    const kinds = ['wall', 'bow', 'wall', 'bow', 'wall', 'wall'],
      sites = cells.filter((x) => dist(x) >= 700).slice(0, TREE_SITES_PER_SIDE);
    cells = cells.filter((x) => !sites.includes(x));
    sites
      .sort(byDist)
      .forEach((x, i) => trees.push({ x, mark: 0, v: i % 2, site: kinds[i % kinds.length] }));
    // Todos os pontos de muro e torre aparecem desde o início (req 0): a sede só libera bancadas e melhorias.
    [w1, ...take(WALLS_RANDOM_PER_SIDE - 1)]
      .sort(byDist)
      .forEach((x) => slots.push(mk(x, 'wall', 0, side)));
    [t1, ...take(TOWERS_RANDOM_PER_SIDE - 1)]
      .sort(byDist)
      .forEach((x) => slots.push(mk(x, 'bow', 0, side)));
    take(FARM_SITES / 2).forEach((x) => slots.push(mk(x, 'farm', 0, side)));
  }
  // árvores comuns em qualquer ponto do mapa, a mais de 200 da sede
  while (trees.length < COMMON_TREES + 2 * TREE_SITES_PER_SIDE) {
    const x = rnd(160, WW - 160);
    if (Math.abs(x - CX) > 200) trees.push({ x, mark: 0, v: trees.length % 2 });
  }
  return { slots, trees, camps, chests };
}
// Gera o mundo e, se por falta de espaço algum item não coube (raro), sorteia de novo (até 30 tentativas).
function mkWorld() {
  let w;
  for (let attempt = 0; attempt < 30; attempt++) {
    w = buildWorld();
    const n = (t) => w.slots.filter((s) => s.t === t).length;
    if (
      n('wall') === 2 * (1 + WALLS_RANDOM_PER_SIDE) &&
      n('bow') === 2 * (1 + TOWERS_RANDOM_PER_SIDE) &&
      n('farm') === FARM_SITES &&
      w.trees.filter((t) => t.site).length === 2 * TREE_SITES_PER_SIDE &&
      w.camps.length === 2 * CAMPS_PER_SIDE &&
      w.chests.length === 2 * CHESTS_PER_SIDE
    )
      break;
  }
  return w;
}
// Custo do PRÓXIMO nível de um ponto de construção (0 = já está no nível máximo).
function cost(s) {
  const table = { wall: WALLC, bow: BOWC, farm: FARMC, cata: [5] }[s.t];
  return s.lvl < table.length ? table[s.lvl] : 0;
}
// Fazendas liberadas? Sim depois que a bancada do fazendeiro foi posicionada (checkFarmUnlock).
function farmUnlocked() {
  return G.farmStandX != null;
}
// X da bancada de uma profissão ('ham', 'bow' ou 'farm'); null se a do fazendeiro ainda não existe.
function standX(k) {
  if (k === 'farm') return G.farmStandX;
  if (k === 'spearL') return spearStandX(-1);
  if (k === 'spearR') return spearStandX(1);
  return G.castle.lvl >= 1 ? STANDS[k] : null; // tier 0: sem bancadas
}
// Ponta da muralha de um lado: o muro construído mais longe da sede (precisa de pelo menos 2 muros construídos).
function spearTipX(side) {
  const walls = G.slots.filter((w) => w.t === 'wall' && w.lvl > 0 && w.side === side);
  if (walls.length < 2) return null;
  return walls.reduce((a, b) => (Math.abs(a.x - CX) > Math.abs(b.x - CX) ? a : b)).x;
}
// Bancada do lanceiro: tier 3, sempre na ponta da muralha (SPEAR_STAND_GAP para dentro). Se um muro cair, a bancada recua
// para o muro anterior; se sobrar menos de 2 muros, ela some até a muralha ser reconstruída.
function spearStandX(side) {
  if (G.castle.lvl < 3) return null;
  const tip = spearTipX(side);
  return tip == null ? null : tip - side * SPEAR_STAND_GAP;
}
// Há algo no caminho de uma cabana de catapulta em x? Árvores inteiras, pontos de muro/torre/fazenda, tendas de vagabundos e bancadas.
function cataBlocked(x) {
  const near = (v, r) => Math.abs(v - x) < r;
  return (
    G.trees.some((t) => near(t.x, 18)) ||
    G.slots.some((s) => s.t !== 'cata' && s.x != null && G.castle.lvl >= s.req && near(s.x, 18)) ||
    G.camps.some((c) => near(c, 44)) ||
    [STANDS.ham, STANDS.bow, G.farmStandX, spearStandX(-1), spearStandX(1)].some(
      (v) => v != null && near(v, 26),
    )
  );
}
// Onde a cabana do lado side deve ficar: logo atrás da bancada de lança; se algo atrapalhar, recua em direção à sede.
function cataSpot(side) {
  const sx = spearStandX(side);
  if (sx == null) return null;
  for (let off = CATA_BACK_GAP; off <= 600; off += 6) {
    const x = sx - side * off;
    if (Math.abs(x - CX) < 44) break; // chegou na sede
    if (!cataBlocked(x)) return x;
  }
  return null;
}
// Tempo (s) que a obra/tarefa w exige: mudar a cabana de lugar, construir/melhorar ou derrubar uma árvore.
function jobNeed(w) {
  return w.relocate != null ? CATA_MOVE_TIME : w.t ? BUILD_TIME[w.t][w.lvl] : TREE_TIME;
}
// Os monstros destruíram a cabana: volta a ser um ponto vazio (custa 5 moedas de novo) e perde as dinamites.
function destroyHut(s) {
  if (s.op) {
    s.op.cataOp = null;
    s.op = null;
  }
  s.lvl = 0;
  s.ammo = 0;
  s.pend = 0;
  s.relocate = null;
  s.progress = 0;
  G.effects.push({ k: 'boom', x: s.x, l: 0.5 });
}
// Pedras e dinamites em voo; no impacto causam dano em área (só em Greed terrestres). A dinamite deixa fogo no chão.
function updateShells(dt) {
  G.shells = G.shells.filter((sh) => {
    sh.t += dt;
    if (sh.t < sh.T) return true;
    const r = sh.dyn ? DYN_RADIUS : STONE_RADIUS,
      dmg = sh.dyn ? DYN_DAMAGE : STONE_DAMAGE;
    [...G.greeds].forEach((g) => {
      if (!g.air && !g.fl && Math.abs(g.x - sh.x1) < r + g.w / 2) {
        g.hp -= dmg;
        if (g.hp <= 0) kill(g);
      }
    });
    G.effects.push({ k: sh.dyn ? 'boom' : 'puff', x: sh.x1, l: 0.5 });
    if (sh.dyn) G.fires.push({ x: sh.x1, t: 0, tick: 0 });
    return false;
  });
  G.fires = G.fires.filter((f) => (f.t += dt) < FIRE_TIME);
  G.fires.forEach((f) => {
    f.tick -= dt;
    if (f.tick > 0) return;
    f.tick = 0.5; // o fogo machuca a cada meio segundo quem estiver nele
    [...G.greeds].forEach((g) => {
      if (!g.air && !(g.jy > 6) && Math.abs(g.x - f.x) < FIRE_RADIUS + g.w / 2) {
        g.hp -= FIRE_DPS * 0.5;
        if (g.hp <= 0) kill(g);
      }
    });
  });
}
// Dois pontos de cabana (um por lado), só existem de verdade quando há bancada de lança do lado.
function mkCatas() {
  return [-1, 1].map((side) => ({
    x: null,
    t: 'cata',
    req: 3,
    lvl: 0,
    hp: 0,
    ar: null,
    cd: 0,
    side,
    ammo: 0,
    op: null,
    recoil: 0,
  }));
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
    if (s.x == null || G.castle.lvl < s.req || s.pend) return;
    if (s.t === 'wall' && s.lvl >= 2 && G.castle.lvl < 3) return; // 3º nível do muro: só no tier 3 da sede
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
  if (standX('ham') != null && G.tools.ham < 4)
    cand(
      standX('ham'),
      TOOL_COST.ham,
      () => {
        G.tools.ham++;
      },
      'ham',
    );
  if (standX('bow') != null && G.tools.bow < 4)
    cand(
      standX('bow'),
      TOOL_COST.bow,
      () => {
        G.tools.bow++;
      },
      'arc',
    );
  // Melhoria da sede (tier 0 -> 1 -> 2 -> 3): paga no centro da sede. O tier 0 não tem bancadas.
  if (G.castle.lvl < 3)
    cand(
      CX,
      CENC[G.castle.lvl],
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
  // Bancadas do lanceiro (uma em cada ponta da muralha) e dinamites da catapulta.
  ['spearL', 'spearR'].forEach((k) => {
    const sx = standX(k);
    if (sx != null && G.tools[k] < 4)
      cand(
        sx,
        TOOL_COST.spear,
        () => {
          G.tools[k]++;
        },
        'spear',
      );
  });
  G.slots.forEach((s) => {
    if (s.t === 'cata' && s.lvl > 0 && s.x != null && s.ammo < DYNAMITE_MAX)
      cand(
        s.x,
        DYNAMITE_COST,
        () => {
          s.ammo++;
        },
        'dyn',
      );
  });
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
// Torre "antes do muro": está fora do perímetro, ou seja, há um muro construído do mesmo lado mais perto da sede e
// nenhum mais longe do que ela. Nesse caso o alcance não é um círculo: vale só para a FRENTE (para fora, em direção
// ao portal), com TOWER_FORWARD_MULT x o alcance, e nada para trás. Torre depois do muro mantém o alcance em volta.
function towerExposed(s) {
  const walls = G.slots.filter((w) => w.t === 'wall' && w.lvl > 0 && w.side === s.side),
    d = Math.abs(s.x - CX);
  return walls.some((w) => Math.abs(w.x - CX) < d) && !walls.some((w) => Math.abs(w.x - CX) > d);
}
// Conclui uma obra ou a derrubada de uma árvore e libera os construtores que estavam nela.
function finishJob(w) {
  if (w.t && w.relocate != null) {
    // cabana mudou de lugar
    w.x = w.relocate;
    w.relocate = null;
    w.pend = 0;
    w.progress = 0;
  } else if (w.t) {
    w.pend = 0;
    w.progress = 0; // a próxima melhoria começa do zero
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
  G.peasants.forEach((q) => {
    if (q.work === w) {
      q.work = null;
      q.hit = 0;
    }
  });
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
    w.progress = 0;
  }
}
// Antecedência (fração do dia) com que os monstros saem dos portais: o tempo que um Greed comum leva para ir do portal
// até o muro construído mais próximo (ou até a sede, se não houver muro), para chegarem quando a noite começa.
// Quanto mais longe o portal, mais cedo eles saem (no máximo SPAWN_LEAD_MAX do dia).
function spawnLead() {
  const speed = Math.min(
      MAX_GREED_SPEED,
      GREED_KINDS.normal.sp * START_SPEED_MULT * (1 + TIER_SPEED * greedTier(G.day)),
    ),
    walls = G.slots.filter((w) => w.t === 'wall' && w.lvl > 0);
  let worst = 0;
  for (const side of [-1, 1]) {
    const portal = side < 0 ? 70 : WW - 70,
      mine = walls.filter((w) => w.side === side),
      target = mine.length
        ? mine.reduce((a, b) => (Math.abs(a.x - portal) < Math.abs(b.x - portal) ? a : b)).x
        : CX;
    worst = Math.max(worst, Math.abs(target - portal) / speed);
  }
  return Math.min(SPAWN_LEAD_MAX, worst / dayLength(G.day));
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
  const tool = q.isBuilder
    ? 'ham'
    : q.isArcher
      ? 'bow'
      : q.isFarmer
        ? 'farm'
        : q.isSpearman
          ? q.spearKey
          : null;
  let loot = null;
  if (tool) {
    if (q.job && q.s && q.s.ars) q.s.ars = q.s.ars.filter((o) => o !== q); // sai da torre
    q.isBuilder = q.isArcher = q.isFarmer = q.isSpearman = 0;
    q.fishing = 0;
    if (q.cataOp) {
      q.cataOp.op = null; // a catapulta perde o operador
      q.cataOp = null;
    }
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
    G.camps.forEach((c) => {
      if (G.vagrants.filter((v) => v.home === c).length < VAGRANTS_PER_CAMP)
        G.vagrants.push(newVagrant(c));
    });
    if (G.day > NIGHTS) {
      G.over = 'win';
      return;
    }
  }
  // ===== 2. Surgimento dos Greed: saem dos portais com antecedência (spawnLead) para chegar quando anoitece =====
  if (!G.nightStarted && pr >= 0.6 - spawnLead()) {
    G.nightStarted = 1;
    // Lua Roxa: ninguém nasce. Lua de Sangue: o dobro de monstros. Sem limite de quantidade.
    G.greedsLeft = isBloodDay(G.day - 1)
      ? 0
      : Math.round((4 + 3 * G.day) * (isBloodDay(G.day) ? BLOOD_COUNT : 1));
  }
  if (G.nightStarted && G.greedsLeft > 0) {
    G.spawnTimer -= dt;
    if (G.spawnTimer <= 0) {
      const side = Math.random() < 0.5 ? -1 : 1,
        blood = isBloodDay(G.day), // a Lua de Sangue vale para todos os monstros do dia, mesmo os que saem mais cedo
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
        const n =
          CHEST_COINS_MIN + Math.floor(Math.random() * (CHEST_COINS_MAX - CHEST_COINS_MIN + 1));
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
  // 5a1. Cabanas de catapulta: a ainda não construída acompanha a bancada de lança; a construída, se a bancada
  // se mover, vira uma tarefa de MUDANÇA (feita por construtores, CATA_MOVE_TIME s). Sem bancada, o ponto some.
  G.slots.forEach((s) => {
    if (s.t !== 'cata') return;
    const d = cataSpot(s.side);
    if (d == null) {
      if (s.lvl === 0) {
        s.x = null;
        s.pend = 0;
        s.progress = 0;
      }
      return;
    }
    if (s.lvl === 0) s.x = d;
    else if (s.relocate != null) s.relocate = d;
    else if (!s.pend && Math.abs(s.x - d) > 6) {
      s.relocate = d;
      s.pend = 1;
      s.progress = 0;
    }
  });
  // 5a2. Cada cabana pronta precisa de um construtor livre como operador (fica ao lado dela e dispara a catapulta).
  G.slots.forEach((s) => {
    if (s.t !== 'cata') return;
    if (s.op && (!G.peasants.includes(s.op) || !s.op.isBuilder || s.lvl < 1)) {
      s.op.cataOp = null;
      s.op = null;
    }
    if (s.lvl < 1 || s.op || s.x == null) return;
    let bq = null,
      bd = 1e9;
    G.peasants.forEach((q) => {
      if (q.isBuilder && !q.cataOp && !q.work && !q.helping) {
        const d = Math.abs(q.x - s.x);
        if (d < bd) {
          bd = d;
          bq = q;
        }
      }
    });
    if (bq) {
      bq.cataOp = s;
      s.op = bq;
    }
  });
  const bl = G.peasants.filter((q) => q.isBuilder && !q.cataOp);
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
  // 5b3. Progresso das obras e árvores. O trabalho anda quando HÁ construtores no local (principal ou ajudante:
  // tanto faz quem chegou primeiro): 1 presente = 1x, 2 = 2x, 3 = 3x... (helpBoost). O progresso fica guardado
  // na própria obra/árvore (w.progress), então se for interrompido (noite etc.) continua de onde parou.
  G.slots
    .filter((s) => s.pend)
    .concat(G.trees.filter((t) => t.mark))
    .forEach((w) => {
      if (!canWork(w.x)) return;
      const present = bl.filter(
        (q) => (q.work === w || q.helping === w) && Math.abs(q.x - w.x) < 20,
      ).length;
      if (!present) return;
      w.progress = (w.progress || 0) + dt * helpBoost(present - 1);
      if (w.progress >= jobNeed(w)) finishJob(w);
    });
  bl.forEach((q, i) => {
    q.home = zl + ((i + 1) / (bl.length + 1)) * (zr - zl);
  });
  // bancada que sumiu (muralha destruída): quem estava indo até ela desiste
  G.peasants.forEach((q) => {
    if (q.goal && standX(q.goal) == null) q.goal = null;
  });
  // 5c. Camponeses ociosos vão buscar ferramentas disponíveis nas bancadas (uma reservada por camponês).
  ['ham', 'bow', 'farm', 'spearL', 'spearR'].forEach((k) => {
    const sx = standX(k);
    if (sx == null) return;
    let av = G.tools[k] - G.peasants.filter((q) => q.goal === k).length;
    while (av > 0) {
      let bq = null,
        bd = 1e9;
      G.peasants.forEach((q) => {
        if (!q.job && !q.isBuilder && !q.isArcher && !q.isFarmer && !q.isSpearman && !q.goal) {
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
  const sc = { spearL: 0, spearR: 0 };
  G.peasants.forEach((q) => {
    if (q.isSpearman) q.si = sc[q.spearKey]++; // posição na fila do posto
  });
  // 5e. Ação de cada camponês: pegar ferramenta > trabalhar > ficar na zona (construtor/arqueiro) > vagar.
  G.peasants.forEach((q) => {
    if (q.hurt > 0) q.hurt = Math.max(0, q.hurt - dt);
    if (q.goal) {
      q.tx = standX(q.goal);
      if (Math.abs(q.x - q.tx) < 4) {
        const k = q.goal;
        q.goal = null;
        if (G.tools[k] > 0) {
          G.tools[k]--;
          if (k === 'ham') q.isBuilder = 1;
          else if (k === 'farm') q.isFarmer = 1;
          else if (k === 'spearL' || k === 'spearR') {
            q.isSpearman = 1;
            q.spearKey = k;
          } else {
            q.archerSide = G.peasants.filter((o) => o.isArcher).length % 2 ? 1 : -1;
            q.isArcher = 1;
          }
        }
      }
    } else if (q.cataOp) {
      // Operador da catapulta: fica ao lado da cabana.
      q.tx = q.cataOp.x - q.cataOp.side * 14;
      q.hit = q.cataOp.recoil > 0 ? 1 : 0;
    } else if (q.work) {
      // Construtor principal: só vai até o local. O progresso é contado por obra (bloco 5b3).
      q.tx = q.work.x;
      q.hit = Math.abs(q.x - q.tx) < 4 ? 1 : 0;
    } else if (q.isBuilder && q.helping) {
      // Ajudante: vai até a obra e martela ao lado do construtor principal (acelera a obra).
      const hs = bl.filter((o) => o.helping === q.helping),
        idx = hs.indexOf(q);
      q.tx = q.helping.x + (idx % 2 ? 1 : -1) * (6 + Math.floor(idx / 2) * 6);
      q.hit = Math.abs(q.x - q.tx) < 4 ? 1 : 0;
    } else if (q.isSpearman) {
      // Lanceiro: de manhã, sem monstros por perto, pesca (até FISH_TRIES_PER_DAY vezes por dia; FISH_CHANCE de achar
      // um peixe = 1 moeda). No resto do tempo fica no posto, na ponta da muralha, e ataca de lança (bloco 6c).
      const side = q.spearKey === 'spearL' ? -1 : 1;
      if (q.fishDay !== G.day) {
        q.fishDay = G.day;
        q.fishTries = 0;
        q.fishT = 0;
        q.fishSpot = null;
      }
      q.stabT = Math.max(0, (q.stabT || 0) - dt);
      q.hit = q.stabT > 0 ? 1 : 0;
      const morning = G.time % 1 < FISH_MORNING;
      if (!nt && morning && G.greeds.length === 0 && q.fishTries < FISH_TRIES_PER_DAY) {
        if (q.fishSpot == null) q.fishSpot = clamp(CX + rnd(-140, 140), zl, zr);
        q.tx = q.fishSpot;
        if (Math.abs(q.x - q.tx) < 4) {
          q.fishing = 1;
          q.fishT = (q.fishT || 0) + dt;
          if (q.fishT >= FISH_TIME) {
            q.fishT = 0;
            q.fishTries++;
            q.fishSpot = null;
            q.fishing = 0;
            if (Math.random() < FISH_CHANCE) {
              G.groundCoins.push({ x: q.x });
              G.effects.push({ k: 'pop', x: q.x, l: 0.3 });
            }
          }
        } else q.fishing = 0;
      } else {
        q.fishing = 0;
        const tip = spearTipX(side),
          post = tip != null ? tip - side * 10 : side < 0 ? zl : zr; // posto: logo dentro da ponta da muralha
        q.tx = post - side * 8 * (q.si || 0);
      }
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
      // torre fora do muro enxerga só para a frente, mais longe; torre atrás do muro enxerga em volta
      const fwd = towerExposed(s);
      let t = null,
        bd = fwd ? ARROW_TOWER_RANGE * TOWER_FORWARD_MULT : ARROW_TOWER_RANGE;
      G.greeds.forEach((g) => {
        const d = Math.abs(g.x - q.x);
        if (fwd && (g.x - q.x) * s.side < 0) return;
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
  updateShells(dt);
  // ===== 6c. Lanceiros atacam corpo a corpo (não alcançam voadores) =====
  G.peasants.forEach((q) => {
    if (!q.isSpearman || q.fishing) return;
    q.cd = (q.cd || 0) - dt;
    if (q.cd > 0) return;
    let t = null,
      bd = SPEAR_REACH;
    G.greeds.forEach((g) => {
      const d = Math.abs(g.x - q.x);
      if (!g.air && !g.fl && d < bd) {
        bd = d;
        t = g;
      }
    });
    if (t) {
      q.cd = SPEAR_COOLDOWN;
      q.f = t.x < q.x;
      q.stabT = 0.25;
      G.effects.push({ k: 'puff', x: t.x, l: 0.2 });
      t.hp -= SPEAR_DAMAGE;
      if (t.hp <= 0) kill(t);
    }
  });
  // ===== 6d. Catapultas: o operador dispara pedras ou, se houver, dinamites (uma de cada vez) =====
  G.slots.forEach((s) => {
    if (s.t !== 'cata' || s.lvl < 1 || s.pend || !s.op || s.x == null) return;
    s.recoil = Math.max(0, (s.recoil || 0) - dt);
    if (Math.abs(s.op.x - (s.x - s.side * 14)) > 10) return; // o operador precisa estar na cabana
    s.cd = (s.cd || 0) - dt;
    if (s.cd > 0) return;
    let t = null,
      bd = CATA_RANGE;
    G.greeds.forEach((g) => {
      const d = Math.abs(g.x - s.x);
      if (!g.air && !g.fl && d < bd) {
        bd = d;
        t = g;
      }
    });
    if (!t) return;
    const dyn = s.ammo > 0;
    if (dyn) s.ammo--;
    const dist = Math.abs(t.x - s.x),
      T = 0.6 + dist / 500,
      lead = t.mv ? -t.side * t.sp * T : 0,
      err = ((rnd(-1, 1) + rnd(-1, 1)) / 2) * (6 + dist * 0.04);
    G.shells.push({
      x0: s.x,
      y0: 14,
      x1: t.x + lead + err,
      y1: 0,
      t: 0,
      T,
      peak: 40 + dist * 0.25,
      dyn,
    });
    s.cd = CATA_COOLDOWN;
    s.recoil = 0.4;
  });
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
    // Contato com a cabana da catapulta: ela é destruída.
    const hut = G.slots.find(
      (s) => s.t === 'cata' && s.lvl > 0 && s.x != null && Math.abs(s.x - g.x) < 14 + g.w / 2,
    );
    if (hut) destroyHut(hut);
    // O Greed comum rouba o que estiver no chão (moeda ou ferramenta caída) e foge para o portal.
    if (g.kind === 'normal' && !g.loot) {
      const ci = G.groundCoins.findIndex((c) => Math.abs(c.x - g.x) < REACH);
      if (ci >= 0) {
        G.groundCoins.splice(ci, 1);
        g.loot = { type: 'coin' };
        g.fl = 1;
      } else {
        const ti = G.toolDrops.findIndex((d) => Math.abs(d.x - g.x) < REACH);
        if (ti >= 0) {
          g.loot = { type: 'tool', tool: G.toolDrops.splice(ti, 1)[0].tool };
          g.fl = 1;
        }
      }
    }
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
      isSpearman: q.isSpearman,
      spearKey: q.spearKey,
      fishing: q.fishing,
      hurt: q.hurt > 0 ? 1 : 0,
      job: q.job,
      hit: q.hit,
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
    shells: G.shells.map((a) => ({
      x0: a.x0,
      y0: a.y0,
      x1: a.x1,
      y1: a.y1,
      t: a.t,
      T: a.T,
      peak: a.peak,
      dyn: a.dyn,
    })),
    fires: G.fires.map((f) => ({ x: f.x, t: f.t })),
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
      progress: s.progress,
      side: s.side,
      ammo: s.ammo,
      relocate: s.relocate,
      recoil: s.recoil,
    }));
    d.trees = G.trees;
    d.stumps = G.stumps;
    d.chests = G.chests;
    d.camps = G.camps;
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
    d.camps = o.camps;
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
