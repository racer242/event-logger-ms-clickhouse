import { IsOptional, IsString, IsInt, Min, IsUUID, IsDateString, IsEnum } from 'class-validator';
import { Type } from 'class-transformer';
import { Criticality, Severity } from './create-event.dto';

export class QueryEventsDto {
  @IsString()
  table: 'user_events' | 'crm_events' | 'system_events';

  @IsOptional()
  @IsString()
  client_id?: string;

  @IsOptional()
  @IsString()
  campaign_id?: string;

  @IsOptional()
  @IsString()
  subcampaign_id?: string;

  @IsOptional()
  @IsString()
  event_type?: string;

  @IsOptional()
  @IsUUID()
  user_id?: string;

  @IsOptional()
  @IsUUID()
  crm_user_id?: string;

  @IsOptional()
  @IsString()
  session_id?: string;

  @IsOptional()
  @IsEnum(Criticality)
  criticality?: Criticality;

  @IsOptional()
  @IsEnum(Severity)
  severity?: Severity;

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
