import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../database/prisma.service.js';
import type { PaymentStatus } from '../../generated/prisma/enums.js';

const select = {
  id: true,
  reference: true,
  status: true,
  amount: true,
  currency: true,
  cardBrand: true,
  cardLast4: true,
  payerName: true,
  failureReason: true,
  createdAt: true,
  course: { select: { id: true, title: true } },
} as const;

@Injectable()
export class PaymentsRepository {
  constructor(private readonly prisma: PrismaService) {}

  coursePrice(courseId: number) {
    return this.prisma.course.findUnique({ where: { id: courseId }, select: { title: true, price: true } });
  }

  findApproved(userId: number, courseId: number) {
    return this.prisma.payment.findFirst({ where: { userId, courseId, status: 'APPROVED' }, select, orderBy: { id: 'desc' } });
  }

  referenceExists(reference: string) {
    return this.prisma.payment.count({ where: { reference } }).then((n) => n > 0);
  }

  create(data: {
    reference: string;
    status: PaymentStatus;
    amount: number;
    cardBrand: string;
    cardLast4: string;
    payerName: string;
    failureReason?: string;
    userId: number;
    courseId: number;
  }) {
    return this.prisma.payment.create({ data, select });
  }

  mine(userId: number) {
    return this.prisma.payment.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: 100, select });
  }
}
