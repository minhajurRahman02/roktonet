# A DEV-mode Dockerfile -- runs Vite's dev server (hot reload, source maps,
# etc.), not a production build. That's appropriate here since this
# container is for local development, matching how you already run
# "npm run dev" today.

FROM node:20-slim

WORKDIR /app

COPY package*.json ./
RUN npm ci

# In practice, docker-compose.yml (D5) bind-mounts your actual frontend
# folder over this at container-start time, so live edits show up
# immediately -- this COPY mainly matters for node_modules to exist at
# build time. Details in D5's comments.
COPY . .

EXPOSE 5173

CMD ["npm", "run", "dev"]
