export const REVIEW_SESSION_SETTING = "review.session";

export const REVIEW_TEMPLATE_IDS = ["daily", "weekly", "monthly", "project", "decision", "intervention", "domain", "system"] as const;
export type ReviewTemplateId = (typeof REVIEW_TEMPLATE_IDS)[number];

export interface ReviewTemplate {
  id: ReviewTemplateId;
  stepCount: number;
  promptKeys: readonly string[];
}

export interface ReviewSession {
  schemaVersion: 1;
  templateId: ReviewTemplateId;
  stepIndex: number;
  completedSteps: number[];
  startedAt: string;
}

export const REVIEW_TEMPLATES: readonly ReviewTemplate[] = [
  { id: "daily", stepCount: 3, promptKeys: ["capture", "attention", "next"] },
  { id: "weekly", stepCount: 4, promptKeys: ["wins", "open", "evidence", "next"] },
  { id: "monthly", stepCount: 4, promptKeys: ["pattern", "commitments", "resources", "next"] },
  { id: "project", stepCount: 3, promptKeys: ["outcome", "risk", "next"] },
  { id: "decision", stepCount: 3, promptKeys: ["question", "evidence", "next"] },
  { id: "intervention", stepCount: 3, promptKeys: ["change", "signal", "next"] },
  { id: "domain", stepCount: 3, promptKeys: ["signals", "exceptions", "next"] },
  { id: "system", stepCount: 4, promptKeys: ["health", "recovery", "boundaries", "next"] }
];

export function getReviewTemplate(id: ReviewTemplateId): ReviewTemplate {
  const template = REVIEW_TEMPLATES.find((candidate) => candidate.id === id);
  if (!template) throw new Error("Review template is not available");
  return template;
}

export function isReviewTemplateId(value: unknown): value is ReviewTemplateId {
  return typeof value === "string" && REVIEW_TEMPLATE_IDS.includes(value as ReviewTemplateId);
}

export function makeReviewSession(templateId: ReviewTemplateId, startedAt = new Date().toISOString()): ReviewSession {
  getReviewTemplate(templateId);
  return { schemaVersion: 1, templateId, stepIndex: 0, completedSteps: [], startedAt };
}

export function isReviewSession(value: unknown): value is ReviewSession {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  const stepIndex = candidate.stepIndex;
  if (candidate.schemaVersion !== 1 || !isReviewTemplateId(candidate.templateId) || typeof stepIndex !== "number" || !Number.isInteger(stepIndex) || !Array.isArray(candidate.completedSteps) || typeof candidate.startedAt !== "string" || !Number.isFinite(Date.parse(candidate.startedAt))) return false;
  const template = getReviewTemplate(candidate.templateId);
  return stepIndex >= 0 && stepIndex <= template.stepCount && candidate.completedSteps.every((step) => Number.isInteger(step) && step >= 0 && step < template.stepCount);
}

export function advanceReviewSession(session: ReviewSession, skipped = false): ReviewSession {
  if (!isReviewSession(session)) throw new Error("Review session is invalid");
  const template = getReviewTemplate(session.templateId);
  if (session.stepIndex >= template.stepCount) return structuredClone(session);
  const completedSteps = skipped ? [...session.completedSteps] : [...new Set([...session.completedSteps, session.stepIndex])].sort((left, right) => left - right);
  return { ...structuredClone(session), stepIndex: Math.min(template.stepCount, session.stepIndex + 1), completedSteps };
}
