import { HttpClient } from '@angular/common/http';
import { Component, computed, DestroyRef, inject, input, output, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { apiErrorMessage } from '../../../../core/http/api-error';
import {
  BRAND_LABEL,
  brandOf,
  expiryError,
  formatCardNumber,
  formatExpiry,
  luhnValid,
  onlyDigits,
} from './card-format';

export interface PaymentReceipt {
  id: number;
  reference: string;
  status: 'APPROVED' | 'DECLINED';
  amount: number;
  currency: string;
  cardBrand: string;
  cardLast4: string;
  payerName: string;
  failureReason: string | null;
  createdAt: string;
  course: { id: number; title: string };
}

interface CheckoutResponse {
  status: 'APPROVED' | 'DECLINED';
  alreadyPaid: boolean;
  enrolled: boolean;
  reason?: string;
  payment: PaymentReceipt;
}

/** Formulario de pago SIMULADO: no hay pasarela real ni se cobra dinero. */
@Component({
  selector: 'app-checkout-dialog',
  templateUrl: './checkout-dialog.html',
  styleUrl: './checkout-dialog.scss',
})
export class CheckoutDialog {
  private readonly http = inject(HttpClient);
  private readonly destroyRef = inject(DestroyRef);

  readonly BRAND = BRAND_LABEL;
  readonly courseId = input.required<string>();
  readonly title = input.required<string>();
  readonly amount = input.required<number>();
  readonly needsPassword = input(false);
  readonly paid = output<void>();
  readonly closed = output<void>();

  readonly holder = signal('');
  readonly number = signal('');
  readonly expiry = signal('');
  readonly cvv = signal('');
  readonly password = signal('');
  readonly touched = signal(false);
  readonly processing = signal(false);
  readonly serverError = signal('');
  readonly declined = signal('');
  readonly receipt = signal<PaymentReceipt | null>(null);

  readonly testCards = [
    { label: 'Aprobada', number: '4242 4242 4242 4242', hint: 'Visa' },
    { label: 'Aprobada', number: '5555 5555 5555 4444', hint: 'Mastercard' },
    { label: 'Fondos insuficientes', number: '4000 0000 0000 0002', hint: 'Visa' },
  ];

  readonly digits = computed(() => onlyDigits(this.number()));
  readonly brand = computed(() => brandOf(this.digits()));
  readonly brandLabel = computed(() => BRAND_LABEL[this.brand()]);
  readonly cvvLength = computed(() => (this.brand() === 'AMEX' ? 4 : 3));
  readonly previewNumber = computed(() => {
    const raw = this.digits().padEnd(16, '•');
    return this.brand() === 'AMEX'
      ? [raw.slice(0, 4), raw.slice(4, 10), raw.slice(10, 15)].join(' ')
      : (raw.slice(0, 16).match(/.{4}/g) ?? []).join(' ');
  });

  readonly errors = computed(() => {
    const out: Record<string, string> = {};
    if (this.holder().trim().length < 2) out['holder'] = 'Escribe el nombre que aparece en la tarjeta';
    if (!luhnValid(this.digits())) out['number'] = 'El número de la tarjeta no es válido';
    const expiry = expiryError(this.expiry());
    if (expiry) out['expiry'] = expiry;
    if (this.cvv().length !== this.cvvLength()) out['cvv'] = `Son ${this.cvvLength()} dígitos`;
    if (this.needsPassword() && !this.password()) out['password'] = 'Escribe la contraseña del curso';
    return out;
  });

  readonly money = computed(() =>
    new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(
      this.amount(),
    ),
  );

  readonly receiptDate = computed(() => {
    const value = this.receipt()?.createdAt;
    return value
      ? new Intl.DateTimeFormat('es-CO', { dateStyle: 'long', timeStyle: 'short' }).format(new Date(value))
      : '';
  });

  setNumber(value: string): void {
    this.number.set(formatCardNumber(value));
  }

  setExpiry(value: string): void {
    this.expiry.set(formatExpiry(value));
  }

  setCvv(value: string): void {
    this.cvv.set(onlyDigits(value).slice(0, this.cvvLength()));
  }

  useTestCard(number: string): void {
    this.number.set(number);
    this.declined.set('');
    this.serverError.set('');
    if (!this.holder().trim()) this.holder.set('Estudiante de prueba');
    if (!this.expiry()) this.expiry.set('12/30');
    if (!this.cvv()) this.cvv.set('123');
  }

  submit(): void {
    this.touched.set(true);
    this.serverError.set('');
    this.declined.set('');
    if (this.processing() || Object.keys(this.errors()).length) return;
    this.processing.set(true);
    const [month, year] = this.expiry().split('/').map(Number);
    const started = Date.now();
    this.http
      .post<CheckoutResponse>(`/api/courses/${this.courseId()}/checkout`, {
        cardHolder: this.holder().trim(),
        cardNumber: this.digits(),
        expMonth: month,
        expYear: year,
        cvv: this.cvv(),
        ...(this.needsPassword() ? { password: this.password() } : {}),
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        // Un respiro para que se note que «se está procesando».
        next: (response) => setTimeout(() => this.finish(response), Math.max(0, 1200 - (Date.now() - started))),
        error: (error: unknown) => {
          this.processing.set(false);
          this.serverError.set(apiErrorMessage(error, 'No pudimos procesar el pago. Intenta nuevamente.'));
        },
      });
  }

  private finish(response: CheckoutResponse): void {
    this.processing.set(false);
    if (response.status === 'APPROVED') {
      // `paid` se avisa al cerrar el comprobante: la página pasa a «inscrito» y destruiría este diálogo.
      this.receipt.set(response.payment);
    } else {
      this.declined.set(response.reason || 'El banco rechazó el pago');
    }
  }

  close(): void {
    if (this.processing()) return;
    if (this.receipt()) this.paid.emit();
    this.closed.emit();
  }
}
