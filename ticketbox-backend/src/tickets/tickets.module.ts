import { Module } from '@nestjs/common';
import { TicketsController } from './tickets.controller.js';
import { TicketsService } from './tickets.service.js';
import { TicketsGateway } from './tickets.gateway.js';
import { AuthModule } from '../auth/auth.module.js';

@Module({
  imports: [AuthModule],
  controllers: [TicketsController],
  providers: [TicketsService, TicketsGateway],
  exports: [TicketsService, TicketsGateway],
})
export class TicketsModule {}
