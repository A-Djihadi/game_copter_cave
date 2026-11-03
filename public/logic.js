// Logique pure du jeu « Copter Cave ».
// Aucune dépendance, aucun accès au DOM : ce module est testable via Node
// (`node --test tests/`) et importé par main.js côté navigateur.
//
// Toutes les distances/tailles sont exprimées en pixels « CSS » (le rendu
// s'occupe du devicePixelRatio et du redimensionnement).

// Clé localStorage pour le meilleur score (préfixe imposé).
export const HIGHSCORE_KEY = 'odg.game_copter_cave.highscore';

// Paramètres par défaut du jeu. Les vitesses/accélérations sont en px/s et px/s².
// Ces valeurs sont calibrées pour un terrain de 720 px de haut (REFERENCE_HEIGHT) ;
// `scaleConfig` les adapte à la hauteur réelle de l'écran (mobile-first).
export const REFERENCE_HEIGHT = 720;

export const DEFAULT_CONFIG = {
  gravity: 2200,            // accélération vers le bas quand on ne pousse pas
  thrust: -4400,            // accélération vers le haut quand on pousse
  maxFallSpeed: 820,        // vitesse de chute maximale
  maxRiseSpeed: -480,       // vitesse de montée maximale
  heroRadius: 13,           // rayon de la zone de collision de l'hélico
  gateWidth: 80,            // épaisseur (horizontale) d'un mur
  baseGap: 300,             // écart initial entre plafond et sol
  minGap: 140,              // écart minimal atteint à la difficulté maximale
  gapShrinkPerSecond: 8,    // réduction de l'écart par seconde
  baseSpeed: 220,           // vitesse de défilement initiale
  speedIncreasePerSecond: 12, // accélération de défilement par seconde
  maxSpeed: 540,            // vitesse de défilement maximale
  gapCenterJitter: 90,      // décalage aléatoire maximal du centre du gap
  ceilingMargin: 10,        // marge de sécurité sous le plafond
  floorMargin: 10,          // marge de sécurité au-dessus du sol
};

// Adapte la configuration à la hauteur réelle du terrain : les quantités
// verticales (gravité, poussée, vitesses verticales, tailles des gaps) sont
// mises à l'échelle pour que le jeu se ressente identiquement sur tout écran.
// Les quantités horizontales (épaisseur des murs, vitesse de défilement)
// restent absolues. Renvoie une nouvelle config (ne modifie pas l'originale).
export function scaleConfig(cfg, fieldHeight) {
  const k = fieldHeight / REFERENCE_HEIGHT;
  return {
    ...cfg,
    gravity: cfg.gravity * k,
    thrust: cfg.thrust * k,
    maxFallSpeed: cfg.maxFallSpeed * k,
    maxRiseSpeed: cfg.maxRiseSpeed * k,
    heroRadius: cfg.heroRadius * k,
    baseGap: cfg.baseGap * k,
    minGap: cfg.minGap * k,
    gapShrinkPerSecond: cfg.gapShrinkPerSecond * k,
    gapCenterJitter: cfg.gapCenterJitter * k,
    ceilingMargin: cfg.ceilingMargin * k,
    floorMargin: cfg.floorMargin * k,
  };
}

