import type { AlbumPhoto, AppState, Moment } from "./types";

export function albumPhotos(moments: Moment[], status: AppState["couple"]["status"], uploads: AlbumPhoto[] = [], order: string[] = []) {
  if (status !== "PAIRED") return [];
  const photos: AlbumPhoto[] = uploads.filter(photo => photo.source && (!photo.status || photo.status === "READY"));
  const ordered = moments.filter((moment) => moment.visibility === "SHARED" && moment.status === "PUBLISHED" && moment.mediaType === "IMAGE")
    .slice().sort((left, right) => Date.parse(right.occurredAt) - Date.parse(left.occurredAt));
  for (const moment of ordered) {
    for (const media of moment.media || []) {
      const source = media.thumbnailPath || media.path;
      if (media.type !== "IMAGE" || media.status !== "READY" || !source) continue;
      photos.push({ key: `${moment.id}:${media.id}`, momentId: moment.id, title: moment.title,
        author: moment.author, assetId: media.assetId || media.id, source, original: media.path || source, createdAt: moment.occurredAt });
    }
  }
  const seen = new Set<string>();
  const rank = new Map(order.map((id, index) => [id, index]));
  return photos.sort((left, right) => (rank.get(left.assetId) ?? order.length) - (rank.get(right.assetId) ?? order.length)
      || Date.parse(right.createdAt) - Date.parse(left.createdAt))
    .filter(photo => {
      if (seen.has(photo.assetId)) return false;
      seen.add(photo.assetId);
      return true;
    }).slice(0, 6);
}

export function albumSlots(moments: Moment[], status: AppState["couple"]["status"], uploads: AlbumPhoto[] = []) {
  if (status !== "PAIRED") return 0;
  return Math.min(6, new Set([...albumPhotos(moments, status, uploads).map(photo => photo.assetId),
    ...uploads.filter(photo => photo.status === "PROCESSING").map(photo => photo.assetId)]).size);
}
