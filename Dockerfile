# syntax=docker/dockerfile:1
ARG BINARY_SOURCE=build
FROM oven/bun:1.3.13 AS build
WORKDIR /src
COPY package.json ./
RUN bun install --linker hoisted
COPY . .
RUN bun run build && bun run compile

# CI reuses the already-tested compiled binary.
FROM scratch AS prebuilt
COPY dist/homeserver-fan-control /src/dist/homeserver-fan-control

FROM ${BINARY_SOURCE} AS artifact
FROM debian:bookworm-slim AS runtime
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates ipmitool && rm -rf /var/lib/apt/lists/* \
 && groupadd -g 10001 hsfc && useradd -u 10001 -g 10001 -M -s /usr/sbin/nologin hsfc \
 && install -d -m 0700 -o 10001 -g 10001 /data
COPY --from=artifact /src/dist/homeserver-fan-control /usr/local/bin/homeserver-fan-control
USER 10001:10001
ENV HSFC_DATA_DIR=/data NITRO_HOST=0.0.0.0 NITRO_PORT=3000
EXPOSE 3000
VOLUME ["/data"]
ENTRYPOINT ["/usr/local/bin/homeserver-fan-control"]
