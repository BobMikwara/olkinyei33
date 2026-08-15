import { useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Archive,
  ChevronDown,
  ChevronUp,
  Copy,
  Edit3,
  ImagePlus,
  Package,
  Plus,
  Search,
  Star,
  Trash2,
  Upload,
} from "lucide-react";
import { can, store, useStore, newContentId } from "../store";
import { uploadCmsImages } from "../mediaStorage";
import { Button, Card, Input, Textarea, Select, Badge, Modal, ConfirmDialog, PageHeader, EmptyState, Tabs } from "../ui";
import type { SafariPackage, SafariPackageImage } from "../types";

function PackageCard({ pkg, canManage, onEdit, onDuplicate, onDelete, onTogglePublish }: {
  pkg: SafariPackage;
  canManage: boolean;
  onEdit: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onTogglePublish: () => void;
}) {
  return (
    <motion.div layout initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="group">
      <Card hoverable className="flex h-full flex-col overflow-hidden !p-0">
        <div className="relative aspect-[16/10] overflow-hidden bg-[var(--admin-surface-2)]">
          {pkg.image ? <img src={pkg.image} alt={pkg.title} className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" /> : <div className="flex h-full items-center justify-center"><ImagePlus className="text-[var(--admin-fg-muted)]" /></div>}
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
          <div className="absolute left-3 top-3 flex gap-1.5">
            {pkg.featured && <Badge variant="accent" dot>Featured</Badge>}
            <Badge variant={pkg.published ? "success" : "neutral"} dot>{pkg.published ? "Live" : "Draft"}</Badge>
          </div>
          {canManage && <div className="absolute right-3 top-3 flex gap-1.5 opacity-0 transition-opacity group-hover:opacity-100">
            <button onClick={onEdit} className="flex h-8 w-8 items-center justify-center rounded-md bg-black/40 text-white backdrop-blur-sm hover:bg-black/60" aria-label={`Edit ${pkg.title}`}><Edit3 size={13} /></button>
            <button onClick={onDuplicate} className="flex h-8 w-8 items-center justify-center rounded-md bg-black/40 text-white backdrop-blur-sm hover:bg-black/60" aria-label={`Duplicate ${pkg.title}`}><Copy size={13} /></button>
            <button onClick={onDelete} className="flex h-8 w-8 items-center justify-center rounded-md bg-black/40 text-red-300 backdrop-blur-sm hover:bg-red-500/60 hover:text-white" aria-label={`Archive ${pkg.title}`}><Archive size={13} /></button>
          </div>}
          <div className="absolute bottom-3 left-3 right-3">
            <h3 className="font-serif text-xl font-light text-white">{pkg.title}</h3>
            <p className="mt-0.5 text-[11px] text-white/80">{pkg.region} · {pkg.gallery.length} image{pkg.gallery.length === 1 ? "" : "s"}</p>
          </div>
        </div>
        <div className="flex flex-1 flex-col p-4">
          <p className="line-clamp-2 text-[12.5px] leading-relaxed text-[var(--admin-fg-muted)]">{pkg.summary}</p>
          <div className="mt-4 flex items-center justify-between border-t border-[var(--admin-border)] pt-3">
            <div className="flex gap-3 text-[11px] text-[var(--admin-fg-muted)]"><span>{pkg.duration}</span><span>·</span><span className="font-medium text-[var(--admin-accent)]">${pkg.price.toLocaleString()}</span></div>
            {canManage && <button onClick={onTogglePublish} className={`text-[11px] font-medium transition-colors ${pkg.published ? "text-emerald-400 hover:text-emerald-300" : "text-[var(--admin-fg-muted)] hover:text-[var(--admin-fg)]"}`}>{pkg.published ? "Unpublish" : "Publish"}</button>}
          </div>
        </div>
      </Card>
    </motion.div>
  );
}

function StringListEditor({ title, items, onChange, placeholder }: {
  title: string;
  items: string[];
  onChange: (items: string[]) => void;
  placeholder?: string;
}) {
  const update = (index: number, value: string) => onChange(items.map((item, itemIndex) => itemIndex === index ? value : item));
  const move = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= items.length) return;
    const next = items.slice();
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  };
  return <div className="space-y-3">
    <div className="flex items-center justify-between"><span className="text-[11px] font-medium uppercase tracking-wider text-[var(--admin-fg-muted)]">{title}</span><Button size="sm" variant="secondary" icon={Plus} onClick={() => onChange([...items, ""])}>Add item</Button></div>
    {items.length === 0 ? <p className="rounded-md border border-dashed border-[var(--admin-border)] px-3 py-5 text-center text-[12px] text-[var(--admin-fg-muted)]">No items yet.</p> : <div className="space-y-2">{items.map((item, index) => <div key={index} className="flex items-center gap-2">
      <Input value={item} maxLength={160} onChange={(event) => update(index, event.target.value)} placeholder={placeholder} />
      <div className="flex shrink-0 gap-1">
        <Button size="icon" variant="ghost" aria-label={`Move ${title} item up`} disabled={index === 0} onClick={() => move(index, -1)}><ChevronUp size={13} /></Button>
        <Button size="icon" variant="ghost" aria-label={`Move ${title} item down`} disabled={index === items.length - 1} onClick={() => move(index, 1)}><ChevronDown size={13} /></Button>
        <Button size="icon" variant="ghost" aria-label={`Remove ${title} item`} onClick={() => onChange(items.filter((_, itemIndex) => itemIndex !== index))}><Trash2 size={13} /></Button>
      </div>
    </div>)}</div>}
  </div>;
}

