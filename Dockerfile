FROM node:22-slim

WORKDIR /app

RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        ca-certificates \
        python3 \
        build-essential \
    && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm install

# Actualizar yt-dlp a la última versión (YouTube rompe versiones viejas seguido)
RUN ./node_modules/youtube-dl-exec/bin/yt-dlp -U || true

COPY . .
RUN npm run build

CMD ["node", "dist/index.js"]
