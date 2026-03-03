import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class OptionalJwtAuthGuard extends AuthGuard('jwt') {
  handleRequest<TUser = unknown>(
    err: unknown,
    user: TUser | false | null | undefined,
  ): TUser | undefined {
    if (err || !user) {
      return undefined;
    }
    return user;
  }
}
