import { describe, expect, it } from "vitest";

import {
  compilePersonalPrompt,
  mergeAnswers,
  questionsForRole,
  requiredAnswersMissing,
  suggestedPersonaRole,
  trainingKickoffPrompt,
  isTrainingRun,
  buildTrainingInterviewPrompt,
  formatInterviewAgenda,
  formatTrainingSnapshot,
  TRAIN_PERSONAL_MARKER,
  trainingProgress,
  answersFromTrainingTranscript,
  inferAnswersFromSnapshot,
} from "./personal-training";
import { profileIsTrained } from "./personal-agent-status";
import type { AgentContext, PersonalTrainingAnswer } from "../types";

function context(): AgentContext {
  return {
    user: { id: "u1", name: "Ada", email: "ada@fairlx.dev" },
    workspaces: [{ id: "w1", name: "Acme", role: "ADMIN" }],
    projects: [{ id: "p1", name: "Website", workspaceId: "w1", key: "WEB" }],
    workItems: [],
    notifications: [],
    githubRepos: [],
    integrations: [],
    docs: [],
  };
}

function filled(role: "tech_lead" | "frontend" | "qa" | "pm"): PersonalTrainingAnswer[] {
  return questionsForRole(role).map((question) => ({
    questionId: question.id,
    question: question.prompt,
    answer: `Detailed answer for ${question.id}: I own this specifically and I never skip the quality bar.`,
  }));
}

