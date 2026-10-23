/*
 * DESENHO (só navegador). Nada aqui altera o estado do jogo.
 * Os sprites são mapas de texto: cada letra é uma cor da paleta, "." é transparente.
 * Para trocar por PNG no futuro, substitua o corpo de spr().
 *
 * Funções principais: spr() desenha um mapa de pixels | B() desenha um retângulo no chão
 * view() desenha o mundo para um jogador (céu, cenário, objetos, HUD)
 */
// Cor da capa de cada jogador (por id).
const CLOAK = ['#3b4a8a', '#8a3b4a', '#3b8a5a', '#8a6b3b', '#6b3b8a', '#3b8a8a'];
const DT = [111, 179, 210],
  DB = [241, 219, 165],
  NT = [8, 11, 34],
  NB = [43, 34, 80];
let gyc = 0;
// Retângulo centrado em px, com a base yo pixels acima do chão (gyc = y do chão da visão atual).
function B(px, w, h, col, yo = 0) {
  x.fillStyle = col;
  x.fillRect(Math.round(px - w / 2), gyc - h - yo, w, h);
}
// Desenha um sprite (mapa de texto m + paleta pal) centrado em px, base yo acima do chão.
// flip espelha, ox desloca em x, sc é a escala.
function spr(m, pal, px, yo, flip, ox = 0, sc = 1) {
  const h = m.length,
    w = m[0].length,
    x0 = Math.round(px) - Math.floor((w * sc) / 2) + ox;
  for (let r = 0; r < h; r++)
    for (let c = 0; c < w; c++) {
      const ch = m[r][c];
      if (ch === '.') continue;
      x.fillStyle = pal[ch];
      x.fillRect(x0 + (flip ? w - 1 - c : c) * sc, gyc - yo - (h - r) * sc, sc, sc);
    }
}
// ----- SPRITES (mapas de texto) -----
// PER: pessoa 7x10. Letras: c=cabelo/chapéu, s=pele, k=olho, b=roupa, l=pernas.
const PER = [
  '..ccc..',
  '.ccccc.',
  '..sss..',
  '..sks..',
  '.bbbbb.',
  'bbbbbbb',
  'sbbbbbs',
  '.bbbbb.',
  '.l...l.',
  '.l...l.',
];
// Itens segurados: arco, martelo.
const BOW = ['dd.', '.dw', '.dw', '..w', '..w', '.dw', '.dw', 'dd.'],
  BOWP = { d: '#8b5a2b', w: '#e8e0c0' };
const HAM = ['gg.', 'gg.', '.b.', '.b.', '.b.', '.b.'],
  HAMP = { g: '#b8b8c0', b: '#8b5a2b' };
// Cenário: árvore, Greed, moeda, cavalo com monarca.
const TREE = [
  '...gggg...',
  '..gggggg..',
  '.gggGgggg.',
  'ggggggGggg',
  'gGgggggggg',
  '.ggggGggg.',
  '..gggggg..',
  '...gGgg...',
  '....tt....',
  '....tt....',
  '....tt....',
  '....tt....',
];
const GR = [
  'p....p..',
  'pp..pp..'.padEnd(8, '.'),
  '.pppppp.',
  'pppppppp',
  'pyppppyp',
  'pppppppp',
  '.pp..pp.',
  '.p....p.',
];
GR[0] = 'p......p';
GR[1] = 'pp....pp';
const COIN = ['.yy.', 'yYyy', 'yyyy', '.yy.'];
const HORSE = [
  '......y.y.y.....',
  '......yyyyy.....',
  '.......sss......',
  '.......sks......',
  '......BBBBB.....',
  '......BBBBB..hh.',
  '..hhhhhhhhhhhhh.',
  '.hhhhhhhhhhhhhhh',
  '.hhhhhhhhhhhhhhk',
  '.hhhhhhhhhhhhhh.',
  '..l.l......l.l..',
  '..l.l......l.l..',
];
const LEGB = ['...l.l....l.l...', '...l.l....l.l...'];
const BASE = { k: '#1b1410', s: '#e8c9a0', l: '#3a2616' };
// Paletas por papel (cores de chapéu c e roupa b).
const ROLE = {
  vag: { ...BASE, c: '#777', b: '#8a8a8a' },
  pea: { ...BASE, c: '#6b4a2a', b: '#c8a15a' },
  arc: { ...BASE, c: '#2f6b3a', b: '#3f8a4a' },
  bld: { ...BASE, c: '#f2c53d', b: '#d9722b' },
};
// Ícones e objetos: arco grande, machado, tijolo, casa, baú.
const BBOW = ['ddd...', '..dd..', '...dw.', '...dw.', '...dw.', '...dw.', '..dd..', 'ddd...'];
const AXE = ['.gg.', 'ggg.', '.bg.', '.b..', '.b..', '.b..'],
  AXEP = { g: '#c8c8d0', b: '#8b5a2b' };
