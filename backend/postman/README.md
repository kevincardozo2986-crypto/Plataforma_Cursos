# Pruebas del registro

## Postman

1. Desde `backend/`, ejecutar `npm run start:dev`.
2. En Postman, seleccionar **Import** y abrir `registro.postman_collection.json`.
3. Ajustar la variable de colección `baseUrl` si la API no escucha en `http://localhost:3000`.
4. Abrir **Run collection** y ejecutar los 17 requests en orden, con una iteración.
5. Revisar las aserciones en los resultados del Runner o en **Test Results** de cada request.

La primera petición genera emails y documentos únicos. Las siguientes reutilizan esas variables para probar duplicados. Para enviar peticiones manualmente, ejecutar primero `01 - Registro correcto`.

Postman deja los usuarios de prueba en la base de datos; sus emails empiezan por `postman.` y terminan en `@example.com`. No existe un endpoint para eliminarlos. La colección no contiene las credenciales de PostgreSQL.

## Ejecución automática con limpieza

Desde `backend/`:

```bash
npm run build
node test/postman-register.mjs --run
```

Este script inicia la aplicación compilada en un puerto local libre, usa la misma validación de `main.ts`, prueba HTTP contra la base configurada y elimina exclusivamente los usuarios temporales de esa ejecución. También comprueba el hash de la contraseña con bcrypt. No necesita Postman ni un servidor previamente iniciado.

`results.json` contiene el resultado de la última ejecución. El script devuelve código de salida 1 si algún caso falla. Para regenerar solamente la colección: `node test/postman-register.mjs`.

## Última verificación

17 de 17 casos de registro pasaron en el módulo de autenticación aislado:

- Documento duplicado: devuelve 409.
- Nombre compuesto solo por espacios: devuelve 400.

La colección mantiene estos casos como pruebas de regresión. No cubre registros concurrentes. El script de login también verifica `/auth/me` y `JwtAuthGuard`; `RolesGuard` tiene pruebas unitarias.

## Pruebas automáticas de login

Desde `backend/`:

```bash
npm run build
node test/login-smoke.mjs
```

El script crea un usuario temporal, prueba el login por HTTP, verifica la firma y duración de una hora del JWT, comprueba las validaciones y elimina el usuario al terminar. No guarda tokens ni credenciales en el reporte `login-results.json`.

Última verificación: 25 de 25 comprobaciones aprobadas en el módulo de autenticación aislado. Incluyen email y documento, validaciones, credenciales incorrectas, usuarios inactivos, firma JWT, perfil y rechazo de tokens inválidos. El login correcto sigue devolviendo 201.

## Contrato de autenticación

`POST /auth/login` ahora recibe `identifier` en lugar de `email`:

```json
{ "identifier": "persona@example.com", "password": "TuContrasena" }
```

También acepta `"identifier": "0012345678"`. El identificador y el documento se envían como texto para conservar ceros iniciales. Se eliminan espacios exteriores; los correos se normalizan a minúsculas. Los identificadores sin `@` se buscan por documento. En registro, `document` es obligatorio y no puede ser vacío, null ni solo espacios.

La migración `20260930142505_require_user_document` cambia únicamente `users.document` a `NOT NULL`. Se aplicó sin modificar usuarios existentes (la tabla estaba vacía).

## Verificación aislada y bloqueo actual

La compilación completa está bloqueada por una referencia en `src/app.module.ts` a `./modules/courses/courses.module.js`, que no existe. No se modificó Courses ni se retiró su registro. Mientras se resuelve, se verificó autenticación con:

```bash
npx tsc --ignoreConfig --module nodenext --target es2023 --experimentalDecorators --emitDecoratorMetadata --skipLibCheck --esModuleInterop --strictPropertyInitialization false --outDir dist --rootDir src src/modules/auth/auth.module.ts src/database/database.module.ts
node test/postman-register.mjs --run --auth-only
node test/login-smoke.mjs --auth-only
npm test
npm run lint
```

`test/auth-test-module.mjs` carga los módulos reales de autenticación y base de datos sin los módulos ajenos a estas pruebas. La ejecución aislada no sustituye una verificación completa de `AppModule`.
