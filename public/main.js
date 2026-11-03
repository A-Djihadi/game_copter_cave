// Point d'entrée du jeu « Copter Cave » (module ESM).
// Orchestre : canvas (devicePixelRatio + resize), boucle requestAnimationFrame,
// entrées clavier/souris/tactile, rendu procédural et écrans (menu / jeu / game over).
// La logique pure (collision, génération, score) est importée de logic.js.

import {
  DEFAULT_CONFIG,
  HIGHSCORE_KEY,
  scaleConfig,
  createRng,
  createHero,
  stepHero,
  difficultyAt,
  createWorld,
  updateWorld,
  collidesWithGate,
  outOfBounds,
  scoreFromDistance,
  heroXFor,
} from './logic.js';

// --- Éléments du DOM ---------------------------------------------------------
const game = document.getElementById('game');
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const hud = document.getElementById('hud');
const scoreEl = document.getElementById('score');
const menuEl = document.getElementById('menu');
const menuHighscoreEl = document.getElementById('menu-highscore');
const gameoverEl = document.getElementById('gameover');
const finalScoreEl = document.getElementById('final-score');
const bestScoreEl = document.getElementById('best-score');
const restartBtn = document.getElementById('restart');

// --- Constantes locales ------------------------------------------------------
const RESTART_DELAY = 600; // délai (ms) avant de pouvoir relancer après la mort
const THRUST_KEYS = new Set(['Space', 'ArrowUp', 'KeyW']);

// --- État du jeu -------------------------------------------------------------
let screen = 'menu'; // 'menu' | 'game' | 'gameover'
let cfg = DEFAULT_CONFIG; // config adaptée à la hauteur d'écran (scaleConfig)
let rng = createRng((Math.random() * 0xffffffff) >>> 0);
let world = null;
let hero = null;
let heroX = 90;
let thrusting = false;
let fieldWidth = 0;
let fieldHeight = 0;
let dpr = 1;
let lastTime = 0;
let deathAt = 0;
let highscore = loadHighscore();
let bgGradient = null;
let particles = [];

// --- Persistance du meilleur score (localStorage) ----------------------------
function loadHighscore() {
  try {
    return Number(localStorage.getItem(HIGHSCORE_KEY)) || 0;
  } catch {
    return 0; // localStorage indisponible (navigation privée) : on ignore.
  }
}

function saveHighscore(value) {
  try {
    localStorage.setItem(HIGHSCORE_KEY, String(value));
  } catch {
    /* stockage indisponible : on ignore silencieusement */
  }
}

// --- Canvas responsive (devicePixelRatio + redimensionnement) ----------------
function resize() {
  dpr = Math.min(window.devicePixelRatio || 1, 3);
  fieldWidth = canvas.clientWidth || window.innerWidth;
  fieldHeight = canvas.clientHeight || window.innerHeight;

  // Adapte la physique à la hauteur réelle (mobile-first) avant tout calcul.
  cfg = scaleConfig(DEFAULT_CONFIG, fieldHeight);

  canvas.width = Math.round(fieldWidth * dpr);
  canvas.height = Math.round(fieldHeight * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  heroX = heroXFor(fieldWidth, cfg);
  buildBackgroundGradient();
  initParticles();

  // Recentre le héros si la hauteur du terrain a changé en cours de partie.
  if (hero) {
    hero.y = Math.max(cfg.heroRadius, Math.min(fieldHeight - cfg.heroRadius, hero.y));
  }
}

function buildBackgroundGradient() {
  bgGradient = ctx.createLinearGradient(0, 0, 0, fieldHeight);
  bgGradient.addColorStop(0, '#0a1226');
  bgGradient.addColorStop(0.5, '#05060a');
  bgGradient.addColorStop(1, '#080d1a');
}

function initParticles() {
  const count = Math.max(30, Math.min(120, Math.floor((fieldWidth * fieldHeight) / 14000)));
  particles = [];
  for (let i = 0; i < count; i++) {
    particles.push({
      x: Math.random() * fieldWidth,
      y: Math.random() * fieldHeight,
      r: 0.5 + Math.random() * 1.6,
      speed: 0.3 + Math.random() * 0.7,
      alpha: 0.2 + Math.random() * 0.45,
    });
  }
}

// --- Écrans ------------------------------------------------------------------
function showScreen(name) {
  menuEl.hidden = name !== 'menu';
  gameoverEl.hidden = name !== 'gameover';
  hud.hidden = name !== 'game';
}

function startGame() {
  rng = createRng((Math.random() * 0xffffffff) >>> 0);
  world = createWorld(cfg, rng, fieldWidth, fieldHeight);
  hero = createHero(fieldHeight / 2);
  scoreEl.textContent = '0';
  screen = 'game';
  showScreen('game');
}

function endGame() {
  screen = 'gameover';
  deathAt = performance.now();
  const score = scoreFromDistance(world.distance);
  if (score > highscore) {
    highscore = score;
    saveHighscore(highscore);
  }
  finalScoreEl.textContent = String(score);
  bestScoreEl.textContent = String(highscore);
  showScreen('gameover');
}

// --- Entrées (clavier, souris, tactile) --------------------------------------
function onPress() {
  thrusting = true;
  if (screen === 'menu') {
    startGame();
  } else if (screen === 'gameover' && performance.now() - deathAt >= RESTART_DELAY) {
    startGame();
  }
}

function onRelease() {
  thrusting = false;
}

window.addEventListener('keydown', (event) => {
  if (THRUST_KEYS.has(event.code)) {
    event.preventDefault();
    if (!event.repeat) onPress();
  }
});

window.addEventListener('keyup', (event) => {
  if (THRUST_KEYS.has(event.code)) {
    event.preventDefault();
    onRelease();
  }
});

game.addEventListener('pointerdown', (event) => {
  if (event.button !== 0) return; // bouton principal (souris) ou tactile
  event.preventDefault();
  onPress();
});

window.addEventListener('pointerup', onRelease);
window.addEventListener('pointercancel', onRelease);
game.addEventListener('contextmenu', (event) => event.preventDefault());

// Le bouton « Rejouer » doit aussi fonctionner au clavier (Entrée/Espace).
restartBtn.addEventListener('click', () => {
  if (screen === 'gameover' && performance.now() - deathAt >= RESTART_DELAY) {
    startGame();
  }
});

// Évite un saut de dt géant quand on revient sur l'onglet.
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    lastTime = 0;
    thrusting = false;
  }
});

