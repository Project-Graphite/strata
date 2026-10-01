FROM node:26-alpine AS manifests

WORKDIR /app
COPY package.json package-lock.json ./
COPY server/package.json ./server/
COPY frontend/package.json ./frontend/

FROM manifests AS development
RUN npm ci
COPY . .

FROM development AS build
RUN npm run build

FROM manifests AS production-dependencies
RUN npm ci --omit=dev

FROM node:26-alpine AS server

ENV NODE_ENV=production
WORKDIR /app
COPY --from=production-dependencies /app/node_modules ./node_modules
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=build /app/server/dist ./server/dist
COPY --from=build /app/frontend/dist ./frontend/dist
COPY package.json ./
COPY server/package.json ./server/
COPY server/prisma.config.ts ./server/
COPY server/prisma ./server/prisma
USER node
EXPOSE 3000
CMD ["sh", "-c", "npm run prisma:migrate:deploy && exec node server/dist/main.js"]
