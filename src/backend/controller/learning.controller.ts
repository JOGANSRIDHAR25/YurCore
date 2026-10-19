import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import { AppError, ValidationError } from "@/shared/api/api-error";
import { requireAuth } from "@/shared/auth/require-auth";
import { writeAuditLog } from "@/shared/security/audit-log";
import { getRequestIp, getRequestUserAgent } from "@/shared/security/request-meta";
import type { AuthUser } from "@/shared/auth/auth.types";
import { LearningService, type ScopeFilter } from "../service/learning.service";
import { LearningAdminService } from "../service/learning-admin.service";

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
      return LearningService.list(user, scope, { q: sp.get("q")?.slice(0, 100) || undefined, category: sp.get("category")?.slice(0, 80) || undefined });
    }),
  categories: (req: NextRequest) => handle(async () => LearningService.categories(await requireAuth(req))),
  details: (req: NextRequest, ctx: Ctx) => handle(async () => LearningService.getDetails(await requireAuth(req), (await params(ctx)).id)),
  start: (req: NextRequest, ctx: Ctx) => handle(async () => { await LearningService.start(await requireAuth(req), (await params(ctx)).id); return null; }),
  complete: (req: NextRequest, ctx: Ctx) => handle(async () => { const p = await params(ctx); await LearningService.complete(await requireAuth(req), p.id, p.contentId!); return null; }),
  startAttempt: (req: NextRequest, ctx: Ctx) => handle(async () => { const p = await params(ctx); return LearningService.startAttempt(await requireAuth(req), p.id, p.contentId!); }, 201),
  submitAttempt: (req: NextRequest, ctx: Ctx) => handle(async () => { const p = await params(ctx); return LearningService.submitAttempt(await requireAuth(req), p.id, p.contentId!, p.attemptId!, await body(req)); }),
  respond: (req: NextRequest, ctx: Ctx) => handle(async () => { const p = await params(ctx); await LearningService.respond(await requireAuth(req), p.id, p.contentId!, await body(req)); return null; }),
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