// --- Mise à jour -------------------------------------------------------------
function update(dt) {
  // Les particules défilent en permanence (fond animé), plus vite en jeu.
  const flow = screen === 'game' ? difficultyAt(world.time, cfg).speed : screen === 'menu' ? 50 : 0;
  for (const p of particles) {
    p.x -= flow * p.speed * dt;
    if (p.x < -2) {
      p.x = fieldWidth + 2;
      p.y = Math.random() * fieldHeight;
    }
  }

  if (screen !== 'game') return;

  hero = stepHero(hero, dt, thrusting, cfg);
  updateWorld(world, dt, rng, cfg, fieldWidth, fieldHeight);

  // Collisions : plafond/sol puis murs.
  if (outOfBounds({ y: hero.y }, fieldHeight, cfg)) {
    endGame();
    return;
  }
  for (const gate of world.gates) {
    if (collidesWithGate({ x: heroX, y: hero.y }, gate, cfg)) {
      endGame();
      return;
    }
  }

  scoreEl.textContent = String(scoreFromDistance(world.distance));
}

// --- Rendu (100 % procédural) ------------------------------------------------
function render(now) {
  ctx.clearRect(0, 0, fieldWidth, fieldHeight);
  drawBackground();
  drawParticles();
  if (world && screen !== 'menu') {
    drawWalls();
    drawHelicopter(now);
  }
}

function drawBackground() {
  ctx.fillStyle = bgGradient || '#05060a';
  ctx.fillRect(0, 0, fieldWidth, fieldHeight);
}

