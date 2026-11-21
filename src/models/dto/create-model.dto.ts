import {
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class CreateModelDto {
  @IsString()
  @IsNotEmpty()
  title: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  description: string;

  @IsString()
  @IsNotEmpty()
  category: string;

  /** 逗号分隔的标签，例如 "vase,low-poly" */
  @IsOptional()
  @IsString()
  @MaxLength(300)
  tags?: string;
}
