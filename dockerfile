# Build stage
FROM node:18-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy source code
COPY . .

# Build the NestJS app
RUN npm run build

# Production stage
FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install only production dependencies
RUN npm install --only=production

# Copy built app from builder stage
COPY --from=builder /app/dist ./dist

# Expose port (change 3000 if your app runs on different port)
EXPOSE 3000

# Start the app
CMD ["node", "dist/main"]