function orderedImages(images: SafariPackageImage[]): SafariPackageImage[] {
  return images.map((image, index) => ({ ...image, sortOrder: index }));
}

function PackageGalleryEditor({ images, primaryImage, folder, onChange, onPrimaryChange }: {
  images: SafariPackageImage[];
  primaryImage: string;
  folder: string;
  onChange: (images: SafariPackageImage[]) => void;
  onPrimaryChange: (url: string) => void;
}) {
  const [url, setUrl] = useState("");
  const [uploading, setUploading] = useState(false);
  const [replaceIndex, setReplaceIndex] = useState<number | null>(null);
  const uploadRef = useRef<HTMLInputElement>(null);
  const replaceRef = useRef<HTMLInputElement>(null);

  const changeImages = (next: SafariPackageImage[]) => onChange(orderedImages(next));
  const addUrl = () => {
    const imageUrl = url.trim();
    if (!imageUrl) return;
    if (images.some((image) => image.imageUrl === imageUrl)) {
      store.notify({ type: "error", title: "Image already added" });
      return;
    }
    const next = [...images, { id: newContentId(), imageUrl, altText: "", caption: "", sortOrder: images.length }];
    changeImages(next);
    if (!primaryImage) onPrimaryChange(imageUrl);
    setUrl("");
  };
  const upload = async (files: File[], replacing?: number) => {
    if (files.length === 0) return;
    setUploading(true);
    try {
      const stored = await uploadCmsImages(files, `packages/${folder}`);
      if (replacing !== undefined) {
        const first = stored[0];
        const next = images.map((image, index) => index === replacing ? { ...image, imageUrl: first.imageUrl, altText: image.altText || first.altText } : image);
        if (images[replacing]?.imageUrl === primaryImage) onPrimaryChange(first.imageUrl);
        changeImages(next);
      } else {
        const additions = stored.map((image, index) => ({ id: newContentId(), imageUrl: image.imageUrl, altText: image.altText, caption: "", sortOrder: images.length + index }));
        changeImages([...images, ...additions]);
        if (!primaryImage && additions[0]) onPrimaryChange(additions[0].imageUrl);
      }
      store.notify({ type: "success", title: stored.length === 1 ? "Image uploaded" : `${stored.length} images uploaded`, message: "Stored in the existing expedition-media bucket." });
    } catch (error) {
      store.notify({ type: "error", title: "Upload failed", message: error instanceof Error ? error.message : String(error) });
    } finally {
      setUploading(false);
      setReplaceIndex(null);
      if (uploadRef.current) uploadRef.current.value = "";
      if (replaceRef.current) replaceRef.current.value = "";
    }
  };
  const remove = (index: number) => {
    const removed = images[index];
    const next = images.filter((_, imageIndex) => imageIndex !== index);
    changeImages(next);
    if (removed.imageUrl === primaryImage) onPrimaryChange(next[0]?.imageUrl ?? "");
  };
  const move = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= images.length) return;
    const next = images.slice();
    [next[index], next[target]] = [next[target], next[index]];
    changeImages(next);
  };
  const update = (index: number, patch: Partial<SafariPackageImage>) => changeImages(images.map((image, imageIndex) => imageIndex === index ? { ...image, ...patch } : image));

  return <div className="space-y-4 border-t border-[var(--admin-border)] pt-6">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h3 className="font-serif text-xl font-light">Safari Package Images</h3><p className="mt-1 text-[11px] text-[var(--admin-fg-muted)]">Upload any number of images, set one primary image, and control the exact public gallery order.</p></div>
      <Button variant="secondary" icon={Upload} disabled={uploading} onClick={() => uploadRef.current?.click()}>{uploading ? "Uploading…" : "Upload images"}</Button>
      <input ref={uploadRef} type="file" multiple accept="image/*" className="hidden" onChange={(event) => void upload(Array.from(event.target.files ?? []))} />
      <input ref={replaceRef} type="file" accept="image/*" className="hidden" onChange={(event) => replaceIndex !== null && void upload(Array.from(event.target.files ?? []).slice(0, 1), replaceIndex)} />
    </div>
    <div className="flex gap-2"><Input type="url" value={url} onChange={(event) => setUrl(event.target.value)} placeholder="Or add an image URL" onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); addUrl(); } }} /><Button variant="outline" icon={Plus} onClick={addUrl}>Add</Button></div>
    {images.length === 0 ? <div className="rounded-lg border border-dashed border-[var(--admin-border)] p-8 text-center"><ImagePlus className="mx-auto text-[var(--admin-fg-muted)]" /><p className="mt-3 text-xs text-[var(--admin-fg-muted)]">No package images yet.</p></div> : <div className="grid gap-3 sm:grid-cols-2">{images.map((image, index) => {
      const primary = image.imageUrl === primaryImage;
      return <div key={image.id} className={`overflow-hidden rounded-lg border ${primary ? "border-[var(--admin-accent)]" : "border-[var(--admin-border)]"}`}>
        <div className="relative aspect-[16/9] bg-[var(--admin-surface-2)]"><img src={image.imageUrl} alt={image.altText} className="h-full w-full object-cover" />
          <span className="absolute left-2 top-2 rounded bg-black/60 px-2 py-1 text-[10px] text-white">{index + 1}</span>{primary && <span className="absolute right-2 top-2"><Badge variant="accent"><Star size={10} /> Primary</Badge></span>}
        </div>
        <div className="space-y-2 p-3">
          <Input value={image.imageUrl} onChange={(event) => { const previous = image.imageUrl; update(index, { imageUrl: event.target.value }); if (previous === primaryImage) onPrimaryChange(event.target.value); }} placeholder="Image URL" />
          <Input value={image.altText} onChange={(event) => update(index, { altText: event.target.value })} placeholder="Alt text" maxLength={240} />
          <Input value={image.caption} onChange={(event) => update(index, { caption: event.target.value })} placeholder="Optional caption" maxLength={500} />
          <div className="flex flex-wrap gap-1 border-t border-[var(--admin-border)] pt-2">
            {!primary && <Button size="sm" variant="ghost" icon={Star} onClick={() => onPrimaryChange(image.imageUrl)}>Set primary</Button>}
            <Button size="icon" variant="ghost" aria-label="Move image up" disabled={index === 0} onClick={() => move(index, -1)}><ChevronUp size={13} /></Button>
            <Button size="icon" variant="ghost" aria-label="Move image down" disabled={index === images.length - 1} onClick={() => move(index, 1)}><ChevronDown size={13} /></Button>
            <Button size="sm" variant="ghost" onClick={() => { setReplaceIndex(index); replaceRef.current?.click(); }}>Replace</Button>
            <Button size="icon" variant="ghost" aria-label="Remove image" onClick={() => remove(index)}><Trash2 size={13} /></Button>
          </div>
        </div>
      </div>;
    })}</div>}
  </div>;
}

