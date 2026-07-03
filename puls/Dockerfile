# Static hosting for the rPPG web app. Everything runs client-side, so the
# server just ships the files. Put an HTTPS reverse proxy (Caddy, Traefik,
# nginx, or your platform's TLS) in front so the browser grants camera access.
FROM nginx:alpine

COPY index.html /usr/share/nginx/html/
COPY css/       /usr/share/nginx/html/css/
COPY js/        /usr/share/nginx/html/js/

EXPOSE 80
# nginx:alpine already serves .wasm/.js with correct MIME types by default.
