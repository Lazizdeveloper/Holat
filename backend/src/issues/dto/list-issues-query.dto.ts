import { Transform, type TransformFnParams, Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { IssueCategory } from '../../common/enums/issue-category.enum';
import { IssuePriority } from '../../common/enums/issue-priority.enum';
import { IssueStatus } from '../../common/enums/issue-status.enum';

const toBoolean = ({ value }: TransformFnParams): boolean | undefined => {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }

  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true' || normalized === '1') {
      return true;
    }
    if (normalized === 'false' || normalized === '0') {
      return false;
    }
  }

  return undefined;
};

export type IssueSortBy =
  | 'createdAt'
  | 'updatedAt'
  | 'votes'
  | 'priority'
  | 'status';

export type SortOrder = 'asc' | 'desc';

export class ListIssuesQueryDto {
  @IsOptional()
  @IsEnum(IssueStatus)
  status?: IssueStatus;

  @IsOptional()
  @IsEnum(IssueCategory)
  category?: IssueCategory;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  region?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;

  @IsOptional()
  @IsEnum(IssuePriority)
  priority?: IssuePriority;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @IsOptional()
  @IsIn(['createdAt', 'updatedAt', 'votes', 'priority', 'status'])
  sortBy?: IssueSortBy;

  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortOrder?: SortOrder;

  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  mine?: boolean;

  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  voted?: boolean;

  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  hasClaim?: boolean;
}
