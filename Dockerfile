# Works on any container host with WebSocket support (Fly.io, Railway, Google Cloud Run, a VPS…)
FROM node:20-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm install --omit=dev && npm cache clean --force
COPY public ./public
COPY server ./server
ENV NODE_ENV=production PORT=8080
EXPOSE 8080
USER node
CMD ["node", "server/index.js"]
