import { IsOptional, IsString, IsInt, Min, IsUUID, IsDateString } from 'class-validator';
import { Type } from 'class-transformer';

export class QueryEventsDto {
  @IsString()
  table: string;

  @IsOptional()
  @IsUUID()
  campaign_id?: string;

  @IsOptional()
  @IsString()
  event_type?: string;

  @IsOptional()
  @IsUUID()
  user_id?: string;

  @IsOptional()
  @IsDateString()
  date_from?: string;

  @IsOptional()
  @IsDateString()
  date_to?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number = 100;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number = 0;
}
