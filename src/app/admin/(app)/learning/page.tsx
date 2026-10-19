"use client";

import { SITE_NAME } from "@/shared/config/site";
import { useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "react-hot-toast";
import { BookOpen, Eye, GraduationCap, Pencil, Plus, RefreshCw, Search, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useQuery } from "@/hooks/useQuery";
import { LEVEL_LABEL } from "@/shared/learning/content";
import { adminLearningApi, type AdminCourse } from "./_lib/api";
import { ConfirmDialog, MoodleOriginBadge, MoodleSyncStatus, Spinner, StatusBadge, ghostBtn, iconBtn, inputCls, primaryBtn } from "./_components/ui";

const TH = "text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider";

export default function AdminLearningPage() {
  const { data, loading, error, refetch } = useQuery(() => adminLearningApi.list(), []);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [status, setStatus] = useState<"" | "draft" | "published">("");
  const [deleting, setDeleting] = useState<AdminCourse | null>(null);
  const [syncing, setSyncing] = useState(false);

  const all = data ?? [];
  // While Moodle syncs or imports run in the background, refresh so their status and content appear.
  const pending = all.some((c) => c.moodleSync.busy || (c.origin === "moodle" && !c.moodleSync.syncedAt && !c.moodleSync.error));
  useEffect(() => {
    if (!pending) return;
    const t = setTimeout(refetch, 4000);
    return () => clearTimeout(t);
  }, [pending, data, refetch]);

  async function syncAll() {
    setSyncing(true);
    try {
      const r = await adminLearningApi.syncAll();
      const parts = [r.imported ? `${r.imported} new ${r.imported === 1 ? "course" : "courses"} imported from Moodle` : null, `${r.synced} synced`, r.failed ? `${r.failed} with problems` : null].filter(Boolean);
      (r.failed ? toast.error : toast.success)(parts.join(" · "), { duration: 6000 });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "The sync with Moodle failed. Please try again.");
    } finally {
      setSyncing(false);
      refetch();
    }
  }
  const categories = [...new Set(all.map((c) => c.category).filter(Boolean))] as string[];
  const term = search.trim().toLowerCase();
  const rows = all.filter((c) => (!term || c.title.toLowerCase().includes(term)) && (!category || c.category === category) && (!status || c.status === status));
  const stats = [
    { label: "Total courses", value: all.length },
    { label: "Drafts", value: all.filter((c) => c.status === "draft").length },
    { label: "Published", value: all.filter((c) => c.status === "published").length },
    { label: "Learners enrolled", value: all.reduce((n, c) => n + c.learners, 0) },
  ];

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-foreground">{SITE_NAME} Learning</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">Create courses with videos, documents, lessons and quizzes for practitioners.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={syncAll} disabled={syncing} className={ghostBtn} title="Import courses created in Moodle and send course content to Moodle">
            <RefreshCw size={15} className={cn(syncing && "animate-spin")} /> {syncing ? "Syncing with Moodle…" : "Sync with Moodle"}
          </button>
          <Link href="/admin/learning/new" className={primaryBtn}><Plus size={16} /> Create course</Link>
        </div>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="rounded-2xl border border-border bg-white p-5">
            <p className="font-display text-3xl font-bold text-foreground">{loading && !data ? "–" : s.value}</p>
            <p className="mt-1 text-xs text-muted-foreground">{s.label}</p>
          </div>
        ))}
      </div>

      <div className="mb-5 flex flex-wrap gap-3">
        <div className="relative min-w-56 flex-1">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input type="text" placeholder="Search courses" value={search} onChange={(e) => setSearch(e.target.value)} className={inputCls + " pl-9"} />
        </div>
        <select value={category} onChange={(e) => setCategory(e.target.value)} className={inputCls + " !w-auto"} aria-label="Filter by category">
          <option value="">All categories</option>
          {categories.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={status} onChange={(e) => setStatus(e.target.value as typeof status)} className={inputCls + " !w-auto"} aria-label="Filter by status">
          <option value="">All statuses</option>
          <option value="draft">Draft</option>
          <option value="published">Published</option>
        </select>
      </div>

      {error && <p className="mb-4 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">{error}</p>}

      <div className="overflow-hidden rounded-2xl border border-border bg-white">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-background">
                <th className={cn(TH, "px-5")}>Course</th>
                <th className={TH}>Status</th>
                <th className={TH}>Content</th>
                <th className={TH}>Learners</th>
                <th className={TH}>Updated</th>
                <th className={cn(TH, "px-5 text-right")}>Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading && !data ? (
                <tr><td colSpan={6} className="py-16"><Spinner className="mx-auto" /></td></tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-5 py-16 text-center">
                    <GraduationCap className="mx-auto text-muted-foreground/40" size={32} />
                    <p className="mt-3 text-sm font-semibold text-foreground">{all.length ? "No courses match your filters" : "No courses yet"}</p>
                    {!all.length && (
                      <>
                        <p className="mt-1 text-xs text-muted-foreground">Create your first course: add details, build sections, upload content and publish.</p>
                        <Link href="/admin/learning/new" className={primaryBtn + " mt-4"}><Plus size={16} /> Create course</Link>
                      </>
                    )}
                  </td>
                </tr>
              ) : rows.map((c) => (
                <tr key={c.id} className="align-middle transition-colors hover:bg-background/60">
                  <td className="px-5 py-3.5">
                    <Link href={`/admin/learning/${c.id}`} className="flex items-center gap-3">
                      {c.thumbnailUrl ? <img src={c.thumbnailUrl} alt="" className="h-12 w-20 flex-shrink-0 rounded-lg object-cover" /> : <span className="flex h-12 w-20 flex-shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-herb-green/15 to-copper/10 text-herb-green/60"><BookOpen size={18} /></span>}
                      <span className="min-w-0">
                        <span className="block max-w-xs truncate font-semibold text-foreground hover:text-herb-green">{c.title}</span>
                        <span className="block text-xs text-muted-foreground">{[c.category, c.level && LEVEL_LABEL[c.level], c.instructor?.name].filter(Boolean).join(" · ") || "No category"}</span>
                        {c.moodleStatus === "missing" ? (
                          <span className="mt-0.5 block text-[11px] text-amber-700">Deleted in Moodle. Delete it here too, or recreate it.</span>
                        ) : (
                          <span className="mt-1 flex flex-wrap items-center gap-2">
                            {c.origin === "moodle" && <MoodleOriginBadge />}
                            <MoodleSyncStatus course={c} />
                          </span>
                        )}
                      </span>
                    </Link>
                  </td>
                  <td className="px-4 py-3.5"><StatusBadge status={c.status} /></td>
                  <td className="whitespace-nowrap px-4 py-3.5 text-xs text-foreground">
                    {c.counts.sections} sections · {c.counts.items} items
                    <span className="block text-muted-foreground">{c.counts.videos} videos · {c.counts.documents} files · {c.counts.quizzes} quizzes</span>
                  </td>
                  <td className="px-4 py-3.5 text-xs text-foreground">{c.learners}</td>
                  <td className="whitespace-nowrap px-4 py-3.5 text-xs text-muted-foreground">{new Date(c.updatedAt).toLocaleDateString()}</td>
                  <td className="px-5 py-3.5">
                    <div className="flex items-center justify-end">
                      <Link href={`/admin/learning/${c.id}`} className="mr-2 rounded-lg bg-herb-green/10 px-3 py-1.5 text-xs font-semibold text-herb-green hover:bg-herb-green/15">{c.origin === "moodle" ? "View" : "Build"}</Link>
                      <Link href={`/admin/learning/${c.id}?tab=preview`} className={iconBtn} title="Preview" aria-label="Preview"><Eye size={16} /></Link>
                      <Link href={`/admin/learning/${c.id}/settings`} className={iconBtn} title="Edit details" aria-label="Edit details"><Pencil size={15} /></Link>
                      <button onClick={() => setDeleting(c)} className={cn(iconBtn, "hover:text-red-600")} title="Delete" aria-label="Delete"><Trash2 size={15} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {deleting && (
        <ConfirmDialog
          title="Delete course?"
          message={
            <>
              <b>{deleting.title}</b> will be permanently deleted from {SITE_NAME} Learning and Moodle, including its sections, videos, images, PDFs/files, lessons, quizzes and related course data such as learner progress. This action cannot be undone.
            </>
          }
          confirmLabel="Delete permanently"
          onClose={() => setDeleting(null)}
          onConfirm={async () => {
            try {
              await adminLearningApi.remove(deleting.id);
            } catch (err) {
              toast.error(err instanceof Error ? err.message : "The course could not be deleted. Please try again.", { duration: 7000 });
              throw err; // keep the dialog open so the admin can retry
            } finally {
              refetch(); // show the real state either way
            }
            toast.success(`Course permanently deleted from ${SITE_NAME} Learning and Moodle.`);
          }}
        />
      )}
    </div>
  );
}
