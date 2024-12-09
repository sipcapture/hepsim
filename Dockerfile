FROM oven/bun:1.1 AS base
WORKDIR /app

FROM base AS install
RUN mkdir -p /tmp/prod
COPY . /tmp/prod/
RUN cd /tmp/prod && bun install 

FROM base AS release
COPY --from=install /tmp/prod/node_modules ./node_modules
COPY . .

USER bun
ENTRYPOINT ["bun", "run", "index.js"]