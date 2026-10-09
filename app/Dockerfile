# syntax=docker/dockerfile:1

# Reference: https://pnpm.io/docker

ARG NODE_VERSION=22

################################################################################
FROM node:${NODE_VERSION} AS base

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

COPY . /app
WORKDIR /app

FROM base AS prod-deps

RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --prod --frozen-lockfile

FROM base AS build

# Ensure mock credentials and config exist for TypeScript compilation if missing
RUN if [ ! -f /app/service-account.json ]; then cp /app/service-account.example.json /app/service-account.json; fi
RUN if [ ! -f /app/config.json ]; then cp /app/config.example.json /app/config.json; fi

RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile
RUN pnpm run build

FROM base

COPY --from=prod-deps /app/node_modules /app/node_modules
COPY --from=build /app/build /app/build
EXPOSE 3001
CMD [ "pnpm", "start" ]
