#!/usr/bin/env bash
#
# Despliegue de la Plataforma de Cursos (NestJS + Angular) en producción.
#
# Uso:
#   ./deploy/deploy.sh              Despliegue completo (respaldo + pull + build + publicar)
#   ./deploy/deploy.sh --no-backup  Igual, pero sin respaldar (no recomendado)
#   ./deploy/deploy.sh --rollback   Restaura el frontend del último respaldo
#   ./deploy/deploy.sh --rollback /root/backups/2026-11-09-213000
#
# Requiere: root, git, node (en /opt/node24/bin), rsync, pg_dump, curl.
#
set -Eeuo pipefail

# ---------------------------------------------------------------------------
# Configuración (ajustar aquí si cambian rutas o nombres)
# ---------------------------------------------------------------------------
REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND_DIR="$REPO_DIR/backend"
FRONTEND_DIR="$REPO_DIR/frontend"

WEB_ROOT="/var/www/html/cursos_virtuales_mooc"
UPLOADS_DIR="/var/lib/cursos_mooc/uploads"
SERVICE="cursos-mooc-api"
NODE_BIN="/opt/node24/bin"
BASE_HREF="/cursos_virtuales_mooc/"
BACKUP_ROOT="/root/backups"
KEEP_BACKUPS=5
LOCK_FILE="/var/lock/cursos-mooc-deploy.lock"
LOG_DIR="/var/log"
STATE_DIR="/var/lib/cursos-mooc-deploy"

# ---------------------------------------------------------------------------
# Utilidades
# ---------------------------------------------------------------------------
log()  { printf '\n\033[1;34m==> %s\033[0m\n' "$*"; }
ok()   { printf '\033[1;32m  OK  %s\033[0m\n' "$*"; }
warn() { printf '\033[1;33m  !!  %s\033[0m\n' "$*"; }
die()  { printf '\033[1;31m  XX  %s\033[0m\n' "$*" >&2; exit 1; }

trap 'printf "\n\033[1;31mFalló el despliegue en la línea %s\033[0m\n" "$LINENO" >&2' ERR

usage() {
  sed -n '2,12p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
  exit 0
}

# Instala dependencias solo si package.json / package-lock.json cambiaron
# (o si node_modules no existe). Evita borrar node_modules en cada despliegue.
ensure_deps() {
  local dir="$1" state="$2"
  shift 2

  local hash
  hash="$(cat "$dir/package.json" "$dir/package-lock.json" 2>/dev/null | sha256sum | cut -d' ' -f1)"

  if [[ -d "$dir/node_modules" && -f "$state" && "$(cat "$state")" == "$hash" ]]; then
    ok "Dependencias de $(basename "$dir") sin cambios; se omite npm ci"
    return 0
  fi

  ( cd "$dir" && npm ci "$@" )
  printf '%s\n' "$hash" > "$state"
}

[[ "${1:-}" == "-h" || "${1:-}" == "--help" ]] && usage

# ---------------------------------------------------------------------------
# Modo rollback
# ---------------------------------------------------------------------------
if [[ "${1:-}" == "--rollback" ]]; then
  [[ $EUID -eq 0 ]] || die "Ejecuta como root."

  BK="${2:-$(cat "$BACKUP_ROOT/LAST" 2>/dev/null || true)}"
  [[ -n "${BK:-}" && -f "$BK/frontend.tar.gz" ]] || die "No encuentro respaldo de frontend. Indica la carpeta: $0 --rollback /root/backups/FECHA"

  log "Restaurando frontend desde $BK"
  rm -rf "$WEB_ROOT"
  tar xzf "$BK/frontend.tar.gz" -C "$(dirname "$WEB_ROOT")"
  chown -R root:root "$WEB_ROOT"
  find "$WEB_ROOT" -type d -exec chmod 755 {} +
  find "$WEB_ROOT" -type f -exec chmod 644 {} +
  ok "Frontend restaurado"

  if [[ -f "$BK/db_plataforma_cursos.dump" ]]; then
    DBURL="$(grep -E '^DATABASE_URL=' "$BACKEND_DIR/.env" | cut -d= -f2- | tr -d '"' | sed 's/?.*$//')"
    warn "Si la migración causó el problema, restaura la base con:"
    printf '\n  pg_restore --clean --if-exists -d "%s" "%s"\n\n' "$DBURL" "$BK/db_plataforma_cursos.dump"
  fi
  warn "El código del backend sigue en el commit actual. Para volver atrás:"
  printf '  cd %s && git log --oneline -5 && git checkout <commit> && cd backend && npm ci --include=dev && npm run build && systemctl restart %s\n\n' "$REPO_DIR" "$SERVICE"
  exit 0
fi

SKIP_BACKUP=0
[[ "${1:-}" == "--no-backup" ]] && SKIP_BACKUP=1

