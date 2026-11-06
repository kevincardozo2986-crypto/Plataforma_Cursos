# Informe de la prueba completa del sistema

- Ejecución: `E2E15d01ffe` · 6/11/2026, 7:24:00 a. m. · 73 s · servidor http://localhost:3000
- **262 pasan · 2 fallan · 1 no verificables** (de 265)

## Fallos

- **13. Seguridad: permisos entre usuarios y entradas maliciosas** — Ids malformados (texto, negativos, enormes) → 4xx, nunca 500
  - /courses/99999999999999999999 → 500
- **interfaz** — La sección «interfaz» se interrumpió
  - Error: Failed to launch the browser process:  Code: 0 |  | stderr:

## No verificables en este entorno

- **1. Registro, inicio de sesión y contraseña** — Recuperación por correo (código enviado y confirmado): el servidor de correo (SMTP_USER/SMTP_PASSWORD) no está configurado; sin él no hay forma de recibir el código

## Detalle por sección

### 1. Registro, inicio de sesión y contraseña (22/23)

- ✅ Registro con datos válidos crea la cuenta (rol estudiante)
- ✅ Registro: correo repetido → 409
- ✅ Registro: documento repetido → 409
- ✅ Registro: contraseña corta → 400
- ✅ Registro: correo inválido → 400
- ✅ Registro: sin documento → 400
- ✅ Registro: no se puede elegir el rol (se ignora o se rechaza)
- ✅ Inicio de sesión con correo
- ✅ Inicio de sesión con documento (cédula)
- ✅ Contraseña incorrecta → 401
- ✅ Cuenta inexistente → 401 (mismo mensaje que contraseña mala)
- ✅ /auth/me sin token → 401
- ✅ /auth/me con token inválido → 401
- ✅ /auth/me no expone el hash ni el documento de otros
- ✅ Cambiar contraseña: la actual incorrecta → 400
- ✅ Cambiar contraseña: igual a la actual → 400
- ✅ Cambiar contraseña: nueva demasiado corta → 400
- ✅ Cambiar contraseña: válida → la vieja deja de servir y la nueva sí
- ⚠️ Recuperación por correo (código enviado y confirmado)
- ✅ Recuperación de contraseña por correo: pedir código
- ✅ Confirmar un código de recuperación falso → 400/401 (nunca cambia la clave)
- ✅ Pedir código estando en sesión (cambio de contraseña) responde sin romperse
- ✅ Confirmar código falso en sesión → 400

### 2. Administración (solo admin) (15/15)

