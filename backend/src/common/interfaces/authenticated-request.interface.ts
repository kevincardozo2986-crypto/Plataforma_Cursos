import type { Request } from 'express';

import {
  Role,
  UserStatus,
} from '../../generated/prisma/enums.js';

export interface AuthenticatedUser {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
  document: string | null;
  phone: string | null;
  role: Role;
  status: UserStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface AuthenticatedRequest extends Request {
  user?: AuthenticatedUser;
}