import { IsOptional, IsString, IsUUID, IsObject, IsEnum, IsNumber, IsArray, ValidateNested, IsEnum as IsEnumValidator } from 'class-validator';
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

export enum Severity {
  CRITICAL = 'critical',
  HIGH = 'high',
  MEDIUM = 'medium',
  LOW = 'low',
  INFO = 'info',
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

  @IsOptional()
  @IsUUID()
  campaign_id?: string;

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

  @IsOptional()
  @IsUUID()
  admin_id?: string;

  @IsOptional()
  @IsUUID()
  moderator_id?: string;

  @IsOptional()
  @IsUUID()
  prize_id?: string;

  @IsOptional()
  @IsUUID()
  submission_id?: string;

  @IsOptional()
  @IsObject()
  payload?: Record<string, any>;

  @IsOptional()
  @IsObject()
  device?: DeviceDto;

  @IsString()
  timestamp: string;

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
  @IsNumber()
  reward_amount?: number;

  // System events fields
  @IsOptional()
  @IsEnumValidator(Severity)
  severity?: Severity;

  @IsOptional()
  @IsString()
  service_name?: string;

  @IsOptional()
  @IsNumber()
  duration_ms?: number;

  @IsOptional()
  @IsNumber()
  memory_mb?: number;

  @IsOptional()
  @IsNumber()
  cpu_percent?: number;

  @IsOptional()
  @IsString()
  error_code?: string;

  @IsOptional()
  @IsString()
  error_message?: string;

  @IsOptional()
  @IsString()
  stack_trace?: string;
}

export class BatchEventsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateEventDto)
  events: CreateEventDto[];
}
