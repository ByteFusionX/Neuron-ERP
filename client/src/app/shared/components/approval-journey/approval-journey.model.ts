export type ApprovalJourneyStageVariant = 'start' | 'manager' | 'stage' | 'empty' | 'end' | 'done' | 'current' | 'rejected';

export interface ApprovalJourneyStage {
  key: string;
  variant: ApprovalJourneyStageVariant;
  title: string;
  subtitle?: string;
  icon?: string;
  initials?: string;
  stepNumber?: number;
}
