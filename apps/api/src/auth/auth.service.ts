import { Injectable, UnauthorizedException, ConflictException, BadRequestException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../services/prisma.service';
import * as bcrypt from 'bcryptjs';

// Simplified types for Phase 5 MVP - will be replaced with Prisma generated types
export enum UserRole {
  USER = 'USER',
  PREMIUM = 'PREMIUM',
  ADMIN = 'ADMIN',
  MODERATOR = 'MODERATOR',
}

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  isActive: boolean;
  githubId?: string;
}

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface RegisterData {
  email: string;
  password: string;
  name: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface JwtPayload {
  sub: string; // user ID
  email: string;
  name: string;
  role: UserRole;
  iat?: number;
  exp?: number;
  jti: string; // JWT ID for session management
}

export interface RefreshTokenPayload {
  sub: string; // user ID
  sessionId: string;
  iat?: number;
  exp?: number;
}

// Temporary session storage (in-memory for MVP, will move to database)
interface UserSession {
  id: string;
  userId: string;
  refreshToken: string;
  accessTokenHash: string;
  expiresAt: Date;
  userAgent?: string;
  ipAddress?: string;
  isRevoked: boolean;
  createdAt: Date;
}

@Injectable()
export class AuthService {
  private readonly saltRounds = 12;
  private readonly accessTokenExpiry = '15m';
  private readonly refreshTokenExpiry = '7d';
  private readonly sessions = new Map<string, UserSession>(); // Temporary in-memory storage

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Register a new user with email and password
   */
  async register(registerData: RegisterData): Promise<AuthUser> {
    const { email, password, name } = registerData;

    // Check if user already exists
    const existingUser = await this.prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      throw new ConflictException('User with this email already exists');
    }

    // Validate password strength
    this.validatePassword(password);

    // Hash password
    const passwordHash = await bcrypt.hash(password, this.saltRounds);

    try {
      // Create user with temporary password storage in preferences
      const user = await this.prisma.user.create({
        data: {
          email,
          name,
          avatar: null,
          githubId: null,
          emailNotifications: true,
          preferredLanguages: [],
          preferredRepos: [],
          theme: 'system',
          // Store password hash temporarily in preferences until we have proper auth tables
          // @ts-expect-error - temporary solution for MVP
          preferences: { passwordHash },
        },
      });

      return this.mapUserToAuthUser(user);
    } catch (error) {
      console.error('Registration error:', error);
      throw new BadRequestException('Failed to create user account');
    }
  }

  /**
   * Login user with email and password
   */
  async login(credentials: LoginCredentials, userAgent?: string, ipAddress?: string): Promise<{ user: AuthUser; tokens: AuthTokens }> {
    const { email, password } = credentials;

    // Find user by email
    const user = await this.prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid email or password');
    }

    // Get password hash from preferences (temporary solution)
    // @ts-expect-error - temporary solution for MVP
    const passwordHash = user.preferences?.passwordHash;
    if (!passwordHash) {
      throw new UnauthorizedException('Invalid email or password');
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, passwordHash);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid email or password');
    }

    // Generate tokens
    const tokens = this.generateTokens(user, userAgent, ipAddress);

    return {
      user: this.mapUserToAuthUser(user),
      tokens,
    };
  }

  /**
   * Refresh access token using refresh token
   */
  async refreshTokens(refreshToken: string, userAgent?: string, ipAddress?: string): Promise<AuthTokens> {
    try {
      // Verify refresh token
      this.jwtService.verify(refreshToken, {
        secret: this.configService.get('JWT_REFRESH_SECRET'),
      });

      // Find session
      const session = this.sessions.get(refreshToken);

      if (!session || session.expiresAt < new Date() || session.isRevoked) {
        throw new UnauthorizedException('Invalid or expired refresh token');
      }

      // Get user
      const user = await this.prisma.user.findUnique({
        where: { id: session.userId },
      });

      if (!user) {
        throw new UnauthorizedException('User not found');
      }

      // Revoke old session
      this.revokeSession(session.id);

      // Generate new tokens
      return this.generateTokens(user, userAgent, ipAddress);
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  /**
   * Logout user by revoking session
   */
  logout(refreshToken: string): void {
    const session = this.sessions.get(refreshToken);
    if (session) {
      this.revokeSession(session.id);
    }
  }

  /**
   * Validate JWT payload for protected routes
   */
  async validateJwtPayload(payload: JwtPayload): Promise<AuthUser> {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
    });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    // Check if JWT is blacklisted (session revoked)
    const session = Array.from(this.sessions.values()).find(
      s => s.userId === user.id && !s.isRevoked && s.expiresAt > new Date()
    );

    if (!session) {
      throw new UnauthorizedException('Session expired or revoked');
    }

    return this.mapUserToAuthUser(user);
  }

  /**
   * Get user by ID
   */
  async getUserById(userId: string): Promise<AuthUser | null> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    return user ? this.mapUserToAuthUser(user) : null;
  }

  /**
   * Change user password
   */
  async changePassword(userId: string, currentPassword: string, newPassword: string): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    // Get current password hash
    // @ts-expect-error - temporary solution for MVP
    const currentPasswordHash = user.preferences?.passwordHash;
    if (!currentPasswordHash) {
      throw new UnauthorizedException('No password set for this account');
    }

    // Verify current password
    const isCurrentPasswordValid = await bcrypt.compare(currentPassword, currentPasswordHash);
    if (!isCurrentPasswordValid) {
      throw new UnauthorizedException('Current password is incorrect');
    }

    // Validate new password
    this.validatePassword(newPassword);

    // Hash new password
    const newPasswordHash = await bcrypt.hash(newPassword, this.saltRounds);

    // Update password
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        // @ts-expect-error - temporary solution for MVP
        preferences: { 
          ...(user as any).preferences,
          passwordHash: newPasswordHash 
        },
      },
    });

    // Revoke all user sessions
    this.revokeAllUserSessions(userId);
  }

  /**
   * Generate JWT tokens and create session
   */
  private generateTokens(user: any, userAgent?: string, ipAddress?: string): AuthTokens {
    const jwtId = this.generateRandomToken();
    
    // Create JWT payload
    const jwtPayload: JwtPayload = {
      sub: user.id,
      email: user.email,
      name: user.name,
      role: UserRole.USER, // Default role for MVP
      jti: jwtId,
    };

    // Generate tokens
    const accessToken = this.jwtService.sign(jwtPayload, {
      secret: this.configService.get('JWT_SECRET'),
      expiresIn: this.accessTokenExpiry,
    });

    const refreshTokenPayload: RefreshTokenPayload = {
      sub: user.id,
      sessionId: jwtId,
    };

    const refreshToken = this.jwtService.sign(refreshTokenPayload, {
      secret: this.configService.get('JWT_REFRESH_SECRET'),
      expiresIn: this.refreshTokenExpiry,
    });

    // Calculate expiry date
    const refreshTokenExpiresAt = new Date();
    refreshTokenExpiresAt.setDate(refreshTokenExpiresAt.getDate() + 7);

    // Store session (in-memory for MVP)
    const session: UserSession = {
      id: jwtId,
      userId: user.id,
      refreshToken,
      accessTokenHash: this.hashToken(accessToken),
      expiresAt: refreshTokenExpiresAt,
      userAgent,
      ipAddress,
      isRevoked: false,
      createdAt: new Date(),
    };

    this.sessions.set(refreshToken, session);

    return {
      accessToken,
      refreshToken,
      expiresIn: 15 * 60, // 15 minutes in seconds
    };
  }

  /**
   * Revoke a user session
   */
  private revokeSession(sessionId: string): void {
    for (const [token, session] of this.sessions.entries()) {
      if (session.id === sessionId) {
        session.isRevoked = true;
        this.sessions.set(token, session);
        break;
      }
    }
  }

  /**
   * Revoke all sessions for a user
   */
  private revokeAllUserSessions(userId: string): void {
    for (const [token, session] of this.sessions.entries()) {
      if (session.userId === userId) {
        session.isRevoked = true;
        this.sessions.set(token, session);
      }
    }
  }

  /**
   * Validate password strength
   */
  private validatePassword(password: string): void {
    if (password.length < 8) {
      throw new BadRequestException('Password must be at least 8 characters long');
    }
    
    if (!/(?=.*[a-z])/.test(password)) {
      throw new BadRequestException('Password must contain at least one lowercase letter');
    }
    
    if (!/(?=.*[A-Z])/.test(password)) {
      throw new BadRequestException('Password must contain at least one uppercase letter');
    }
    
    if (!/(?=.*\d)/.test(password)) {
      throw new BadRequestException('Password must contain at least one number');
    }
  }

  /**
   * Map database user to auth user
   */
  private mapUserToAuthUser(user: any): AuthUser {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: UserRole.USER, // Default role for MVP
      isActive: true, // Default active for MVP
      githubId: user.githubId ?? undefined,
    };
  }

  /**
   * Generate a random token
   */
  private generateRandomToken(): string {
    return Math.random().toString(36).substring(2) + Date.now().toString(36);
  }

  /**
   * Hash a token for storage
   */
  private hashToken(token: string): string {
    return bcrypt.hashSync(token, 8);
  }
}