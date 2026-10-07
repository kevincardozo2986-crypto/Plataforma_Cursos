import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from '../dist/modules/auth/auth.module.js';
import { DatabaseModule } from '../dist/database/database.module.js';

// Allows authentication tests to run independently of unrelated application modules.
export class AuthTestModule {}
Module({ imports: [ConfigModule.forRoot({ isGlobal: true }), DatabaseModule, AuthModule] })(AuthTestModule);
