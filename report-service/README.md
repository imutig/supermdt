# report-service — Rapport hebdomadaire LSPD (LaTeX → PDF)

Service Railway **distinct** du site et du bot. Il reçoit les données du rapport
(JSON), remplit un modèle **XeLaTeX** (charte reprise du règlement) et renvoie le
**PDF**. La génération n'est **jamais automatique** : elle est déclenchée depuis le
MDT une fois les sections rédigées à la main ajoutées.

## API

`POST /compile`
- En-tête `x-report-secret: <REPORT_SECRET>` (obligatoire).
- Corps : `ReportPayload` JSON (voir `src/template.ts`).
- Réponse : `application/pdf` (le binaire) ou `{ error }` (400/401/500).

`GET /health` → `{ ok: true }`.

## Variables d'environnement

| Var | Rôle |
|-----|------|
| `REPORT_SECRET` | secret partagé avec Convex (comme `BOT_SECRET`). |
| `PORT` | fourni par Railway. |

## Déploiement Railway (nouveau service)

1. Créer un service dans le projet `supermdt`, **Root Directory = `report-service`**.
2. Définir la variable `REPORT_SECRET` (identique côté Convex : `npx convex env set REPORT_SECRET "…" --prod`).
3. Déployer :
   ```bash
   railway up --service report-service --detach
   ```
   (le Dockerfile installe XeLaTeX + TeX Gyre + la charte ; premier build ~5–8 min).

## Contenu

- `src/template.ts` — contrat `ReportPayload` + génération du `.tex` (échappement LaTeX, conversion sûre des sections manuelles).
- `src/latex.ts` — compilation XeLaTeX (3 passes, jobname unique, remontée d'erreur).
- `src/server.ts` — serveur HTTP protégé par secret.
- `tex/` — charte (`style/rapport.sty` + `style/lspd.sty`), polices Inter, images (sceau, insignes).

Modifier la mise en forme : `tex/style/rapport.sty`. Modifier les sections/données : `src/template.ts`.
