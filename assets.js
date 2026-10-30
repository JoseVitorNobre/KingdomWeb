/*
 * SPRITES FEITOS NO PISKEL (só navegador)
 *
 * O jogo lê arquivos .piskel diretamente (o arquivo que o Piskel salva em File > Save). Não precisa exportar PNG:
 * o .piskel já traz todas as camadas, frames e o fps. Fluxo:
 *   1. salve o desenho no Piskel e coloque o .piskel na pasta assets/
 *   2. registre-o em assets/assets.json:  "nome": { "file": "arquivo.piskel" }
 *   3. desenhe no jogo com  drawAsset('nome', T, x)  (ver render.js). Se o arquivo não carregar, o jogo usa o
 *      desenho antigo (drawAsset devolve false), então nada quebra.
 *
 * Opções de cada entrada do assets.json (todas opcionais):
 *   fps      substitui o fps salvo no arquivo
 *   scale    tamanho do sprite no mundo (1 = cada pixel do sprite vira 1 pixel do mundo)
 *   anchorX  coluna do sprite que fica em cima do x desenhado (padrão: meio do quadro)
 *   anchorY  linha do sprite que fica no chão (padrão: base do desenho, achada sozinha)
 *
 * Regras que o carregador segue: camadas são empilhadas da primeira (fundo) para a última; quadros totalmente
 * transparentes são pulados; cada quadro tem o tamanho do projeto Piskel (ex.: 64x64).
 */
const ASSETS = {}; // nome -> sprite pronto para desenhar

// Lê um .piskel (JSON com PNGs em base64) e devolve um sprite pronto.
async function loadPiskel(url, cfg = {}) {
  const p = (await (await fetch(url)).json()).piskel,
    w = p.width,
    h = p.height,
    layers = [];
  for (const raw of p.layers) {
    const l = JSON.parse(raw),
      frames = [];
    for (const ch of l.chunks) {
      const img = new Image();
      img.src = ch.base64PNG;
      await img.decode();
      // layout[coluna][linha] = número do quadro dentro da folha
      ch.layout.forEach((col, ci) =>
        col.forEach((fi, ri) => {
          frames[fi] = { img, sx: ci * w, sy: ri * h };
        }),
      );
    }
    layers.push({ opacity: l.opacity === undefined ? 1 : l.opacity, frames });
  }
  // descobre os quadros que têm algum pixel e onde fica a base do desenho (para apoiar no chão)
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  const cx = cv.getContext('2d', { willReadFrequently: true }),
    total = Math.max(...layers.map((l) => l.frames.length)),
    active = [];
  let bottom = 0;
  for (let f = 0; f < total; f++) {
    cx.clearRect(0, 0, w, h);
    layers.forEach(
      (l) =>
        l.frames[f] &&
        cx.drawImage(l.frames[f].img, l.frames[f].sx, l.frames[f].sy, w, h, 0, 0, w, h),
    );
    const d = cx.getImageData(0, 0, w, h).data;
    let any = false;
    for (let y = 0; y < h; y++)
      for (let xx = 0; xx < w; xx++)
        if (d[(y * w + xx) * 4 + 3] > 0) {
          any = true;
          bottom = Math.max(bottom, y + 1);
        }
    if (any) active.push(f);
  }
  return {
    w,
    h,
    layers,
    active: active.length ? active : [0],
    fps: cfg.fps || p.fps || 12,
    scale: cfg.scale || 1,
    ax: cfg.anchorX === undefined ? w / 2 : cfg.anchorX,
    ay: cfg.anchorY === undefined ? bottom || h : cfg.anchorY,
  };
}

// Carrega assets/assets.json e todos os sprites listados nele. Chamada uma vez ao abrir a página.
async function loadAssets() {
  try {
    const manifest = await (await fetch('assets/assets.json')).json();
    for (const [name, cfg] of Object.entries(manifest)) {
      try {
        ASSETS[name] = await loadPiskel('assets/' + cfg.file, cfg);
      } catch (e) {
        console.warn('sprite não carregou:', name, e);
      }
    }
  } catch (e) {
    console.warn('assets/assets.json não encontrado: usando os desenhos antigos', e);
  }
}

// Desenha o sprite `name` com a base no chão, centrado em px. T = tempo em segundos (anima pelo fps do arquivo).
// Devolve false se o sprite não existe (o chamador então usa o desenho antigo).
function drawAsset(name, T, px, flip = false) {
  const a = ASSETS[name];
  if (!a) return false;
  const f = a.active[Math.floor(T * a.fps) % a.active.length],
    k = a.scale,
    dx = Math.round(px - a.ax * k),
    dy = Math.round(gyc - a.ay * k);
  x.save();
  if (flip) {
    x.translate(Math.round(px), 0);
    x.scale(-1, 1);
    x.translate(-Math.round(px), 0);
  }
  a.layers.forEach((l) => {
    const fr = l.frames[f];
    if (!fr || l.opacity <= 0) return;
    x.globalAlpha = l.opacity;
    x.drawImage(fr.img, fr.sx, fr.sy, a.w, a.h, dx, dy, a.w * k, a.h * k);
  });
  x.restore();
  return true;
}