// Générateur pseudo-aléatoire déterministe (Linear Congruential Generator).
// Permet de rejouer la même partie pour les tests.
export function createRng(seed) {
  let state = seed >>> 0;
  return function rng() {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

// Position de l'hélico sur l'axe horizontal (reste à gauche, ~20 % de l'écran).
export function heroXFor(fieldWidth, cfg) {
  return Math.round(Math.max(56, Math.min(140, fieldWidth * 0.2)));
}

// Espacement horizontal entre deux murs consécutifs, adapté à la largeur.
export function gateSpacingFor(fieldWidth, cfg) {
  return Math.max(220, Math.round(fieldWidth * 0.55));
}

// État du héros : position verticale y et vitesse verticale vy.
export function createHero(y) {
  return { y, vy: 0 };
}

// Avance la physique du héros d'un pas de temps `dt`.
// `thrusting` = vrai tant que le joueur maintient (poussée vers le haut).
// Renvoie un nouvel état (fonction pure).
export function stepHero(hero, dt, thrusting, cfg) {
  const acc = thrusting ? cfg.thrust : cfg.gravity;
  const vy = Math.max(cfg.maxRiseSpeed, Math.min(cfg.maxFallSpeed, hero.vy + acc * dt));
  return { y: hero.y + vy * dt, vy };
}

// Difficulté à un instant t (en secondes) : écart du gap + vitesse de défilement.
export function difficultyAt(t, cfg) {
  const gap = Math.max(cfg.minGap, cfg.baseGap - cfg.gapShrinkPerSecond * t);
  const speed = Math.min(cfg.maxSpeed, cfg.baseSpeed + cfg.speedIncreasePerSecond * t);
  return { gap, speed };
}

// Centre vertical du prochain gap, décalé aléatoirement autour du centre
// précédent et borné pour que le gap reste entièrement dans le terrain.
export function nextGateCenter(rng, prevCenter, gap, fieldHeight, cfg) {
  const minCenter = gap / 2 + cfg.ceilingMargin;
  const maxCenter = fieldHeight - gap / 2 - cfg.floorMargin;
  const delta = (rng() - 0.5) * 2 * cfg.gapCenterJitter;
  return Math.max(minCenter, Math.min(maxCenter, prevCenter + delta));
}

// Un « mur » est une paire plafond/sol : position x (centre), centre du gap,
// et taille du gap.
export function createGate(x, gapCenter, gap) {
  return { x, gapCenter, gap };
}

// État du monde : liste des murs, distance parcourue, temps écoulé.
export function createWorld(cfg, rng, fieldWidth, fieldHeight) {
  const world = { gates: [], distance: 0, time: 0 };
  spawnGates(world, cfg, rng, fieldWidth, fieldHeight, difficultyAt(0, cfg));
  return world;
}

// Avance le monde d'un pas de temps : défilement des murs, retrait des murs
// sortis à gauche, création des nouveaux murs à droite, accumulation de la
// distance et du temps. Modifie `world` en place.
export function updateWorld(world, dt, rng, cfg, fieldWidth, fieldHeight) {
  world.time += dt;
  const difficulty = difficultyAt(world.time, cfg);
  world.distance += difficulty.speed * dt;

  // Défilement : tous les murs glissent vers la gauche.
  for (const gate of world.gates) {
    gate.x -= difficulty.speed * dt;
  }

  // Retire les murs entièrement sortis de l'écran par la gauche.
  while (world.gates.length && world.gates[0].x + cfg.gateWidth / 2 < 0) {
    world.gates.shift();
  }

  spawnGates(world, cfg, rng, fieldWidth, fieldHeight, difficulty);
}

// Crée les murs manquants à droite pour que le tunnel soit toujours rempli
// jusqu'à l'horizon de génération.
function spawnGates(world, cfg, rng, fieldWidth, fieldHeight, difficulty) {
  const spacing = gateSpacingFor(fieldWidth, cfg);
  const horizon = fieldWidth + spacing;
  let last = world.gates[world.gates.length - 1];
  let nextX = last ? last.x + spacing : heroXFor(fieldWidth, cfg) + spacing * 2;

  while (nextX < horizon) {
    const prevCenter = last ? last.gapCenter : fieldHeight / 2;
    const gapCenter = nextGateCenter(rng, prevCenter, difficulty.gap, fieldHeight, cfg);
    world.gates.push({ x: nextX, gapCenter, gap: difficulty.gap });
    last = world.gates[world.gates.length - 1];
    nextX = last.x + spacing;
  }
}

// Collision entre le héros et un mur : vrai si le héros mord dans le plafond
// ou le sol sur la tranche horizontale du mur.
export function collidesWithGate(hero, gate, cfg) {
  const halfWidth = cfg.gateWidth / 2;
  if (hero.x + cfg.heroRadius < gate.x - halfWidth) return false;
  if (hero.x - cfg.heroRadius > gate.x + halfWidth) return false;

  const topY = gate.gapCenter - gate.gap / 2;
  const bottomY = gate.gapCenter + gate.gap / 2;
  if (hero.y - cfg.heroRadius < topY) return true;
  if (hero.y + cfg.heroRadius > bottomY) return true;
  return false;
}

// Collision avec le plafond (y <= 0) ou le sol (y >= fieldHeight).
export function outOfBounds(hero, fieldHeight, cfg) {
  return hero.y - cfg.heroRadius <= 0 || hero.y + cfg.heroRadius >= fieldHeight;
}

// Score affiché = distance parcourue (en pixels) divisée par 10.
export function scoreFromDistance(distance) {
  return Math.floor(distance / 10);
}
