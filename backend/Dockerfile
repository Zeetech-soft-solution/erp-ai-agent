FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
# Python analytics engine (analytics/*.py, run as a child process)
RUN apk add --no-cache python3 py3-pandas py3-numpy
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
COPY knowledge ./knowledge
COPY analytics ./analytics
EXPOSE 4000
CMD ["node", "dist/server.js"]
