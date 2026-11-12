export type KeywordCategory =
  | 'all'
  | 'cliche'
  | 'crypto'
  | 'follow'
  | 'nsfw'
  | 'scam';

export type HonestFeedbackPhase =
  | 'phase1'
  | 'phase2'
  | 'phase3'
  | 'settled'
  | 'cancelled';

export interface HonestStageStatus {
  local: 'pending' | 'succeeded' | 'failed' | 'cancelled';
  nativeX: 'pending' | 'running' | 'succeeded' | 'failed' | 'cancelled';
  community: 'pending' | 'running' | 'succeeded' | 'failed' | 'cancelled';
}
