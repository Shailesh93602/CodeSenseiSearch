import {
  Controller,
  Post,
  Body,
  Get,
  UseGuards,
  Request,
  Res,
  HttpCode,
  HttpStatus,
  ValidationPipe,
} from '@nestjs/common';
import type { Response } from 'express';
import { AuthService, AuthUser } from './auth.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { GitHubAuthGuard } from './guards/github-auth.guard';

// DTOs for request validation
export class LoginDto {
  email: string;
  password: string;
}

export class RegisterDto {
  email: string;
  password: string;
  name: string;
}

export class ChangePasswordDto {
  currentPassword: string;
  newPassword: string;
}

export interface AuthRequest extends Request {
  user: AuthUser;
}

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /**
   * Register a new user account
   */
  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  async register(@Body(ValidationPipe) registerDto: RegisterDto) {
    const user = await this.authService.register(registerDto);
    return {
      message: 'User registered successfully',
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
    };
  }

  /**
   * Login with email and password
   */
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body(ValidationPipe) loginDto: LoginDto, @Request() req: any) {
    const userAgent = req.get('User-Agent');
    const ipAddress = req.ip ?? req.connection.remoteAddress;

    const result = await this.authService.login(loginDto, userAgent, ipAddress);

    return {
      message: 'Login successful',
      user: {
        id: result.user.id,
        email: result.user.email,
        name: result.user.name,
        role: result.user.role,
      },
      tokens: result.tokens,
    };
  }

  /**
   * Refresh access token
   */
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refreshTokens(
    @Body() body: { refreshToken: string },
    @Request() req: any,
  ) {
    const userAgent = req.get('User-Agent');
    const ipAddress = req.ip ?? req.connection.remoteAddress;

    const tokens = await this.authService.refreshTokens(
      body.refreshToken,
      userAgent,
      ipAddress,
    );

    return {
      message: 'Tokens refreshed successfully',
      tokens,
    };
  }

  /**
   * Logout and invalidate session
   */
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  logout(@Body() body: { refreshToken: string }) {
    this.authService.logout(body.refreshToken);
    return { message: 'Logout successful' };
  }

  /**
   * Get current user profile
   */
  @Get('profile')
  @UseGuards(JwtAuthGuard)
  getProfile(@Request() req: AuthRequest) {
    return {
      user: {
        id: req.user.id,
        email: req.user.email,
        name: req.user.name,
        role: req.user.role,
        isActive: req.user.isActive,
        githubId: req.user.githubId,
      },
    };
  }

  /**
   * Change user password
   */
  @Post('change-password')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async changePassword(
    @Request() req: AuthRequest,
    @Body(ValidationPipe) changePasswordDto: ChangePasswordDto,
  ) {
    await this.authService.changePassword(
      req.user.id,
      changePasswordDto.currentPassword,
      changePasswordDto.newPassword,
    );

    return { message: 'Password changed successfully' };
  }

  /**
   * Initiate GitHub OAuth flow
   */
  @Get('github')
  @UseGuards(GitHubAuthGuard)
  githubAuth() {
    // Guard will redirect to GitHub
  }

  /**
   * GitHub OAuth callback
   */
  @Get('github/callback')
  @UseGuards(GitHubAuthGuard)
  githubCallback(@Request() req: any, @Res() res: Response) {
    // For MVP, we'll just return user info
    // In full implementation, we'd generate tokens and redirect to frontend
    const user = req.user;

    // For development, return JSON. In production, redirect to frontend with tokens
    if (process.env.NODE_ENV === 'development') {
      return res.json({
        message: 'GitHub authentication successful',
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          githubId: user.githubId,
        },
      });
    }

    // In production, redirect to frontend with token in query params or cookies
    res.redirect(`${process.env.FRONTEND_URL}/auth/success`);
  }

  /**
   * Health check endpoint for authentication service
   */
  @Get('health')
  health() {
    return {
      status: 'ok',
      service: 'authentication',
      timestamp: new Date().toISOString(),
    };
  }
}
