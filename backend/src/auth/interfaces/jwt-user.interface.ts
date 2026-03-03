import { UserRole } from '../../common/enums/user-role.enum';

export interface JwtUser {
  sub: string;
  email: string;
  fullName: string;
  role: UserRole;
}
