// Tests unitaires de la logique pure de « Copter Cave ».
// Exécutables sans dépendance : `node --test`.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULT_CONFIG,
  REFERENCE_HEIGHT,
  scaleConfig,
  createRng,
  createHero,
  stepHero,
  difficultyAt,
  nextGateCenter,
  createGate,
  createWorld,
  updateWorld,
  collidesWithGate,
  outOfBounds,
  scoreFromDistance,
  HIGHSCORE_KEY,
} from '../public/logic.js';

test('stepHero : la gravité fait descendre, la poussée fait monter', () => {
  const cfg = DEFAULT_CONFIG;
  const hero = createHero(300);

  // Sans poussée : vitesse vers le bas, position qui augmente (descente).
  const falling = stepHero(hero, 0.1, false, cfg);
  assert.ok(falling.vy > 0, 'la vitesse doit être positive en chute');
  assert.ok(falling.y > hero.y, 'la position doit descendre');

  // Avec poussée : vitesse vers le haut, position qui diminue (montée).
  const rising = stepHero(hero, 0.1, true, cfg);
  assert.ok(rising.vy < 0, 'la vitesse doit être négative en poussée');
  assert.ok(rising.y < hero.y, 'la position doit monter');
});

test('stepHero : la vitesse est bornée (vitesse terminale)', () => {
  const cfg = DEFAULT_CONFIG;
  const hero = createHero(300);

  hero.vy = 999999; // déjà bien au-dessus du max de chute
  const clamped = stepHero(hero, 0.016, false, cfg);
  assert.ok(clamped.vy <= cfg.maxFallSpeed, 'vitesse de chute plafonnée');

  hero.vy = -999999; // déjà bien en dessous du max de montée
  const clampedUp = stepHero(hero, 0.016, true, cfg);
  assert.ok(clampedUp.vy >= cfg.maxRiseSpeed, 'vitesse de montée plafonnée');
});

test('difficultyAt : le gap se resserre et la vitesse augmente (bornés)', () => {
  const cfg = DEFAULT_CONFIG;

  const start = difficultyAt(0, cfg);
  assert.equal(start.gap, cfg.baseGap);
  assert.equal(start.speed, cfg.baseSpeed);

  const later = difficultyAt(30, cfg);
  assert.ok(later.gap < start.gap, 'le gap doit se resserrer');
  assert.ok(later.gap >= cfg.minGap, 'le gap ne passe pas sous son minimum');
  assert.ok(later.speed > start.speed, 'la vitesse doit augmenter');
  assert.ok(later.speed <= cfg.maxSpeed, 'la vitesse ne dépasse pas son maximum');

  const maxed = difficultyAt(1000, cfg);
  assert.equal(maxed.gap, cfg.minGap);
  assert.equal(maxed.speed, cfg.maxSpeed);
});

test('collidesWithGate : collision avec les murs, pas dans le gap', () => {
  const cfg = DEFAULT_CONFIG;
  // x=100, centre vertical 300, gap 200 → zone libre de y=200 à y=400.
  const gate = createGate(100, 300, 200);

  const inGap = { x: 100, y: 300 };
  assert.equal(collidesWithGate(inGap, gate, cfg), false);

  const inTopWall = { x: 100, y: 100 };
  assert.equal(collidesWithGate(inTopWall, gate, cfg), true);

  const inBottomWall = { x: 100, y: 500 };
  assert.equal(collidesWithGate(inBottomWall, gate, cfg), true);

  // Hors de la largeur du mur : aucune collision verticale.
  const aside = { x: 500, y: 100 };
  assert.equal(collidesWithGate(aside, gate, cfg), false);
});

test('outOfBounds : détecte le plafond et le sol', () => {
  const cfg = DEFAULT_CONFIG;
  const fieldHeight = 720;

  assert.equal(outOfBounds({ y: 300 }, fieldHeight, cfg), false);
  assert.equal(outOfBounds({ y: cfg.heroRadius }, fieldHeight, cfg), true, 'plafond touché');
  assert.equal(
    outOfBounds({ y: fieldHeight - cfg.heroRadius }, fieldHeight, cfg),
    true,
    'sol touché'
  );
});

test('createRng + nextGateCenter : génération déterministe et centre borné', () => {
  const cfg = DEFAULT_CONFIG;

  // Deux générateurs avec la même graine produisent la même séquence.
  const rngA = createRng(42);
  const rngB = createRng(42);
  const seqA = [rngA(), rngA(), rngA()];
  const seqB = [rngB(), rngB(), rngB()];
  assert.deepEqual(seqA, seqB);

  // Le centre du gap reste toujours dans le terrain (gap entièrement visible).
  const fieldHeight = 720;
  const gap = 200;
  for (let i = 0; i < 200; i++) {
    const center = nextGateCenter(createRng(i), 360, gap, fieldHeight, cfg);
    assert.ok(center >= gap / 2 + cfg.ceilingMargin - 1e-9, 'centre pas trop haut');
    assert.ok(center <= fieldHeight - gap / 2 - cfg.floorMargin + 1e-9, 'centre pas trop bas');
  }
});

test('updateWorld : fait défiler les murs, augmente la distance, resserre le gap', () => {
  const cfg = DEFAULT_CONFIG;
  const rng = createRng(7);
  const fieldWidth = 480;
  const fieldHeight = 720;

  const world = createWorld(cfg, rng, fieldWidth, fieldHeight);
  assert.ok(world.gates.length > 0, 'des murs existent dès la création');

  const initialDistance = world.distance;
  const firstGap = world.gates[0].gap;

  updateWorld(world, 10, rng, cfg, fieldWidth, fieldHeight);
  assert.ok(world.distance > initialDistance, 'la distance augmente');
  assert.ok(world.gates.length > 0, 'des murs restent à l\'écran');
  assert.ok(
    world.gates[0].gap < firstGap,
    'le gap des murs générés se resserre avec le temps'
  );
});

test('scaleConfig : adapte les quantités verticales, préserve les horizontales', () => {
  const k = 480 / REFERENCE_HEIGHT;
  const scaled = scaleConfig(DEFAULT_CONFIG, 480);

  // Quantités verticales mises à l'échelle.
  assert.equal(scaled.gravity, DEFAULT_CONFIG.gravity * k);
  assert.equal(scaled.thrust, DEFAULT_CONFIG.thrust * k);
  assert.equal(scaled.maxRiseSpeed, DEFAULT_CONFIG.maxRiseSpeed * k);
  assert.equal(scaled.baseGap, DEFAULT_CONFIG.baseGap * k);
  assert.equal(scaled.heroRadius, DEFAULT_CONFIG.heroRadius * k);

  // Quantités horizontales inchangées.
  assert.equal(scaled.gateWidth, DEFAULT_CONFIG.gateWidth);
  assert.equal(scaled.baseSpeed, DEFAULT_CONFIG.baseSpeed);
  assert.equal(scaled.maxSpeed, DEFAULT_CONFIG.maxSpeed);

  // À la hauteur de référence, la config est identique (k = 1).
  assert.deepEqual(scaleConfig(DEFAULT_CONFIG, REFERENCE_HEIGHT), DEFAULT_CONFIG);

  // La config d'origine n'est pas mutée.
  assert.equal(DEFAULT_CONFIG.gravity, 2200);
});

test('scoreFromDistance + HIGHSCORE_KEY', () => {
  assert.equal(scoreFromDistance(0), 0);
  assert.equal(scoreFromDistance(149), 14);
  assert.equal(scoreFromDistance(200), 20);
  assert.match(HIGHSCORE_KEY, /^odg\.game_copter_cave\./);
});
