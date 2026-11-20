# ---------- 1. Build TypeScript ----------
FROM node:26-alpine AS build
WORKDIR /app
RUN apk add --no-cache openssl

COPY package.json package-lock.json ./
COPY prisma ./prisma/
RUN npm install
RUN npx prisma generate
COPY . .
COPY .env.example .env

EXPOSE 4001

# Copy the entrypoint script
COPY entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh
RUN mkdir -p /var/lib/mysql
RUN chmod -R 0755 /var/lib/mysql 
# Use the entrypoint script to start the application
ENTRYPOINT ["/app/entrypoint.sh"]