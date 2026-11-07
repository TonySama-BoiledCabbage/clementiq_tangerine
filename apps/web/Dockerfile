# ClementIQ web (Next.js standalone). Build context: repository root.
FROM node:22-alpine AS deps
WORKDIR /repo
COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/
COPY packages/shared-types/package.json packages/shared-types/
RUN npm ci --no-audit --no-fund

FROM node:22-alpine AS build
WORKDIR /repo
ENV NEXT_TELEMETRY_DISABLED=1
ARG NEXT_PUBLIC_SHOW_DEMO_CODES=false
ARG NEXT_PUBLIC_SOLANA_DEVNET_RPC=https://api.devnet.solana.com
ENV NEXT_PUBLIC_SHOW_DEMO_CODES=$NEXT_PUBLIC_SHOW_DEMO_CODES NEXT_PUBLIC_SOLANA_DEVNET_RPC=$NEXT_PUBLIC_SOLANA_DEVNET_RPC
COPY --from=deps /repo/node_modules ./node_modules
COPY package.json package-lock.json ./
COPY packages ./packages
COPY apps/web ./apps/web
RUN npm --workspace apps/web run build

FROM node:22-alpine AS run
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
RUN addgroup -S app && adduser -S app -G app
COPY --from=build /repo/apps/web/.next/standalone ./
COPY --from=build /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=build /repo/apps/web/public ./apps/web/public
USER app
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s CMD wget -qO- http://127.0.0.1:3000/login >/dev/null || exit 1
CMD ["node", "apps/web/server.js"]