const BRICK = ['bbb.bbb', 'bbb.bbb', '.......', 'bb.bbbb', 'bb.bbbb'];
const HOUSE = ['..rr..', '.rrrr.', 'rrrrrr', 'wwwwww', 'wkkwww', 'wkkwww'],
  HOUSEP = { r: '#a0412e', w: '#b9b6a8', k: '#3b2a1c' };
const CH = ['.bbbbbb.', 'bbbbbbbb', 'bggggggb', 'bbbkkbbb', 'bbbggbbb', 'bbbbbbbb'],
  CHP = { b: '#8b5a2b', g: '#f2c53d', k: '#1b1410' };
// Ícone flutuante acima do alvo de interação (mostra o que será comprado).
function icon(t) {
  const I = {
    per: [PER, ROLE.pea],
    arc: [PER, ROLE.arc],
    axe: [AXE, AXEP],
    ham: [HAM, HAMP],
    bow: [BBOW, BOWP],
    wall: [BRICK, { b: '#b9b6a8' }],
    home: [HOUSE, HOUSEP],
  }[t.ic];
  if (!I) return;
  B(t.x, 16, 16, 'rgba(0,0,0,.65)', 52);
  spr(I[0], I[1], t.x, 54, false);
}
// Placa de ponto de obra vazio: verde com arco (torre) ou cinza com tijolos (muro).
function site(px, k) {
  const bow = k === 'bow';
  B(px, 1, 16, '#4b3b2a');
  B(px, 14, 11, bow ? '#2f6b3a' : '#6b6b70', 9);
  B(px, 12, 9, bow ? '#cfe3b0' : '#d6d3c8', 10);
  if (bow) spr(BBOW, BOWP, px, 11, false);
  else spr(BRICK, { b: '#8d8d86' }, px, 12, false);
}
// Desenha uma pessoa de um papel (vag, pea, arc, bld). mv = andando, T = tempo para a animação.
function person(role, px, yo, flip, mv, T) {
  spr(PER, ROLE[role], px, yo + (mv && Math.floor(T * 6) % 2 ? 1 : 0), flip);
}

