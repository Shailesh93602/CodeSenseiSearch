import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, Profile } from 'passport-github2';
import { ConfigService } from '@nestjs/config';
import { AuthService, AuthUser } from '../auth.service';

@Injectable()
export class GitHubStrategy extends PassportStrategy(Strategy, 'github') {
  constructor(
    private readonly configService: ConfigService,
    private readonly authService: AuthService,
  ) {
    super({
      clientID: configService.get('GITHUB_CLIENT_ID') ?? '',
      clientSecret: configService.get('GITHUB_CLIENT_SECRET') ?? '',
      callbackURL:
        configService.get('GITHUB_CALLBACK_URL') ??
        'http://localhost:3001/auth/github/callback',
      scope: ['user:email'],
    });
  }

  async validate(
    accessToken: string,
    refreshToken: string,
    profile: Profile,
  ): Promise<AuthUser> {
    const { id, username, displayName, emails } = profile;

    // Get primary email
    const email = emails?.[0]?.value;

    if (!email) {
      throw new Error('No email found in GitHub profile');
    }

    // For MVP, we'll create or find user by email
    // In full implementation, we'd use the GitHub OAuth specific flow
    const user = await this.authService.getUserById(id);

    return (
      user ?? {
        id,
        email,
        name: displayName ?? username ?? 'GitHub User',
        role: 'USER' as any,
        isActive: true,
        githubId: id,
      }
    );
  }
}
