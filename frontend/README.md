# Frontend — Plataforma de cursos

Aplicación Angular con componentes standalone, SCSS y soporte SSR.

## Comandos

Desde `frontend/`:

```bash
npm ci
npm start
npm run build
npm test -- --watch=false
npm run format
npm run format:check
```

El servidor de desarrollo usa `http://localhost:4200`. El backend debe estar iniciado en `http://localhost:3000`; `proxy.conf.json` redirige `/api` al backend. En producción se necesita un reverse proxy equivalente.

## Organización

| Carpeta | Responsabilidad |
| --- | --- |
| `src/app/core/` | Autenticación, permisos, servicios HTTP, idioma, accesibilidad y utilidades compartidas. |
| `src/app/features/auth/` | Páginas y componentes de login y registro. |
| `src/app/features/home/pages/` | Composición de la portada pública y del catálogo. |
| `src/app/features/home/components/` | Secciones visuales de la portada y componentes del catálogo. |
| `src/app/features/teacher/` | Panel docente, cursos, módulos, lecciones, recursos y evaluaciones. |
| `src/app/features/admin/` | Rutas del administrador. |
| `src/app/shared/layout/` | Encabezado y estructura común de las páginas. |
| `src/app/shared/ui/` | Elementos de interfaz reutilizables. |
| `public/images/` | Imágenes y recursos visuales. |

`app.routes.ts` define las rutas principales. Cada página compone sus componentes; los servicios manejan HTTP y los modelos describen los datos. Mantener el HTML, SCSS y TypeScript de cada componente juntos. Las pruebas se ubican junto al archivo que verifican.

## Rutas y sesión

- `/`: portada informativa; docentes y administradores con sesión se redirigen al panel.
- `/courses`: catálogo público de cursos.
- `/login` y `/register`: acceso y registro.
- `/teacher`: panel y herramientas para docentes y administradores.
- `/admin`: rutas restringidas al administrador.

El login envía `identifier` (correo o documento) y `password`. El token se guarda en `sessionStorage` o en `localStorage` si se selecciona Recordarme. La contraseña no se almacena. Los permisos del frontend complementan las verificaciones del backend.

## Estilos y movimiento

- `styles.scss`: base global.
- `panel.scss`: variables y elementos comunes del panel.
- SCSS del componente: composición y apariencia propias.
- Las animaciones de la portada usan APIs nativas del navegador, se inicializan después del renderizado y respetan movimiento reducido.

Prettier usa la configuración de `.prettierrc`. Ejecutar `npm run format` después de editar y `npm run format:check` para verificar.

## Idioma

`core/i18n/language.service.ts` mantiene la preferencia de idioma. Las traducciones están en `core/i18n/translations.ts`; los componentes que traducen texto importan `TranslatePipe` (`t`). Los nombres y logos institucionales se conservan como recursos de marca.

## SSR

Después de compilar:

```bash
npm run serve:ssr:frontend
```

Las credenciales privadas deben permanecer en el backend y no incluirse en el código enviado al navegador.
