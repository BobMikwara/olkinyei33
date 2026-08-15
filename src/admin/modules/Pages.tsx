import { useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Archive, Edit3, Eye, FileText, Plus, Save, Search, Upload } from "lucide-react";
import { can, newContentId, store, useStore } from "../store";
import { normalizePageSlug, pagePath, validatePageSlug } from "../pages";
import { uploadCmsImages } from "../mediaStorage";
import type { PageSettings, PageStatus } from "../types";
import { Badge, Button, Card, ConfirmDialog, EmptyState, Input, Modal, PageHeader, Select, Tabs, Textarea } from "../ui";

const STATUS_BADGE: Record<PageStatus, "neutral" | "success" | "warning"> = {
  draft: "neutral",
  published: "success",
  archived: "warning",
};

type PageDraft = Omit<PageSettings, "id" | "createdAt" | "updatedAt" | "updatedBy">;

function emptyPage(sortOrder: number): PageDraft {
  return {
    slug: "",
    title: "",
    content: { body: "" },
    featuredImage: "",
    heroTitle: "",
    heroEyebrow: "",
    heroText: "",
    status: "draft",
    layout: "standard",
    navigationLabel: "",
    showInNavigation: false,
    sortOrder,
    seo: { title: "", description: "" },
  };
}

function PagePreview({ page, onClose }: { page: PageDraft | PageSettings; onClose: () => void }) {
  const body = String(page.content.body ?? "");
  return <Modal open onClose={onClose} size="lg" title={`Preview: ${page.title || "Untitled page"}`} footer={<><Button variant="ghost" onClick={onClose}>Close</Button>{page.status === "published" && <Button icon={Eye} onClick={() => window.open(pagePath(page.slug), "_blank", "noopener,noreferrer")}>Open public URL</Button>}</>}>
    <article className="overflow-hidden rounded-lg border border-[var(--admin-border)] bg-[#f3ecdf] text-[#151713]">
      {page.featuredImage && <img src={page.featuredImage} alt="" className="aspect-[16/7] w-full object-cover" />}
      <div className="p-7"><p className="text-[10px] uppercase tracking-[.25em] text-[#b9552d]">{page.heroEyebrow}</p><h1 className="mt-3 font-serif text-4xl font-light">{page.heroTitle || page.title}</h1>{page.heroText && <p className="mt-3 max-w-2xl text-sm leading-relaxed opacity-70">{page.heroText}</p>}
        {body && <div className="mt-8 space-y-4 border-t border-black/10 pt-6 text-sm leading-7">{body.split(/\n{2,}/).map((paragraph, index) => <p key={index}>{paragraph}</p>)}</div>}
      </div>
    </article>
  </Modal>;
}

