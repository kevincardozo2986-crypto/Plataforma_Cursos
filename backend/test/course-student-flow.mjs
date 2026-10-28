import 'dotenv/config';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile, writeFile, unlink } from 'node:fs/promises';
import { resolve, dirname, join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

// Local-only integration audit. Credentials are supplied through environment variables.
// --keep retains the isolated fixtures for a browser review; --cleanup removes them later.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const reportPath = join(root, '.preview/course-student-flow.json');
const base = process.env.COURSE_AUDIT_URL ?? 'http://localhost:3000';
assert(['localhost', '127.0.0.1', '[::1]'].includes(new URL(base).hostname), 'This audit only runs against a local server');
const report = { startedAt: new Date().toISOString(), checks: [], courses: [], uploads: [], fixtures: {} };
const teacherEmail = process.env.COURSE_AUDIT_TEACHER_EMAIL;
const studentEmail = process.env.COURSE_AUDIT_STUDENT_EMAIL;
const prefix = 'AUDIT-CURSO-' + randomUUID().slice(0, 8);
let teacher, student;
function check(name, value) { assert(value, name); report.checks.push({ name, passed: true }); console.log('PASS ' + name); }
async function request(method, path, token, body, expected = 200, binary = false) {
  const headers = token ? { Authorization: 'Bearer ' + token } : {};
  const form = body instanceof FormData;
  if (body !== undefined && !form) headers['Content-Type'] = 'application/json';
  const response = await fetch(base + path, { method, headers, body: body === undefined ? undefined : form ? body : JSON.stringify(body), signal: AbortSignal.timeout(30000) });
  const data = binary && response.ok ? Buffer.from(await response.arrayBuffer()) : await response.json().catch(() => null);
  assert([expected].flat().includes(response.status), `${method} ${path}: expected ${expected}, got ${response.status}: ${JSON.stringify(data)}`);
  return data;
}
async function login(email, password) {
  assert(email && password, 'Provide audit account emails and passwords through COURSE_AUDIT_* environment variables');
  return request('POST', '/auth/login', undefined, { identifier: email, password }, 201);
}
async function upload(kind, token, content, name, type = 'text/plain') {
  const form = new FormData(); form.append('file', new Blob([content], { type }), name);
  const result = await request('POST', '/uploads/' + kind, token, form, 201);
  const storedName = result.url ? result.url.split('/').at(-1) : result.name;
  assert(/^[a-f0-9]{32}\.[a-z0-9]+$/.test(storedName), 'Unexpected upload name');
  report.uploads.push({ name: storedName, private: kind === 'documents' });
  return result;
}
async function cleanup(state) {
  const dbUrl = new URL(process.env.DATABASE_URL);
  assert(['localhost', '127.0.0.1', '[::1]'].includes(dbUrl.hostname), 'Cleanup only runs on the local database');
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 5000 });
  await client.connect();
  try {
    for (const fixture of [...state.courses].reverse()) {
      const rows = await client.query('SELECT id,title,"teacherId" FROM courses WHERE id=$1', [fixture.id]);
      if (!rows.rowCount) continue;
      assert(rows.rows[0].title === fixture.title && fixture.title.startsWith('AUDIT-CURSO-') && rows.rows[0].teacherId === teacher.user.id, 'Refusing to clean a course not created by this audit');
      // Only remove enrollment/notifications belonging to this newly created test course.
      await client.query('DELETE FROM notifications WHERE "courseId"=$1', [fixture.id]);
      await client.query('DELETE FROM enrollments WHERE "courseId"=$1', [fixture.id]);
      await request('DELETE', '/courses/' + fixture.id, teacher.accessToken);
    }
  } finally { await client.end(); }
  const uploadsRoot = resolve(process.env.UPLOADS_DIR ?? join(root, 'backend/uploads'));
  assert(uploadsRoot.startsWith(root + '\\') || uploadsRoot.startsWith(root + '/'), 'Upload cleanup must remain inside this workspace');
  for (const file of state.uploads) {
    assert(/^[a-f0-9]{32}\.[a-z0-9]+$/.test(file.name) && basename(file.name) === file.name);
    const path = join(uploadsRoot, file.private ? '.private' : '', file.name);
    await unlink(path).catch(error => { if (error.code !== 'ENOENT') throw error; });
    const metadata = join(uploadsRoot, file.private ? '.private' : '.state', file.name.split('.')[0] + '.json');
    await unlink(metadata).catch(error => { if (error.code !== 'ENOENT') throw error; });
  }
}
try {
  teacher = await login(teacherEmail, process.env.COURSE_AUDIT_TEACHER_PASSWORD);
  if (process.argv.includes('--cleanup')) {
    const previous = JSON.parse(await readFile(reportPath, 'utf8'));
    await cleanup(previous); previous.cleaned = true;
    await writeFile(reportPath, JSON.stringify(previous, null, 2));
    console.log('Audit fixtures cleaned');
  } else {
    student = await login(studentEmail, process.env.COURSE_AUDIT_STUDENT_PASSWORD);
    check('Teacher and student have separate correct roles', teacher.user.role === 'TEACHER' && student.user.role === 'STUDENT');
    // Creating a named course avoids reusing or altering a pre-existing empty wizard draft.
    const course = await request('POST', '/courses', teacher.accessToken, { title: prefix + '-principal', description: '<p>Descripcion de auditoria docente-estudiante</p>', price: 0, level: 'BEGINNER' }, 201);
    report.courses.push({ id: course.id, title: course.title });
    await request('GET', '/courses/' + course.id, undefined, undefined, 404);
    check('Unpublished draft is hidden from the public', true);
    await request('PATCH', '/courses/' + course.id + '/status', teacher.accessToken, { status: 'PUBLISHED' }, 400);
    check('Publishing validates the minimum course content', true);
    const m1 = await request('POST', `/courses/${course.id}/modules`, teacher.accessToken, { title: 'Inicio', description: '<p>Descripcion del modulo de inicio</p>', position: 1 }, 201);
    const m2 = await request('POST', `/courses/${course.id}/modules`, teacher.accessToken, { title: 'Practica final', description: '<p>Descripcion del modulo final</p>', position: 2 }, 201);
    const l1 = await request('POST', `/modules/${m1.id}/lessons`, teacher.accessToken, { title: 'Lectura inicial', content: '<p>Contenido de lectura del docente</p>', position: 1, durationMinutes: 1 }, 201);
    let videoUrl = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
    if (process.env.COURSE_AUDIT_VIDEO) {
      const media = await upload('videos', teacher.accessToken, await readFile(process.env.COURSE_AUDIT_VIDEO), 'audit-video.mp4', 'video/mp4');
      videoUrl = media.url;
      if (media.status === 'processing') {
        const name = media.url.split('/').at(-1);
        for (let i = 0; i < 40; i++) {
          const state = await request('GET', `/uploads/${name}/status`, teacher.accessToken);
          if (state.status === 'ready') break;
          assert(state.status !== 'failed', 'Video optimization failed');
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }
    }
    const l2 = await request('POST', `/modules/${m1.id}/lessons`, teacher.accessToken, { title: 'Video de practica', content: '<p>Descripcion del video del docente</p>', videoUrl, position: 2, durationMinutes: 1 }, 201);
    const l3 = await request('POST', `/modules/${m2.id}/lessons`, teacher.accessToken, { title: 'Cierre del curso', content: '<p>Resumen y cierre del docente</p>', position: 1 }, 201);
    await request('POST', `/lessons/${l1.id}/resources`, teacher.accessToken, { title: 'Enlace de apoyo', type: 'LINK', url: 'https://example.com/guia' }, 201);
    const guide = await upload('documents', teacher.accessToken, 'Guia del curso de auditoria', 'guia-curso.txt');
    const courseFile = await request('POST', `/courses/${course.id}/files`, teacher.accessToken, { name: guide.name }, 201);
    const taskGuide = await upload('documents', teacher.accessToken, 'Instrucciones para resolver la tarea', 'instrucciones-tarea.txt');
    const task = await request('POST', `/modules/${m2.id}/assignments`, teacher.accessToken, { title: 'Tarea de auditoria', description: '<p>Responde y entrega el archivo de practica.</p>', maxScore: 20, allowLate: true, attachments: [{ name: taskGuide.name }] }, 201);
    const quiz = await request('POST', `/modules/${m2.id}/evaluations`, teacher.accessToken, { title: 'Evaluacion de auditoria', description: '<p>Prueba automatica y respuesta abierta.</p>', passingScore: 60, questions: [ { type: 'SINGLE', text: 'Selecciona la respuesta correcta', points: 1, options: [{ text: 'Correcta', isCorrect: true }, { text: 'Incorrecta', isCorrect: false }] }, { type: 'ESSAY', text: 'Explica lo aprendido', points: 1 } ] }, 201);
    await request('PATCH', '/courses/' + course.id, teacher.accessToken, { whatYouWillLearn: '<p>APRENDER-AUDITORIA: objetivos del docente.</p>', audience: '<p>PUBLICO-AUDITORIA: estudiantes iniciales.</p>', materials: '<p>MATERIALES-AUDITORIA: guias descargables.</p>', requirements: '<p>REQUISITOS-AUDITORIA: navegador y conexion.</p>', durationMinutes: 62, dripType: 'SEQUENTIAL', qaEnabled: true, programmingEnabled: true, visibility: 'PASSWORD', accessPassword: 'CursoAudit2026!' });
    const managed = await request('GET', '/courses/manage/' + course.id, teacher.accessToken);
    check('Saved teacher settings and HTML survive reload', managed.durationMinutes === 62 && managed.whatYouWillLearn.includes('APRENDER-AUDITORIA') && managed.programmingEnabled && managed.qaEnabled && managed.modules.length === 2);
    check('Password hash stays hidden in managed course', !('accessPassword' in managed) && managed.hasPassword);
    await request('PATCH', `/courses/${course.id}/status`, teacher.accessToken, { status: 'PUBLISHED' });
    const publicCourse = await request('GET', '/courses/' + course.id);
    check('Published student outline contains all lessons and video flags', publicCourse.modules.length === 2 && publicCourse.modules[0].lessons.length === 2 && publicCourse.modules[0].lessons[1].hasVideo === true);
    await request('GET', `/lessons/${l1.id}`, student.accessToken, undefined, 403);
    await request('GET', `/courses/${course.id}/files`, student.accessToken, undefined, 403);
    await request('POST', `/courses/${course.id}/enroll`, student.accessToken, { password: 'wrong' }, 403);
    check('Content/files and password-protected enrollment reject unauthorized access', true);
    await request('POST', `/courses/${course.id}/enroll`, student.accessToken, { password: 'CursoAudit2026!' }, 201);
    const availability = await request('GET', `/courses/${course.id}/modules/availability`, student.accessToken);
    check('Sequential drip opens first module and locks the second', !availability.modules[0].locked && availability.modules[1].locked);
    const lesson = await request('GET', `/lessons/${l1.id}`, student.accessToken);
    check('Enrolled student receives lesson HTML and resources', lesson.content.includes('Contenido de lectura') && lesson.resources.length === 1);
    const files = await request('GET', `/courses/${course.id}/files`, student.accessToken);
    const download = await request('GET', `/course-files/${courseFile.id}/download`, student.accessToken, undefined, 200, true);
    check('Course materials are listed and downloadable with the student token', files.length === 1 && download.toString().includes('Guia del curso'));
    await request('GET', `/lessons/${l3.id}`, student.accessToken, undefined, 403);
    await request('POST', `/lessons/${l1.id}/complete`, student.accessToken, {}, 201);
    await request('POST', `/lessons/${l2.id}/complete`, student.accessToken, {}, 403);
    check('A video lesson cannot be completed before the watched threshold', true);
    const duration = 3.9;
    await request('POST', `/lessons/${l2.id}/video-progress`, student.accessToken, { position: 0, duration, playing: true }, 201);
    await new Promise(resolve => setTimeout(resolve, 2100));
    const watched = await request('POST', `/lessons/${l2.id}/video-progress`, student.accessToken, { position: duration, duration, playing: false }, 201);
    check('Watched progress unlocks completion after real elapsed playback time', watched.eligible && watched.percent >= 90);
    await request('POST', `/lessons/${l2.id}/complete`, student.accessToken, {}, 201);
    const unlocked = await request('GET', `/courses/${course.id}/modules/availability`, student.accessToken);
    check('Completing the preceding module unlocks the next module', !unlocked.modules[1].locked);
    await request('POST', `/lessons/${l3.id}/complete`, student.accessToken, {}, 201);
    const pending = await request('GET', `/certificates/courses/${course.id}/completion`, student.accessToken);
    check('Lessons alone do not issue a certificate while assessments are pending', pending.contentComplete && !pending.gradesComplete && !pending.eligible);
    const studentQuiz = await request('GET', `/evaluations/${quiz.id}`, student.accessToken);
    check('Quiz hides correct answers from students', studentQuiz.questions.every(q => q.options.every(o => !('isCorrect' in o))));
    const teacherQuiz = await request('GET', `/evaluations/${quiz.id}`, teacher.accessToken);
    const first = teacherQuiz.questions.find(q => q.type === 'SINGLE');
    const essay = teacherQuiz.questions.find(q => q.type === 'ESSAY');
    const attempt = await request('POST', `/evaluations/${quiz.id}/attempts`, student.accessToken, { answers: [ { questionId: first.id, optionIds: [first.options.find(o => o.isCorrect).id] }, { questionId: essay.id, text: 'Aprendi los conceptos del curso.' } ] }, 201);
    check('Essay responses wait for teacher grading', attempt.status === 'PENDING_REVIEW');
    await request('PATCH', `/evaluation-attempts/${attempt.id}/grade`, teacher.accessToken, { grades: [{ questionId: essay.id, points: 1, comment: 'Correcto' }], feedback: 'Evaluacion aprobada' });
    const attempts = await request('GET', `/evaluations/${quiz.id}/attempts/mine`, student.accessToken);
    check('Student receives the teacher-reviewed quiz grade', attempts.some(a => a.id === attempt.id && a.passed && a.status === 'GRADED'));
    const studentTask = await request('GET', `/assignments/${task.id}`, student.accessToken);
    const taskDownload = await request('GET', `/submission-files/${taskGuide.name}`, student.accessToken, undefined, 200, true);
    check('Teacher task instructions and attachment reach the student', studentTask.attachments.length === 1 && taskDownload.toString().includes('Instrucciones'));
    const studentFile = await upload('documents', student.accessToken, 'Respuesta de auditoria del estudiante', 'respuesta.txt');
    const submission = await request('PUT', `/assignments/${task.id}/submission`, student.accessToken, { text: 'Mi entrega de practica', files: [{ name: studentFile.name }] });
    await request('PATCH', `/assignment-submissions/${submission.id}/grade`, teacher.accessToken, { score: 16, feedback: 'Tarea aprobada' });
    const graded = await request('GET', `/assignments/${task.id}/submission/mine`, student.accessToken);
    check('Student receives task grade, feedback and submitted file', graded.status === 'GRADED' && graded.score === 16 && graded.feedback === 'Tarea aprobada' && graded.files.length === 1);
    const complete = await request('GET', `/certificates/courses/${course.id}/completion`, student.accessToken);
    check('Completion normalizes task grade to percent and combines requirements', complete.eligible && complete.assessments.find(a => a.type === 'assignment').score === 80);
    const { certificate } = await request('POST', `/certificates/courses/${course.id}/claim`, student.accessToken, {}, 201);
    const pdf = await request('GET', `/certificates/${certificate.id}/pdf`, student.accessToken, undefined, 200, true);
    const verification = await request('GET', `/certificates/verify/${certificate.code}`);
    check('Eligible student downloads a PDF and public verification succeeds', pdf.subarray(0, 4).toString() === '%PDF' && verification.valid);
    const question = await request('POST', `/courses/${course.id}/questions`, student.accessToken, { title: 'Consulta sobre el curso de auditoria', body: 'Esta es una pregunta de prueba del estudiante.', lessonId: l3.id }, 201);
    await request('POST', `/discussions/${question.id}/replies`, teacher.accessToken, { body: 'Respuesta de prueba del docente.' }, 201);
    const thread = await request('GET', `/discussions/${question.id}`, student.accessToken);
    check('Student can read the teacher reply in the course discussion', JSON.stringify(thread).includes('Respuesta de prueba del docente'));
    const paid = await request('POST', '/courses', teacher.accessToken, { title: prefix + '-pago', description: '<p>Curso de auditoria de pago simulado</p>', price: 5000, level: 'BEGINNER' }, 201);
    report.courses.push({ id: paid.id, title: paid.title });
    await request('POST', `/courses/${paid.id}/modules`, teacher.accessToken, { title: 'Modulo de pago' }, 201);
    await request('PATCH', `/courses/${paid.id}/status`, teacher.accessToken, { status: 'PUBLISHED' });
    await request('POST', `/courses/${paid.id}/enroll`, student.accessToken, {}, [400, 402, 403]);
    const payment = await request('POST', `/courses/${paid.id}/checkout`, student.accessToken, { cardHolder: 'Estudiante Pruebas', cardNumber: '4242424242424242', expMonth: 12, expYear: 2030, cvv: '123' }, 201);
    check('Paid course blocks free enrollment and simulated checkout enrolls the student', payment.status === 'APPROVED' && payment.enrolled);
    report.fixtures = { courseId: course.id, paidCourseId: paid.id, moduleIds: [m1.id, m2.id], lessonIds: [l1.id, l2.id, l3.id], taskId: task.id, quizId: quiz.id, teacherId: teacher.user.id, studentId: student.user.id };
    report.success = true;
  }
} catch (error) {
  report.success = false; report.error = error.message; console.error('FAIL ' + error.message); process.exitCode = 1;
} finally {
  if (!process.argv.includes('--cleanup')) {
    if (teacher && !process.argv.includes('--keep')) {
      try { await cleanup(report); report.cleaned = true; }
      catch (error) { report.cleanupError = error.message; process.exitCode = 1; console.error('Cleanup: ' + error.message); }
    }
    report.finishedAt = new Date().toISOString();
    await writeFile(reportPath, JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ passed: report.checks.length, success: report.success, cleaned: report.cleaned ?? false, courseIds: report.courses.map(c => c.id), report: reportPath }));
  }
}
