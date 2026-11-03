# Copter Cave — OhDjiGames

Un hélicoptère avance tout seul dans un tunnel qui se resserre. Maintenez pour monter, relâchez pour descendre, survivez le plus longtemps possible. Le classique one-button qui vous fera dire « encore une ».

## Comment jouer
Maintenez (espace, clic ou doigt posé) pour monter, relâchez pour descendre. Ne touchez ni le plafond ni le sol. Le tunnel se resserre et accélère au fil du temps.

## Lancer en local
Aucun build : servir le dossier `public`.
```bash
cd public && python3 -m http.server 8000      # http://localhost:8000
```
Ou via l'image :
```bash
docker build -t game_copter_cave . && docker run --rm -p 8080:8080 game_copter_cave
```

## Tests
```bash
node --test tests/     # logique pure (collision, génération, score) — zéro dépendance
```

## Stack
Vanilla JS + Canvas 2D, sans dépendance, sans build, sans appel réseau, sans clé d'API, sans traceur.
Le meilleur score est enregistré dans le navigateur (`localStorage`) et reste sur l'appareil.

## Structure
```
public/
  index.html   structure + canvas
  style.css    styles (fichier externe, CSP stricte)
  main.js      point d'entrée : boucle de jeu, rendu, entrées
  logic.js     logique pure testable (collision, génération, score)
  favicon.svg
tests/         tests Node (node --test)
nginx.conf     en-têtes de sécurité (CSP stricte), cache, /healthz
Dockerfile     nginx-unprivileged, port 8080, sans root
```

## CI/CD
`.github/workflows/ci.yml` : tests Node, build image, smoke test (page, assets, `/healthz`, CSP), scan Trivy (bloquant sur CRITICAL), push sur `ghcr.io/a-djihadi/game_copter_cave`.

## Déploiement Dokploy
Application « build Dockerfile » → `https://copter.ohdji.dev` (port 8080, HTTPS Let's Encrypt).
