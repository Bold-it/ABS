# Stage 1: Build the Next.js Dashboard
FROM node:20-alpine AS dashboard-builder
WORKDIR /app/dashboard
COPY dashboard/package*.json ./
RUN npm install
COPY dashboard/ ./
# Build the static export
RUN npm run build

# Stage 2: Build the NestJS Backend
FROM node:20-alpine AS backend-builder
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
# Copy the static export from dashboard so NestJS can serve it
COPY --from=dashboard-builder /app/dashboard/out ./dashboard/out
RUN npm run build

# Stage 3: Production Server
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --only=production
COPY --from=backend-builder /app/dist ./dist
COPY --from=backend-builder /app/dashboard/out ./dashboard/out

EXPOSE 3000
CMD ["npm", "run", "start:prod"]
