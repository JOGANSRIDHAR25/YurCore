import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import { AppError, ValidationError } from "@/shared/api/api-error";
import { requireAuth } from "@/shared/auth/require-auth";
import { writeAuditLog } from "@/shared/security/audit-log";
import { getRequestIp, getRequestUserAgent } from "@/shared/security/request-meta";
import type { AuthUser } from "@/shared/auth/auth.types";
import { LearningService, type ScopeFilter } from "../service/learning.service";
import { LearningAdminService } from "../service/learning-admin.service";
import { LearningProfileService } from "../service/learning-profile.service";
import { LearningAdminCredentialsService as AdminCred } from "../service/learning-admin-credentials.service";
import { LearningNotify } from "../service/learning-notify.service";
import { AuthorizationError } from "@/shared/api/api-error";
import type { CourseSort } from "../repo/learning.repo";
import { timingSafeEqual } from "crypto";

export type Ctx = { params: Promise<{ id: string; sectionId?: string; contentId?: string; attemptId?: string }> };

/** Maps any failure to a safe, user-friendly response. Internal detail is logged, never returned. */
function fail(error: unknown) {
  if (error instanceof AppError) {
    const details = error instanceof ValidationError ? error.details : undefined;
    return NextResponse.json({ success: false, error: error.message, ...(details ? { details } : {}) }, { status: error.statusCode });
  }
  if (error instanceof ZodError) {
    return NextResponse.json({ success: false, error: error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  console.error("[learning] unexpected error:", error instanceof Error ? error.message : error);
  return NextResponse.json({ success: false, error: "Something went wrong. Please try again." }, { status: 500 });
}

async function handle<T>(fn: () => Promise<T>, status = 200) {
  try {
    return NextResponse.json({ success: true, data: await fn() }, { status });
  } catch (error) {
    return fail(error);
  }
}

/** Runs an admin command and records it in the audit log once it has succeeded. */
function adminAction<T>(req: NextRequest, action: string, run: (user: AuthUser, p: Awaited<Ctx["params"]>) => Promise<T>, ctx?: Ctx, status?: number) {
  return handle(async () => {
    const user = await requireAuth(req);
    const p = ctx ? await ctx.params : ({ id: "" } as Awaited<Ctx["params"]>);
    const result = await run(user, p);
    await writeAuditLog({ userId: user.id, role: user.role, action, module: "meyveda_learning", recordId: p.contentId ?? p.sectionId ?? (p.id || undefined), ipAddress: getRequestIp(req), userAgent: getRequestUserAgent(req) });
    return result;
  }, status);
}

const body = (req: NextRequest) => req.json().catch(() => ({}));
const params = async (ctx: Ctx) => await ctx.params;

/** Practitioner (learner) endpoints. No management operations exist here. */
export const LearningController = {
  courses: (req: NextRequest) =>
    handle(async () => {
      const user = await requireAuth(req);
      const sp = req.nextUrl.searchParams;
      const scope = (["all", "mine", "completed"].includes(sp.get("scope") ?? "") ? sp.get("scope") : "all") as ScopeFilter;
      const limit = Number(sp.get("limit") ?? "");
      const sort = (["newest", "oldest"].includes(sp.get("sort") ?? "") ? sp.get("sort") : "published") as CourseSort;
      const categoryIds = (sp.get("categories") ?? "").split(",").map((x) => x.trim()).filter((x) => /^[0-9a-f-]{36}$/i.test(x)).slice(0, 10);
      return LearningService.list(
        user,
        scope,
        { q: sp.get("q")?.slice(0, 100) || undefined, category: sp.get("category")?.slice(0, 80) || undefined, categoryIds, sort },
        { limit: Number.isFinite(limit) && limit > 0 ? limit : undefined, cursor: sp.get("cursor")?.slice(0, 200) || null },
      );
    }),
  categories: (req: NextRequest) => handle(async () => LearningService.categories(await requireAuth(req))),
  details: (req: NextRequest, ctx: Ctx) => handle(async () => LearningService.getDetails(await requireAuth(req), (await params(ctx)).id)),
  start: (req: NextRequest, ctx: Ctx) => handle(async () => { await LearningService.start(await requireAuth(req), (await params(ctx)).id); return null; }),
  complete: (req: NextRequest, ctx: Ctx) => handle(async () => { const p = await params(ctx); await LearningService.complete(await requireAuth(req), p.id, p.contentId!); return null; }),
  startAttempt: (req: NextRequest, ctx: Ctx) => handle(async () => { const p = await params(ctx); return LearningService.startAttempt(await requireAuth(req), p.id, p.contentId!); }, 201),
  submitAttempt: (req: NextRequest, ctx: Ctx) => handle(async () => { const p = await params(ctx); return LearningService.submitAttempt(await requireAuth(req), p.id, p.contentId!, p.attemptId!, await body(req)); }),
  respond: (req: NextRequest, ctx: Ctx) => handle(async () => { const p = await params(ctx); await LearningService.respond(await requireAuth(req), p.id, p.contentId!, await body(req)); return null; }),
  feedback: (req: NextRequest, ctx: Ctx) => handle(async () => LearningService.submitFeedback(await requireAuth(req), (await params(ctx)).id, await body(req))),
  recommended: (req: NextRequest) => handle(async () => LearningService.recommended(await requireAuth(req))),

  // Learning profile (always the caller's own records)
  profile: (req: NextRequest) => handle(async () => LearningProfileService.profile(await requireAuth(req))),
  saveSetup: (req: NextRequest) => handle(async () => LearningProfileService.saveSetup(await requireAuth(req), await body(req))),
  updateInterests: (req: NextRequest) => handle(async () => LearningProfileService.updateInterests(await requireAuth(req), await body(req))),
  updateTarget: (req: NextRequest) => handle(async () => LearningProfileService.updateTarget(await requireAuth(req), await body(req))),
  credits: (req: NextRequest) =>
    handle(async () => {
      const sp = req.nextUrl.searchParams;
      return LearningProfileService.credits(await requireAuth(req), { year: Number(sp.get("year")) || null, type: sp.get("type") });
    }),
  certificates: (req: NextRequest) => handle(async () => LearningProfileService.certificates(await requireAuth(req))),
  certificateDownload: (req: NextRequest, ctx: Ctx) => handle(async () => LearningProfileService.certificateDownload(await requireAuth(req), (await params(ctx)).id)),
};

/** Shared-secret check for scheduled jobs (constant time). */
function cronAuthorized(req: NextRequest): boolean {
  const secret = process.env.LEARNING_CRON_SECRET?.trim();
  const given = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim() ?? "";
  if (!secret || !given) return false;
  const a = Buffer.from(secret);
  const b = Buffer.from(given);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Scheduled jobs (called by a cron with `Authorization: Bearer $LEARNING_CRON_SECRET`). */
export const LearningJobsController = {
  reminders: (req: NextRequest) =>
    handle(async () => {
      if (!cronAuthorized(req)) throw new AuthorizationError("Not allowed");
      return LearningNotify.runReminders();
    }),
};

/** Admin management of categories, settings, certificates, credits, deliveries and course feedback. */
export const LearningAdminCredentialsController = {
  categories: (req: NextRequest) => handle(async () => AdminCred.categories(await requireAuth(req))),
  createCategory: (req: NextRequest) => adminAction(req, "learning.category.create", async (u) => AdminCred.createCategory(u, await body(req)), undefined, 201),
  updateCategory: (req: NextRequest, ctx: Ctx) => adminAction(req, "learning.category.update", async (u, p) => AdminCred.updateCategory(u, p.id, await body(req)), ctx),
  settings: (req: NextRequest) => handle(async () => AdminCred.settings(await requireAuth(req))),
  updateSettings: (req: NextRequest) => adminAction(req, "learning.settings.update", async (u) => AdminCred.updateSettings(u, await body(req))),
  setSignature: (req: NextRequest) => adminAction(req, "learning.settings.signature", async (u) => AdminCred.setSignature(u, await body(req))),
  certificates: (req: NextRequest) =>
    handle(async () => AdminCred.certificates(await requireAuth(req), { q: req.nextUrl.searchParams.get("q") ?? undefined, courseId: req.nextUrl.searchParams.get("courseId") ?? undefined })),
  revoke: (req: NextRequest, ctx: Ctx) => adminAction(req, "learning.certificate.revoke", async (u, p) => AdminCred.revokeCertificate(u, p.id, await body(req)), ctx),
  reissue: (req: NextRequest, ctx: Ctx) => adminAction(req, "learning.certificate.reissue", async (u, p) => AdminCred.reissueCertificate(u, p.id, await body(req)), ctx),
  certificateDownload: (req: NextRequest, ctx: Ctx) => handle(async () => AdminCred.certificateDownload(await requireAuth(req), (await params(ctx)).id)),
  adjustCredits: (req: NextRequest) => adminAction(req, "learning.credits.adjust", async (u) => AdminCred.adjustCredits(u, await body(req)), undefined, 201),
  progress: (req: NextRequest) => handle(async () => AdminCred.learnerProgress(await requireAuth(req))),
  deliveries: (req: NextRequest) => handle(async () => AdminCred.deliveries(await requireAuth(req), { status: req.nextUrl.searchParams.get("status") })),
  retryDelivery: (req: NextRequest, ctx: Ctx) => adminAction(req, "learning.delivery.retry", async (u, p) => { await AdminCred.retryDelivery(u, p.id); return null; }, ctx),
  runReminders: (req: NextRequest) => adminAction(req, "learning.reminders.run", async (u) => AdminCred.runReminders(u)),
  courseFeedback: (req: NextRequest, ctx: Ctx) => handle(async () => AdminCred.courseFeedback(await requireAuth(req), (await params(ctx)).id)),
};

/** Admin endpoints (mounted under /api/admin/learning). Every method enforces the admin role in the service. */
export const LearningAdminController = {
  list: (req: NextRequest) => handle(async () => LearningAdminService.list(await requireAuth(req))),
  categories: (req: NextRequest) => handle(async () => LearningAdminService.categories(await requireAuth(req))),
  searchPractitioners: (req: NextRequest) => handle(async () => LearningAdminService.searchPractitioners(await requireAuth(req), req.nextUrl.searchParams.get("q") ?? "")),
  create: (req: NextRequest) => adminAction(req, "learning.course.create", async (u) => LearningAdminService.createCourse(u, await body(req)), undefined, 201),
  details: (req: NextRequest, ctx: Ctx) => handle(async () => LearningAdminService.getDetails(await requireAuth(req), (await params(ctx)).id)),
  update: (req: NextRequest, ctx: Ctx) => adminAction(req, "learning.course.update", async (u, p) => LearningAdminService.updateCourse(u, p.id, await body(req)), ctx),
  publish: (req: NextRequest, ctx: Ctx) =>
    adminAction(req, "learning.course.publish", async (u, p) => LearningAdminService.setPublished(u, p.id, ((await body(req)) as { published?: unknown }).published === true), ctx),
  sync: (req: NextRequest, ctx: Ctx) => adminAction(req, "learning.course.sync", async (u, p) => LearningAdminService.syncCourse(u, p.id), ctx),
  syncAll: (req: NextRequest) => adminAction(req, "learning.sync", async (u) => LearningAdminService.syncAll(u)),
  remove: (req: NextRequest, ctx: Ctx) => adminAction(req, "learning.course.delete", async (u, p) => { await LearningAdminService.deleteCourse(u, p.id); return null; }, ctx),

  createUpload: (req: NextRequest, ctx: Ctx) => adminAction(req, "learning.file.upload", async (u, p) => LearningAdminService.createUpload(u, p.id, await body(req)), ctx, 201),
  discardUpload: (req: NextRequest, ctx: Ctx) => adminAction(req, "learning.file.discard", async (u, p) => { await LearningAdminService.discardUpload(u, p.id, req.nextUrl.searchParams.get("path") ?? ""); return null; }, ctx),

  addSection: (req: NextRequest, ctx: Ctx) => adminAction(req, "learning.section.add", async (u, p) => LearningAdminService.addSection(u, p.id, await body(req)), ctx, 201),
  updateSection: (req: NextRequest, ctx: Ctx) => adminAction(req, "learning.section.update", async (u, p) => { await LearningAdminService.updateSection(u, p.id, p.sectionId!, await body(req)); return null; }, ctx),
  deleteSection: (req: NextRequest, ctx: Ctx) => adminAction(req, "learning.section.delete", async (u, p) => { await LearningAdminService.deleteSection(u, p.id, p.sectionId!); return null; }, ctx),
  saveLayout: (req: NextRequest, ctx: Ctx) => adminAction(req, "learning.layout.save", async (u, p) => { await LearningAdminService.saveLayout(u, p.id, await body(req)); return null; }, ctx),

  addContent: (req: NextRequest, ctx: Ctx) => adminAction(req, "learning.content.add", async (u, p) => LearningAdminService.addContent(u, p.id, await body(req)), ctx, 201),
  updateContent: (req: NextRequest, ctx: Ctx) => adminAction(req, "learning.content.update", async (u, p) => LearningAdminService.updateContent(u, p.id, p.contentId!, await body(req)), ctx),
  deleteContent: (req: NextRequest, ctx: Ctx) => adminAction(req, "learning.content.delete", async (u, p) => { await LearningAdminService.deleteContent(u, p.id, p.contentId!); return null; }, ctx),
  responses: (req: NextRequest, ctx: Ctx) => handle(async () => { const p = await params(ctx); return LearningAdminService.responses(await requireAuth(req), p.id, p.contentId!); }),
  learners: (req: NextRequest, ctx: Ctx) => handle(async () => LearningAdminService.learners(await requireAuth(req), (await params(ctx)).id)),
};
