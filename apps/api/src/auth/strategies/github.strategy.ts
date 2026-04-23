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
    // passport-oauth2 throws synchronously if clientID is missing — even
    // if the /auth/github routes are never hit at runtime. When the
    // env isn't configured (the deployed portfolio build doesn't demo
    // OAuth), pass a placeholder so DI resolution succeeds; actual
    // OAuth calls will still fail with a proper 401 when someone tries.
    super({
      clientID:
        configService.get<string>('GITHUB_CLIENT_ID') ?? 'GITHUB_OAUTH_DISABLED',
      clientSecret:
        configService.get<string>('GITHUB_CLIENT_SECRET') ??
        'GITHUB_OAUTH_DISABLED',
      callbackURL:
        configService.get<string>('GITHUB_CALLBACK_URL') ??
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
