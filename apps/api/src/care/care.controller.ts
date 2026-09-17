import { Body, Controller, Get, Param, Patch, Post, Query, Req } from '@nestjs/common';
import type { Request } from 'express';
import { CareService } from './care.service';
import {
  CreateCarePlanDto,
  CreateCareTaskDto,
  RecordTaskCompletionDto,
  UpdateCarePlanDto,
} from './dto/care.dto';
import { RequirePermissions } from '../common/decorators/auth.decorators';
import { Permissions } from '../common/enums/rbac';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUser } from '../common/decorators/current-user.decorator';

@Controller('care')
export class CareController {
  constructor(private readonly care: CareService) {}

  @Post('plans')
  @RequirePermissions(Permissions.CARE_PLANS_WRITE)
  createPlan(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateCarePlanDto,
    @Req() req: Request,
  ) {
    return this.care.createPlan(user, dto, req);
  }

  @Get('plans')
  @RequirePermissions(Permissions.CARE_PLANS_READ)
  listPlans(
    @CurrentUser() user: AuthUser,
    @Query('residentId') residentId: string,
    @Req() req: Request,
  ) {
    return this.care.listPlans(user, residentId, req);
  }

  @Patch('plans/:id')
  @RequirePermissions(Permissions.CARE_PLANS_WRITE)
  updatePlan(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateCarePlanDto,
    @Req() req: Request,
  ) {
    return this.care.updatePlan(user, id, dto, req);
  }

  @Post('tasks')
  @RequirePermissions(Permissions.CARE_PLANS_WRITE)
  createTask(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateCareTaskDto,
    @Req() req: Request,
  ) {
    return this.care.createTask(user, dto, req);
  }

  @Get('task-board')
  @RequirePermissions(Permissions.TASKS_COMPLETE)
  taskBoard(
    @CurrentUser() user: AuthUser,
    @Query('residentId') residentId: string,
    @Query('date') date: string,
    @Req() req: Request,
  ) {
    return this.care.taskBoard(user, residentId, date || new Date().toISOString().slice(0, 10), req);
  }

  @Post('completions')
  @RequirePermissions(Permissions.TASKS_COMPLETE)
  record(
    @CurrentUser() user: AuthUser,
    @Body() dto: RecordTaskCompletionDto,
    @Req() req: Request,
  ) {
    return this.care.recordCompletion(user, dto, req);
  }
}
