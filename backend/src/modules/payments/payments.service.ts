import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';

import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface.js';
import { ProgressService } from '../progress/progress.service.js';
import { brandOf, cvvValid, isExpired, luhnValid, newReference, simulateGateway } from './card.js';
import type { CheckoutDto } from './dto/checkout.dto.js';
import { PaymentsRepository } from './payments.repository.js';

type PaymentRow = NonNullable<Awaited<ReturnType<PaymentsRepository['findApproved']>>>;

/**
 * Compra de cursos con una pasarela SIMULADA: valida la tarjeta, «cobra» (no se mueve dinero) y, si la
 * aprueba, inscribe a la persona. Guarda el comprobante, nunca el número completo ni el código de seguridad.
 */
@Injectable()
export class PaymentsService {
  constructor(
    private readonly repository: PaymentsRepository,
    private readonly progress: ProgressService,
  ) {}

  async checkout(user: AuthenticatedUser, courseId: number, dto: CheckoutDto, now = new Date()) {
    // Antes de cobrar: que el curso se pueda comprar y que la persona pueda entrar (cupo, contraseña…).
    const { price } = await this.progress.assertCanEnroll(user, courseId, dto.password);
    const course = await this.repository.coursePrice(courseId);

    if (!course) {
      throw new NotFoundException('El curso no existe');
    }

    // Un curso gratis no se paga: se inscribe con el botón de siempre.
    if (price <= 0) {
      throw new BadRequestException('Este curso es gratis: no necesita pago');
    }

    // Si ya lo pagó antes (por ejemplo, canceló su inscripción), no se le cobra otra vez.
    const paid = await this.repository.findApproved(user.id, courseId);

    if (paid) {
      await this.progress.enroll(user, courseId, dto.password);

      return { status: 'APPROVED' as const, alreadyPaid: true, enrolled: true, payment: this.present(paid) };
    }

    this.assertCardUsable(dto, now);

    const brand = brandOf(dto.cardNumber);
    const result = simulateGateway(dto.cardNumber);
    const payment = await this.repository.create({
      reference: await this.uniqueReference(),
      status: result.approved ? 'APPROVED' : 'DECLINED',
      amount: price,
      cardBrand: brand,
      cardLast4: dto.cardNumber.slice(-4),
      payerName: dto.cardHolder,
      failureReason: result.reason,
      userId: user.id,
      courseId,
    });

    if (!result.approved) {
      return { status: 'DECLINED' as const, alreadyPaid: false, enrolled: false, reason: result.reason, payment: this.present(payment) };
    }

    await this.progress.enroll(user, courseId, dto.password);

    return { status: 'APPROVED' as const, alreadyPaid: false, enrolled: true, payment: this.present(payment) };
  }

  async mine(user: AuthenticatedUser) {
    return (await this.repository.mine(user.id)).map((payment) => this.present(payment));
  }

  /** Errores de la tarjeta que el formulario puede corregir, con un mensaje claro cada uno. */
  private assertCardUsable(dto: CheckoutDto, now: Date) {
    const brand = brandOf(dto.cardNumber);

    if (!luhnValid(dto.cardNumber)) {
      throw new BadRequestException('El número de la tarjeta no es válido: revisa que lo hayas escrito bien');
    }

    if (isExpired(dto.expMonth, dto.expYear, now)) {
      throw new BadRequestException('La tarjeta está vencida');
    }

    if (!cvvValid(dto.cvv, brand)) {
      throw new BadRequestException(
        brand === 'AMEX' ? 'El código de seguridad de American Express tiene 4 dígitos' : 'El código de seguridad debe tener 3 dígitos',
      );
    }
  }

  private async uniqueReference(): Promise<string> {
    for (let attempt = 0; attempt < 5; attempt++) {
      const reference = newReference();

      if (!(await this.repository.referenceExists(reference))) {
        return reference;
      }
    }

    throw new Error('No se pudo generar un comprobante único');
  }

  private present(payment: Pick<PaymentRow, 'id' | 'reference' | 'status' | 'amount' | 'currency' | 'cardBrand' | 'cardLast4' | 'payerName' | 'failureReason' | 'createdAt' | 'course'>) {
    return {
      id: payment.id,
      reference: payment.reference,
      status: payment.status,
      amount: Number(payment.amount),
      currency: payment.currency,
      cardBrand: payment.cardBrand,
      cardLast4: payment.cardLast4,
      payerName: payment.payerName,
      failureReason: payment.failureReason,
      createdAt: payment.createdAt,
      course: payment.course,
    };
  }
}
