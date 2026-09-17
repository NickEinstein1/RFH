import { Body, Controller, Get, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { AuthService } from './auth.service';
import {
  CreateUserDto,
  LoginDto,
  RefreshDto,
  RegisterTenantDto,
} from './dto/auth.dto';
import { Public, RequirePermissions } from '../common/decorators/auth.decorators';
import { Permissions } from '../common/enums/rbac';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUser } from '../common/decorators/current-user.decorator';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('register-tenant')
  registerTenant(@Body() dto: RegisterTenantDto, @Req() req: Request) {
    return this.auth.registerTenant(dto, req);
  }

  @Public()
  @Post('login')
  login(@Body() dto: LoginDto, @Req() req: Request) {
    return this.auth.login(dto, req);
  }

  @Public()
  @Post('refresh')
  refresh(@Body() dto: RefreshDto) {
    return this.auth.refresh(dto.refreshToken);
  }

  @Post('logout')
  logout(
    @CurrentUser() user: AuthUser,
    @Body() body: RefreshDto,
    @Req() req: Request,
  ) {
    return this.auth.logout(user, body.refreshToken, req);
  }

  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return this.auth.me(user);
  }

  @Post('users')
  @RequirePermissions(Permissions.USERS_MANAGE)
  createUser(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateUserDto,
    @Req() req: Request,
  ) {
    return this.auth.createUser(user, dto, req);
  }
}
