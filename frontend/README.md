# Frontend — Plataforma de cursos

Aplicación Angular con SCSS y renderizado del lado del servidor (SSR). La página inicial contiene el login del campus, basado en la referencia visual proporcionada.

## Comandos

Desde `frontend/`:

```bash
npm ci
npm start
npm run build
npm test -- --watch=false
```

El servidor de desarrollo está disponible en `http://localhost:4200`.

El formulario envía `identifier` (correo o cédula) y `password` a `/api/auth/login`. En desarrollo, `proxy.conf.json` dirige `/api` al backend en `http://localhost:3000` sin cambiar su configuración CORS. El backend debe estar iniciado. En producción, configurar un reverse proxy equivalente para `/api`; el servidor SSR no lo incorpora automáticamente.

El token se guarda en `sessionStorage`, o en `localStorage` cuando se marca «Recordarme». La contraseña no se guarda. Después del login se muestra una confirmación y un botón para cerrar sesión; todavía no hay un panel de usuario ni restauración automática de sesión al recargar. «Crear cuenta», «Invitado» y recuperación de contraseña muestran un aviso de funcionalidad pendiente.

La referencia guía los colores y la composición. Toda la pantalla está construida con HTML y SCSS, sin usar la captura como fondo. El panel institucional usa identidad tipográfica y formas decorativas; una fotografía y un escudo oficiales se pueden incorporar después como recursos independientes. En móvil la identidad se presenta como cabecera compacta.

## Organización del login

- `app.html`: solo contiene `router-outlet`.
- `app.routes.ts`: redirige a `/login` y carga la página bajo demanda.
- `core/auth/`: contratos de datos y `AuthService` para HTTP y almacenamiento de sesión.
- `features/auth/pages/login/`: composición de la página, carga y mensajes de error.
- `features/auth/components/campus-brand/`: identidad institucional y mensaje de bienvenida.
- `features/auth/components/login-form/`: formulario reactivo, validación y mostrar contraseña; emite credenciales sin hacer HTTP.
- `features/auth/components/login-links/`: acciones secundarias.
- `shared/ui/accessibility-menu/`: opciones de contraste y tamaño de texto, comunicadas mediante inputs/outputs.

Cada componente tiene su propio archivo TypeScript, HTML y SCSS. Los estilos globales contienen únicamente la base; las variables visuales del login se definen en la página y se heredan por sus componentes.

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