function PageEditor({ page, pages, onClose }: { page: PageSettings | null; pages: PageSettings[]; onClose: () => void }) {
  const [draft, setDraft] = useState<PageDraft>(() => page ? {
    slug: page.slug,
    title: page.title,
    content: structuredClone(page.content),
    featuredImage: page.featuredImage,
    heroTitle: page.heroTitle,
    heroEyebrow: page.heroEyebrow,
    heroText: page.heroText,
    status: page.status,
    layout: page.layout,
    navigationLabel: page.navigationLabel,
    showInNavigation: page.showInNavigation,
    sortOrder: page.sortOrder,
    seo: structuredClone(page.seo),
  } : emptyPage(Math.max(0, ...pages.map((item) => item.sortOrder)) + 10));
  const [slugEdited, setSlugEdited] = useState(Boolean(page));
  const mayArchive = can(store.currentUser(), "pages", "delete");
  const [saving, setSaving] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const imageRef = useRef<HTMLInputElement>(null);
  const update = <K extends keyof PageDraft>(key: K, value: PageDraft[K]) => setDraft((current) => ({ ...current, [key]: value }));
  const normalizedSlug = normalizePageSlug(draft.slug);
  const duplicate = pages.some((item) => item.id !== page?.id && item.slug.toLowerCase() === normalizedSlug);
  const slugError = validatePageSlug(normalizedSlug) ?? (duplicate ? `/${normalizedSlug} is already used by another page.` : null);

  const changeTitle = (title: string) => {
    setDraft((current) => ({ ...current, title, navigationLabel: current.navigationLabel || title, slug: slugEdited ? current.slug : normalizePageSlug(title) }));
  };
  const uploadImage = async (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const [stored] = await uploadCmsImages([file], `pages/${(page?.id ?? normalizedSlug) || newContentId()}`);
      update("featuredImage", stored.imageUrl);
      store.notify({ type: "success", title: "Featured image uploaded", message: "Stored in expedition-media." });
    } catch (error) {
      store.notify({ type: "error", title: "Upload failed", message: error instanceof Error ? error.message : String(error) });
    } finally {
      setUploading(false);
      if (imageRef.current) imageRef.current.value = "";
    }
  };
  const save = async () => {
    if (!draft.title.trim()) { store.notify({ type: "error", title: "Page title is required" }); return; }
    if (slugError) { store.notify({ type: "error", title: duplicate ? "Slug already exists" : "Invalid slug", message: slugError }); return; }
    setSaving(true);
    const clean: PageDraft = {
      ...draft,
      slug: normalizedSlug,
      title: draft.title.trim(),
      navigationLabel: draft.navigationLabel.trim() || draft.title.trim(),
      content: { ...draft.content, body: String(draft.content.body ?? "").trim() },
    };
    const result = page
      ? await store.actions.updatePage(page.id, clean)
      : await store.actions.createPage(clean);
    setSaving(false);
    if (result.ok) onClose();
  };

  return <>
    <Modal open onClose={onClose} size="xl" title={page ? `Edit ${page.title}` : "Create New Page"} description="This record is shared by the CMS and public website through Supabase." footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="outline" icon={Eye} onClick={() => setPreviewing(true)}>Preview</Button><Button icon={Save} disabled={saving || Boolean(slugError)} onClick={() => void save()}>{saving ? "Saving…" : page ? "Save changes" : "Create page"}</Button></>}>
      <div className="space-y-6">
        <div className="grid gap-4 md:grid-cols-2"><label><span className="mb-2 block text-[11px] uppercase tracking-wider text-[var(--admin-fg-muted)]">Page title *</span><Input value={draft.title} onChange={(event) => changeTitle(event.target.value)} placeholder="About our camps" /></label><label><span className="mb-2 block text-[11px] uppercase tracking-wider text-[var(--admin-fg-muted)]">Slug *</span><div className="flex items-center"><span className="flex h-9 items-center rounded-l-md border border-r-0 border-[var(--admin-border)] bg-[var(--admin-surface-2)] px-3 text-xs text-[var(--admin-fg-muted)]">/</span><Input className="rounded-l-none" disabled={draft.layout === "home"} value={draft.slug} onChange={(event) => { setSlugEdited(true); update("slug", normalizePageSlug(event.target.value)); }} placeholder="about-our-camps" /></div>{slugError && <p className="mt-1.5 text-[11px] text-red-400">{slugError}</p>}</label></div>
        <div className="grid gap-4 md:grid-cols-2"><label><span className="mb-2 block text-[11px] uppercase tracking-wider text-[var(--admin-fg-muted)]">Status</span><Select value={draft.status} disabled={draft.status === "archived" && !mayArchive} onChange={(event) => update("status", event.target.value as PageStatus)}><option value="draft">Draft</option><option value="published">Published</option>{(mayArchive || draft.status === "archived") && <option value="archived">Archived</option>}</Select></label><label><span className="mb-2 block text-[11px] uppercase tracking-wider text-[var(--admin-fg-muted)]">Layout</span><Select value={draft.layout} disabled={Boolean(page && page.layout !== "standard")} onChange={(event) => update("layout", event.target.value as PageSettings["layout"])}><option value="standard">Standard CMS page</option>{page && page.layout !== "standard" && <option value={page.layout}>{page.layout} specialist layout</option>}</Select><p className="mt-1.5 text-[10px] text-[var(--admin-fg-muted)]">Specialist layouts keep their React structure while all editable content comes from this record.</p></label></div>
        <div className="border-t border-[var(--admin-border)] pt-6"><h3 className="mb-4 font-serif text-xl font-light">Hero &amp; featured image</h3><div className="space-y-4">
          <label><span className="mb-2 block text-[11px] uppercase tracking-wider text-[var(--admin-fg-muted)]">Hero eyebrow</span><Input value={draft.heroEyebrow} onChange={(event) => update("heroEyebrow", event.target.value)} /></label><label><span className="mb-2 block text-[11px] uppercase tracking-wider text-[var(--admin-fg-muted)]">Hero title</span><Input value={draft.heroTitle} onChange={(event) => update("heroTitle", event.target.value)} /></label><label><span className="mb-2 block text-[11px] uppercase tracking-wider text-[var(--admin-fg-muted)]">Hero description</span><Textarea rows={3} value={draft.heroText} onChange={(event) => update("heroText", event.target.value)} /></label>
          <label><span className="mb-2 block text-[11px] uppercase tracking-wider text-[var(--admin-fg-muted)]">Featured image</span><div className="flex gap-2"><Input type="url" value={draft.featuredImage} onChange={(event) => update("featuredImage", event.target.value)} placeholder="https://…" /><Button variant="secondary" icon={Upload} disabled={uploading} onClick={() => imageRef.current?.click()}>{uploading ? "Uploading…" : "Upload"}</Button><input ref={imageRef} type="file" accept="image/*" className="hidden" onChange={(event) => void uploadImage(event.target.files)} /></div></label>{draft.featuredImage && <img src={draft.featuredImage} alt="Featured preview" className="aspect-[16/5] w-full rounded-lg object-cover" />}
        </div></div>
        <div className="border-t border-[var(--admin-border)] pt-6"><h3 className="mb-4 font-serif text-xl font-light">Page content</h3><label><span className="mb-2 block text-[11px] uppercase tracking-wider text-[var(--admin-fg-muted)]">Body</span><Textarea rows={12} value={String(draft.content.body ?? "")} onChange={(event) => update("content", { ...draft.content, body: event.target.value })} placeholder="Write the page content. Separate paragraphs with a blank line." /></label>
          {draft.layout === "home" && <div className="mt-4 grid gap-4"><label><span className="mb-2 block text-[11px] uppercase tracking-wider text-[var(--admin-fg-muted)]">Home brand statement</span><Textarea rows={4} value={String(draft.content.homeStatement ?? "")} onChange={(event) => update("content", { ...draft.content, homeStatement: event.target.value })} /></label><label><span className="mb-2 block text-[11px] uppercase tracking-wider text-[var(--admin-fg-muted)]">Conservation statement</span><Textarea rows={4} value={String(draft.content.conservationStatement ?? "")} onChange={(event) => update("content", { ...draft.content, conservationStatement: event.target.value })} /></label></div>}
        </div>
        <div className="border-t border-[var(--admin-border)] pt-6"><h3 className="mb-4 font-serif text-xl font-light">Navigation</h3><div className="grid gap-4 md:grid-cols-[1fr_120px]"><label><span className="mb-2 block text-[11px] uppercase tracking-wider text-[var(--admin-fg-muted)]">Navigation label</span><Input value={draft.navigationLabel} onChange={(event) => update("navigationLabel", event.target.value)} /></label><label><span className="mb-2 block text-[11px] uppercase tracking-wider text-[var(--admin-fg-muted)]">Order</span><Input type="number" value={draft.sortOrder} onChange={(event) => update("sortOrder", Number(event.target.value))} /></label></div><label className="mt-4 flex items-center gap-2 text-xs"><input type="checkbox" className="accent-[var(--admin-accent)]" checked={draft.showInNavigation} onChange={(event) => update("showInNavigation", event.target.checked)} />Show this page in public navigation when published</label></div>
        <div className="border-t border-[var(--admin-border)] pt-6"><h3 className="mb-4 font-serif text-xl font-light">SEO</h3><div className="space-y-4"><label><span className="mb-2 block text-[11px] uppercase tracking-wider text-[var(--admin-fg-muted)]">SEO title</span><Input value={draft.seo.title} onChange={(event) => update("seo", { ...draft.seo, title: event.target.value })} maxLength={70} /></label><label><span className="mb-2 block text-[11px] uppercase tracking-wider text-[var(--admin-fg-muted)]">SEO description</span><Textarea rows={3} value={draft.seo.description} onChange={(event) => update("seo", { ...draft.seo, description: event.target.value })} maxLength={180} /></label></div></div>
      </div>
    </Modal>
    {previewing && <PagePreview page={draft} onClose={() => setPreviewing(false)} />}
  </>;
}