function PackageEditor({ pkg, onClose }: { pkg: SafariPackage | null; onClose: () => void }) {
  const [form, setForm] = useState<Partial<SafariPackage>>(pkg ?? {
    title: "", region: "", duration: "", nights: 0, price: 0, image: "", gallery: [], summary: "", description: "", signature: "", highlights: [], included: [], excluded: [], availability: [], country: [], parks: [], wildlife: [], difficulty: "Moderate", tags: [], featured: false, published: false, seo: { title: "", description: "" }, coordinates: [0, 0],
  });
  const [saving, setSaving] = useState(false);
  const [folder] = useState(() => pkg?.id ?? newContentId());
  const update = <K extends keyof SafariPackage>(key: K, value: SafariPackage[K]) => setForm((current) => ({ ...current, [key]: value }));
  const save = async () => {
    if (!form.title?.trim() || !form.region?.trim()) { store.notify({ type: "error", title: "Missing required fields", message: "Title and region are required." }); return; }
    const gallery = orderedImages((form.gallery ?? []).filter((image) => image.imageUrl.trim()).map((image) => ({ ...image, imageUrl: image.imageUrl.trim(), altText: image.altText.trim(), caption: image.caption.trim() })));
    if (gallery.length === 0) { store.notify({ type: "error", title: "Package image required", message: "Add at least one gallery image and set its details." }); return; }
    if (!form.duration?.trim() || Number(form.price) <= 0) { store.notify({ type: "error", title: "Duration and price required", message: "Enter a duration and a price greater than zero." }); return; }
    const image = gallery.some((entry) => entry.imageUrl === form.image) ? String(form.image) : gallery[0]?.imageUrl ?? "";
    const sanitized = { ...form, image, gallery, included: (form.included ?? []).map((item) => item.trim()).filter(Boolean), excluded: (form.excluded ?? []).map((item) => item.trim()).filter(Boolean) };
    setSaving(true);
    const result = pkg
      ? await store.actions.updatePackage(pkg.id, sanitized)
      : await store.actions.createPackage(sanitized as Omit<SafariPackage, "id" | "createdAt" | "updatedAt" | "slug">);
    setSaving(false);
    if (result.ok) onClose();
  };
  return <Modal open onClose={onClose} size="xl" title={pkg ? `Edit ${pkg.title}` : "New Safari Package"} footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button disabled={saving} onClick={() => void save()} icon={pkg ? undefined : Plus}>{saving ? "Saving…" : pkg ? "Save changes" : "Create package"}</Button></>}>
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2"><label><span className="mb-2 block text-[11px] font-medium uppercase tracking-wider text-[var(--admin-fg-muted)]">Title *</span><Input value={form.title ?? ""} onChange={(event) => update("title", event.target.value)} /></label><label><span className="mb-2 block text-[11px] font-medium uppercase tracking-wider text-[var(--admin-fg-muted)]">Region *</span><Input value={form.region ?? ""} onChange={(event) => update("region", event.target.value)} /></label></div>
      <div className="grid gap-4 md:grid-cols-3"><label><span className="mb-2 block text-[11px] font-medium uppercase tracking-wider text-[var(--admin-fg-muted)]">Duration</span><Input value={form.duration ?? ""} onChange={(event) => update("duration", event.target.value)} /></label><label><span className="mb-2 block text-[11px] font-medium uppercase tracking-wider text-[var(--admin-fg-muted)]">Price (USD)</span><Input type="number" value={form.price ?? 0} onChange={(event) => update("price", Number(event.target.value))} /></label><label><span className="mb-2 block text-[11px] font-medium uppercase tracking-wider text-[var(--admin-fg-muted)]">Difficulty</span><Select value={form.difficulty} onChange={(event) => update("difficulty", event.target.value as SafariPackage["difficulty"])}><option>Gentle</option><option>Moderate</option><option>Active</option><option>Expedition</option></Select></label></div>
      <label className="block"><span className="mb-2 block text-[11px] font-medium uppercase tracking-wider text-[var(--admin-fg-muted)]">Summary</span><Textarea rows={3} value={form.summary ?? ""} onChange={(event) => update("summary", event.target.value)} /></label>
      <label className="block"><span className="mb-2 block text-[11px] font-medium uppercase tracking-wider text-[var(--admin-fg-muted)]">Full Description</span><Textarea rows={6} value={form.description ?? ""} onChange={(event) => update("description", event.target.value)} /></label>
      <PackageGalleryEditor images={form.gallery ?? []} primaryImage={form.image ?? ""} folder={folder} onChange={(images) => update("gallery", images)} onPrimaryChange={(image) => update("image", image)} />
      <div className="border-t border-[var(--admin-border)] pt-6"><h3 className="mb-4 font-serif text-xl font-light">Included &amp; Not included</h3><div className="space-y-6"><StringListEditor title="Included" items={form.included ?? []} onChange={(items) => update("included", items)} /><StringListEditor title="Not included" items={form.excluded ?? []} onChange={(items) => update("excluded", items)} /></div></div>
      <div className="border-t border-[var(--admin-border)] pt-6"><h3 className="mb-4 font-serif text-xl font-light">Publishing</h3><div className="flex items-center gap-6"><label className="flex items-center gap-2 text-[12.5px]"><input type="checkbox" className="accent-[var(--admin-accent)]" checked={Boolean(form.published)} onChange={(event) => update("published", event.target.checked)} />Published</label><label className="flex items-center gap-2 text-[12.5px]"><input type="checkbox" className="accent-[var(--admin-accent)]" checked={Boolean(form.featured)} onChange={(event) => update("featured", event.target.checked)} />Featured on homepage</label></div></div>
      <div className="border-t border-[var(--admin-border)] pt-6"><h3 className="mb-4 font-serif text-xl font-light">SEO</h3><div className="space-y-4"><label><span className="mb-2 block text-[11px] font-medium uppercase tracking-wider text-[var(--admin-fg-muted)]">SEO Title</span><Input value={form.seo?.title ?? ""} onChange={(event) => update("seo", { title: event.target.value, description: form.seo?.description ?? "" })} /></label><label><span className="mb-2 block text-[11px] font-medium uppercase tracking-wider text-[var(--admin-fg-muted)]">Meta Description</span><Textarea rows={2} value={form.seo?.description ?? ""} onChange={(event) => update("seo", { title: form.seo?.title ?? "", description: event.target.value })} /></label></div></div>
    </div>
  </Modal>;
}