# ---------------------------------------------------------------------------
# Pre-flight
# ---------------------------------------------------------------------------
[[ $EUID -eq 0 ]] || die "Ejecuta como root (necesita systemctl, chown y /var/www)."

for cmd in git rsync pg_dump curl find; do
  command -v "$cmd" >/dev/null 2>&1 || die "Falta el comando: $cmd"
done

[[ -x "$NODE_BIN/node" ]] || die "No existe $NODE_BIN/node"
export PATH="$NODE_BIN:$PATH"

[[ -f "$BACKEND_DIR/.env" ]] || die "No existe $BACKEND_DIR/.env"
[[ -d "$FRONTEND_DIR" ]] || die "No existe $FRONTEND_DIR"

mkdir -p "$BACKUP_ROOT" "$LOG_DIR" "$STATE_DIR"
LOG_FILE="$LOG_DIR/cursos-mooc-deploy-$(date +%F-%H%M%S).log"
exec > >(tee -a "$LOG_FILE") 2>&1
log "Log: $LOG_FILE"

exec 9>"$LOCK_FILE"
flock -n 9 || die "Ya hay un despliegue en curso (lock: $LOCK_FILE)."

cd "$REPO_DIR"

if [[ -n "$(git status --porcelain --untracked-files=no)" ]]; then
  git status --short
  die "Hay cambios locales sin commitear en el servidor. Resuélvelos antes de desplegar."
fi

PORT="$(grep -E '^PORT=' "$BACKEND_DIR/.env" | cut -d= -f2- | tr -d '"' | tr -d '[:space:]')"
APP_URL="$(grep -E '^APP_URL=' "$BACKEND_DIR/.env" | cut -d= -f2- | tr -d '"' | tr -d '[:space:]')"
[[ -n "$PORT" ]] || die "No pude leer PORT del .env"
[[ -n "$APP_URL" ]] || die "No pude leer APP_URL del .env"

APP_HOST="$(printf '%s' "$APP_URL" | sed -E 's#^https?://##; s#/.*$##')"
APP_PATH="$(printf '%s' "$APP_URL" | sed -E 's#^https?://[^/]+##')"
[[ -n "$APP_HOST" ]] || die "No pude interpretar APP_URL: $APP_URL"

log "Repositorio: $REPO_DIR"
log "Rama: $(git branch --show-current) | commit: $(git log --oneline -1)"
log "API: http://127.0.0.1:$PORT | Público: $APP_URL"

# ---------------------------------------------------------------------------
# 1. Respaldo
# ---------------------------------------------------------------------------
BK="$BACKUP_ROOT/$(date +%F-%H%M%S)"

backup() {
  mkdir -p "$BK"

  DBURL="$(grep -E '^DATABASE_URL=' "$BACKEND_DIR/.env" | cut -d= -f2- | tr -d '"' | sed 's/?.*$//')"
  pg_dump "$DBURL" -Fc -f "$BK/db_plataforma_cursos.dump"
  ok "Base de datos respaldada"

  if [[ -d "$UPLOADS_DIR" ]]; then
    tar czf "$BK/uploads.tar.gz" -C "$(dirname "$UPLOADS_DIR")" "$(basename "$UPLOADS_DIR")"
    ok "Uploads respaldados"
  else
    warn "No existe $UPLOADS_DIR; se omite"
  fi

  if [[ -d "$WEB_ROOT" ]]; then
    tar czf "$BK/frontend.tar.gz" -C "$(dirname "$WEB_ROOT")" "$(basename "$WEB_ROOT")"
    ok "Frontend actual respaldado"
  fi

  printf '%s\n' "$BK" > "$BACKUP_ROOT/LAST"

  # Conservar solo los últimos N respaldos
  find "$BACKUP_ROOT" -maxdepth 1 -type d -name '20*' -printf '%T@ %p\n' \
    | sort -rn | tail -n +$((KEEP_BACKUPS + 1)) | cut -d' ' -f2- \
    | xargs -r rm -rf
  ok "Respaldo en $BK (se conservan los últimos $KEEP_BACKUPS)"
}

if [[ $SKIP_BACKUP -eq 1 ]]; then
  warn "Respaldo omitido por --no-backup"
else
  log "1/8 Respaldo"
  backup
fi

# ---------------------------------------------------------------------------
# 2. Traer cambios
# ---------------------------------------------------------------------------
log "2/8 git pull"
git fetch --prune
git pull --ff-only
ok "Commit actual: $(git log --oneline -1)"

# ---------------------------------------------------------------------------
# 3. Backend: dependencias + migraciones + build
# ---------------------------------------------------------------------------
log "3/8 Backend: dependencias"
ensure_deps "$BACKEND_DIR" "$STATE_DIR/backend.deps" --include=dev
ok "Dependencias del backend listas"

