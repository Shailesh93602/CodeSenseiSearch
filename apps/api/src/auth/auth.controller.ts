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
import { Throttle } from '@nestjs/throttler';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import {
  IsEmail,
  IsNotEmpty,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import type { Response } from 'express';
import { AuthService, AuthUser } from './auth.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { GitHubAuthGuard } from './guards/github-auth.guard';

// DTOs for request validation. The global ValidationPipe in main.ts is
// configured with whitelist + forbidNonWhitelisted, so unknown fields
// here will reject the request before any handler runs. transform: true
// also coerces string types where appropriate.

const STRONG_PASSWORD_PATTERN =
  /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).+$/;

export class LoginDto {
  @IsEmail({}, { message: 'email must be a valid email address' })
  @MaxLength(254)
  email!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password!: string;
}

export class RegisterDto {
  @IsEmail({}, { message: 'email must be a valid email address' })
  @MaxLength(254)
  email!: string;

  @IsString()
  @MinLength(8, { message: 'password must be at least 8 characters' })
  @MaxLength(128)
  @Matches(STRONG_PASSWORD_PATTERN, {
    message:
      'password must contain at least one uppercase letter, one lowercase letter, and one digit',
  })
  password!: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  @MaxLength(100)
  name!: string;
}

export class ChangePasswordDto {
  @IsString()
  @IsNotEmpty()
  currentPassword!: string;

  @IsString()
  @MinLength(8, { message: 'newPassword must be at least 8 characters' })
  @MaxLength(128)
  @Matches(STRONG_PASSWORD_PATTERN, {
    message:
      'newPassword must contain at least one uppercase letter, one lowercase letter, and one digit',
  })
  newPassword!: string;
}

export interface AuthRequest extends Request {
  user: AuthUser;
}

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @ApiOperation({ summary: 'Register a new user account' })
  @ApiResponse({ status: 201, description: 'User created' })
  @ApiResponse({ status: 400, description: 'Validation failed' })
  @ApiResponse({ status: 409, description: 'Email already in use' })
  @ApiResponse({ status: 429, description: 'Rate limit (5/min) exceeded' })
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
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

  @ApiOperation({ summary: 'Login with email and password' })
  @ApiResponse({ status: 200, description: 'Login successful — returns access + refresh tokens' })
  @ApiResponse({ status: 401, description: 'Invalid credentials' })
  @ApiResponse({ status: 429, description: 'Rate limit (10/min) exceeded' })
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
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

  @ApiOperation({ summary: 'Get current user profile' })
  @ApiBearerAuth()
  @ApiResponse({ status: 200, description: 'Authenticated user profile' })
  @ApiResponse({ status: 401, description: 'Missing or invalid token' })
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

  @ApiOperation({ summary: 'Change the authenticated user password' })
  @ApiBearerAuth()
  @ApiResponse({ status: 200, description: 'Password updated' })
  @ApiResponse({ status: 401, description: 'Invalid current password or token' })
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
