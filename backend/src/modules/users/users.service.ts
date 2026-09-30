import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import { Role } from '../../generated/prisma/enums.js';

interface CreateUserData {
  firstName: string;
  lastName: string;
  email: string;
  passwordHash: string;
  document: string;
  phone?: string;
}

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async findByEmail(email: string) {
    return this.prisma.user.findUnique({
      where: { email },
    });
  }

  async findByDocument(document: string) {
    return this.prisma.user.findUnique({
      where: { document },
    });
  }
  async findById(id: number) {
    return this.prisma.user.findUnique({
      where: { id },
      omit: {
        passwordHash: true,
      },
    });
  }

  async create(data: CreateUserData) {
    return this.prisma.user.create({
      data: {
        ...data,
        role: Role.STUDENT,
      },
      omit: {
        passwordHash: true,
      },
    });
  }
}
