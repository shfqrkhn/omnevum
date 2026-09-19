import { describe, expect, it } from "vitest";
import { advanceReviewSession, getReviewTemplate, isReviewSession, makeReviewSession, REVIEW_TEMPLATES } from "./review";

describe("Review templates", () => {
  it("keeps a passive shelf of bounded templates", () => {
    expect(REVIEW_TEMPLATES).toHaveLength(8);
    expect(REVIEW_TEMPLATES.every((template) => template.stepCount >= 3 && template.stepCount <= 4)).toBe(true);
    expect(getReviewTemplate("weekly").promptKeys).toEqual(["wins", "open", "evidence", "next"]);
  });

  it("persists resumable progress without pressure metadata", () => {
    const session = makeReviewSession("daily", "2026-09-19T00:00:00.000Z");
    expect(isReviewSession(session)).toBe(true);
    const skipped = advanceReviewSession(session, true);
    const progressed = advanceReviewSession(skipped);
    expect(progressed).toMatchObject({ templateId: "daily", stepIndex: 2, completedSteps: [1] });
    expect(JSON.stringify(progressed)).not.toMatch(/due|streak|notification|decay/i);
    expect(isReviewSession({ ...progressed, stepIndex: 99 })).toBe(false);
  });
});
