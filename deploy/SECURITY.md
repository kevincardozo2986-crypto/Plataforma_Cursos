# Seguridad antes del despliegue universitario

Esta revisión refuerza autenticación, validación y configuración; no certifica ausencia de vulnerabilidades ni sustituye una auditoría del despliegue real.

## Protecciones verificadas en el código

- Login con consultas estructuradas de Prisma: correo/documento se pasan como valores, no se concatenan a SQL. Los SQL crudos encontrados usan plantillas parametrizadas de Prisma.
- DTOs con tipos y longitudes, lista de campos permitidos y rechazo de campos extra, incluyendo `role` en el registro público.
- Bcrypt con costo 12 y comparación ficticia cuando no existe la cuenta. Cuenta inactiva y credenciales incorrectas producen el mismo mensaje de login.
- JWT HS256 con caducidad, emisor y audiencia explícitos; el backend vuelve a consultar el usuario, estado, rol y versión de sesión. El cambio de contraseña desde el perfil ahora incrementa la versión e invalida los tokens anteriores, igual que la recuperación.
- Límites por IP antes del login (30/15 minutos), registro (10/hora) y cambios de contraseña (15/15 minutos). La recuperación conserva su límite propio.
- Helmet en la API, ausencia de `X-Powered-By`, respuestas autenticadas sin caché, límite JSON de 1 MB y rechazo de cuerpos comprimidos. Se conserva el cuerpo crudo del webhook POK para verificar su firma.
- Cabeceras de seguridad en el servidor SSR. La CSP limita bases, objetos, formularios y quién puede incrustar la plataforma; todavía no restringe la ejecución de todos los scripts.
- El interceptor Angular adjunta el token solo a rutas propias de la API.
- El checkout de tarjetas actual es una simulación. En producción se rechaza antes de registrar pagos o inscripciones; debe reemplazarse por una pasarela real con confirmación verificable del servidor antes de cobrar cursos.

Las pruebas de seguridad cubren cadenas SQL y JavaScript como credenciales, objetos en lugar de strings, campos adicionales, límites de longitud, fuerza bruta, tokens alterados/expirados/de otra aplicación y revocación de sesión. Las pruebas de login usan una base de datos simulada; no son un pentest contra PostgreSQL ni contra el servidor público.

## Configuración requerida en producción

1. Configurar `NODE_ENV=production`, `APP_URL=https://DOMINIO/cursos-virtuales`, `CORS_ORIGINS=https://DOMINIO` y un `JWT_SECRET` aleatorio de al menos 32 bytes. Para generar un secreto: `node -e "console.log(require('node:crypto').randomBytes(48).toString('base64url'))"`. No pegarlo en el repositorio. El arranque rechaza secretos cortos/de ejemplo, APP_URL sin HTTPS y CORS abierto o con rutas.
2. Terminar TLS en el proxy institucional. Mantener API y SSR inaccesibles desde Internet salvo por el proxy. Con Nginx local, configurar `TRUSTED_PROXIES=loopback`; en otra topología, solo las IPs/CIDRs reales del proxy. Este debe sobrescribir los encabezados de origen y evitar que un cliente falsifique su IP. Probar desde dos clientes que los límites distingan sus direcciones.
3. Los límites de Express y recuperación están en memoria por proceso. Para varias réplicas o procesos, añadir un límite compartido en el proxy/WAF o un almacén Redis; un reinicio restablece los contadores locales. Ajustar los límites tras medir el uso de la red universitaria, donde muchos usuarios pueden compartir IP.
4. Usar un usuario PostgreSQL con privilegios mínimos para la aplicación, restringir la red de la base de datos y separar las credenciales de migraciones. Respaldar base de datos y uploads con acceso restringido y probar una restauración.
5. Renovar secretos si estuvieron expuestos, proteger `.env` y excluirlo de cualquier directorio público. Registrar y alertar sobre 401/403/429 y errores 500 sin guardar contraseñas, tokens ni códigos de recuperación.
6. Ejecutar `npm ci`, compilaciones, pruebas y `npm audit --omit=dev` en ambos proyectos antes de cada publicación. Un resultado sin avisos conocidos no garantiza ausencia de vulnerabilidades. No publicar `ng serve`, Vitest ni otras herramientas de desarrollo.

Los tokens anteriores al cambio de emisor/audiencia dejan de ser válidos: todos deberán iniciar sesión nuevamente al desplegar esta versión.

## Puntos pendientes para una revisión institucional

- Los pagos por tarjeta quedan deshabilitados con `NODE_ENV=production`; no pedir tarjetas reales ni ofrecer el simulador como medio de pago universitario.

- Los tokens permanecen en `localStorage`/`sessionStorage`. Una migración a cookies HttpOnly/Secure requiere diseñar CSRF y renovar/cerrar sesiones; las cabeceras actuales no eliminan el impacto de una eventual XSS. Evaluar MFA para administradores con la política de la universidad.
- Las imágenes y videos de `/uploads/:name` siguen siendo públicos por URL. Las tareas/documentos privados usan rutas y permisos separados. Si las clases requieren confidencialidad, implementar autorización de streaming o enlaces firmados con vencimiento antes de publicar ese contenido. No usar nombres aleatorios como sustituto de permisos.
- Completar la CSP de scripts con nonces/hashes y verificar los reproductores, fuentes, HTML enriquecido e integraciones en un navegador real.
- Validar en staging los permisos entre dos estudiantes y dos docentes distintos, descarga de documentos, revocación de cuentas y recuperación de contraseña. Revisar también cabeceras/TLS, límites del proxy, dependencias del sistema (Node, Nginx, ffmpeg) y controles operativos con el equipo de TI.

Consultar también [la guía de despliegue](README.md).
