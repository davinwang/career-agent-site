# --- Build stage -------------------------------------------------------------
FROM node:22-alpine AS build
WORKDIR /app
COPY frontend/recruiter/package.json frontend/recruiter/package-lock.json* ./
RUN npm ci || npm install
COPY frontend/recruiter/ ./
RUN npm run build

# --- Serve stage -------------------------------------------------------------
FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
# Replace the stock site config so client-side routes fall back to index.html.
COPY deploy/nginx/spa.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