export default function PackagesManager() {
  const packages = useStore((state) => state.packages);
  const user = store.currentUser();
  const canManage = Boolean(user && (can(user, "packages", "edit") || can(user, "packages", "manage")));
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "published" | "draft" | "archived">("all");
  const [editing, setEditing] = useState<SafariPackage | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [deleting, setDeleting] = useState<SafariPackage | null>(null);
  const filtered = packages.filter((pkg) => {
    if (filter === "published" && !pkg.published) return false;
    if (filter === "draft" && pkg.published) return false;
    if (filter === "archived" && !pkg.archived) return false;
    if (filter === "all" && pkg.archived) return false;
    return !search || pkg.title.toLowerCase().includes(search.toLowerCase()) || pkg.region.toLowerCase().includes(search.toLowerCase());
  });
  return <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
    <PageHeader eyebrow="Content management" title="Safari Packages" description="Create, edit, publish, and manage ordered image galleries from Supabase." actions={canManage ? <Button icon={Plus} onClick={() => setShowNew(true)}>New Package</Button> : undefined} />
    <div className="mb-6 flex flex-wrap items-center gap-3"><div className="min-w-[240px] flex-1"><Input icon={Search} placeholder="Search packages..." value={search} onChange={(event) => setSearch(event.target.value)} /></div><Tabs tabs={[{ id: "all", label: "All", count: packages.filter((pkg) => !pkg.archived).length }, { id: "published", label: "Published", count: packages.filter((pkg) => pkg.published && !pkg.archived).length }, { id: "draft", label: "Drafts", count: packages.filter((pkg) => !pkg.published && !pkg.archived).length }, { id: "archived", label: "Archived", count: packages.filter((pkg) => pkg.archived).length }]} value={filter} onChange={setFilter} /></div>
    {filtered.length === 0 ? <EmptyState icon={Package} title="No packages found" description={search ? "Try a different search term." : "No Supabase package records match this view."} action={canManage ? <Button icon={Plus} onClick={() => setShowNew(true)}>New Package</Button> : undefined} /> : <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"><AnimatePresence>{filtered.map((pkg) => <PackageCard key={pkg.id} pkg={pkg} canManage={canManage} onEdit={() => setEditing(pkg)} onDuplicate={() => store.actions.duplicatePackage(pkg.id)} onDelete={() => setDeleting(pkg)} onTogglePublish={() => store.actions.updatePackage(pkg.id, { published: !pkg.published })} />)}</AnimatePresence></div>}
    {editing && <PackageEditor pkg={editing} onClose={() => setEditing(null)} />}{showNew && <PackageEditor pkg={null} onClose={() => setShowNew(false)} />}
    {deleting && <ConfirmDialog open onClose={() => setDeleting(null)} onConfirm={() => store.actions.deletePackage(deleting.id)} title={`Archive ${deleting.title}?`} description="This unpublishes the package without deleting bookings or gallery metadata. It can be restored later." confirmLabel="Archive" />}
  </motion.div>;
}
