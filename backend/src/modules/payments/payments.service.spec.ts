import { BadRequestException, ConflictException } from '@nestjs/common';

import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface.js';
import { Role } from '../../generated/prisma/enums.js';
import type { ProgressService } from '../progress/progress.service.js';
import type { CheckoutDto } from './dto/checkout.dto.js';
import type { PaymentsRepository } from './payments.repository.js';
import { PaymentsService } from './payments.service.js';

const student = { id: 5, role: Role.STUDENT } as AuthenticatedUser;
const now = new Date('2026-10-23T12:00:00Z');

const dto = (overrides: Partial<CheckoutDto> = {}): CheckoutDto => ({
  cardHolder: 'Ana Ruiz', cardNumber: '4242424242424242', expMonth: 12, expYear: 2028, cvv: '123', ...overrides,
});

function build() {
  const repository = {
    coursePrice: vi.fn().mockResolvedValue({ title: 'Angular', price: 50000 }),
    findApproved: vi.fn().mockResolvedValue(null),
    referenceExists: vi.fn().mockResolvedValue(false),
    create: vi.fn((data: Record<string, unknown>) => Promise.resolve({ id: 1, currency: 'COP', failureReason: null, createdAt: now, course: { id: 3, title: 'Angular' }, ...data })),
    mine: vi.fn().mockResolvedValue([]),
  };
  const progress = {
    assertCanEnroll: vi.fn().mockResolvedValue({ price: 50000 }),
    enroll: vi.fn().mockResolvedValue({ id: 1 }),
  };

  return {
    service: new PaymentsService(repository as unknown as PaymentsRepository, progress as unknown as ProgressService),
    repository,
    progress,
  };
}

describe('PaymentsService.checkout', () => {
  it('con una tarjeta válida aprueba, guarda el comprobante e inscribe', async () => {
    const { service, repository, progress } = build();

    const result = await service.checkout(student, 3, dto(), now);

    expect(result).toMatchObject({ status: 'APPROVED', enrolled: true, alreadyPaid: false, payment: { amount: 50000, cardBrand: 'VISA', cardLast4: '4242', status: 'APPROVED' } });
    expect(result.payment.reference).toMatch(/^PAY-/);
    expect(repository.create).toHaveBeenCalledOnce();
    expect(progress.enroll).toHaveBeenCalledWith(student, 3, undefined);
  });

  it('NUNCA guarda el número completo ni el código de seguridad', async () => {
    const { service, repository } = build();

    await service.checkout(student, 3, dto(), now);

    const saved = JSON.stringify(repository.create.mock.calls[0][0]);

    expect(saved).not.toContain('4242424242424242');
    expect(saved).not.toContain('"cvv"');
    expect(saved).not.toContain('123"');
  });

  it('la tarjeta de prueba de fondos insuficientes se rechaza: queda el comprobante y NO se inscribe', async () => {
    const { service, repository, progress } = build();

    const result = await service.checkout(student, 3, dto({ cardNumber: '4000000000000002' }), now);

    expect(result).toMatchObject({ status: 'DECLINED', enrolled: false, reason: 'Fondos insuficientes' });
    expect(repository.create).toHaveBeenCalledWith(expect.objectContaining({ status: 'DECLINED', failureReason: 'Fondos insuficientes' }));
    expect(progress.enroll).not.toHaveBeenCalled();
  });

  it.each([
    ['un número que no pasa la comprobación', { cardNumber: '4242424242424241' }],
    ['una tarjeta vencida', { expMonth: 1, expYear: 2025 }],
    ['un código de seguridad de 4 dígitos en Visa', { cvv: '1234' }],
  ])('rechaza %s (400) y no cobra ni inscribe', async (_name, change) => {
    const { service, repository, progress } = build();

    await expect(service.checkout(student, 3, dto(change), now)).rejects.toBeInstanceOf(BadRequestException);
    expect(repository.create).not.toHaveBeenCalled();
    expect(progress.enroll).not.toHaveBeenCalled();
  });

  it('American Express pide 4 dígitos de seguridad', async () => {
    const { service } = build();

    await expect(service.checkout(student, 3, dto({ cardNumber: '378282246310005', cvv: '123' }), now)).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.checkout(student, 3, dto({ cardNumber: '378282246310005', cvv: '1234' }), now)).resolves.toMatchObject({ status: 'APPROVED' });
  });

  it('un curso gratis no se paga (400)', async () => {
    const { service, progress, repository } = build();
    progress.assertCanEnroll.mockResolvedValue({ price: 0 });

    await expect(service.checkout(student, 3, dto(), now)).rejects.toBeInstanceOf(BadRequestException);
    expect(repository.create).not.toHaveBeenCalled();
  });

  it('si no puede inscribirse (cupo lleno, ya inscrito…), no se cobra nada', async () => {
    const { service, progress, repository } = build();
    progress.assertCanEnroll.mockRejectedValue(new ConflictException('Ya estás inscrito en este curso'));

    await expect(service.checkout(student, 3, dto(), now)).rejects.toBeInstanceOf(ConflictException);
    expect(repository.create).not.toHaveBeenCalled();
  });

  it('si ya lo había pagado, lo inscribe sin cobrar otra vez', async () => {
    const { service, repository, progress } = build();
    repository.findApproved.mockResolvedValue({ id: 9, reference: 'PAY-AAAA-BBBB', status: 'APPROVED', amount: 50000, currency: 'COP', cardBrand: 'VISA', cardLast4: '4242', payerName: 'Ana', failureReason: null, createdAt: now, course: { id: 3, title: 'Angular' } });

    const result = await service.checkout(student, 3, dto({ cardNumber: '1' }), now);

    expect(result).toMatchObject({ status: 'APPROVED', alreadyPaid: true, enrolled: true });
    expect(repository.create).not.toHaveBeenCalled();
    expect(progress.enroll).toHaveBeenCalledOnce();
  });

  it('reintenta si el código del comprobante ya existe', async () => {
    const { service, repository } = build();
    repository.referenceExists.mockResolvedValueOnce(true).mockResolvedValueOnce(false);

    await service.checkout(student, 3, dto(), now);

    expect(repository.referenceExists).toHaveBeenCalledTimes(2);
  });

  it('el importe viene del servidor, no de lo que mande el formulario', async () => {
    const { service, repository } = build();

    await service.checkout(student, 3, { ...dto(), amount: 1 } as unknown as CheckoutDto, now);

    expect(repository.create).toHaveBeenCalledWith(expect.objectContaining({ amount: 50000 }));
  });
});

describe('PaymentsService.mine', () => {
  it('devuelve los comprobantes con el importe como número', async () => {
    const { service, repository } = build();
    repository.mine.mockResolvedValue([{ id: 1, reference: 'PAY-AAAA-BBBB', status: 'APPROVED', amount: '50000.00', currency: 'COP', cardBrand: 'VISA', cardLast4: '4242', payerName: 'Ana', failureReason: null, createdAt: now, course: { id: 3, title: 'Angular' } }]);

    const result = await service.mine(student);

    expect(result[0]).toMatchObject({ amount: 50000, cardLast4: '4242', course: { title: 'Angular' } });
  });
});
