import {
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { IssueStatus } from '../../common/enums/issue-status.enum';

export class CreateClaimDto {
  @IsUUID()
  issueId: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  organization: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  statement: string;

  @IsOptional()
  @IsDateString()
  claimDate?: string;

  @IsOptional()
  @IsEnum(IssueStatus)
  status?: IssueStatus;
}
