# Bot Discord de la Station 13. Service Railway distinct du site.
FROM node:22-alpine AS build
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml* ./
RUN pnpm install --frozen-lockfile 2>/dev/null || pnpm install
COPY . .
RUN pnpm build

FROM node:22-alpine
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml* ./
RUN pnpm install --prod --frozen-lockfile 2>/dev/null || pnpm install --prod
COPY --from=build /app/dist ./dist
ENV NODE_OPTIONS=--max-old-space-size=192
CMD ["node", "dist/index.js"]
