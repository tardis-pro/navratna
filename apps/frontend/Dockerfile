FROM node:20-alpine AS development

RUN apk add --no-cache curl
RUN npm install -g pnpm

WORKDIR /app
RUN addgroup -g 1001 nodejs && \
    adduser -u 1001 -G nodejs -D frontend

COPY pnpm-workspace.yaml ./
COPY package.json ./
COPY pnpm-lock.yaml ./
COPY tsconfig.json ./
COPY tsconfig.base.json ./
COPY nx.json ./

COPY apps/packages/ ./apps/packages/
COPY apps/frontend/package.json ./apps/frontend/
COPY apps/frontend/tsconfig.json ./apps/frontend/
COPY apps/frontend/tsconfig.app.json ./apps/frontend/
COPY apps/frontend/vite.config.ts ./apps/frontend/
COPY apps/frontend/index.html ./apps/frontend/

RUN chown -R frontend:nodejs /app
USER frontend

RUN pnpm install --frozen-lockfile

RUN pnpm nx run-many -t build --projects=@uaip/types,@uaip/contracts

WORKDIR /app/apps/frontend

EXPOSE 5173

HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD curl -f http://localhost:5173 || exit 1

CMD ["pnpm", "dev", "--host", "0.0.0.0", "--port", "5173"]


FROM node:20-alpine AS production

RUN apk add --no-cache curl
RUN npm install -g pnpm

WORKDIR /app
RUN addgroup -g 1001 nodejs && \
    adduser -u 1001 -G nodejs -D frontend

COPY pnpm-workspace.yaml ./
COPY package.json ./
COPY pnpm-lock.yaml ./
COPY tsconfig.json ./
COPY tsconfig.base.json ./
COPY nx.json ./

COPY apps/packages/ ./apps/packages/
COPY apps/frontend/ ./apps/frontend/

RUN chown -R frontend:nodejs /app
USER frontend

RUN pnpm install --frozen-lockfile

RUN pnpm nx run-many -t build --projects=@uaip/types,@uaip/contracts
RUN pnpm nx run @council/frontend:build

FROM nginx:alpine AS production-serve
COPY --from=production /app/apps/frontend/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
