# ---- build ----
FROM node:20-bookworm AS build
WORKDIR /app
COPY package*.json ./
# Install all deps (including dev) to build and generate prisma client
RUN npm ci
# Copy Prisma schema early to run generate before copying rest (cache-friendly)
COPY prisma ./prisma
RUN npx prisma generate
# Copy rest of the server source
COPY . .
RUN npm run build
# Remove dev deps, keep runtime + generated prisma client
RUN npm prune --omit=dev

# ---- runtime ----
FROM node:20-bookworm
ENV NODE_ENV=production
# Add a non-root user
RUN useradd -m nodeuser
WORKDIR /app
# Copy node_modules with generated Prisma client from build
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/package*.json ./
USER nodeuser
EXPOSE 4000
CMD ["node", "dist/index.js"]
