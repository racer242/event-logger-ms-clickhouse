# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Устанавливаем Python и build tools для better-sqlite3
RUN apk add --no-cache python3 make g++

COPY package*.json ./
RUN npm install

COPY . .
RUN npm run build

# Production stage
FROM node:20-alpine

WORKDIR /app

# Устанавливаем runtime зависимости для better-sqlite3
RUN apk add --no-cache libc6-compat

COPY package*.json ./
RUN npm install --omit=dev

COPY --from=builder /app/dist ./dist

EXPOSE 3000

CMD ["node", "dist/main.js"]