function drawParticles() {
  ctx.save();
  ctx.fillStyle = '#7dd3fc';
  for (const p of particles) {
    ctx.globalAlpha = p.alpha;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawWalls() {
  const half = cfg.gateWidth / 2;
  for (const gate of world.gates) {
    const left = gate.x - half;
    const topY = gate.gapCenter - gate.gap / 2;
    const bottomY = gate.gapCenter + gate.gap / 2;

    // Plafond (mur du haut) et sol (mur du bas).
    drawWallSegment(left, 0, cfg.gateWidth, topY, true);
    drawWallSegment(left, bottomY, cfg.gateWidth, fieldHeight - bottomY, false);
  }
}

function drawWallSegment(x, y, w, h, isTop) {
  if (h <= 0) return;

  // Corps du mur : dégradé vertical, clair du côté du gap.
  const grad = ctx.createLinearGradient(0, y, 0, y + h);
  if (isTop) {
    grad.addColorStop(0, '#071a26');
    grad.addColorStop(1, '#0c3a4a');
  } else {
    grad.addColorStop(0, '#0c3a4a');
    grad.addColorStop(1, '#071a26');
  }
  ctx.fillStyle = grad;
  ctx.fillRect(x, y, w, h);

  // Liseré néon sur le bord du gap.
  const edgeY = isTop ? y + h : y;
  ctx.save();
  ctx.strokeStyle = '#22d3ee';
  ctx.lineWidth = 2.5;
  ctx.shadowColor = 'rgba(34,211,238,0.9)';
  ctx.shadowBlur = 10;
  ctx.beginPath();
  ctx.moveTo(x - 2, edgeY);
  ctx.lineTo(x + w + 2, edgeY);
  ctx.stroke();
  ctx.restore();

  // Stries verticales fines pour donner de la texture à la roche.
  ctx.save();
  ctx.globalAlpha = 0.18;
  ctx.strokeStyle = '#67e8f9';
  ctx.lineWidth = 1;
  for (let gx = x + 6; gx < x + w; gx += 10) {
    ctx.beginPath();
    ctx.moveTo(gx, y);
    ctx.lineTo(gx, y + h);
    ctx.stroke();
  }
  ctx.restore();
}

function drawHelicopter(now) {
  const x = heroX;
  const y = hero.y;
  const r = cfg.heroRadius;

  ctx.save();
  ctx.translate(x, y);

  // Rotor : pales en rotation rapide.
  ctx.save();
  ctx.translate(0, -r - 7);
  ctx.rotate((now / 1000) * 24);
  ctx.fillStyle = 'rgba(224,242,254,0.95)';
  ctx.fillRect(-18, -1.4, 36, 2.8);
  ctx.restore();

  // Mât du rotor.
  ctx.strokeStyle = '#94a3b8';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, -r - 4);
  ctx.lineTo(0, -r);
  ctx.stroke();

  // Poutre de queue + stabilisateur.
  ctx.strokeStyle = '#67e8f9';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(r * 0.8, r * 0.1);
  ctx.lineTo(r * 1.9, r * 0.35);
  ctx.stroke();
  ctx.fillStyle = '#67e8f9';
  ctx.beginPath();
  ctx.moveTo(r * 1.9, r * 0.35);
  ctx.lineTo(r * 1.9 + 4, r * 0.15);
  ctx.lineTo(r * 1.9 + 4, r * 0.55);
  ctx.closePath();
  ctx.fill();

  // Corps (capsule).
  const bodyGrad = ctx.createLinearGradient(0, -r, 0, r);
  bodyGrad.addColorStop(0, '#8ef0fb');
  bodyGrad.addColorStop(0.5, '#22d3ee');
  bodyGrad.addColorStop(1, '#0e7490');
  ctx.fillStyle = bodyGrad;
  roundRect(ctx, -r * 0.95, -r, r * 1.9, r * 2, r * 0.7);
  ctx.fill();

  // Cockpit.
  ctx.fillStyle = 'rgba(5,6,10,0.85)';
  ctx.beginPath();
  ctx.arc(r * 0.2, -r * 0.25, r * 0.42, 0, Math.PI * 2);
  ctx.fill();

  // Patins.
  ctx.strokeStyle = '#94a3b8';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-r * 0.6, r * 0.9);
  ctx.lineTo(-r * 0.6, r * 1.4);
  ctx.moveTo(r * 0.6, r * 0.9);
  ctx.lineTo(r * 0.6, r * 1.4);
  ctx.moveTo(-r * 0.8, r * 1.4);
  ctx.lineTo(r * 0.8, r * 1.4);
  ctx.stroke();

  // Flamme d'échappement quand on maintient la poussée.
  if (thrusting) {
    ctx.save();
    ctx.translate(0, r * 1.5);
    const flame = 4 + Math.sin(now / 60) * 2;
    const fg = ctx.createLinearGradient(0, 0, 0, flame);
    fg.addColorStop(0, '#fbbf24');
    fg.addColorStop(1, 'rgba(251,191,36,0)');
    ctx.fillStyle = fg;
    ctx.beginPath();
    ctx.moveTo(-r * 0.5, 0);
    ctx.lineTo(r * 0.5, 0);
    ctx.lineTo(0, flame);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  ctx.restore();
}

// Rond-rectangle dessiné à la main (compatibilité maximale).
function roundRect(context, x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2);
  context.beginPath();
  context.moveTo(x + radius, y);
  context.arcTo(x + w, y, x + w, y + h, radius);
  context.arcTo(x + w, y + h, x, y + h, radius);
  context.arcTo(x, y + h, x, y, radius);
  context.arcTo(x, y, x + w, y, radius);
  context.closePath();
}

// --- Boucle principale -------------------------------------------------------
function loop(timestamp) {
  const dt = lastTime ? Math.min((timestamp - lastTime) / 1000, 0.05) : 0;
  lastTime = timestamp;
  update(dt);
  render(timestamp);
  requestAnimationFrame(loop);
}

// --- Démarrage ---------------------------------------------------------------
resize();
menuHighscoreEl.textContent = String(highscore);
showScreen('menu');
window.addEventListener('resize', resize);
window.addEventListener('load', resize);
requestAnimationFrame(loop);
