export const ONBOARDING_AUTO_SHOW_RECORD_THRESHOLD = 3;

export function shouldAutoShowOnboarding(recordCount: number, dismissed: boolean): boolean {
  return !dismissed && Number.isInteger(recordCount) && recordCount >= ONBOARDING_AUTO_SHOW_RECORD_THRESHOLD;
}
