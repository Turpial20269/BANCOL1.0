# Dockerfile para aplicación Express.js con Telegram Bot
FROM node:18-alpine

# Instalar dependencias del sistema necesarias para fetch
RUN apk add --no-cache \
    ca-certificates \
    tzdata

# Establecer zona horaria para Colombia
ENV TZ=America/Bogota

# Crear directorio de trabajo
WORKDIR /app

# Copiar archivos de dependencias primero (para mejor cache de Docker)
COPY package*.json ./

# Instalar dependencias (con npm ci si existe package-lock.json, sino npm install)
RUN if [ -f package-lock.json ]; then \
        npm ci --omit=dev && npm cache clean --force; \
    else \
        npm install --omit=dev && npm cache clean --force; \
    fi

# Copiar código fuente
COPY . .

# Crear directorio public si no existe
RUN mkdir -p public

# Mover archivos HTML a la carpeta public si están en la raíz
RUN if [ -f index.html ]; then mv *.html public/ 2>/dev/null || true; fi

# Crear usuario no-root para seguridad
RUN addgroup -g 1001 -S appgroup && \
    adduser -S appuser -u 1001 -G appgroup

# Cambiar propietario de archivos
RUN chown -R appuser:appgroup /app

# Cambiar al usuario no-root
USER appuser

# Exponer puerto
EXPOSE 3000

# Variables de entorno
ENV NODE_ENV=production
ENV PORT=3000

# Healthcheck para Render
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD node -e "const http=require('http');http.get('http://localhost:3000',(r)=>{process.exit(r.statusCode===200?0:1)})"

# Comando para ejecutar la aplicación
CMD ["node", "server.js"]