// Muro construído, aparência por nível (1 madeira, 2 pedra, 3 pedra reforçada).
function wall(s) {
  const L = s.lvl,
    h = 10 + L * 5,
    st = L == 2 ? '#8d8d86' : '#b9b6a8';
  if (L == 1) {
    for (let i = -3; i <= 3; i += 3) {
      B(s.x + i, 2, h, '#8b6b43');
      B(s.x + i, 1, 2, '#8b6b43', h);
    }
    B(s.x, 8, 1, '#5a4630', 4);
  } else {
    B(s.x, 8, h, st);
    for (let y = 3; y < h; y += 4) B(s.x, 8, 1, '#5d5d58', y);
    for (let i = -3; i <= 3; i += 3) B(s.x + i, 2, 3, st, h);
    if (L == 3) B(s.x, 2, 5, '#2b2b30', h - 9);
  }
  const m = WALLHP[L];
  if (s.hp < m) {
    B(s.x, 8, 1, '#400', -2);
    B(s.x - 4 + (4 * s.hp) / m, (8 * s.hp) / m, 1, '#d33', -2);
  }
}
// Torre de arco: fica maior e mais larga a cada nível; a cor da bandeira indica o nível.
function tower(s) {
  const L = s.lvl,
    hw = 3 * L + 3,
    w = hw * 2;
  if (L >= 2) B(s.x, w + 2, L == 2 ? 6 : 10, '#8d8d86');
  B(s.x - hw, 2, 26, '#6b4e2e');
  B(s.x + hw, 2, 26, '#6b4e2e');
  B(s.x, w - 2, 1, '#5a3f24', 6);
  B(s.x, w + 2, 2, '#8b6b43', 14);
  B(s.x - hw - 1, 1, 5, '#8b6b43', 16);
  B(s.x + hw + 1, 1, 5, '#8b6b43', 16);
  B(s.x, w + 4, 2, '#a0522d', 26);
  B(s.x, w - 2, 2, '#a0522d', 28);
  B(s.x, Math.max(4, w - 8), 1, '#a0522d', 30);
  B(s.x, 1, 5, '#4b3b2a', 31);
  B(s.x + 2, 4, 3, ['', '#3f8a4a', '#3b6fd0', '#e0b33c'][L], 33);
}
// Andaime + barra de progresso enquanto uma obra está em andamento.
function scaf(s, T) {
  const tw = s.t === 'bow' && s.lvl,
    by = tw ? 38 : 19;
  if (!tw) {
    B(s.x - 5, 1, 16, '#6b4e2e');
    B(s.x + 5, 1, 16, '#6b4e2e');
    B(s.x, 11, 1, '#8b6b43', 9);
    B(s.x, 11, 1, '#8b6b43', 3);
  }
  const bl = G.peasants.find((q) => q.work === s && q.workTime > 0);
  if (bl) {
    const need = 3 + 2 * s.lvl;
    B(s.x, 12, 2, '#222', by);
    B(s.x - 6 + (6 * bl.workTime) / need, (12 * bl.workTime) / need, 2, '#7fd35a', by);
  } else spr(HAM, HAMP, s.x, by + 1 + (Math.floor(T * 2) % 2), false);
}
// Acampamento de vagabundos (sprite provisório).
function camp(px, dk, T) {
  for (let r = 0; r < 9; r++) B(px - 6, 18 - r * 2, 1, r % 2 ? '#a9855a' : '#8f6d46', r);
  B(px - 6, 4, 5, '#2b1d12');
  B(px - 6, 1, 3, '#4b3b2a', 9);
  if (dk > 0) {
    x.fillStyle = `rgba(255,160,70,${0.2 * dk})`;
    x.beginPath();
    x.arc(px + 8, gyc - 6, 28, 0, 7);
    x.fill();
  }
  B(px + 4, 2, 2, '#888');
  B(px + 12, 2, 2, '#888');
  B(px + 6, 8, 2, '#6b4a2a');
  B(px + 10, 8, 2, '#6b4a2a', 1);
  B(px + 8, 3, 3, Math.floor(T * 6) % 2 ? '#ff9a2a' : '#ffd23a', 2);
  B(px + 8, 1, 2, '#e33', 5);
  B(px - 16, 5, 2, '#6b4a2a');
  B(px - 16, 3, 1, '#d9c9a0', 2);
}
// Bancada de profissão. k = tipo (ham/bow), n = ferramentas no estoque (0 a 4).
function stand(px, k, n) {
  const bow = k === 'bow';
  B(px, 20, 4, '#6b4e2e');
  B(px, 20, 1, '#8b6b43', 4);
  if (bow) {
    spr(BBOW, BOWP, px - 3, 4, false, 0, 2);
    B(px + 5, 3, 7, '#8b5a2b', 5);
    B(px + 4, 1, 3, '#e8e0c0', 12);
    B(px + 6, 1, 3, '#e8e0c0', 12);
  } else {
    spr(PER, ROLE.bld, px - 3, 4, false, 0, 2);
    spr(HAM, HAMP, px + 8, 4, false, 0, 2);
  }
  B(px - 10, 2, 27, '#6b4e2e');
  B(px + 10, 2, 27, '#6b4e2e');
  for (let i = 0; i < 10; i++)
    B(px - 10 + i * 2 + 1, 2, 3, i % 2 ? '#f2e6c4' : bow ? '#3f8a4a' : '#d9722b', 24);
  for (let i = 0; i < 4; i++) {
    B(px - 7 + i * 5, 3, 1, '#2b1d12', 1);
    if (i < n) {
      if (bow) spr(BOW, BOWP, px - 7 + i * 5, 5, false);
      else spr(HAM, HAMP, px - 7 + i * 5, 5, false);
    }
  }
}