log "4/8 Backend: migraciones"
(cd "$BACKEND_DIR" && npx prisma migrate deploy)
ok "Migraciones aplicadas"

log "5/8 Backend: build"
(cd "$BACKEND_DIR" && npm run build)
[[ -f "$BACKEND_DIR/dist/main.js" ]] || die "El build no generó dist/main.js"
ok "Backend compilado"

# ---------------------------------------------------------------------------
# 4. Frontend: dependencias + build
# ---------------------------------------------------------------------------
log "6/8 Frontend: dependencias + build"
ensure_deps "$FRONTEND_DIR" "$STATE_DIR/frontend.deps"
(cd "$FRONTEND_DIR" && npm run build:deploy)

INDEX_HTML="$FRONTEND_DIR/dist/frontend/browser/index.html"
[[ -f "$INDEX_HTML" ]] || die "El build no generó $INDEX_HTML"

if ! grep -q "base href=\"$BASE_HREF\"" "$INDEX_HTML"; then
  die "El index compilado no tiene base href $BASE_HREF. Revisa frontend/angular.json (configuración subpath)."
fi
ok "Frontend compilado con base href $BASE_HREF"

# ---------------------------------------------------------------------------
# 5. Reiniciar API y esperar a que responda
# ---------------------------------------------------------------------------
log "7/8 Reiniciando $SERVICE"
systemctl restart "$SERVICE"

healthy=0
for _ in $(seq 1 40); do
  if curl -fsS "http://127.0.0.1:$PORT/courses" >/dev/null 2>&1; then
    healthy=1
    break
  fi
  sleep 1
done

if [[ $healthy -ne 1 ]]; then
  systemctl status "$SERVICE" --no-pager | head -20 || true
  journalctl -u "$SERVICE" -n 30 --no-pager || true
  die "El API no respondió en 40s. NO se publicó el frontend. Revisa el journal."
fi
ok "API activa en 127.0.0.1:$PORT"

# ---------------------------------------------------------------------------
# 6. Publicar frontend
# ---------------------------------------------------------------------------
log "8/8 Publicando frontend"
rsync -a --delete "$FRONTEND_DIR/dist/frontend/browser/" "$WEB_ROOT/"
chown -R root:root "$WEB_ROOT"
find "$WEB_ROOT" -type d -exec chmod 755 {} +
find "$WEB_ROOT" -type f -exec chmod 644 {} +
ok "Frontend publicado en $WEB_ROOT"

# ---------------------------------------------------------------------------
# 7. Verificación (con rollback automático del frontend si falla)
# ---------------------------------------------------------------------------
log "Verificación"

# Consulta Apache en local con el Host correcto (no depende de DNS/hairpin).
fetch_local() {
  curl -fsk -H "Host: $APP_HOST" "https://127.0.0.1${APP_PATH}$1"
}

verify() {
  local base_home base_route api
  base_home="$(fetch_local "/" | grep -o '<base[^>]*>' | head -1 || true)"
  [[ "$base_home" == *"$BASE_HREF"* ]] || { warn "base href en / incorrecto: ${base_home:-<vacío>}"; return 1; }

  base_route="$(fetch_local "/courses" | grep -o '<base[^>]*>' | head -1 || true)"
  [[ "$base_route" == *"$BASE_HREF"* ]] || { warn "base href en /courses incorrecto: ${base_route:-<vacío>}"; return 1; }

  api="$(fetch_local "/api/courses" || true)"
  [[ "$api" == *'"data"'* ]] || { warn "El API no devolvió JSON: ${api:0:120}"; return 1; }

  ok "Home: $base_home"
  ok "Ruta interna: $base_route"
  ok "API: JSON correcto"
}

if ! verify; then
  warn "Verificación fallida: restaurando el frontend anterior"
  if [[ -f "$BK/frontend.tar.gz" ]]; then
    rm -rf "$WEB_ROOT"
    tar xzf "$BK/frontend.tar.gz" -C "$(dirname "$WEB_ROOT")"
    chown -R root:root "$WEB_ROOT"
    ok "Frontend anterior restaurado"
  fi
  die "Despliegue revertido. El backend quedó en el commit nuevo; revisa el journal si el problema es del API."
fi

# Comprobación externa (solo avisa: puede fallar por DNS/hairpin en el servidor)
if ! curl -fsS "$APP_URL/api/courses" 2>/dev/null | grep -q '"data"'; then
  warn "La verificación externa falló. Comprueba desde tu equipo: $APP_URL/api/courses"
else
  ok "Verificación externa correcta"
fi

log "Despliegue completado"
printf '\n  Commit:  %s\n  Respaldo: %s\n  Log:      %s\n\n' \
  "$(git log --oneline -1)" "$BK" "$LOG_FILE"
printf '  Servicio: systemctl status %s\n  Logs:     journalctl -u %s -f\n\n' "$SERVICE" "$SERVICE"
