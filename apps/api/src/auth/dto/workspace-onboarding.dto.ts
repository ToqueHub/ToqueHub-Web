import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsString } from 'class-validator';

export const WORKSPACE_ONBOARDING_STATUSES = ['IN_PROGRESS', 'DEFERRED', 'COMPLETED'] as const;
export const WORKSPACE_ONBOARDING_STEPS = [
  'WELCOME',
  'ECOSYSTEM',
  'STARTER_BUNDLE',
  'INSTALLATION',
  'MINI_TOUR',
] as const;

export class UpdateWorkspaceOnboardingDto {
  @ApiProperty({ enum: WORKSPACE_ONBOARDING_STATUSES })
  @IsString()
  @IsIn(WORKSPACE_ONBOARDING_STATUSES)
  status!: (typeof WORKSPACE_ONBOARDING_STATUSES)[number];

  @ApiProperty({ enum: WORKSPACE_ONBOARDING_STEPS })
  @IsString()
  @IsIn(WORKSPACE_ONBOARDING_STEPS)
  currentStep!: (typeof WORKSPACE_ONBOARDING_STEPS)[number];
}
