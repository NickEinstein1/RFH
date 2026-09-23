import { Body, Controller, Get, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { IsString, MinLength } from 'class-validator';
import { FamilyService } from './family.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUser } from '../common/decorators/current-user.decorator';

class FamilyMessageDto {
  @IsString()
  residentId!: string;

  @IsString()
  @MinLength(2)
  body!: string;
}

@Controller('family')
export class FamilyController {
  constructor(private readonly family: FamilyService) {}

  @Get('portal')
  portal(@CurrentUser() user: AuthUser, @Req() req: Request) {
    return this.family.portal(user, req);
  }

  @Post('messages')
  sendMessage(
    @CurrentUser() user: AuthUser,
    @Body() dto: FamilyMessageDto,
    @Req() req: Request,
  ) {
    return this.family.sendMessage(user, dto, req);
  }
}
