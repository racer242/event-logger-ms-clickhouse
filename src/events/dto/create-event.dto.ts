import { IsOptional, IsString, IsUUID, IsObject, IsEnum, ValidateNested, IsDateString } from 'class-validator';
import { Type } from 'class-transformer';

export enum EventTable {
  USER_EVENTS = 'user_events',
  CRM_EVENTS = 'crm_events',
  SYSTEM_EVENTS = 'system_events',
}

export enum UserCycleStage {
  FAMILIARIZATION = 'ознакомление',
  REGISTRATION = 'регистрация',
  PURCHASE = 'покупка',
  ACTIVITY = 'активность',
  PRIZE = 'приз',
  RETURN = 'возврат',
}

export enum ResultStatus {
  SUCCESS = 'success',
  FAILED = 'failed',
  ABANDONED = 'abandoned',
}

export class DeviceDto {
  @IsOptional()
  @IsString()
  type?: string;

  @IsOptional()
  @IsString()
  os?: string;

  @IsOptional()
  @IsString()
  browser?: string;
}

export class CreateEventDto {
  @IsString()
  event_type: string;

  @IsString()
  event_category: string;

  @IsOptional()
  @IsUUID()
  user_id?: string;

  @IsUUID()
  campaign_id: string;

  @IsOptional()
  @IsUUID()
  subcampaign_id?: string;

  @IsOptional()
  @IsUUID()
  portal_id?: string;

  @IsOptional()
  @IsUUID()
  activity_id?: string;

  @IsOptional()
  @IsUUID()
  session_id?: string;

  @IsObject()
  @ValidateNested()
  @Type(() => Object)
  payload: Record<string, any>;

  @IsOptional()
  @ValidateNested()
  @Type(() => DeviceDto)
  device?: DeviceDto;

  @IsOptional()
  @IsDateString()
  timestamp?: string;

  @IsOptional()
  @IsEnum(ResultStatus)
  result_status?: ResultStatus;

  @IsOptional()
  @IsString()
  user_cycle_stage?: string;

  @IsOptional()
  @IsString()
  reward_type?: string;

  @IsOptional()
  reward_amount?: number;
}

export class BatchEventsDto {
  @ValidateNested({ each: true })
  @Type(() => CreateEventDto)
  events: CreateEventDto[];
}
