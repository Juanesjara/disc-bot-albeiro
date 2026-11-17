# --- Base común: Node + python3 (yt-dlp de youtube-dl-exec es un zipapp de Python) ---
FROM node:22-slim AS base
WORKDIR /app
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        ca-certificates \
        python3 \
    && rm -rf /var/lib/apt/lists/*

# --- Herramientas de compilación por si alguna dependencia nativa las necesita ---
FROM base AS toolchain
RUN apt-get update && \
    apt-get install -y --no-install-recommends build-essential \
    && rm -rf /var/lib/apt/lists/*

# --- Dependencias de producción (las que se copian a la imagen final) ---
FROM toolchain AS deps
COPY package.json package-lock.json ./
# Sin scripts de instalación salvo los dos que descargan binarios necesarios (ffmpeg y yt-dlp)
RUN npm ci --omit=dev --ignore-scripts && \
    npm rebuild ffmpeg-static youtube-dl-exec
# Actualizar yt-dlp a la última versión (YouTube rompe versiones viejas seguido)
RUN ./node_modules/youtube-dl-exec/bin/yt-dlp -U || true

# --- Compilación de TypeScript (con devDependencies) ---
FROM toolchain AS build
COPY package.json package-lock.json ./
# Para compilar con tsc no hace falta ningún script de instalación
RUN npm ci --ignore-scripts
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# --- Imagen final: sin devDependencies, sin build-essential, sin root ---
FROM base AS runtime
ENV NODE_ENV=production
COPY package.json package-lock.json ./
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
# El usuario `node` debe poder crear /app/cookies.txt desde YOUTUBE_COOKIES_B64
RUN chown node:node /app
USER node

CMD ["node", "dist/index.js"]
