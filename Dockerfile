FROM oven/bun:1.2.23

WORKDIR /app

# Copy only manifest files first to optimize caching
COPY package.json bun.lockb* ./
RUN bun install --frozen-lockfile

# Now copy the rest of your project files
COPY . .

USER bun
ENTRYPOINT ["bun", "run", "index.js"]
