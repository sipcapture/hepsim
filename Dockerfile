FROM oven/bun:1.2.23

WORKDIR /app

# Copy only manifest files first to optimize caching
COPY package.json bun.lockb* ./
RUN bun install --frozen-lockfile

# Copy the rest of the project files
COPY . .

# Compile the Bun project into a binary
RUN bun build ./index.js --compile --outfile /app/hepsim

# Change user
USER bun

# Use the compiled binary as the entrypoint
ENTRYPOINT ["/app/hepsim"]
