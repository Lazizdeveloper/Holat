import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class RegisterGovDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(140)
  fullName: string;

  @IsEmail()
  email: string;

  @IsString()
  @MinLength(6)
  @MaxLength(72)
  password: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  ministryKey: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  ministryName: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  position?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  region?: string;
}
