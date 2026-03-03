import { Type } from 'class-transformer';
import {
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { IssueCategory } from '../../common/enums/issue-category.enum';
import { IssuePriority } from '../../common/enums/issue-priority.enum';

export class CreateIssueDto {
  @IsEnum(IssueCategory)
  category: IssueCategory;

  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  title: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsEnum(IssuePriority)
  priority?: IssuePriority;

  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  region: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  latitude?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  longitude?: number;

  @IsOptional()
  @IsString()
  @MaxLength(1024)
  imageUrl?: string;
}
