import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import {
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { catchError, finalize, forkJoin, of, throwError } from 'rxjs';
import { RichHtmlPipe } from '../../../shared/pipes/rich-html.pipe';
import { apiErrorMessage } from '../../../core/http/api-error';
import { StudentIcon } from '../dashboard/student-icon';

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
interface QuizResult {
  status: string;
  score: number;
  passed: boolean;
}

const QUESTION_HINTS: Record<string, string> = {
  TRUE_FALSE: 'Verdadero o falso',
  SINGLE: 'Elige una respuesta',
  MULTIPLE: 'Elige todas las correctas',
  FILL_BLANK: 'Completa la respuesta',
  ESSAY: 'Respuesta abierta',
};

@Component({
  selector: 'app-course-assessments',
  imports: [TranslatePipe, FormsModule, RichHtmlPipe, StudentIcon],
  template: `
    @if (!focus()) {
      <header class="list-head">
        <div>
          <span class="eyebrow">{{ 'Tu meta' | t }}</span>
          <h3>{{ 'Evaluaciones y tareas' | t }}</h3>
          <p>
            {{ 'Aprueba cada evaluación y alcanza el mínimo de cada tarea para obtener tu certificado.' | t }}
          </p>
        </div>
        <button type="button" class="ghost" (click)="changed.emit()" [disabled]="busy()">
          {{ 'Actualizar notas' | t }}
        </button>
      </header>
      @if (items().length) {
        <div class="summary" role="status">
          <div class="summary-bar" aria-hidden="true">
            <span [style.width.%]="passedPercent()"></span>
          </div>
          <span><strong>{{ passedCount() }}</strong> {{ 'de' | t }} {{ items().length }} {{ 'aprobadas' | t }}</span>
        </div>
      }
      <ul class="cards">
        @for (item of items(); track item.type + item.id) {
          <li>
            <button
              type="button"
              class="assessment"
              [class.passed]="item.passed"
              [disabled]="busy()"
              (click)="pick(item)"
            >
              <span class="badge" [attr.data-kind]="item.type" aria-hidden="true">
                <app-student-icon [name]="item.type === 'evaluation' ? 'award' : 'book'" />
              </span>
              <span class="card-text">
                <small>{{ item.type === 'evaluation' ? ('Evaluación' | t) : ('Tarea' | t) }} · {{ moduleTitle(item.moduleId) }}</small>
                <strong>{{ item.title }}</strong>
              </span>
              <span class="pill" [attr.data-tone]="tone(item)">{{ statusLabel(item) | t }}</span>
              <app-student-icon class="go" name="arrow" />
            </button>
          </li>
        } @empty {
          <li class="empty">
            <app-student-icon name="award" />
            {{ 'Este curso no tiene evaluaciones ni tareas asignadas.' | t }}
          </li>
        }
      </ul>
    }

    @if (busy() && !quiz() && !task()) {
      <p class="loading" role="status"><span class="spinner" aria-hidden="true"></span>{{ 'Cargando...' | t }}</p>
    }

    @if (result(); as done) {
      <section class="result" [class.ok]="done.passed" [class.review]="done.status === 'PENDING_REVIEW'" role="status">
        @if (done.status === 'PENDING_REVIEW') {
          <span class="result-icon" aria-hidden="true"><app-student-icon name="bell" /></span>
          <h3>{{ '¡Respuestas enviadas!' | t }}</h3>
          <p>{{ 'Tu docente revisará las respuestas abiertas. Verás tu nota cuando las califique.' | t }}</p>
        } @else {
          <div class="ring" [style.--value]="done.score" aria-hidden="true">
            <strong>{{ done.score }}</strong><small>/ 100</small>
          </div>
          <h3>{{ done.passed ? ('¡Aprobaste!' | t) : ('Aún no alcanzas el mínimo' | t) }}</h3>
          <p>
            @if (done.passed) {
              {{ 'Excelente trabajo. Esta evaluación ya cuenta para tu certificado.' | t }}
            } @else {
              {{ 'Necesitas' | t }} {{ focus()?.minimum ?? 60 }} %
              {{ 'para aprobar. Repasa las lecciones e inténtalo otra vez.' | t }}
            }
          </p>
        }
        <div class="result-actions">
          @if (!done.passed && done.status !== 'PENDING_REVIEW' && focus(); as item) {
            <button type="button" class="primary" (click)="open(item)">{{ 'Intentar de nuevo' | t }}</button>
          }
          <button type="button" class="ghost" (click)="close()">{{ 'Volver al curso' | t }}</button>
        </div>
      </section>
    }

    @if (quiz(); as current) {
      <form class="quiz" (ngSubmit)="submitQuiz()">
        <header class="quiz-hero">
          <span class="eyebrow">{{ 'Evaluación' | t }}</span>
          <h2>{{ current.title }}</h2>
          @if (current.description) {
            <p>{{ current.description }}</p>
          }
          <ul class="chips">
            <li>{{ current.questions.length }} {{ current.questions.length === 1 ? ('pregunta' | t) : ('preguntas' | t) }}</li>
            <li>{{ 'Mínimo' | t }} {{ focus()?.minimum ?? 60 }} %</li>
            @if (focus()?.score !== null && focus()?.score !== undefined) {
              <li>{{ 'Tu mejor nota' | t }}: {{ focus()?.score }} / 100</li>
            }
          </ul>
        </header>

        <div class="progress" aria-hidden="true">
          <span [style.width.%]="(answeredCount() / (current.questions.length || 1)) * 100"></span>
        </div>

        <ol class="questions">
          @for (question of current.questions; track question.id; let index = $index) {
            <li class="question" [class.answered]="isAnswered(question)">
              <fieldset [disabled]="busy()">
                <legend>
                  <span class="number" aria-hidden="true">{{ index + 1 }}</span>
                  <span class="legend-text">
                    <small>{{ hint(question.type) | t }}</small>
                    {{ question.text }}
                  </span>
                </legend>
                @if (question.type === 'ESSAY' || question.type === 'FILL_BLANK') {
                  <label class="sr-only" [for]="'answer-' + question.id">{{ 'Tu respuesta' | t }}</label>
                  <textarea
                    [id]="'answer-' + question.id"
                    [name]="'answer-' + question.id"
                    [(ngModel)]="texts[question.id]"
                    required
                    maxlength="5000"
                    [rows]="question.type === 'ESSAY' ? 5 : 2"
                    [placeholder]="'Escribe tu respuesta...' | t"
                  ></textarea>
                } @else {
                  <div class="options" [class.two]="question.type === 'TRUE_FALSE'">
                    @for (option of question.options; track option.id; let o = $index) {
                      <label class="option" [class.chosen]="selected(question.id, option.id)">
                        <input
                          [type]="question.type === 'MULTIPLE' ? 'checkbox' : 'radio'"
                          [name]="'option-' + question.id"
                          [checked]="selected(question.id, option.id)"
                          (change)="choose(question.id, option.id, question.type, $any($event.target).checked)"
                        />
                        @if (question.type !== 'TRUE_FALSE') {
                          <span class="letter" aria-hidden="true">{{ letters[o] }}</span>
                        }
                        <span>{{ option.text }}</span>
                      </label>
                    }
                  </div>
                }
              </fieldset>
            </li>
          }
        </ol>

        @if (error()) {
          <p class="error" role="alert">{{ error() }}</p>
        }

        <footer class="submit-bar">
          <span>
            <strong>{{ answeredCount() }}</strong> {{ 'de' | t }} {{ current.questions.length }}
            {{ 'respondidas' | t }}
          </span>
          <div>
            <button type="button" class="ghost" [disabled]="busy()" (click)="close()">{{ 'Cancelar' | t }}</button>
            <button class="primary" type="submit" [disabled]="busy()">
              {{ busy() ? ('Enviando...' | t) : ('Enviar evaluación' | t) }}
            </button>
          </div>
        </footer>
      </form>
    }

    @if (task(); as current) {
      <form class="quiz" (ngSubmit)="submitTask()">
        <header class="quiz-hero">
          <span class="eyebrow">{{ 'Tarea' | t }}</span>
          <h2>{{ current.title }}</h2>
          <div class="rich" [innerHTML]="current.description || '' | richHtml"></div>
        </header>
        @if (submission(); as previous) {
          <p class="pill-line" [attr.data-tone]="previous.status === 'GRADED' ? 'ok' : 'sent'">
            @if (previous.status === 'GRADED') {
              {{ 'Calificada' | t }}: {{ previous.score }} / {{ current.maxScore }}
            } @else {
              {{ 'Entregada. Pendiente de revisión.' | t }}
            }
          </p>
          @if (previous.feedback) {
            <blockquote>{{ previous.feedback }}</blockquote>
          }
        }
        <label class="field-label" for="task-answer">{{ 'Tu entrega' | t }}</label>
        <textarea
          id="task-answer"
          name="task-answer"
          [(ngModel)]="taskText"
          maxlength="20000"
          rows="5"
          [disabled]="busy() || submission()?.status === 'GRADED'"
        ></textarea>
        <label class="field-label" for="task-files">{{ 'Adjuntar documento (máximo 10 archivos)' | t }}</label>
        <input
          id="task-files"
          type="file"
          accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip,.txt"
          [disabled]="busy() || files().length >= 10 || submission()?.status === 'GRADED'"
          (change)="upload($event)"
        />
        @for (file of files(); track file.name) {
          <p class="file">
            {{ file.originalName }}
            <button
              type="button"
              class="ghost small"
              [disabled]="busy() || submission()?.status === 'GRADED'"
              (click)="removeFile(file.name)"
            >
              {{ 'Quitar' | t }}
            </button>
          </p>
        }
        @if (error()) {
          <p class="error" role="alert">{{ error() }}</p>
        }
        @if (notice()) {
          <p class="notice" role="status">{{ notice() }}</p>
        }
        <footer class="submit-bar">
          <span></span>
          <div>
            <button type="button" class="ghost" [disabled]="busy()" (click)="close()">{{ 'Cerrar' | t }}</button>
            <button
              class="primary"
              type="submit"
              [disabled]="busy() || submission()?.status === 'GRADED' || (!taskText.trim() && !files().length)"
            >
              {{ 'Enviar tarea' | t }}
            </button>
          </div>
        </footer>
      </form>
    }

    @if (error() && !quiz() && !task()) {
      <p class="error" role="alert">{{ error() }}</p>
    }
  `,
  styles: `
    :host {
      --accent: #1265ed;
      --ok: #0a8f7a;
      --warn: #b86e00;
      --bad: #bb354a;
      display: block;
      color: var(--ink);
      font-size: 0.9rem;
    }
    h2,
    h3,
    p {
      margin: 0;
    }
    button {
      font: inherit;
      cursor: pointer;
    }
    button:disabled {
      opacity: 0.55;
      cursor: not-allowed;
    }
    .sr-only {
      position: absolute;
      width: 1px;
      height: 1px;
      overflow: hidden;
      clip: rect(0 0 0 0);
      white-space: nowrap;
    }
    .eyebrow {
      display: block;
      margin-bottom: 6px;
      color: #008c9f;
      font-size: 0.68rem;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }
    .primary,
    .ghost {
      padding: 11px 20px;
      border-radius: 12px;
      font-weight: 700;
      font-size: 0.85rem;
      transition: transform 0.15s, box-shadow 0.15s, border-color 0.15s;
    }
    .primary {
      border: 0;
      color: #fff;
      background: linear-gradient(135deg, #1467ec, #09a6c6);
      box-shadow: 0 8px 18px #1265ed40;
    }
    .primary:hover:not(:disabled) {
      transform: translateY(-1px);
      box-shadow: 0 10px 22px #1265ed55;
    }
    .ghost {
      border: 1px solid var(--border);
      color: var(--ink);
      background: transparent;
    }
    .ghost:hover:not(:disabled) {
      border-color: var(--accent);
      color: var(--accent);
    }
    .small {
      padding: 5px 10px;
      font-size: 0.74rem;
    }
    button:focus-visible,
    .option:has(input:focus-visible) {
      outline: 3px solid color-mix(in srgb, var(--accent) 45%, transparent);
      outline-offset: 2px;
    }

    /* Lista */
    .list-head {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 16px;
    }
    .list-head h3 {
      font-size: clamp(1.3rem, 2.2vw, 1.8rem);
      font-weight: 800;
      letter-spacing: -0.03em;
    }
    .list-head p {
      margin-top: 8px;
      max-width: 52ch;
      color: var(--muted);
      line-height: 1.6;
    }
    .summary {
      display: flex;
      align-items: center;
      gap: 14px;
      margin: 22px 0 6px;
      color: var(--muted);
      font-size: 0.8rem;
    }
    .summary strong {
      color: var(--ink);
    }
    .summary-bar,
    .progress {
      flex: 1;
      height: 8px;
      border-radius: 99px;
      overflow: hidden;
      background: color-mix(in srgb, var(--border) 70%, transparent);
    }
    .summary-bar span,
    .progress span {
      display: block;
      height: 100%;
      border-radius: inherit;
      background: linear-gradient(90deg, #09a6c6, var(--ok));
      transition: width 0.35s ease;
    }
    .cards {
      display: grid;
      gap: 10px;
      margin: 16px 0 0;
      padding: 0;
      list-style: none;
    }
    .assessment {
      display: flex;
      align-items: center;
      gap: 14px;
      width: 100%;
      padding: 14px 16px;
      border: 1px solid var(--border);
      border-radius: 16px;
      color: inherit;
      text-align: left;
      background: var(--surface);
      transition: border-color 0.15s, box-shadow 0.15s, transform 0.15s;
    }
    .assessment:hover:not(:disabled) {
      border-color: color-mix(in srgb, var(--accent) 55%, var(--border));
      box-shadow: 0 8px 22px #12365e14;
      transform: translateY(-1px);
    }
    .badge {
      display: grid;
      place-items: center;
      flex-shrink: 0;
      width: 44px;
      height: 44px;
      border-radius: 12px;
      color: var(--accent);
      background: color-mix(in srgb, var(--accent) 12%, transparent);
    }
    .badge[data-kind='assignment'] {
      color: #7a4ce0;
      background: color-mix(in srgb, #7a4ce0 12%, transparent);
    }
    .passed .badge {
      color: var(--ok);
      background: color-mix(in srgb, var(--ok) 14%, transparent);
    }
    .card-text {
      display: grid;
      flex: 1;
      gap: 3px;
      min-width: 0;
    }
    .card-text small {
      color: var(--muted);
      font-size: 0.72rem;
    }
    .card-text strong {
      font-size: 0.95rem;
      overflow-wrap: anywhere;
    }
    .pill {
      flex-shrink: 0;
      padding: 5px 11px;
      border-radius: 99px;
      font-size: 0.72rem;
      font-weight: 700;
      white-space: nowrap;
      color: var(--warn);
      background: color-mix(in srgb, var(--warn) 12%, transparent);
    }
    .pill[data-tone='ok'] {
      color: var(--ok);
      background: color-mix(in srgb, var(--ok) 13%, transparent);
    }
    .pill[data-tone='bad'] {
      color: var(--bad);
      background: color-mix(in srgb, var(--bad) 12%, transparent);
    }
    .go {
      color: var(--muted);
      width: 18px;
      height: 18px;
    }
    .empty {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 22px;
      border: 1px dashed var(--border);
      border-radius: 16px;
      color: var(--muted);
    }
    .loading {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-top: 18px;
      color: var(--muted);
    }
    .spinner {
      width: 16px;
      height: 16px;
      border: 2px solid var(--border);
      border-top-color: var(--accent);
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }
    @keyframes spin {
      to {
        transform: rotate(360deg);
      }
    }

    /* Evaluación */
    .quiz-hero h2 {
      font-size: clamp(1.4rem, 2.4vw, 2rem);
      font-weight: 800;
      letter-spacing: -0.03em;
      line-height: 1.2;
    }
    .quiz-hero p,
    .rich {
      margin-top: 10px;
      max-width: 62ch;
      color: var(--muted);
      line-height: 1.65;
    }
    .chips {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin: 16px 0 0;
      padding: 0;
      list-style: none;
    }
    .chips li {
      padding: 6px 12px;
      border: 1px solid var(--border);
      border-radius: 99px;
      color: var(--muted);
      font-size: 0.74rem;
      font-weight: 600;
    }
    .progress {
      display: block;
      margin: 22px 0 8px;
      height: 6px;
    }
    .questions {
      display: grid;
      gap: 14px;
      margin: 18px 0 0;
      padding: 0;
      list-style: none;
    }
    .question fieldset {
      margin: 0;
      padding: 18px 20px 20px;
      border: 1px solid var(--border);
      border-radius: 18px;
      background: var(--surface);
      transition: border-color 0.2s;
    }
    .question.answered fieldset {
      border-color: color-mix(in srgb, var(--ok) 45%, var(--border));
    }
    legend {
      display: flex;
      gap: 12px;
      float: left;
      width: 100%;
      margin-bottom: 14px;
      padding: 0;
      font-weight: 700;
      line-height: 1.45;
    }
    legend + * {
      clear: both;
    }
    .number {
      display: grid;
      place-items: center;
      flex-shrink: 0;
      width: 30px;
      height: 30px;
      border-radius: 9px;
      color: #fff;
      font-size: 0.8rem;
      background: linear-gradient(135deg, #1467ec, #09a6c6);
    }
    .answered .number {
      background: var(--ok);
    }
    .legend-text small {
      display: block;
      margin-bottom: 3px;
      color: var(--muted);
      font-size: 0.68rem;
      font-weight: 600;
      letter-spacing: 0.04em;
      text-transform: uppercase;
    }
    .options {
      display: grid;
      gap: 8px;
    }
    .options.two {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
    .option {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 12px 14px;
      border: 1.5px solid var(--border);
      border-radius: 12px;
      cursor: pointer;
      line-height: 1.4;
      transition: border-color 0.15s, background 0.15s;
    }
    .option:hover {
      border-color: color-mix(in srgb, var(--accent) 45%, var(--border));
    }
    .option.chosen {
      border-color: var(--accent);
      background: color-mix(in srgb, var(--accent) 8%, transparent);
    }
    .option input {
      appearance: none;
      display: grid;
      place-items: center;
      flex-shrink: 0;
      width: 20px;
      height: 20px;
      margin: 0;
      border: 2px solid color-mix(in srgb, var(--muted) 70%, transparent);
      border-radius: 50%;
      cursor: pointer;
    }
    .option input[type='checkbox'] {
      border-radius: 6px;
    }
    .option input:checked {
      border-color: var(--accent);
      background: var(--accent);
      box-shadow: inset 0 0 0 3px var(--surface);
    }
    .option input[type='checkbox']:checked {
      box-shadow: none;
      background: var(--accent)
        url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='white' stroke-width='3.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m5 12 4 4L19 6'/%3E%3C/svg%3E")
        center / 13px no-repeat;
    }
    .letter {
      display: grid;
      place-items: center;
      flex-shrink: 0;
      width: 24px;
      height: 24px;
      border-radius: 7px;
      color: var(--muted);
      font-size: 0.72rem;
      font-weight: 800;
      background: color-mix(in srgb, var(--border) 60%, transparent);
    }
    .chosen .letter {
      color: #fff;
      background: var(--accent);
    }
    textarea {
      display: block;
      width: 100%;
      box-sizing: border-box;
      padding: 12px 14px;
      border: 1.5px solid var(--border);
      border-radius: 12px;
      color: inherit;
      font: inherit;
      background: transparent;
      resize: vertical;
    }
    textarea:focus {
      outline: none;
      border-color: var(--accent);
      box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 18%, transparent);
    }
    .submit-bar {
      position: sticky;
      bottom: 0;
      z-index: 1;
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      margin-top: 18px;
      padding: 14px 0;
      border-top: 1px solid var(--border);
      color: var(--muted);
      font-size: 0.82rem;
      background: var(--surface);
    }
    .submit-bar strong {
      color: var(--ink);
    }
    .submit-bar div {
      display: flex;
      gap: 10px;
    }
    .error,
    .notice {
      margin-top: 14px;
      padding: 11px 14px;
      border-radius: 12px;
      font-size: 0.82rem;
    }
    .error {
      color: var(--bad);
      background: color-mix(in srgb, var(--bad) 10%, transparent);
    }
    .notice {
      color: var(--ok);
      background: color-mix(in srgb, var(--ok) 10%, transparent);
    }

    /* Resultado */
    .result {
      display: grid;
      justify-items: center;
      gap: 12px;
      padding: 34px 20px;
      text-align: center;
    }
    .result h3 {
      font-size: 1.5rem;
      font-weight: 800;
      letter-spacing: -0.03em;
    }
    .result p {
      max-width: 46ch;
      color: var(--muted);
      line-height: 1.6;
    }
    .ring {
      --value: 0;
      --tone: var(--warn);
      display: grid;
      place-content: center;
      justify-items: center;
      width: 140px;
      height: 140px;
      margin-bottom: 6px;
      border-radius: 50%;
      background:
        radial-gradient(closest-side, var(--surface) 80%, transparent 81%),
        conic-gradient(var(--tone) calc(var(--value) * 1%), color-mix(in srgb, var(--border) 70%, transparent) 0);
    }
    .result.ok .ring {
      --tone: var(--ok);
    }
    .ring strong {
      font-size: 2.3rem;
      line-height: 1;
      font-weight: 800;
    }
    .ring small {
      color: var(--muted);
      font-size: 0.75rem;
    }
    .result-icon {
      display: grid;
      place-items: center;
      width: 64px;
      height: 64px;
      border-radius: 50%;
      color: var(--accent);
      background: color-mix(in srgb, var(--accent) 12%, transparent);
    }
    .result-actions {
      display: flex;
      flex-wrap: wrap;
      justify-content: center;
      gap: 10px;
      margin-top: 8px;
    }

    /* Tarea (solo en la lista sin delegar) */
    .field-label {
      display: block;
      margin: 18px 0 8px;
      font-weight: 700;
      font-size: 0.82rem;
    }
    .pill-line {
      display: inline-block;
      margin-top: 16px;
      padding: 6px 12px;
      border-radius: 99px;
      color: var(--warn);
      font-size: 0.78rem;
      font-weight: 700;
      background: color-mix(in srgb, var(--warn) 12%, transparent);
    }
    .pill-line[data-tone='ok'] {
      color: var(--ok);
      background: color-mix(in srgb, var(--ok) 12%, transparent);
    }
    blockquote {
      margin: 12px 0 0;
      padding: 10px 14px;
      border-left: 3px solid var(--accent);
      color: var(--muted);
    }
    .file {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-top: 8px;
    }

    @media (max-width: 560px) {
      .list-head {
        flex-direction: column;
      }
      .options.two {
        grid-template-columns: 1fr;
      }
      .pill {
        display: none;
      }
      .submit-bar div {
        width: 100%;
      }
      .submit-bar button {
        flex: 1;
      }
    }
    @media (prefers-reduced-motion: reduce) {
      * {
        transition: none !important;
        animation: none !important;
      }
    }
  `,
})
export class CourseAssessments {
  readonly items = input<Assessment[]>([]);
  readonly modules = input<{ id: number; title: string }[]>([]);
  readonly changed = output<void>();
  /** Si llega, se abre directamente esa evaluación o tarea y no se muestra la lista. */
  readonly focus = input<Assessment | null>(null);
  /** true: al elegir un elemento de la lista se avisa con `picked` en vez de abrirlo aquí. */
  readonly delegate = input(false);
  readonly picked = output<Assessment>();
  /** Se pide cerrar la evaluación o tarea enfocada. */
  readonly closed = output<void>();
  private readonly http = inject(HttpClient);
  private readonly destroyRef = inject(DestroyRef);
  readonly quiz = signal<Quiz | null>(null);
  readonly task = signal<Task | null>(null);
  readonly submission = signal<Submission | null>(null);
  readonly result = signal<QuizResult | null>(null);
  readonly files = signal<{ name: string; originalName: string }[]>([]);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly notice = signal('');
  readonly passedCount = computed(() => this.items().filter((item) => item.passed).length);
  readonly passedPercent = computed(() =>
    this.items().length ? (this.passedCount() / this.items().length) * 100 : 0,
  );
  readonly letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  texts: Record<number, string> = {};
  options: Record<number, number[]> = {};
  taskText = '';

  constructor() {
    effect(() => {
      const item = this.focus();
      if (item) untracked(() => this.open(item, true));
    });
  }
  close() {
    this.quiz.set(null);
    this.task.set(null);
    this.result.set(null);
    if (this.focus()) this.closed.emit();
  }
  pick(item: Assessment) {
    if (this.delegate()) this.picked.emit(item);
    else this.open(item);
  }
  moduleTitle(id: number) {
    return this.modules().find((m) => m.id === id)?.title ?? 'Módulo';
  }
  hint(type: string) {
    return QUESTION_HINTS[type] ?? '';
  }
  tone(item: Assessment): 'ok' | 'bad' | 'todo' {
    if (item.passed) return 'ok';
    return item.score === null ? 'todo' : 'bad';
  }
  statusLabel(item: Assessment) {
    if (item.passed) return 'Aprobada ✓';
    return item.score === null ? 'Pendiente' : item.score + ' / 100';
  }
  isAnswered(question: Quiz['questions'][number]) {
    return question.type === 'ESSAY' || question.type === 'FILL_BLANK'
      ? !!this.texts[question.id]?.trim()
      : !!this.options[question.id]?.length;
  }
  answeredCount() {
    return this.quiz()?.questions.filter((q) => this.isAnswered(q)).length ?? 0;
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
  open(item: Assessment, force = false) {
    if (this.busy() && !force) return;
    this.busy.set(true);
    this.error.set('');
    this.notice.set('');
    this.result.set(null);
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
      .post<QuizResult>('/api/evaluations/' + quiz.id + '/attempts', { answers })
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.busy.set(false)),
      )
      .subscribe({
        next: (result) => {
          this.quiz.set(null);
          this.result.set(result);
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
