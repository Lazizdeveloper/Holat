import { IsOptional, IsUUID } from 'class-validator';

export class ListClaimsQueryDto {
  @IsOptional()
  @IsUUID()
  issueId?: string;
}
