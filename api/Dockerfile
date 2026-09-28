# syntax=docker/dockerfile:1
# Imagem de PRODUÇÃO da API: só dependências de runtime, usuário sem privilégios, sem volume de código.
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force

FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY package.json tsconfig.json ./
COPY migrations ./migrations
COPY src ./src
RUN mkdir -p /data/files && chown -R node:node /app /data
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/api/health >/dev/null || exit 1
# node direto (sem npm) para o SIGTERM chegar ao processo e o desligamento gracioso funcionar.
CMD ["node", "--import", "tsx", "src/index.ts"]
