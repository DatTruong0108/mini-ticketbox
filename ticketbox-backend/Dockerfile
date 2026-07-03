# Stage 1: Build source code
FROM node:20-alpine AS builder
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY prisma ./prisma/
COPY prisma.config.ts ./
RUN npx prisma generate

COPY . .
RUN npm run build

# Stage 2: Production Runner
FROM node:20-alpine AS runner
WORKDIR /app

# Copy package files and install production dependencies only
COPY package*.json ./
RUN npm ci --omit=dev

# Copy Prisma schema, config, and re-generate the lightweight client
COPY prisma ./prisma/
COPY prisma.config.ts ./
# prisma CLI is a devDependency, so use npx to invoke it
RUN npx prisma generate

# Copy the compiled NestJS application from the builder stage
COPY --from=builder /app/dist ./dist

EXPOSE 3001

# Run database migration/sync and start the production server
CMD ["sh", "-c", "npx prisma db push && node dist/src/main"]