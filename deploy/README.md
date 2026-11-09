# Despliegue bajo /cursos_virtuales_mooc/

La carpeta física puede ser `/var/www/html/cursos_virtuales_mooc`. No se incluye esa ruta del disco en las URLs del navegador. La dirección pública será `https://tu-dominio.com/cursos_virtuales_mooc/`.

## Compilar

Desde la raíz del repositorio, con las dependencias instaladas:

```bash
npm --prefix frontend run build:deploy
npm --prefix backend run build
```

El nombre público se define en `frontend/angular.json`, configuración `subpath.baseHref`. Debe empezar y terminar con `/`. `npm start` y `npm run build` conservan el despliegue en la raíz; `build:deploy` aplica el prefijo. No se cambia cada ruta del router.

## Backend

Revisa también [la configuración y los pendientes de seguridad](SECURITY.md) antes de publicar.

Configura `backend/.env` con las credenciales reales y estas variables de ejemplo:

```dotenv
PORT=3000
NODE_ENV=production
TRUSTED_PROXIES=loopback
APP_URL=https://tu-dominio.com/cursos_virtuales_mooc
CORS_ORIGINS=https://tu-dominio.com
UPLOADS_DIR=/var/lib/cursos_virtuales_mooc/uploads
```

`APP_URL` incluye el prefijo, sin barra final; `CORS_ORIGINS` contiene solo los orígenes (protocolo y dominio, sin rutas), separados por comas. Conserva los archivos existentes al configurar `UPLOADS_DIR` y da permisos al proceso del backend. Configura también PostgreSQL, JWT, correo y POK según `backend/.env.example`; aplica las migraciones de Prisma que correspondan antes de arrancar.

Desde `backend/`, ejecuta `npm run start:prod` mediante el gestor de procesos del servidor.

## Frontend SSR y servidor web

Desde `frontend/`, inicia el servidor compilado con estas variables (sintaxis de Linux):

```bash
APP_BASE_PATH=/cursos_virtuales_mooc NG_ALLOWED_HOSTS=tu-dominio.com PORT=4000 npm run serve:ssr:frontend
```

`APP_BASE_PATH` debe coincidir con la base usada al compilar; puede llevar barra final. `NG_ALLOWED_HOSTS` autoriza el dominio público en Angular SSR (sin protocolo ni ruta; varios dominios se separan por comas). Mantén los procesos con un gestor como systemd. Angular requiere el contenido completo de `dist/frontend/`, incluyendo `browser/` y `server/`.

Incluye las ubicaciones de [nginx.conf.example](nginx.conf.example) dentro del bloque `server` de tu dominio, junto con tu configuración HTTPS. Los puertos de Node deben quedar accesibles solo desde el servidor/proxy. Nginx envía `/cursos_virtuales_mooc/api/auth/login` a Nest como `/auth/login`; Nest no necesita un prefijo adicional.

Las URLs `/api/uploads/...` almacenadas siguen siendo válidas: la interfaz aplica la base al mostrarlas o solicitarlas, sin modificar los datos guardados. El mismo mecanismo cubre las fuentes y las imágenes propias; los enlaces externos se conservan.

Si cambias el nombre público, actualiza `subpath.baseHref`, `APP_BASE_PATH`, `APP_URL` y las ubicaciones del proxy, y vuelve a compilar. Actualiza también la URL externa del webhook de POK si lo utilizas.

## Comprobación en el servidor

Abre `/cursos_virtuales_mooc/` y `/cursos_virtuales_mooc/login` directamente y recarga. Verifica el inicio de sesión, una imagen subida, un video, una descarga y el enlace de verificación de un certificado. En la pestaña Red, las peticiones propias deben empezar por `/cursos_virtuales_mooc/` y las peticiones de API por `/cursos_virtuales_mooc/api/`.
