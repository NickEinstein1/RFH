import { Body, Controller, Get, Post, Req } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { AuthService } from './auth.service';
import {
  ChangePasswordDto,
  CreateUserDto,
  LoginDto,
  PasswordResetConfirmDto,
  PasswordResetRequestDto,
  RefreshDto,
  RegisterTenantDto,
  SwitchHomeDto,
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
  @Throttle({ default: { limit: 8, ttl: 60_000 } })
  @Post('login')
  login(@Body() dto: LoginDto, @Req() req: Request) {
    return this.auth.login(dto, req);
  }

  @Public()
  @Post('refresh')
  refresh(@Body() dto: RefreshDto) {
    return this.auth.refresh(dto.refreshToken);
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('password-reset/request')
  requestReset(@Body() dto: PasswordResetRequestDto, @Req() req: Request) {
    return this.auth.requestPasswordReset(dto, req);
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('password-reset/confirm')
  confirmReset(@Body() dto: PasswordResetConfirmDto, @Req() req: Request) {
    return this.auth.confirmPasswordReset(dto, req);
  }

  @Post('logout')
  logout(
    @CurrentUser() user: AuthUser,
    @Body() body: RefreshDto,
    @Req() req: Request,
  ) {
    return this.auth.logout(user, body.refreshToken, req);
  }

  @Post('change-password')
  changePassword(
    @CurrentUser() user: AuthUser,
    @Body() dto: ChangePasswordDto,
    @Req() req: Request,
  ) {
    return this.auth.changePassword(user, dto, req);
  }

  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return this.auth.me(user);
  }

  @Get('homes')
  homes(@CurrentUser() user: AuthUser) {
    return this.auth.listHomes(user);
  }

  @Post('switch-home')
  switchHome(
    @CurrentUser() user: AuthUser,
    @Body() dto: SwitchHomeDto,
    @Req() req: Request,
  ) {
    return this.auth.switchHome(user, dto.tenantId, req);
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
