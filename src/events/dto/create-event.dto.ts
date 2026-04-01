import {
  IsOptional,
  IsString,
  IsUUID,
  IsObject,
  IsEnum,
  IsArray,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export enum EventTable {
  USER_EVENTS = 'user_events',
  CRM_EVENTS = 'crm_events',
  SYSTEM_EVENTS = 'system_events',
}

export enum Severity {
  WARNING = 'warning',
  ERROR = 'error',
  FAILURE = 'failure',
  UNKNOWN = 'unknown',
}

// ============================================
// USER EVENTS DTO
// ============================================

export class UserEventDto {
  // ПОСТОЯННЫЕ ДАННЫЕ (обязательные)
  @IsString()
  client_id: string;

  @IsString()
  campaign_id: string;

  @IsString()
  timestamp: string;

  @IsString()
  portal_id: string;

  @IsString()
  bot_id: string;

  @IsString()
  session_id: string;

  // ОПЦИОНАЛЬНЫЕ ДАННЫЕ
  @IsOptional()
  @IsString()
  subcampaign_id?: string;

  @IsOptional()
  @IsString()
  user_id?: string;

  @IsOptional()
  @IsString()
  user_utm?: string;

  @IsOptional()
  @IsString()
  crm_user_id?: string;

  @IsOptional()
  @IsString()
  receipt_id?: string;

  @IsOptional()
  @IsString()
  code?: string;

  @IsOptional()
  @IsString()
  activity_id?: string;

  @IsOptional()
  @IsString()
  activity_type?: string;

  @IsOptional()
  @IsString()
  prize_id?: string;

  @IsOptional()
  @IsString()
  message_id?: string;

  // КЛАССИФИКАЦИЯ СОБЫТИЯ
  @IsString()
  event_type: string;

  @IsOptional()
  @IsString()
  source?: string;

  @IsString()
  criticality: string;

  // СПЕЦИФИЧЕСКИЕ ДАННЫЕ
  @IsOptional()
  @IsObject()
  payload?: Record<string, any>;
}

// ============================================
// CRM EVENTS DTO
// ============================================

export class CrmEventDto {
  // ПОСТОЯННЫЕ ДАННЫЕ
  @IsString()
  client_id: string;

  @IsString()
  campaign_id: string;

  @IsString()
  timestamp: string;

  @IsString()
  session_id: string;

  @IsString()
  crm_user_id: string;

  @IsString()
  entity_type: string;

  @IsString()
  entity_id: string;

  @IsString()
  action_type: string;

  // КЛАССИФИКАЦИЯ СОБЫТИЯ
  @IsString()
  event_type: string;

  @IsOptional()
  @IsString()
  source?: string;

  @IsString()
  criticality: string;

  // СПЕЦИФИЧЕСКИЕ ДАННЫЕ
  @IsOptional()
  @IsString()
  subcampaign_id?: string;

  @IsOptional()
  @IsObject()
  payload?: Record<string, any>;
}

// ============================================
// SYSTEM EVENTS DTO
// ============================================

export class SystemEventDto {
  // ПОСТОЯННЫЕ ДАННЫЕ
  @IsString()
  client_id: string;

  @IsString()
  campaign_id: string;

  @IsString()
  timestamp: string;

  @IsString()
  instance_id: string;

  // КЛАССИФИКАЦИЯ СОБЫТИЯ
  @IsString()
  event_type: string;

  @IsString()
  source: string;

  @IsString()
  criticality: string;

  @IsEnum(Severity)
  severity: Severity;

  // СПЕЦИФИЧЕСКИЕ ДАННЫЕ (опциональные)
  @IsOptional()
  @IsString()
  subcampaign_id?: string;

  @IsOptional()
  @IsString()
  host_name?: string;

  @IsOptional()
  @IsString()
  error_code?: string;

  @IsOptional()
  @IsObject()
  payload?: Record<string, any>;
}

// ============================================
// ОБЪЕДИНЁННЫЙ DTO ДЛЯ API
// ============================================

export class CreateEventDto {
  @IsString()
  client_id: string;

  @IsString()
  campaign_id: string;

  @IsString()
  timestamp: string;

  @IsString()
  session_id: string;

  @IsString()
  event_type: string;

  @IsOptional()
  @IsString()
  source?: string;

  @IsString()
  criticality: string;

  @IsOptional()
  @IsString()
  subcampaign_id?: string;

  @IsOptional()
  @IsString()
  user_id?: string;

  @IsOptional()
  @IsString()
  portal_id?: string;

  @IsOptional()
  @IsString()
  bot_id?: string;

  @IsOptional()
  @IsString()
  user_utm?: string;

  @IsOptional()
  @IsString()
  crm_user_id?: string;

  @IsOptional()
  @IsString()
  receipt_id?: string;

  @IsOptional()
  @IsString()
  code?: string;

  @IsOptional()
  @IsString()
  activity_id?: string;

  @IsOptional()
  @IsString()
  activity_type?: string;

  @IsOptional()
  @IsString()
  prize_id?: string;

  @IsOptional()
  @IsString()
  message_id?: string;

  @IsOptional()
  @IsString()
  entity_type?: string;

  @IsOptional()
  @IsString()
  entity_id?: string;

  @IsOptional()
  @IsString()
  action_type?: string;

  @IsOptional()
  @IsEnum(Severity)
  severity?: Severity;

  @IsOptional()
  @IsString()
  instance_id?: string;

  @IsOptional()
  @IsString()
  host_name?: string;

  @IsOptional()
  @IsString()
  error_code?: string;

  @IsOptional()
  @IsObject()
  payload?: Record<string, any>;
}

export class BatchEventsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateEventDto)
  events: CreateEventDto[];
}
