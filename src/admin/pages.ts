import type { PageSettings } from "./types";

/** Routes owned by the application shell rather than CMS pages. */
export const RESERVED_PAGE_SLUGS = new Set(["admin", "api", "auth"]);

/** Slugs backed by specialist layouts already present in the public website. */
export const SPECIAL_PAGE_SLUGS = new Set([
  "home",
  "about",
  "safari-experiences",
  "destinations",
  "journal",
  "contact",
]);

/** Generate the same lowercase, URL-safe value accepted by pages_slug_check. */
export function normalizePageSlug(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/^\/+|\/+$/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** `home` is the only special route alias; every other page is `/<slug>`. */
export function pagePath(pageOrSlug: Pick<PageSettings, "slug"> | string): string {
  const slug = typeof pageOrSlug === "string" ? pageOrSlug : pageOrSlug.slug;
  return slug === "home" ? "/" : `/${slug}`;
}

export function pageSlugFromPath(pathname: string): string {
  const clean = pathname.split(/[?#]/, 1)[0].replace(/^\/+|\/+$/g, "");
  return clean.length === 0 ? "home" : normalizePageSlug(clean);
}

export function validatePageSlug(slug: string): string | null {
  if (!slug) return "A page slug is required.";
  if (slug.length > 120) return "The slug must be 120 characters or fewer.";
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    return "Use lowercase letters, numbers, and single hyphens only.";
  }
  if (RESERVED_PAGE_SLUGS.has(slug)) return `/${slug} is reserved by the application.`;
  return null;
}
