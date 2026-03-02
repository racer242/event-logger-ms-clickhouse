import { IsString, IsOptional, IsDateString, IsArray, IsEnum } from 'class-validator';
import { Type } from 'class-transformer';

export enum ExportFormat {
  JSON = 'json',
  CSV = 'csv',
}

export enum ExportDestination {
  S3 = 's3',
  LOCAL = 'local',
}

export class ExportEventsDto {
  @IsString()
  table: string;

  @IsOptional()
  @IsDateString()
  date_from?: string;

  @IsOptional()
  @IsDateString()
  date_to?: string;

  @IsOptional()
  @IsEnum(ExportFormat)
  format?: ExportFormat = ExportFormat.JSON;

  @IsOptional()
  @IsArray()
  @Type(() => String)
  event_types?: string[];

  @IsOptional()
  @IsString()
  campaign_id?: string;

  @IsOptional()
  @IsEnum(ExportDestination)
  destination?: ExportDestination = ExportDestination.LOCAL;
}
