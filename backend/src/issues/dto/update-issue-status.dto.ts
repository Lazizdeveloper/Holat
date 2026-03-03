import { IsEnum } from 'class-validator';
import { IssueStatus } from '../../common/enums/issue-status.enum';

export class UpdateIssueStatusDto {
  @IsEnum(IssueStatus)
  status: IssueStatus;
}
