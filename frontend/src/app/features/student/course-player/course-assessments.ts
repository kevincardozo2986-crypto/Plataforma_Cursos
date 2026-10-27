import { Component, DestroyRef, inject, input, output, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { catchError, finalize, forkJoin, of, throwError } from 'rxjs';
import { RichHtmlPipe } from '../../../shared/pipes/rich-html.pipe';
import { apiErrorMessage } from '../../../core/http/api-error';

export interface Assessment {
  id: number;
  moduleId: number;
  title: string;
  type: 'evaluation' | 'assignment';
  minimum: number;
  score: number | null;
  passed: boolean;
}
interface Quiz {
  id: number;
  title: string;
  description?: string;
  questions: { id: number; text: string; type: string; options: { id: number; text: string }[] }[];
}
interface Task {
  id: number;
  title: string;
  description?: string;
  maxScore: number;
  dueAt?: string;
  allowLate: boolean;
}
interface Submission {
  text?: string;
  status: string;
  score: number | null;
  feedback?: string;
  files?: { name: string; originalName: string }[];
}

@Component({
  selector: 'app-course-assessments',
  imports: [FormsModule, RichHtmlPipe],
  template: `
    <header>
      <h3>Evaluaciones y tareas</h3>
      <button type="button" (click)="changed.emit()" [disabled]="busy()">Actualizar notas</button>
    </header>
    <p>
      Aprueba cada evaluación y alcanza al menos 60 % en cada tarea para obtener tu certificado.
    </p>
    <div class="assessment-list">
      @for (item of items(); track item.type + item.id) {
        <button
          type="button"
          class="assessment"
          [disabled]="busy()"
          (click)="open(item)"
          [class.passed]="item.passed"
        >
          <span
            >{{ item.type === 'evaluation' ? 'Evaluación' : 'Tarea' }} ·
            {{ moduleTitle(item.moduleId) }}<strong>{{ item.title }}</strong></span
          >
          <span
            >{{ item.score === null ? 'Pendiente' : item.score + ' / 100'
            }}<small>{{
              item.passed ? 'Aprobada ✓' : 'Mínimo ' + item.minimum + ' %'
            }}</small></span
          >
        </button>
      } @empty {
        <p>Este curso no tiene evaluaciones ni tareas asignadas.</p>
      }
    </div>
    @if (busy()) {
      <p role="status">Procesando...</p>
    }
    @if (error()) {
      <p class="error" role="alert">{{ error() }}</p>
    }
    @if (notice()) {
      <p class="notice" role="status">{{ notice() }}</p>
    }
    @if (quiz(); as current) {
      <form (ngSubmit)="submitQuiz()">
        <h4>{{ current.title }}</h4>
        <p>{{ current.description }}</p>
        @for (question of current.questions; track question.id; let index = $index) {
          <fieldset [disabled]="busy()">
            <legend>{{ index + 1 }}. {{ question.text }}</legend>
            @if (question.type === 'ESSAY' || question.type === 'FILL_BLANK') {
              <label [for]="'answer-' + question.id">Tu respuesta</label>
              <textarea
                [id]="'answer-' + question.id"
                [name]="'answer-' + question.id"
                [(ngModel)]="texts[question.id]"
                required
                maxlength="5000"
                rows="3"
              ></textarea>
            } @else {
              @for (option of question.options; track option.id) {
                <label class="option"
                  ><input
                    [type]="question.type === 'MULTIPLE' ? 'checkbox' : 'radio'"
                    [name]="'option-' + question.id"
                    [checked]="selected(question.id, option.id)"
                    (change)="
                      choose(question.id, option.id, question.type, $any($event.target).checked)
                    "
                  />{{ option.text }}</label
                >
              }
            }
          </fieldset>
        }
        <button class="primary" type="submit" [disabled]="busy()">Enviar evaluación</button>
        <button type="button" [disabled]="busy()" (click)="quiz.set(null)">Cerrar</button>
      </form>
    }
    @if (task(); as current) {
      <form (ngSubmit)="submitTask()">
        <h4>{{ current.title }}</h4>
        <div [innerHTML]="current.description || '' | richHtml"></div>
        @if (submission(); as previous) {
          <p>
            {{
              previous.status === 'GRADED'
                ? 'Calificada: ' + previous.score + ' / ' + current.maxScore
                : 'Entregada. Pendiente de revisión.'
            }}
          </p>
          @if (previous.feedback) {
            <p>{{ previous.feedback }}</p>
          }
        }
        <label for="task-answer">Tu entrega</label
        ><textarea
          id="task-answer"
          name="task-answer"
          [(ngModel)]="taskText"
          maxlength="20000"
          rows="4"
          [disabled]="busy() || submission()?.status === 'GRADED'"
        ></textarea>
        <label for="task-files">Adjuntar documento (máximo 10 archivos)</label>
        <input
          id="task-files"
          type="file"
          accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip,.txt"
          [disabled]="busy() || files().length >= 10 || submission()?.status === 'GRADED'"
          (change)="upload($event)"
        />
        @for (file of files(); track file.name) {
          <p>
            {{ file.originalName }}
            <button
              type="button"
              [disabled]="busy() || submission()?.status === 'GRADED'"
              (click)="removeFile(file.name)"
            >
              Quitar
            </button>
          </p>
        }
        <button
          class="primary"
          type="submit"
          [disabled]="
            busy() || submission()?.status === 'GRADED' || (!taskText.trim() && !files().length)
          "
        >
          Enviar tarea
        </button>
        <button type="button" [disabled]="busy()" (click)="task.set(null)">Cerrar</button>
      </form>
    }
  `,
  styles: `
    :host {
      display: block;
      font-size: 0.8rem;
      color: var(--ink);
    }
    header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 12px;
    }
    h3,
    h4 {
      margin: 0;
    }
    p {
      color: var(--muted);
      line-height: 1.6;
    }
    .assessment-list {
      display: grid;
      gap: 8px;
      margin: 18px 0;
    }
    button {
      cursor: pointer;
      color: inherit;
      font: inherit;
      padding: 8px 12px;
      border: 1px solid var(--border);
      border-radius: 9px;
      background: var(--surface);
    }
    button:disabled {
      opacity: 0.55;
      cursor: default;
    }
    .assessment {
      display: flex;
      justify-content: space-between;
      gap: 16px;
      text-align: left;
      padding: 13px;
    }
    .assessment strong,
    .assessment small {
      display: block;
      margin-top: 5px;
    }
    .assessment span:first-child {
      font-size: 0.72rem;
      color: var(--muted);
    }
    .assessment strong {
      color: var(--ink);
      font-size: 0.84rem;
    }
    .passed {
      border-color: #16aaa477;
    }
    .passed small {
      color: #078879;
    }
    form {
      margin-top: 16px;
      border-top: 1px solid var(--border);
      padding-top: 18px;
    }
    fieldset {
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 14px;
      margin: 16px 0;
    }
    legend {
      padding: 0 6px;
      font-weight: 600;
    }
    .option {
      display: flex;
      align-items: center;
      gap: 9px;
      padding: 8px 0;
    }
    textarea {
      display: block;
      width: 100%;
      box-sizing: border-box;
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 12px;
      margin: 8px 0 14px;
      font: inherit;
      color: inherit;
      background: var(--surface);
      resize: vertical;
    }
    .primary {
      background: #1265ed;
      color: white;
      margin-right: 8px;
    }
    .error {
      color: #bb354a;
    }
    .notice {
      color: #078879;
    }
    input[type='file'] {
      display: block;
      max-width: 100%;
      margin: 10px 0 18px;
    }
  `,
})
export class CourseAssessments {
  readonly items = input<Assessment[]>([]);
  readonly modules = input<{ id: number; title: string }[]>([]);
  readonly changed = output<void>();
  private readonly http = inject(HttpClient);
  private readonly destroyRef = inject(DestroyRef);
  readonly quiz = signal<Quiz | null>(null);
  readonly task = signal<Task | null>(null);
  readonly submission = signal<Submission | null>(null);
  readonly files = signal<{ name: string; originalName: string }[]>([]);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly notice = signal('');
  texts: Record<number, string> = {};
  options: Record<number, number[]> = {};
  taskText = '';
  moduleTitle(id: number) {
    return this.modules().find((m) => m.id === id)?.title ?? 'Módulo';
  }
  selected(question: number, option: number) {
    return this.options[question]?.includes(option) ?? false;
  }
  choose(question: number, option: number, type: string, checked: boolean) {
    this.options[question] =
      type === 'MULTIPLE'
        ? checked
          ? [...(this.options[question] ?? []), option]
          : (this.options[question] ?? []).filter((id) => id !== option)
        : [option];
  }
  open(item: Assessment) {
    if (this.busy()) return;
    this.busy.set(true);
    this.error.set('');
    this.notice.set('');
    this.quiz.set(null);
    this.task.set(null);
    if (item.type === 'evaluation') {
      this.http
        .get<Quiz>('/api/evaluations/' + item.id)
        .pipe(
          takeUntilDestroyed(this.destroyRef),
          finalize(() => this.busy.set(false)),
        )
        .subscribe({
          next: (quiz) => {
            this.texts = {};
            this.options = {};
            this.quiz.set(quiz);
          },
          error: (e) => this.error.set(apiErrorMessage(e, 'No pudimos abrir la evaluación.')),
        });
    } else {
      forkJoin({
        task: this.http.get<Task>('/api/assignments/' + item.id),
        submission: this.http
          .get<Submission | null>('/api/assignments/' + item.id + '/submission/mine')
          .pipe(catchError((e) => (e.status === 404 ? of(null) : throwError(() => e)))),
      })
        .pipe(
          takeUntilDestroyed(this.destroyRef),
          finalize(() => this.busy.set(false)),
        )
        .subscribe({
          next: ({ task, submission }) => {
            this.task.set(task);
            this.submission.set(submission);
            this.taskText = submission?.text ?? '';
            this.files.set(submission?.files ?? []);
          },
          error: (e) => this.error.set(apiErrorMessage(e, 'No pudimos abrir la tarea.')),
        });
    }
  }
  submitQuiz() {
    const quiz = this.quiz();
    if (!quiz || this.busy()) return;
    const answers = quiz.questions.map((q) =>
      q.type === 'ESSAY' || q.type === 'FILL_BLANK'
        ? { questionId: q.id, text: (this.texts[q.id] ?? '').trim() }
        : { questionId: q.id, optionIds: this.options[q.id] ?? [] },
    );
    if (answers.some((a) => ('text' in a ? !a.text : !a.optionIds?.length))) {
      this.error.set('Responde todas las preguntas antes de enviar.');
      return;
    }
    this.busy.set(true);
    this.error.set('');
    this.http
      .post<{ status: string; score: number; passed: boolean }>(
        '/api/evaluations/' + quiz.id + '/attempts',
        { answers },
      )
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.busy.set(false)),
      )
      .subscribe({
        next: (result) => {
          this.notice.set(
            result.status === 'PENDING_REVIEW'
              ? 'Recibida. El docente revisará las respuestas abiertas.'
              : 'Nota: ' +
                  result.score +
                  ' / 100. ' +
                  (result.passed
                    ? 'Evaluación aprobada.'
                    : 'Puedes repasar e intentarlo de nuevo.'),
          );
          this.quiz.set(null);
          this.changed.emit();
        },
        error: (e) => this.error.set(apiErrorMessage(e, 'No pudimos enviar la evaluación.')),
      });
  }
  upload(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file || this.busy() || this.files().length >= 10) return;
    const form = new FormData();
    form.append('file', file);
    this.busy.set(true);
    this.error.set('');
    this.http
      .post<{ name: string; originalName: string }>('/api/uploads/documents', form)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => {
          this.busy.set(false);
          input.value = '';
        }),
      )
      .subscribe({
        next: (result) => this.files.update((files) => [...files, result]),
        error: (e) => this.error.set(apiErrorMessage(e, 'No pudimos adjuntar el archivo.')),
      });
  }
  removeFile(name: string) {
    this.files.update((files) => files.filter((f) => f.name !== name));
  }
  submitTask() {
    const task = this.task();
    if (!task || this.busy()) return;
    this.busy.set(true);
    this.error.set('');
    this.http
      .put<Submission>('/api/assignments/' + task.id + '/submission', {
        text: this.taskText.trim(),
        files: this.files().map((f) => ({ name: f.name })),
      })
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.busy.set(false)),
      )
      .subscribe({
        next: (submission) => {
          this.submission.set(submission);
          this.notice.set('Tarea enviada. El docente la revisará.');
          this.changed.emit();
        },
        error: (e) => this.error.set(apiErrorMessage(e, 'No pudimos entregar la tarea.')),
      });
  }
}