describe("personal agent training", () => {
  it("suggests tech lead from admin membership and asks role-specific questions first", () => {
    expect(suggestedPersonaRole(context())).toBe("tech_lead");
    const questions = questionsForRole("tech_lead");
    expect(questions[0]?.id).toBe("tl_team");
    expect(questions.some((item) => item.id === "never_do")).toBe(true);
    expect(questions.length).toBeGreaterThanOrEqual(12);
  });

  it("compiles a detailed standing prompt from answers", () => {
    const prompt = compilePersonalPrompt({
      userName: "Ada",
      personaRole: "frontend",
      jobTitle: "Staff frontend",
      workspaceRole: "MEMBER",
      workspaceName: "Acme",
      projectName: "Website",
      answers: filled("frontend"),
    });
    expect(prompt).toContain("Ada's Fairlx Personal Agent");
    expect(prompt).toContain("Staff frontend");
    expect(prompt).toContain("## Identity and role");
    expect(prompt).toContain("## Training interview (verbatim)");
    expect(prompt).toContain("never_do");
    expect(prompt.length).toBeGreaterThan(800);
  });

  it("flags short required answers", () => {
    const questions = questionsForRole("qa");
    const answers = mergeAnswers(questions, undefined, [{ questionId: "qa_strategy", answer: "ok" }]);
    expect(requiredAnswersMissing(answers, questions).length).toBeGreaterThan(5);
  });

  it("detects training runs from kind or the kickoff marker", () => {
    expect(isTrainingRun({ kind: "training", prompt: "anything" })).toBe(true);
    expect(isTrainingRun({ kind: "chat", prompt: trainingKickoffPrompt() })).toBe(true);
    expect(isTrainingRun({ prompt: `${TRAIN_PERSONAL_MARKER}\nRetrain me` })).toBe(true);
    expect(isTrainingRun({ kind: "chat", prompt: "Plan a feature for checkout" })).toBe(false);
    expect(trainingKickoffPrompt()).toBe(TRAIN_PERSONAL_MARKER);
  });

  it("builds a one-question-at-a-time interview prompt covering the agenda", () => {
    const prompt = buildTrainingInterviewPrompt({
      userName: "Ada",
      personaRole: "tech_lead",
      workspaceRole: "ADMIN",
      workspaceName: "Acme",
    });
    expect(prompt).toContain("Open with \"Hi Ada,\"");
    expect(prompt).toContain("[[choices]]");
    expect(prompt).toContain("custom answer");
    expect(prompt).toContain("Fairlx snapshot");
    expect(prompt).toContain("save_personal_agent");
    expect(prompt).toContain("Describe your team");
    expect(prompt).not.toContain("You are the Fairlx Personal Agent, the user's Chief of Staff");
    expect(formatInterviewAgenda("tech_lead")).toContain("Describe your team");
  });

  it("skips covered agenda topics when resuming an interview", () => {
    const prompt = buildTrainingInterviewPrompt({
      userName: "Ada",
      personaRole: "tech_lead",
      covered: [
        {
          questionId: "tl_team",
          question: "Describe your team",
          answer: "We are six engineers and I own reviews.",
          source: "user",
        },
      ],
    });
    expect(prompt).toContain("Already covered");
    expect(prompt).toContain("We are six engineers");
    expect(prompt).toContain("Skip the opening role question");
  });

  it("treats the agent as untrained until a compiled profile is saved", () => {
    expect(profileIsTrained(null)).toBe(false);
    expect(
      profileIsTrained({
        id: "p1",
        userId: "u1",
        personaRole: "frontend",
        status: "draft",
        answers: filled("frontend"),
        compiledPrompt: "",
        promptVersion: 0,
        history: [],
        updatedAt: new Date().toISOString(),
      }),
    ).toBe(false);
    expect(
      profileIsTrained({
        id: "p1",
        userId: "u1",
        personaRole: "frontend",
        status: "trained",
        answers: filled("frontend"),
        compiledPrompt: "You operate as Ada's Personal Agent.",
        promptVersion: 1,
        history: [],
        updatedAt: new Date().toISOString(),
      }),
    ).toBe(true);
  });

  it("computes training progress from filled answers", () => {
    const questions = questionsForRole("frontend");
    const answers = questions.slice(0, 4).map((question) => ({
      questionId: question.id,
      question: question.prompt,
      answer: "A complete sentence covering this topic in detail.",
      source: "user" as const,
    }));
    const progress = trainingProgress(answers, "frontend");
    expect(progress.answered).toBe(4);
    expect(progress.inferred).toBe(0);
    expect(progress.total).toBe(questions.length);
    expect(progress.percent).toBe(Math.round((4 / questions.length) * 100));
  });

  it("maps training transcript replies onto the agenda after a role tap", () => {
    const questions = questionsForRole("tech_lead");
    const extracted = answersFromTrainingTranscript(
      [
        { role: "user", content: TRAIN_PERSONAL_MARKER },
        { role: "assistant", content: "Hi Ada, are you a Tech Lead?" },
        { role: "user", content: "Tech Lead" },
        { role: "assistant", content: "Describe your team" },
        { role: "user", content: "We are six people and reviews go to me first." },
        { role: "user", content: "Ready means criteria exist. Done means merged with tests." },
      ],
      questions,
    );
    expect(extracted[0]?.questionId).toBe("tl_team");
    expect(extracted[0]?.answer).toContain("six people");
    expect(extracted[1]?.questionId).toBe("tl_process");
    expect(extracted.every((item) => item.source === "user")).toBe(true);
  });

  it("fills remaining questions from an empty workspace snapshot", () => {
    const empty: AgentContext = {
      ...context(),
      workspaces: [],
      projects: [],
      workItems: [],
      docs: [],
      githubRepos: [],
    };
    const snapshot = formatTrainingSnapshot(empty);
    expect(snapshot).toMatch(/empty or new/i);
    const answers = inferAnswersFromSnapshot({
      role: "qa",
      previous: [
        {
          questionId: "qa_strategy",
          question: "strategy",
          answer: "I automate regressions and always click the changed path.",
          source: "user",
        },
      ],
      snapshot,
      userName: "Ada",
    });
    expect(answers.find((item) => item.questionId === "qa_strategy")?.source).toBe("user");
    expect(answers.every((item) => item.answer.length >= 8)).toBe(true);
    expect(answers.filter((item) => item.source === "inferred").length).toBeGreaterThan(5);
    expect(trainingProgress(answers, "qa").percent).toBe(100);
  });
});
