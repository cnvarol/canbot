FROM node:16-bullseye-slim

WORKDIR /usr/src/app

# Install build dependencies for native modules (better-sqlite3, talib, tulind)
RUN apt-get update && apt-get install -y \
    build-essential \
    python3 \
    git \
    && rm -rf /var/lib/apt/lists/*

# Upgrade node-gyp to support Python 3 (fixes compilation on modern systems)
RUN npm install -g node-gyp@9 && \
    npm config set node_gyp $(npm root -g)/node-gyp/bin/node-gyp.js

# Install dependencies first (layer caching)
COPY package.json ./
RUN npm install --production --legacy-peer-deps

# Copy application code
COPY . .

# Create required directories
RUN mkdir -p var/log sessions

EXPOSE 8068

CMD ["node", "index.js", "trade"]