- ✅ Un estudiante no entra a /admin/* (403)
- ✅ Un docente no entra a /admin/* (403)
- ✅ Sin sesión → 401
- ✅ Resumen de la plataforma trae usuarios, cursos, inscripciones y certificados
- ✅ Lista de cuentas: paginada, con búsqueda y filtro por rol
- ✅ La lista de cuentas nunca trae contraseñas
- ✅ Crear una cuenta con rol elegido; la persona puede entrar con la clave inicial
- ✅ Crear cuenta con correo repetido → 409
- ✅ Cambiar el rol surte efecto al instante
- ✅ Desactivar una cuenta bloquea el acceso y cierra sus sesiones abiertas
- ✅ Reactivarla permite volver a entrar
- ✅ Un admin no puede cambiar su propia cuenta (400)
- ✅ Rol o estado inválido → 400
- ✅ Cuenta inexistente → 404
- ✅ Lista de todos los cursos (con autor y conteos) y filtro por estado

### 2b. Categorías (5/5)

- ✅ Un docente crea una categoría
- ✅ Un estudiante no puede crear categorías (403)
- ✅ Nombre repetido → 409
- ✅ Listado y detalle son públicos
- ✅ Editar una categoría

### 3. Subida de archivos (12/12)

- ✅ Subir una imagen PNG (docente) → devuelve una URL de la plataforma
- ✅ La imagen subida se puede pedir públicamente y llega como imagen
- ✅ Un estudiante no puede subir imágenes de curso (403)
- ✅ Un archivo que no es imagen renombrado a .png se rechaza (400)
- ✅ Subir sin archivo → 400
- ✅ Sin sesión no se sube nada (401)
- ✅ Un estudiante sube un documento (entrega de tarea)
- ✅ Los documentos son privados: no se piden por /uploads/ (404)
- ✅ Un ejecutable renombrado a .pdf se rechaza por su contenido (400)
- ✅ Una extensión no permitida (.exe) → 400
- ✅ Subir foto de perfil (avatar) como estudiante
- ✅ Subir un video real (generado con ffmpeg) y esperar a que se procese

### 3b. Perfil y ajustes (8/8)

- ✅ GET /profile trae cuenta, perfil y preferencias por defecto (sin hash)
- ✅ PATCH /profile guarda nombre, teléfono, ocupación y bio
- ✅ Preferencias de accesibilidad: tema, tamaño, contraste, filtro de color
- ✅ Valores inválidos de perfil → 400 con mensaje
- ✅ Redes sociales con https se guardan; null las quita
- ✅ Foto de perfil: una imagen subida se acepta; una URL externa se rechaza (400)
- ✅ Firma del docente: solo docentes (estudiante 403), con imagen subida
- ✅ Perfil público del docente: sin correo, teléfono ni documento

### 4. El docente crea y publica un curso (14/14)

- ✅ Crear un borrador vacío (POST /courses/draft)
- ✅ Pedir otro borrador mientras el primero está sin tocar devuelve el mismo (no llena la lista de vacíos)
- ✅ Un estudiante no puede crear cursos (403)
- ✅ Publicar un borrador sin título/descripción/módulos → 400 diciendo qué falta
- ✅ Editar datos del curso: título, descripción HTML, nivel, precio, categoría, imagen
- ✅ Validaciones del curso: precio negativo, nivel inválido, título corto → 400
- ✅ Una imagen externa o archivo inexistente como portada se rechaza o se acepta con URL https válida
- ✅ Crear módulos y listarlos en orden
- ✅ Editar y reordenar un módulo (position)
- ✅ Crear lecciones con contenido HTML (se limpia), video y duración
- ✅ Lección con video de un archivo subido y con URL peligrosa → 400
- ✅ Editar una lección y verla
- ✅ Recursos de una lección: crear (enlace), editar, listar y borrar
- ✅ Archivos descargables del curso: subir, adjuntar, listar y quitar

### 4b. Evaluaciones y tareas (creación) (5/5)

- ✅ Crear un quiz con los 5 tipos de pregunta
- ✅ Reglas de pregunta: MULTIPLE con una sola correcta → 400 con mensaje
- ✅ Quiz con pregunta abierta (ensayo)
- ✅ Crear tareas: una con fecha límite y adjunto del docente, otra vencida sin entregas tardías
- ✅ maxScore fuera de rango → 400

### 4c. Publicar y el catálogo público (8/8)

- ✅ Un curso en borrador NO aparece en el catálogo ni se puede abrir (404)
- ✅ Publicar el curso
- ✅ El catálogo público lo muestra, con filtros por texto, nivel y categoría
- ✅ Detalle público: temario con títulos, sin contenido de lecciones ni correo del docente
- ✅ Paginación del catálogo: page y limit
- ✅ GET /courses/manage: el docente ve sus cursos (con isOwner y cifras de biblioteca)
- ✅ GET /courses/manage/:id trae el árbol de contenido completo
- ✅ El admin gestiona cualquier curso

### 4d. Varios instructores (5/5)

- ✅ Agregar un instructor por correo → le llega INSTRUCTOR_ADDED
- ✅ Repetir el instructor, agregar al autor, a un estudiante o un correo sin cuenta
- ✅ El instructor ve el curso en sus cursos (isOwner=false) y puede editarlo
- ✅ El instructor NO puede borrar el curso ni agregar instructores (403)
- ✅ El instructor se sale solo ({ left: true }) y pierde el acceso

### 5. Acceso al contenido e inscripciones (11/11)

- ✅ Sin inscripción: la lección, los recursos, el quiz y la tarea dan 403 NOT_ENROLLED
- ✅ Sin sesión no se abre el contenido (401)
- ✅ El docente y el admin sí abren el contenido (vista previa)
- ✅ Un docente no puede inscribirse (403)
- ✅ No se puede inscribir a un curso inexistente (404)
- ✅ Inscribirse a un curso gratis → 201
- ✅ Inscribirse de nuevo → 409
- ✅ Mis inscripciones incluye el curso, con su avance
- ✅ Ya inscrito: abre lecciones, recursos, quiz, tarea y archivos del curso
- ✅ Otro estudiante no inscrito no descarga los archivos del curso (404)
- ✅ El docente ve la lista de inscritos del curso; un estudiante no (403)

### 5b. Avance del estudiante (12/12)

- ✅ Una lección con video no se completa sin verlo (exige ver el 90 %): 403
- ✅ Las lecciones siguientes quedan bloqueadas hasta terminar el video anterior (403)
- ✅ Ver el video de verdad (progreso real en el tiempo) permite completar la lección y abre la siguiente
- ✅ Saltar el video de un salto (posición al final sin reproducir) NO cuenta como visto
- ✅ Marcar una lección como completada y ver el avance del curso
- ✅ Completar dos veces no duplica (idempotente)
- ✅ Desmarcar una lección
- ✅ Progreso del video: guardar la posición y retomarla
- ✅ Progreso de video inválido (duración 0 o posición negativa) → 400
- ✅ Racha de estudio (GET /enrollments/streak)
- ✅ Un docente o sin sesión no marca avances (403/401)
- ✅ Un estudiante no inscrito no puede marcar una lección (403)

### 5c. Cancelar y reinscribirse (1/1)

- ✅ Cancelar la inscripción: se pierde el acceso al contenido; reinscribirse lo devuelve

### 5d. Reglas de acceso a un curso (6/6)

- ✅ Un curso en borrador o archivado no admite inscripciones (404)
- ✅ Curso con contraseña: sin ella, con una mala y con la correcta
- ✅ Curso privado: no sale en el catálogo ni admite inscripción
- ✅ Cupo máximo: el último cupo se llena y el siguiente es rechazado
- ✅ Cursos recomendados (prerrequisitos): se guardan y se muestran, pero NO bloquean la inscripción (decisión de diseño)
- ✅ Contenido público: sin inscribirse se puede leer cuando el curso lo permite

### 5e. Liberación gradual de módulos (4/4)

- ✅ SEQUENTIAL: el 2.º módulo está bloqueado hasta terminar el 1.º
- ✅ BY_DATE: un módulo con fecha futura queda bloqueado con reason DATE
- ✅ AFTER_DAYS: se abre N días después de inscribirse (reason DAYS)
- ✅ PREREQUISITES: un círculo (A pide B y B pide A) se rechaza con 400

### 6. Quizzes (7/7)

- ✅ El estudiante ve el quiz SIN las respuestas correctas
- ✅ El docente sí ve cuáles son las correctas
- ✅ Intento con todo correcto (incluye "  PARIS " sin tildes ni mayúsculas) → 100 y aprobado
- ✅ Intento con todo mal → reprobado
- ✅ Mis intentos se listan
- ✅ Responder la misma pregunta dos veces → 400
- ✅ Un estudiante no inscrito no presenta el quiz (403) y un docente tampoco

### 6b. Quiz con pregunta abierta y revisión del docente (7/7)

- ✅ Pregunta abierta → el intento queda PENDING_REVIEW (provisional, no aprobado)
- ✅ Respuesta abierta en blanco → 400
- ✅ Bandeja del docente: lista los pendientes y filtra por estado
- ✅ Detalle del intento (solo docente) con lo escrito por el estudiante
- ✅ Calificar: puntos fuera de rango → 400; válidos → GRADED y aviso GRADED_QUIZ al estudiante
- ✅ Un estudiante no califica (403); otro docente no ve este intento
- ✅ Editar el quiz (reemplaza preguntas) no rompe la revisión de intentos ya hechos

### 6c. Tareas (16/16)

- ✅ El estudiante ve la tarea con el adjunto del docente y su estado (mySubmission null)
- ✅ Entregar con texto y un archivo propio
- ✅ Entrega vacía (sin texto ni archivos) → 400
- ✅ No se puede adjuntar un archivo subido por otra persona (400)
- ✅ Reenviar mientras no esté calificada reemplaza la entrega
- ✅ Sin entrega previa, submission/mine → 404
- ✅ Tarea vencida sin entregas tardías → 400
- ✅ Tarea vencida CON entregas tardías → se acepta y queda late=true
- ✅ Bandeja del docente: entregas pendientes y detalle con archivos
- ✅ Otra persona no descarga la entrega (404)
- ✅ Calificar: fuera de rango → 400; válida → GRADED con aviso GRADED_ASSIGNMENT
- ✅ Una entrega calificada ya no se puede cambiar (400)
- ✅ Se puede corregir la nota
- ✅ El estudiante ve su nota en la lista del módulo (mySubmission)
- ✅ Un estudiante no ve la bandeja de entregas (403)
- ✅ No se baja el puntaje máximo por debajo de una nota puesta (400)

### 7. Anuncios (6/6)

- ✅ El docente publica un anuncio con aviso a los inscritos (HTML se limpia)
- ✅ El estudiante inscrito recibe la notificación ANNOUNCEMENT y ve el anuncio
- ✅ Un estudiante NO inscrito no ve anuncios de ese curso (403 o vacío) y no recibe aviso
- ✅ Un estudiante no publica anuncios (403); un docente ajeno tampoco
- ✅ Anuncio sin texto visible → 400; silencioso (notify=false) no avisa
- ✅ Editar y borrar un anuncio

### 7b. Preguntas, respuestas y comentarios (13/13)

- ✅ El estudiante inscrito hace una pregunta (con lección) y el docente recibe NEW_QUESTION
- ✅ Pregunta con lección de otro curso o título corto → 400
- ✅ Un estudiante no inscrito no pregunta ni lee (403)
- ✅ Las preguntas sin responder aparecen en la bandeja del docente (answered=false)
- ✅ Una respuesta de OTRO ESTUDIANTE no marca la pregunta como respondida
- ✅ El docente responde → answered=true y el estudiante recibe NEW_REPLY
- ✅ No se responde a una respuesta (400/404)
- ✅ Comentario en una lección y listado por tipo
- ✅ Solo el autor edita; el docente puede moderar (borrar)
- ✅ Borrar la respuesta del docente devuelve la pregunta a "sin responder"
- ✅ Con P y R desactivado no se hacen preguntas (403) pero sí comentarios
- ✅ Texto plano: el HTML de una pregunta no se interpreta (se guarda como texto)
- ✅ Borrar la pregunta borra también sus respuestas

### 8. Reseñas (9/9)

- ✅ Un no inscrito no reseña (403) y un docente tampoco (403)
- ✅ Calificación fuera de 1–5 → 400
- ✅ El estudiante inscrito reseña; el docente recibe NEW_REVIEW (solo la primera vez)
- ✅ Mi reseña: se ve la última versión; sin reseña → 404
- ✅ Público: resumen (promedio y distribución) y lista con nombre abreviado
- ✅ Reseñas de un curso sin reseñas: average null (no "0")
- ✅ El docente ve las reseñas de sus cursos con el nombre completo; un estudiante no (403)
- ✅ Borrar mi reseña
- ✅ Reseñas de un curso en borrador (no público) → 404

### 9. Notificaciones (5/5)

- ✅ Contador de no leídas coincide con la lista
- ✅ Marcar una como leída baja el contador; una ajena → 404
- ✅ Marcar todas como leídas
- ✅ Cada usuario ve solo las suyas; sin sesión → 401
- ✅ Paginación y filtro de no leídas

### 10. Plantillas de certificado (7/7)

- ✅ Crear una plantilla con tipografías y estilo
- ✅ Marcador mal escrito ({{estudiante}}) → 400 listando los válidos; color inválido → 400
- ✅ IMAGE sin imagen de fondo → 400; con imagen subida → 201
- ✅ Listar y ver mis plantillas; otro docente no las ve ni usa (403)
- ✅ Editar una plantilla
- ✅ Vista previa en PDF (A4) de los 12 diseños
- ✅ Catálogo de tipografías (biblioteca de 28 + estándar)

### 10b. Emisión del certificado (14/14)

- ✅ Asignar la plantilla al curso (certificatesIssued = 0 al no haber terminados)
- ✅ No se puede usar la plantilla de otro docente (403/400)
- ✅ Antes de terminar: completion dice que falta contenido y claim se rechaza
- ✅ Al completar la última lección se emite solo el certificado y llega CERTIFICATE_ISSUED
- ✅ Completar de nuevo no duplica el certificado
- ✅ Descargar el PDF: lo baja su dueño y el docente; otra persona recibe 404
- ✅ Verificación pública: válida, sin datos privados; minúsculas funcionan; código falso 404
- ✅ El docente lista los certificados emitidos y corrige el nombre (el código no cambia)
- ✅ Actualizar el diseño del certificado con la plantilla actual
- ✅ Una plantilla en uso no se borra (409)
- ✅ Un curso SIN plantilla emite igual, con el diseño predeterminado de la plataforma
- ✅ Asignar una plantilla a un curso cuyos estudiantes ya tienen certificado no duplica (certificatesIssued 0)
- ✅ Revocar: verify → valid:false; el dueño ya no descarga (403)
- ✅ Quitar el certificado del curso (null) y borrar la plantilla cuando nadie la usa

### 10c. Credenciales POK (solo lectura: no se emite nada real) (5/5)

- ✅ GET /pok/status responde con la organización conectada
- ✅ Los estudiantes no ven la configuración de POK (403) ni sin sesión (401)
- ✅ Listar los diseños de POK y ver la vista previa real (PNG)
- ✅ Elegir el diseño de POK para un curso y verlo en /pok/courses (sin emitir)
- ✅ El webhook de POK rechaza llamadas sin firma válida

### 11. Dashboard del docente (11/11)

- ✅ Un estudiante no entra al dashboard (403); sin sesión 401
- ✅ Métricas con periodo 7d: agrupa por day, con series completas
- ✅ Métricas con periodo 30d: agrupa por week, con series completas
- ✅ Métricas con periodo 90d: agrupa por week, con series completas
- ✅ Métricas con periodo 1y: agrupa por month, con series completas
- ✅ Métricas con periodo all: agrupa por month, con series completas
- ✅ Periodo inválido → 400
- ✅ "previous" solo en periodos finitos y sin filtro de curso
- ✅ Con courseId solo cuenta ese curso; un curso ajeno → 403
- ✅ Cada docente ve solo lo suyo; el admin ve todo
- ✅ Los quizzes/tareas pendientes de revisión se cuentan

### 11b. Inscritos y recordatorios (5/5)

- ✅ Lista de estudiantes con avance, estado y semanas; filtros por estado y búsqueda
- ✅ Detalle de una inscripción: lecciones, semanas y línea de tiempo
- ✅ Recordatorio: 201 al estudiante activo, 409 el mismo día, 400 a quien ya terminó, 403 a docente ajeno
- ✅ Reseñas del dashboard: reparto por estrellas
- ✅ Pedir reseñas a quienes terminaron: avisa una sola vez; un docente ajeno 403

### 12. Pagos simulados (12/12)

- ✅ Un curso de pago no admite inscripción directa (402)
- ✅ Tarjeta que no pasa Luhn → 400
- ✅ Tarjeta vencida → 400; CVV inválido → 400
- ✅ El importe lo decide el servidor: enviar "amount" → 400
- ✅ Tarjeta rechazada (fondos insuficientes): DECLINED, no se inscribe, deja comprobante
- ✅ Pago aprobado: APPROVED, queda inscrito y solo se guardan marca y últimos 4
- ✅ Pagar otra vez estando inscrito → 409
- ✅ Mis comprobantes: el rechazado y el aprobado, el más reciente primero
- ✅ Cancelar y reinscribirse NO cobra de nuevo (alreadyPaid)
- ✅ Mastercard y otra tarjeta válida se aprueban
- ✅ Pagar un curso gratis → 400; un docente o sin sesión no paga (403/401)
- ✅ Pagar un curso inexistente o en borrador → 404

### 13. Seguridad: permisos entre usuarios y entradas maliciosas (13/14)

- ✅ Un docente ajeno no edita, borra ni gestiona el curso de otro (403)
- ✅ Un estudiante no gestiona nada del docente (403)
- ✅ Todas las rutas privadas exigen sesión (401 sin token)
- ✅ Las rutas públicas sí abren sin sesión: catálogo, detalle, categorías, reseñas, verificación
- ✅ No se puede elevar el propio rol por el perfil ni el registro (se ignora o 400)
- ✅ Asignación masiva: cambiar teacherId/status/slug de un curso por PATCH no funciona
- ✅ Inyección SQL / caracteres raros en búsquedas no rompen nada (sin 500)
- ❌ Ids malformados (texto, negativos, enormes) → 4xx, nunca 500
- ✅ Cuerpos inválidos o enormes → 400/413, nunca 500
- ✅ Token manipulado o de otra firma → 401
- ✅ Fuerza bruta: muchos intentos fallidos seguidos no tumban el servidor y no dan 500
- ✅ Carga concurrente: 30 lecturas del catálogo en paralelo responden 200
- ✅ Borrar una categoría: docente 403; admin sí (sus cursos quedan sin categoría)
- ✅ Con la sesión cerrada por el admin (cuenta inactiva) el token ya no sirve

### interfaz (0/1)

- ❌ La sección «interfaz» se interrumpió

### 14. Borrar cursos (4/4)

- ✅ Un curso con estudiantes inscritos no se borra: hay que archivarlo (409)
- ✅ Un curso sin inscritos se borra con su contenido; después da 404 y no sale en ningún listado
- ✅ Borrar un curso inexistente → 404; el admin sí puede borrar uno ajeno sin inscritos
- ✅ Un docente puede ver y editar sus borradores sin que aparezcan al público
