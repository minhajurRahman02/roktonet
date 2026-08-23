# Dockerfile -- blueprint for building the optimization engine's image.
# Each instruction below adds one "layer" to the image. Docker caches
# layers, so if requirements.txt hasn't changed, the pip install step is
# skipped on rebuilds -- that's WHY requirements.txt is copied and
# installed BEFORE the rest of the code, not after.

# Start from an official, lightweight Python base image. "slim" is a
# smaller variant than the default (fewer preinstalled OS packages),
# which means faster downloads and a smaller final image.
FROM python:3.11-slim

# All following instructions run relative to this folder INSIDE the
# container (a fresh filesystem, unrelated to your PC's folders).
WORKDIR /app

# Copy ONLY requirements.txt first (not the whole project yet).
COPY requirements.txt .

# Install dependencies inside the container. --no-cache-dir keeps the
# image smaller by not keeping pip's download cache afterward.
RUN pip install --no-cache-dir -r requirements.txt

# NOW copy the rest of the engine's code. This happens after pip install
# specifically so that editing engine.py later doesn't force Docker to
# redo the (slower) dependency install step -- only this copy layer and
# anything after it gets rebuilt.
COPY . .

# Documents which port the app listens on. This is informational for
# humans/tools reading the Dockerfile -- it does NOT actually publish the
# port to your PC. That happens in docker-compose.yml (D5).
EXPOSE 5001

# The command that runs when a container starts from this image.
# app.py already reads the PORT environment variable (from our Render
# deployment work), defaulting to 5001 if unset -- same code, no changes
# needed for Docker.
CMD ["python", "app.py"]
