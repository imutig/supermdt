# Bot Discord de la Station 13. Service Railway distinct du site.
#
# --ignore-scripts : esbuild (dépendance transitive de convex) tente un script
# d'installation que pnpm bloque et transforme en erreur. Le bot ne charge
# jamais esbuild à l'exécution (discord.js et le client HTTP Convex sont en JS
# pur), on saute donc tous les scripts d'installation sans conséquence.
FROM node:22-alpine AS build
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --ignore-scripts
COPY . .
RUN pnpm build

FROM node:22-alpine
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --prod --frozen-lockfile --ignore-scripts
COPY --from=build /app/dist ./dist
ENV NODE_OPTIONS=--max-old-space-size=192
CMD ["node", "dist/index.js"]
