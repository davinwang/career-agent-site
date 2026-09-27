# --- Build stage -------------------------------------------------------------
FROM node:22-alpine AS build
WORKDIR /app
COPY frontend/admin/package.json frontend/admin/package-lock.json* ./
RUN npm ci || npm install
COPY frontend/admin/ ./
# The admin app is built with base '/admin/', so its assets are prefixed and the
# outer nginx strips the /admin/ prefix before proxying to this container.
RUN npm run build

# --- Serve stage -------------------------------------------------------------
FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
# Replace the stock site config so client-side routes fall back to index.html.
COPY deploy/nginx/spa.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
