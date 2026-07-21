# MDT Station 13 - image de production.
# Étape 1 : déploiement des fonctions Convex + build du front.
# Étape 2 : Caddy sert les fichiers statiques avec repli SPA.

# ---------- Build ----------
FROM node:22-alpine AS build
WORKDIR /app

RUN corepack enable

# Couche de dépendances séparée : elle n'est reconstruite que si le lockfile change.
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .

# `convex deploy` pousse le schéma et les fonctions vers le déploiement de
# production, régénère convex/_generated (non versionné), puis lance le build
# du front en lui injectant VITE_CONVEX_URL. Backend et front restent ainsi
# toujours en phase.
ARG CONVEX_DEPLOY_KEY
ARG VITE_CLOUDINARY_CLOUD_NAME
ARG VITE_CLOUDINARY_UPLOAD_PRESET
ARG VITE_IMGBB_KEY
ENV VITE_CLOUDINARY_CLOUD_NAME=$VITE_CLOUDINARY_CLOUD_NAME \
    VITE_CLOUDINARY_UPLOAD_PRESET=$VITE_CLOUDINARY_UPLOAD_PRESET \
    VITE_IMGBB_KEY=$VITE_IMGBB_KEY

# La clé passe par l'environnement de l'étage et n'est jamais citée dans une
# ligne RUN : le constructeur affiche les commandes après substitution, ce qui
# imprimait la clé en clair dans les logs de build.
ENV CONVEX_DEPLOY_KEY=$CONVEX_DEPLOY_KEY

RUN if [ -z "${CONVEX_DEPLOY_KEY}" ]; then       echo "ERREUR: CONVEX_DEPLOY_KEY est vide au moment du build.";       echo "Ajoutez-la aux variables du service Railway, puis relancez un";       echo "deploiement complet : elle est lue a la construction de l'image.";       exit 1;     fi

# `convex deploy --cmd` lance la commande AVANT de régénérer convex/_generated.
# Or ce dossier n'est pas versionné : sans cette étape, `tsc` compilerait sans
# les types de l'API Convex et chaque retour de useQuery deviendrait un `any`
# implicite, faisant échouer le build en mode strict.
RUN npx convex codegen --typecheck disable

RUN npx convex deploy --cmd-url-env-var-name VITE_CONVEX_URL --cmd 'pnpm build'

# ---------- Runtime ----------
FROM caddy:2-alpine

# Port explicite : sans EXPOSE, Railway ne sait pas quel port proposer au
# moment de générer un domaine. Une variable PORT injectée par la plateforme
# reste prioritaire, le Caddyfile la lit en premier.
ENV PORT=8080
EXPOSE 8080

COPY --from=build /app/dist /srv
COPY Caddyfile /etc/caddy/Caddyfile
