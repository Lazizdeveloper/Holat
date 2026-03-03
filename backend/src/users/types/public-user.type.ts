import { UserRole } from '../../common/enums/user-role.enum';

export type PublicUser = {
  id: string;
  role: UserRole;
  fullName: string;
  email: string;
  phone: string | null;
  pinfl: string | null;
  region: string | null;
  ministryKey: string | null;
  ministryName: string | null;
  position: string | null;
  createdAt: Date;
  updatedAt: Date;
};
