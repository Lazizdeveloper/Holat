import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { JwtUser } from '../../auth/interfaces/jwt-user.interface';

export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): JwtUser | undefined => {
    const request = context.switchToHttp().getRequest<{ user?: JwtUser }>();
    return request.user;
  },
);
