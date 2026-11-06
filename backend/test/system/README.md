# Prueba completa del sistema

Recorre **toda** la funcionalidad con los tres roles (estudiante, docente, admin), por API y por la interfaz en un navegador real.
Crea sus propias cuentas y cursos (prefijo `E2E…@example.com`) y al terminar los borra.

```bash
# 1. Backend en :3000 y frontend en :4200 (npm run start:dev / npm start)
# 2. Una sola vez, para la parte de interfaz (no toca package.json):
npm i --no-save puppeteer-core
# 3. Desde backend/
node test/full-system.mjs                  # todo (≈ 3 min)
node test/full-system.mjs --keep           # no borra lo creado, para revisarlo a mano
node test/full-system.mjs --only=pagos     # solo secciones cuyo nombre contenga el texto (las demás dependen de la 4)
```

- Informe: `test/system/informe.md` (y `.json`). Código de salida 1 si algo falla.
- Variables: `E2E_API` (por defecto `http://localhost:3000`), `E2E_FRONT` (`http://localhost:4200`), `E2E_BROWSER` (ruta de Edge/Chrome).
- Solo corre contra un servidor y una base **locales**.
- Cubre: registro/login/contraseña, admin y categorías, perfil y archivos (imagen, documento, avatar, video real con ffmpeg),
  creación y publicación de cursos, instructores, acceso e inscripción (clave, cupo, privado, requisitos, liberación gradual, video 90 %),
  quizzes (5 tipos) y tareas, anuncios, preguntas y comentarios, reseñas, notificaciones, certificados (13 diseños, emisión, verificación, revocación),
  POK (solo lectura), dashboard e inscritos, pagos simulados, seguridad (permisos entre usuarios, inyecciones, ids malformados, token falso) y
  todas las pantallas de docente y admin.
