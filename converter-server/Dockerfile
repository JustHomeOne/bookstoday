FROM node:20-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends calibre fonts-dejavu-core \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install --omit=dev

COPY server.js ./

ENV NODE_ENV=production
ENV QT_QPA_PLATFORM=offscreen
ENV QTWEBENGINE_CHROMIUM_FLAGS="--no-sandbox --disable-gpu"
ENV XDG_RUNTIME_DIR=/tmp/runtime-root
EXPOSE 3000

CMD ["npm", "start"]
