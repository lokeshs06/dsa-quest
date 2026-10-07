# One image for the whole app: Express serves the API, the WebSockets and the built React client.
#   docker build -t dsa-quest .
#   docker run -p 5000:5000 --env-file server/.env dsa-quest
# Works on Railway, Fly.io, Koyeb, Render (Docker runtime) or any VPS.

# ---- 1. build the client
FROM node:22-alpine AS client
WORKDIR /app/client
COPY client/package.json client/package-lock.json ./
RUN npm ci
COPY client/ ./
# Only for split hosting (client somewhere else). Leave empty when this image serves the client itself.
ARG VITE_API_URL=
ENV VITE_API_URL=$VITE_API_URL
RUN npm run build

# ---- 2. the server, production dependencies only
FROM node:22-alpine
WORKDIR /app/server
COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY server/src ./src
COPY --from=client /app/client/dist /app/client/dist

ENV NODE_ENV=production
ENV PORT=5000
EXPOSE 5000
USER node
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD wget -qO- "http://127.0.0.1:${PORT}/api/health" || exit 1
CMD ["node", "src/index.js"]
