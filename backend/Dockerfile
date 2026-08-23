# Same layering idea as the Python engine's Dockerfile, adapted for Node.

# "slim" (Debian-based), not "alpine" -- deliberately consistent with why
# we chose bcryptjs over native bcrypt earlier: Alpine uses a different
# underlying C library (musl instead of glibc), which occasionally causes
# native-module compatibility headaches. Slim avoids that entire class of
# problem, at the cost of a slightly larger image.
FROM node:20-slim

WORKDIR /app

# Copy ONLY the two package files first (package.json AND package-lock.json
# -- the "*" glob matches both). Same caching reason as requirements.txt in
# the engine's Dockerfile: this layer only gets rebuilt when your actual
# dependencies change, not on every code edit.
COPY package*.json ./

# "npm ci" (not "npm install") -- installs EXACTLY what's in
# package-lock.json, nothing more, nothing resolved differently. This is
# the standard choice for reproducible builds; "npm install" can
# technically update lockfile entries, which you don't want happening
# silently inside a container build.
RUN npm ci --omit=dev

COPY . .

EXPOSE 3000

CMD ["npm", "start"]