// Desenha todo o mundo para o jogador p dentro do retângulo (vx, vy, vw, vh).
// Ordem: céu -> colinas -> chão -> objetos -> pessoas -> efeitos -> HUD.
function view(vx, vy, vw, vh, p) {
  const s = Math.max(2, Math.round(vh / 200)),
    vws = vw / s,
    vhs = vh / s,
    gy = Math.floor(vhs * 0.78);
  gyc = gy;
  p.cam += (clamp(p.x - vws / 2, 0, WW - vws) - p.cam) * (1 - Math.exp(-FDT * 8));
  const cam = Math.round(p.cam),
    dk = dark(),
    pr = G.time % 1,
    T = G.time * DAYLEN;
  x.save();
  x.beginPath();
  x.rect(vx, vy, vw, vh);
  x.clip();
  x.translate(vx, vy);
  x.scale(s, s);
  const g = x.createLinearGradient(0, 0, 0, gy);
  g.addColorStop(0, rgb(mix(DT, NT, dk)));
  g.addColorStop(1, rgb(mix(DB, NB, dk)));
  x.fillStyle = g;
  x.fillRect(0, 0, vws, vhs);
  if (dk > 0.3) {
    x.fillStyle = `rgba(255,255,255,${dk})`;
    for (let i = 0; i < 40; i++) x.fillRect((i * 97) % vws, (i * 53) % Math.max(10, gy - 30), 1, 1);
  }
  const night = pr >= 0.6,
    fr = night ? (pr - 0.6) / 0.4 : pr / 0.6;
  x.fillStyle = night ? '#e6e8f5' : '#ffe27a';
  const bs = night ? 6 : 9;
  x.fillRect(vws * (0.08 + 0.84 * fr), gy * 0.7 - Math.sin(fr * Math.PI) * gy * 0.55, bs, bs);
  for (const [f, c1, c2, amp, base] of [
    [0.25, [110, 150, 140], [16, 20, 40], 14, 40],
    [0.5, [84, 124, 100], [12, 16, 32], 18, 26],
  ]) {
    x.fillStyle = rgb(mix(c1, c2, dk));
    for (let i = 0; i < vws; i += 2) {
      const wx = i + cam * f,
        h = base + amp * Math.sin(wx * 0.021) + amp * 0.6 * Math.sin(wx * 0.053 + f * 9);
      x.fillRect(i, gy - h, 2, h);
    }
  }
  x.translate(-cam, 0);
  x.fillStyle = rgb(mix([86, 128, 70], [22, 34, 38], dk));
  x.fillRect(cam, gy, vws, vhs - gy);
  x.fillStyle = rgb(mix([120, 160, 84], [40, 58, 56], dk));
  x.fillRect(cam, gy, vws, 2);
  [60, WW - 60].forEach((px) => {
    if (px < cam - 30 || px > cam + vws + 30) return;
    const a = 0.4 + 0.4 * dk + 0.15 * Math.sin(T * 3);
    B(px, 14, 38, `rgba(120,40,150,${a})`);
    B(px, 8, 30, `rgba(210,120,240,${a})`, 4);
  });
  G.stumps.forEach((t) => {
    B(t.x, 5, 3, '#6b4a2a');
    B(t.x, 3, 1, '#c9a46a', 3);
  });
  G.chests.forEach((c) => {
    spr(CH, CHP, c.x, 0, false);
    spr(COIN, { y: '#f2c53d', Y: '#fff1a0' }, c.x, 9 + Math.abs(Math.sin(T * 3)) * 2, false);
  });
  // árvores
  G.trees.forEach((t) => {
    if (t.x < cam - 20 || t.x > cam + vws + 20) return;
    const bl = G.peasants.find((q) => q.work === t && q.workTime > 0),
      sh = bl ? Math.floor(T * 8) % 2 : 0;
    spr(
      TREE,
      { g: t.v ? '#6a8a30' : '#3f7a3a', G: t.v ? '#4f6a22' : '#2f5f2e', t: '#6b4a2a' },
      t.x + sh,
      0,
      t.v,
    );
    if (t.site) site(t.x + 10, t.site);
    if (t.mark) {
      B(t.x, 1, 5, '#4b3b2a', 15);
      B(t.x + 2, 4, 3, '#e33', 17);
    }
    if (bl) {
      B(t.x, 10, 2, '#222', 20);
      B(t.x - 5 + (5 * bl.workTime) / 3, (10 * bl.workTime) / 3, 2, '#7fd35a', 20);
    }
  });
  // slots
  G.slots.forEach((sl) => {
    if (G.castle.lvl < sl.req) return;
    if (sl.t === 'wall') {
      if (sl.lvl) wall(sl);
      else if (!sl.pend) site(sl.x, 'wall');
      if (sl.pend) scaf(sl, T);
    } else {
      if (sl.lvl) tower(sl);
      else if (!sl.pend) site(sl.x, 'bow');
      if (sl.pend) scaf(sl, T);
    }
  });
  stand(CX - 64, 'ham', G.tools.ham);
  stand(CX + 64, 'bow', G.tools.bow);
  // sede
  const L = G.castle.lvl,
    cw = 22 + L * 8,
    ch = 16 + L * 5;
  if (dk > 0) {
    x.fillStyle = `rgba(255,180,80,${0.18 * dk})`;
    x.beginPath();
    x.arc(CX, gy - 8, 50, 0, 7);
    x.fill();
  }
  if (L >= 2)
    for (const sg of [-1, 1]) {
      B(CX + (sg * cw) / 2, 7, ch + 8, '#7b7468');
      B(CX + (sg * cw) / 2, 9, 2, '#8a3b2e', ch + 8);
      B(CX + (sg * cw) / 2, 5, 2, '#8a3b2e', ch + 10);
    }
  B(CX, cw, ch, '#8a8478');
  B(CX, cw, 3, '#6b665c');
  const k = Math.floor((cw + 8) / 6);
  for (let r = 0; r < 6; r++) B(CX, cw + 8 - r * k, 2, '#8a3b2e', ch + r * 2);
  B(CX - cw / 4, 4, 5, dk > 0.3 ? '#ffd070' : '#2b3a4a', ch / 2);
  B(CX + cw / 4, 4, 5, dk > 0.3 ? '#ffd070' : '#2b3a4a', ch / 2);
  B(CX, 6, 10, '#3b2a1c');
  B(CX, 1, 10, '#4b3b2a', ch + 12);
  B(CX + 3, 6, 4, '#e0b33c', ch + 18);
  B(CX - cw / 2 - 10, 3, 3, dk > 0.3 ? '#ff9a2a' : '#4a4036');
  B(CX - cw / 2 - 10, 5, 1, '#3a2616');
  // moedas
  G.groundCoins.forEach((c) =>
    spr(COIN, { y: '#f2c53d', Y: '#fff1a0' }, c.x, 2 + Math.abs(Math.sin(T * 3 + c.x)) * 2, false),
  );
  CAMPS.forEach((c) => {
    if (c > cam - 40 && c < cam + vws + 40) camp(c, dk, T);
  });
  // gente
  G.vagrants.forEach((v) => person('vag', v.x, 0, v.tx < v.x, Math.abs(v.tx - v.x) > 1, T));
  G.peasants.forEach((q) => {
    const onT = q.job && Math.abs(q.x - q.tx) < 3,
      fl = !!q.f;
    if (q.isArcher) {
      person('arc', q.x, onT ? 16 : 0, fl, q.m, T);
      spr(BOW, BOWP, q.x, (onT ? 16 : 0) + 3, fl, fl ? -5 : 5);
    } else if (q.isBuilder) {
      person('bld', q.x, 0, fl, q.m, T);
      spr(HAM, HAMP, q.x, 2 + (q.hit && Math.floor(T * 6) % 2 ? 2 : 0), fl, fl ? -5 : 5);
    } else person('pea', q.x, 0, fl, q.m, T);
  });
  G.greeds.forEach((e) => {
    const bob = Math.abs(Math.sin(e.t * 8)) * 1.5,
      sc = e.big ? 2 : 1;
    spr(
      GR,
      { p: e.fl ? '#a870b8' : e.big ? '#4a1360' : '#7a2a8a', y: '#ffd23a' },
      e.x,
      bob,
      false,
      0,
      sc,
    );
  });
  G.players.forEach((q) => {
    const mvf = Math.floor(q.t * 10) % 2,
      m = HORSE.slice(0, 10).concat(q.mv ? (mvf ? LEGB : HORSE.slice(10)) : HORSE.slice(10));
    spr(
      m,
      { y: '#ffd23a', s: '#e8c9a0', k: '#1b1410', h: '#7a4a28', l: '#3a2616', B: CLOAK[q.id % 6] },
      q.x,
      0,
      q.face < 0,
    );
    if (q.flash > 0 && Math.floor(q.flash * 14) % 2) B(q.x, 3, 3, '#e33', 20);
  });
  G.effects.forEach((f) => {
    if (f.k === 'arrow') {
      x.strokeStyle = '#ffe9a0';
      x.lineWidth = 1;
      x.beginPath();
      x.moveTo(f.x, gy - f.y);
      x.lineTo(f.x2, gy - f.y2);
      x.stroke();
    } else if (f.k === 'pop') {
      x.strokeStyle = '#ffd23a';
      x.strokeRect(f.x - 6 + f.l * 10, gy - 14 - f.l * 10, 12 - f.l * 20, 12 - f.l * 20);
    } else {
      x.fillStyle = 'rgba(220,200,255,.7)';
      x.fillRect(f.x - 3, gy - 8 - (0.4 - f.l) * 10, 6, 6);
    }
  });
  if (p.target) {
    icon(p.target);
    const c = p.target.cost;
    for (let i = 0; i < c; i++) {
      const px = p.target.x - c * 2 + i * 4;
      x.fillStyle = '#000';
      x.fillRect(px - 1, gy - 47, 5, 5);
      x.fillStyle = i < p.coins ? '#f2c53d' : '#5a5a5a';
      x.fillRect(px, gy - 46, 3, 3);
    }
  }
  x.restore();
  x.fillStyle = '#f2c53d';
  x.fillRect(vx + 14, vy + 34, 12, 12);
  x.fillStyle = '#f2e6c4';
  x.font = 'bold 18px "Courier New",monospace';
  x.textBaseline = 'top';
  x.textAlign = 'left';
  x.fillText(`${p.coins}`, vx + 34, vy + 32);
  x.font = '12px "Courier New",monospace';
  x.fillText(
    `Construtores ${G.peasants.filter((q) => q.isBuilder).length} · Arqueiros ${G.peasants.filter((q) => q.isArcher).length}`,
    vx + 14,
    vy + 56,
  );
  x.font = 'bold 18px "Courier New",monospace';
  if (G.numPlayers == 2) x.fillText(`J${p.id + 1}`, vx + 14, vy + 10);
}
