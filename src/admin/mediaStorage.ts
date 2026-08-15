import { supabase } from "../lib/supabase";

export const CMS_MEDIA_BUCKET = "expedition-media";
const MAX_IMAGE_BYTES = 12 * 1024 * 1024;

export type StoredImage = { imageUrl: string; storagePath: string; altText: string };

function safeFileName(name: string): string {
  const extension = name.includes(".") ? `.${name.split(".").pop()!.toLowerCase().replace(/[^a-z0-9]/g, "")}` : "";
  const stem = name.replace(/\.[^.]+$/, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "image";
  return `${stem.slice(0, 70)}${extension}`;
}

function imageId(): string {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/**
 * Uploads through the signed-in user's Supabase session. RLS on the existing
 * expedition-media bucket authorises CMS roles; no service-role credential is
 * ever used or exposed to the browser.
 */
export async function uploadCmsImages(files: File[], folder: string): Promise<StoredImage[]> {
  const client = supabase;
  if (!client) throw new Error("Supabase Storage is not configured in this build.");
  const invalid = files.find((file) => !file.type.startsWith("image/") || file.size > MAX_IMAGE_BYTES);
  if (invalid) {
    throw new Error(
      !invalid.type.startsWith("image/")
        ? `${invalid.name} is not an image.`
        : `${invalid.name} is larger than 12 MB.`,
    );
  }

  const safeFolder = folder.toLowerCase().replace(/[^a-z0-9/_-]+/g, "-").replace(/\.{2,}/g, "");
  return Promise.all(files.map(async (file) => {
    const storagePath = `${safeFolder}/${imageId()}-${safeFileName(file.name)}`;
    const { error } = await client.storage
      .from(CMS_MEDIA_BUCKET)
      .upload(storagePath, file, { cacheControl: "31536000", upsert: false, contentType: file.type });
    if (error) throw new Error(error.message);
    const { data } = client.storage.from(CMS_MEDIA_BUCKET).getPublicUrl(storagePath);
    return {
      imageUrl: data.publicUrl,
      storagePath,
      altText: file.name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ").trim(),
    };
  }));
}
