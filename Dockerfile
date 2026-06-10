FROM node:22-slim

WORKDIR /app

# Install production dependencies first (better layer caching).
COPY package*.json ./
RUN npm install --omit=dev

# App source.
COPY . .

# Persisted data + uploads (mount volumes here in production).
RUN mkdir -p data uploads
VOLUME ["/app/data", "/app/uploads"]

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

CMD ["node", "server.js"]