export default function PagesManager() {
  const pages = useStore((state) => state.pages);
  const user = store.currentUser();
  const canCreate = Boolean(user && (can(user, "pages", "create") || can(user, "pages", "manage")));
  const canEdit = Boolean(user && (can(user, "pages", "edit") || can(user, "pages", "manage")));
  const canDelete = Boolean(user && can(user, "pages", "delete"));
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"all" | PageStatus>("all");
  const [editing, setEditing] = useState<PageSettings | null>(null);
  const [creating, setCreating] = useState(false);
  const [previewing, setPreviewing] = useState<PageSettings | null>(null);
  const [deleting, setDeleting] = useState<PageSettings | null>(null);
  const filtered = useMemo(() => pages.filter((page) => (status === "all" || page.status === status) && (!search || page.title.toLowerCase().includes(search.toLowerCase()) || page.slug.includes(search.toLowerCase()))), [pages, search, status]);
  return <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
    <PageHeader eyebrow="Page manager" title="Website pages" description="Create, edit, publish, preview, and archive the Supabase records rendered by public routes." actions={canCreate ? <Button icon={Plus} onClick={() => setCreating(true)}>Create New Page</Button> : undefined} />
    <div className="mb-6 flex flex-wrap gap-3"><div className="min-w-[240px] flex-1"><Input icon={Search} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search title or slug…" /></div><Tabs value={status} onChange={setStatus} tabs={[{ id: "all", label: "All", count: pages.length }, { id: "published", label: "Published", count: pages.filter((page) => page.status === "published").length }, { id: "draft", label: "Drafts", count: pages.filter((page) => page.status === "draft").length }, { id: "archived", label: "Archived", count: pages.filter((page) => page.status === "archived").length }]} /></div>
    {filtered.length === 0 ? <EmptyState icon={FileText} title="No pages found" description={pages.length === 0 ? "No page rows were returned. Run supabase/pages_sync.sql and confirm this build is connected to Supabase." : "Try another search or status filter."} action={canCreate ? <Button icon={Plus} onClick={() => setCreating(true)}>Create New Page</Button> : undefined} /> : <div className="space-y-2">{filtered.map((page) => <Card key={page.id} className="!p-4"><div className="flex flex-wrap items-center gap-4"><div className="min-w-0 flex-1"><div className="flex items-center gap-2"><h2 className="truncate font-serif text-xl font-light">{page.title}</h2><Badge variant={STATUS_BADGE[page.status]} dot>{page.status}</Badge>{page.layout !== "standard" && <Badge variant="info">{page.layout} layout</Badge>}</div><p className="mt-1 text-[11px] text-[var(--admin-fg-muted)]">{pagePath(page)} · Updated {new Date(page.updatedAt).toLocaleDateString()}</p></div><div className="flex items-center gap-1"><Button size="sm" variant="ghost" icon={Eye} onClick={() => setPreviewing(page)}>Preview</Button>{canEdit && <Button size="sm" variant="ghost" icon={Edit3} onClick={() => setEditing(page)}>Edit</Button>}{canDelete && page.status !== "archived" && <Button size="icon" variant="ghost" aria-label={`Delete ${page.title}`} onClick={() => setDeleting(page)}><Archive size={13} /></Button>}</div></div></Card>)}</div>}
    {creating && <PageEditor page={null} pages={pages} onClose={() => setCreating(false)} />}{editing && <PageEditor page={editing} pages={pages} onClose={() => setEditing(null)} />}{previewing && <PagePreview page={previewing} onClose={() => setPreviewing(null)} />}
    {deleting && <ConfirmDialog open onClose={() => setDeleting(null)} onConfirm={() => { void store.actions.deletePage(deleting.id); setDeleting(null); }} title={`Delete “${deleting.title}”?`} description={`This will unpublish ${pagePath(deleting)}, remove it from navigation, and archive the row. Related content and route history are preserved; no records are cascade-deleted.`} confirmLabel="Archive page" />}
  </motion.div>;
}
