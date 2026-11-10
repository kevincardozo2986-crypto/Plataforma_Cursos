import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import {
  Component,
  DestroyRef,
  HostListener,
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

import { apiErrorMessage } from '../../../core/http/api-error';
import { Assessment } from './course-assessments';

interface Question {
  id: number;
  text: string;
  type: string;
  options: { id: number; text: string }[];
}

interface Quiz {
  id: number;
  title: string;
  description?: string;
  questions: Question[];
}

interface AttemptResult {
  status: string;
  score: number;
  passed: boolean;
  earnedPoints?: number;
  totalPoints?: number;
  passingScore?: number;
  results?: { questionId: number; correct: boolean | null }[];
}

interface Saved {
  options: Record<number, number[]>;
  texts: Record<number, string>;
  flags: number[];
}

const HINTS: Record<string, string> = {
  TRUE_FALSE: 'Verdadero o falso',
  SINGLE: 'Elige una respuesta',
  MULTIPLE: 'Elige todas las correctas',
  FILL_BLANK: 'Completa la respuesta',
  ESSAY: 'Respuesta abierta',
};

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

/**
 * Responder una evaluación: una pregunta a la vez, con mapa de preguntas, marcas «para revisar»,
 * atajos de teclado, revisión antes de enviar y resultados con el detalle de cada pregunta.
 * Cada respuesta se guarda en el navegador al momento, así que recargar no pierde nada.
 */
@Component({
  selector: 'app-quiz-taker',
  imports: [TranslatePipe, FormsModule],
  templateUrl: './quiz-taker.html',
  styleUrl: './quiz-taker.scss',
})
export class QuizTaker {
  private readonly http = inject(HttpClient);
  private readonly destroyRef = inject(DestroyRef);

  readonly item = input.required<Assessment>();
  /** Todos los elementos del curso: para contar las evaluaciones y buscar el título del módulo. */
  readonly all = input<Assessment[]>([]);
  readonly modules = input<{ id: number; title: string }[]>([]);

  readonly changed = output<void>();
  readonly closed = output<void>();
  readonly showAll = output<void>();

  readonly quiz = signal<Quiz | null>(null);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly index = signal(0);
  readonly options = signal<Record<number, number[]>>({});
  readonly texts = signal<Record<number, string>>({});
  readonly flags = signal<ReadonlySet<number>>(new Set());
  readonly reviewing = signal(false);
  readonly submitting = signal(false);
  readonly result = signal<AttemptResult | null>(null);
  readonly animate = signal(0);
  readonly ringReady = signal(false);
  /** Las respuestas con las que se envió, para mostrarlas en la revisión. */
  readonly sent = signal<{ options: Record<number, number[]>; texts: Record<number, string> } | null>(null);

  readonly letters = LETTERS;
  readonly circle = 251.33;

  readonly evaluationCount = computed(
    () => this.all().filter((entry) => entry.type === 'evaluation').length,
  );
  readonly moduleTitle = computed(
    () => this.modules().find((module) => module.id === this.item().moduleId)?.title ?? '',
  );
  readonly current = computed(() => this.quiz()?.questions[this.index()] ?? null);
  readonly total = computed(() => this.quiz()?.questions.length ?? 0);
  readonly answered = computed(
    () => this.quiz()?.questions.filter((question) => this.isAnswered(question)).length ?? 0,
  );
  readonly minimum = computed(() => this.result()?.passingScore ?? this.item().minimum ?? 60);
  readonly hasBest = computed(() => this.item().score !== null && this.item().score !== undefined);
  readonly newBest = computed(() => {
    const result = this.result();
    const best = this.item().score;

    return !!result && result.status === 'GRADED' && result.score > (best ?? -1);
  });

  private advance?: ReturnType<typeof setTimeout>;

  constructor() {
    effect(() => {
      const item = this.item();

      untracked(() => this.load(item));
    });

    this.destroyRef.onDestroy(() => clearTimeout(this.advance));
  }

  // ----------------------------------------------------------------- carga

  load(item: Assessment = this.item()): void {
    clearTimeout(this.advance);
    this.loading.set(true);
    this.error.set('');
    this.result.set(null);
    this.sent.set(null);
    this.ringReady.set(false);
    this.reviewing.set(false);
    this.index.set(0);

    this.http
      .get<Quiz>('/api/evaluations/' + item.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (quiz) => {
          const saved = this.read(quiz.id);

          this.options.set(saved?.options ?? {});
          this.texts.set(saved?.texts ?? {});
          this.flags.set(new Set(saved?.flags ?? []));
          this.quiz.set(quiz);
          this.loading.set(false);
        },
        error: (error: unknown) => {
          this.error.set(apiErrorMessage(error, 'No pudimos abrir la evaluación.'));
          this.loading.set(false);
        },
      });
  }

  // ------------------------------------------------------------- respuestas

  hint(type: string): string {
    return HINTS[type] ?? '';
  }

  isOpen(question: Question): boolean {
    return question.type === 'ESSAY' || question.type === 'FILL_BLANK';
  }

  isAnswered(question: Question): boolean {
    return this.isOpen(question)
      ? !!this.texts()[question.id]?.trim()
      : !!this.options()[question.id]?.length;
  }

  selected(question: Question, optionId: number): boolean {
    return this.options()[question.id]?.includes(optionId) ?? false;
  }

  choose(question: Question, optionId: number, checked = true): void {
    const current = this.options()[question.id] ?? [];
    const next =
      question.type === 'MULTIPLE'
        ? checked
          ? [...new Set([...current, optionId])]
          : current.filter((id) => id !== optionId)
        : [optionId];

    this.options.update((all) => ({ ...all, [question.id]: next }));
    this.save();

    // En las de una sola respuesta, al elegir pasa sola a la siguiente.
    if (question.type !== 'MULTIPLE' && this.index() < this.total() - 1) {
      clearTimeout(this.advance);
      this.advance = setTimeout(() => this.go(1), 400);
    }
  }

  setText(question: Question, value: string): void {
    this.texts.update((all) => ({ ...all, [question.id]: value }));
    this.save();
  }

  toggleFlag(): void {
    const question = this.current();

    if (!question) return;

    this.flags.update((set) => {
      const next = new Set(set);

      if (!next.delete(question.id)) next.add(question.id);

      return next;
    });
    this.save();
  }

  isFlagged(question: Question): boolean {
    return this.flags().has(question.id);
  }

  // ------------------------------------------------------------- navegación

  go(delta: number): void {
    clearTimeout(this.advance);
    this.jump(this.index() + delta);
  }

  jump(index: number): void {
    clearTimeout(this.advance);
    this.index.set(Math.max(0, Math.min(this.total() - 1, index)));
    this.animate.update((n) => n + 1);
  }

  /** Preguntas sin responder o marcadas, para el aviso antes de enviar. */
  pending(): { index: number; label: string }[] {
    const questions = this.quiz()?.questions ?? [];

    return questions
      .map((question, index) => ({
        index,
        label: !this.isAnswered(question) ? 'sin responder' : this.isFlagged(question) ? 'marcada' : '',
      }))
      .filter((entry) => entry.label);
  }

  missing(): number {
    return this.total() - this.answered();
  }

  review(): void {
    if (this.answered() > 0) this.reviewing.set(true);
  }

  jumpFromReview(index: number): void {
    this.reviewing.set(false);
    this.jump(index);
  }

  // ----------------------------------------------------------------- envío

  submit(): void {
    const quiz = this.quiz();

    if (!quiz || this.submitting()) return;

    const answers = quiz.questions
      .filter((question) => this.isAnswered(question))
      .map((question) =>
        this.isOpen(question)
          ? { questionId: question.id, text: (this.texts()[question.id] ?? '').trim() }
          : { questionId: question.id, optionIds: this.options()[question.id] ?? [] },
      );

    this.submitting.set(true);
    this.error.set('');

    this.http
      .post<AttemptResult>('/api/evaluations/' + quiz.id + '/attempts', { answers })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (result) => {
          this.sent.set({ options: this.options(), texts: this.texts() });
          this.result.set(result);
          this.reviewing.set(false);
          this.submitting.set(false);
          this.clear(quiz.id);
          this.changed.emit();
          setTimeout(() => this.ringReady.set(true), 60);
        },
        error: (error: unknown) => {
          this.reviewing.set(false);
          this.submitting.set(false);
          this.error.set(apiErrorMessage(error, 'No pudimos enviar la evaluación.'));
        },
      });
  }

  // -------------------------------------------------------------- resultados

  dashOffset(): number {
    const score = this.result()?.score ?? 0;

    return this.ringReady() ? this.circle * (1 - Math.min(100, Math.max(0, score)) / 100) : this.circle;
  }

  /** Cuántas preguntas acertó (cuando el servidor da el detalle). */
  hits(): number {
    return this.result()?.results?.filter((entry) => entry.correct === true).length ?? 0;
  }

  verdict(question: Question): 'ok' | 'no' | 'open' {
    const entry = this.result()?.results?.find((item) => item.questionId === question.id);

    if (!entry || entry.correct === null) return 'open';

    return entry.correct ? 'ok' : 'no';
  }

  chosen(question: Question): { text: string; open: boolean }[] {
    const sent = this.sent();

    if (!sent) return [];

    if (this.isOpen(question)) {
      const text = (sent.texts[question.id] ?? '').trim();

      return text ? [{ text, open: true }] : [];
    }

    return question.options
      .filter((option) => sent.options[question.id]?.includes(option.id))
      .map((option) => ({ text: option.text, open: false }));
  }

  letter(question: Question, option: { id: number }): string {
    return LETTERS[question.options.findIndex((entry) => entry.id === option.id)] ?? '';
  }

  keyOf(question: Question, index: number): string {
    return question.type === 'TRUE_FALSE' ? (index === 0 ? '✓' : '✕') : (LETTERS[index] ?? '');
  }

  // ----------------------------------------------------------------- teclado

  @HostListener('document:keydown', ['$event'])
  onKey(event: KeyboardEvent): void {
    if (event.altKey || event.ctrlKey || event.metaKey) return;

    if (this.reviewing()) {
      if (event.key === 'Escape') this.reviewing.set(false);
      return;
    }

    const question = this.current();
    const target = event.target as HTMLElement | null;

    if (!question || this.result() || target?.closest('textarea, input[type=text], select')) return;

    const key = event.key.toUpperCase();
    let option = -1;

    if (question.type === 'TRUE_FALSE') {
      if (key === 'V') option = 0;
      if (key === 'F') option = 1;
    } else if (!this.isOpen(question)) {
      option = LETTERS.indexOf(key);
    }

    if (option < 0 && /^[1-9]$/.test(event.key) && !this.isOpen(question)) option = Number(event.key) - 1;

    if (option >= 0 && option < question.options.length) {
      const choice = question.options[option];

      this.choose(question, choice.id, !(question.type === 'MULTIPLE' && this.selected(question, choice.id)));
      event.preventDefault();
      return;
    }

    if (event.key === 'ArrowRight') this.go(1);
    if (event.key === 'ArrowLeft') this.go(-1);
  }

  // ----------------------------------------------------------- almacenamiento

  private key(id: number): string {
    return `campus.quiz:${id}`;
  }

  private read(id: number): Saved | null {
    try {
      const raw = localStorage.getItem(this.key(id));

      return raw ? (JSON.parse(raw) as Saved) : null;
    } catch {
      return null;
    }
  }

  private save(): void {
    const quiz = this.quiz();

    if (!quiz) return;

    try {
      localStorage.setItem(
        this.key(quiz.id),
        JSON.stringify({ options: this.options(), texts: this.texts(), flags: [...this.flags()] } satisfies Saved),
      );
    } catch {
      // Sin almacenamiento: las respuestas se conservan mientras la página siga abierta.
    }
  }

  private clear(id: number): void {
    try {
      localStorage.removeItem(this.key(id));
    } catch {
      // Nada que limpiar.
    }
  }
}
