import type { AppState, Moment } from "./types";

export function albumPhotos(moments: Moment[], status: AppState["couple"]["status"]) {
  if (status !== "PAIRED") return [];
  const photos: Array<{ key: string; momentId: string; title: string; author: Moment["author"]; assetId: string; source: string; original: string }> = [];
  const ordered = moments.filter((moment) => moment.visibility === "SHARED" && moment.status === "PUBLISHED" && moment.mediaType === "IMAGE")
    .slice().sort((left, right) => Date.parse(right.occurredAt) - Date.parse(left.occurredAt));
  for (const moment of ordered) {
    for (const media of moment.media || []) {
      const source = media.thumbnailPath || media.path;
      if (media.type !== "IMAGE" || media.status !== "READY" || !source) continue;
      photos.push({ key: `${moment.id}:${media.id}`, momentId: moment.id, title: moment.title,
        author: moment.author, assetId: media.assetId || media.id, source, original: media.path || source });
      if (photos.length === 6) return photos;
    }
  }
  return photos;
}
