# Service de compilation du rapport hebdomadaire LSPD (XeLaTeX -> PDF).
# Service Railway distinct du site et du bot.

# ---------- Build TypeScript ----------
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json ./
RUN npm install
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# ---------- Runtime : Node + XeLaTeX ----------
FROM node:22-bookworm-slim
WORKDIR /app

# TeX Live minimal pour XeLaTeX + les paquets utilisés par la charte (fontspec,
# tcolorbox, titlesec, babel-french…) et les polices TeX Gyre (police du corps).
RUN apt-get update && apt-get install -y --no-install-recommends \
      texlive-xetex \
      texlive-latex-recommended \
      texlive-latex-extra \
      texlive-pictures \
      texlive-lang-french \
      texlive-fonts-recommended \
      fonts-texgyre \
      fontconfig \
 && fc-cache -f \
 && rm -rf /var/lib/apt/lists/*

COPY package.json ./
RUN npm install --omit=dev
COPY --from=build /app/dist ./dist
COPY tex ./tex

ENV PORT=8080 NODE_ENV=production
EXPOSE 8080
CMD ["node", "dist/server.js"]
