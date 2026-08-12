# Edge router + SPA host for the tardis.local deployment.
#
# Stage 1 builds the frontend bundle (same steps as apps/frontend/Dockerfile's
# production stage, but with VITE_API_BASE_URL pointing at the tardis host so
# the SPA and the API share one origin).
#
# Stage 2 plays the role nginx/the CF worker play elsewhere: serves the SPA,
# path-splits /api/v1/* between navratna-core and navratna-gateway, validates
# the JWT once via auth_request against the gateway, and forwards identity as
# X-User-* headers (the contract attachNginxAuth expects).
#
# Unprivileged base: listens on 8080, non-root, temp files in /tmp — required
# by the platform's PSA `restricted` policy.
FROM node:20-alpine AS frontend-build

RUN npm install -g pnpm@10.12.1
WORKDIR /app

COPY pnpm-workspace.yaml package.json pnpm-lock.yaml tsconfig.json tsconfig.base.json nx.json ./
COPY apps/packages/ ./apps/packages/
COPY apps/frontend/ ./apps/frontend/

RUN pnpm install --frozen-lockfile

# Same-origin API: the router serves both the SPA and /api/v1 on this host.
ENV VITE_API_BASE_URL=https://navratna.tardis.local
ENV NODE_ENV=production
RUN pnpm nx run-many -t build --projects=@uaip/types,@uaip/contracts \
 && pnpm nx run @council/frontend:build

FROM nginxinc/nginx-unprivileged:1.27-alpine

COPY deploy/tardis/router/nginx.conf /etc/nginx/conf.d/default.conf
COPY deploy/tardis/router/proxy_common.conf /etc/nginx/proxy_common.conf
COPY --chmod=755 deploy/tardis/router/05-render-edge-secret.sh /docker-entrypoint.d/05-render-edge-secret.sh
COPY --from=frontend-build /app/apps/frontend/dist /usr/share/nginx/html
