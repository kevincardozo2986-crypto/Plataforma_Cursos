# Frontend — Plataforma de cursos

Aplicación Angular con SCSS y renderizado del lado del servidor (SSR). Actualmente no tiene pantallas, rutas de negocio ni conexión con la API.

## Comandos

Desde `frontend/`:

```bash
npm ci
npm start
npm run build
npm test -- --watch=false
```

El servidor de desarrollo está disponible en `http://localhost:4200`.

Para ejecutar el servidor SSR después de compilar:

```bash
npm run serve:ssr:frontend
```

## Estructura

- `src/app/`: componentes, configuración y rutas.
- `src/styles.scss`: estilos globales.
- `public/`: archivos estáticos.
- `src/server.ts`: entrada del servidor SSR.

Agregar las funcionalidades de cursos, usuarios y autenticación conforme se implementen. Las variables o credenciales privadas no deben incluirse en código que se envía al navegador.
