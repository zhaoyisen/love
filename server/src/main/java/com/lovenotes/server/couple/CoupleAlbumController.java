package com.lovenotes.server.couple;

import com.lovenotes.server.auth.Actor;
import com.lovenotes.server.auth.AuthFilter;
import com.lovenotes.server.common.ApiException;
import com.lovenotes.server.common.ApiResponse;
import com.lovenotes.server.common.RequestContext;
import com.lovenotes.server.domain.DomainEnums;
import com.lovenotes.server.domain.MediaAssetEntity;
import com.lovenotes.server.media.MediaService;
import com.lovenotes.server.repository.ActiveCoupleMemberRepository;
import com.lovenotes.server.repository.MediaAssetRepository;
import com.lovenotes.server.repository.CoupleSpaceRepository;
import com.lovenotes.server.domain.CoupleSpaceEntity;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import jakarta.validation.constraints.Min;
import org.springframework.http.HttpStatus;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.web.bind.annotation.*;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

@RestController
public class CoupleAlbumController {
    private final MediaAssetRepository assets;
    private final ActiveCoupleMemberRepository members;
    private final MediaService media;
    private final CoupleSpaceRepository couples;

    public CoupleAlbumController(MediaAssetRepository assets, ActiveCoupleMemberRepository members, MediaService media, CoupleSpaceRepository couples) {
        this.assets = assets; this.members = members; this.media = media; this.couples = couples;
    }

    @GetMapping("/couples/current/album-photos")
    @Transactional(readOnly = true)
    ApiResponse<List<AlbumPhoto>> list(@RequestAttribute(AuthFilter.ACTOR_ATTRIBUTE) Actor actor, HttpServletRequest request) {
        var membership = members.findById(actor.userId());
        var photos = membership.map(member -> photos(actor.userId(), member.getCoupleId())).orElseGet(List::of);
        return ApiResponse.ok(photos, RequestContext.requestId(request));
    }

    @PostMapping("/couples/current/album-photos")
    // MySQL's repeatable-read snapshot may predate the couple lock wait.
    @Transactional(isolation = Isolation.READ_COMMITTED)
    ApiResponse<List<AlbumPhoto>> add(@RequestAttribute(AuthFilter.ACTOR_ATTRIBUTE) Actor actor,
            @Valid @RequestBody AddPhotos body, HttpServletRequest request) {
        UUID coupleId = members.findById(actor.userId()).orElseThrow(() -> new ApiException(
                HttpStatus.FORBIDDEN, "RELATIONSHIP_REQUIRED", "完成配对后才能上传共同相册。")).getCoupleId();
        if (!coupleId.equals(body.coupleId())) throw new ApiException(
                HttpStatus.CONFLICT, "RELATIONSHIP_CHANGED", "情侣空间已变化，请刷新后重新上传。");
        lockCurrent(actor.userId(), coupleId);
        var selected = new java.util.ArrayList<MediaAssetEntity>();
        for (UUID id : body.assetIds().stream().distinct().toList()) {
            MediaAssetEntity asset = media.getAuthorized(actor.userId(), id);
            if (!asset.getUploaderId().equals(actor.userId())) throw new ApiException(
                    HttpStatus.FORBIDDEN, "RESOURCE_FORBIDDEN", "只能添加自己上传的照片。");
            if (asset.getKind() != DomainEnums.MediaKind.IMAGE || asset.getMomentId() != null || asset.isProfileAvatar()
                    || (asset.getAlbumCoupleId() != null && !asset.getAlbumCoupleId().equals(coupleId)))
                throw new ApiException(HttpStatus.BAD_REQUEST, "VALIDATION_ERROR", "请选择新上传的相册照片。");
            if (asset.getStatus() != DomainEnums.MediaStatus.READY && asset.getStatus() != DomainEnums.MediaStatus.PROCESSING)
                throw new ApiException(HttpStatus.CONFLICT, "MEDIA_NOT_READY", "照片尚未上传完成或未通过安全处理。");
            selected.add(asset);
        }
        long added = selected.stream().filter(asset -> asset.getAlbumCoupleId() == null).count();
        if (added > 0 && assets.countAlbumSlots(coupleId) + added > 6) throw new ApiException(
                HttpStatus.CONFLICT, "ALBUM_FULL", "相册最多保留 6 张照片，请先移除照片。");
        selected.forEach(asset -> asset.attachToAlbum(coupleId));
        assets.flush();
        return ApiResponse.ok(photos(actor.userId(), coupleId), RequestContext.requestId(request));
    }

    @GetMapping("/couples/current/album-capacity")
    @Transactional(readOnly = true)
    ApiResponse<AlbumCapacity> capacity(@RequestAttribute(AuthFilter.ACTOR_ATTRIBUTE) Actor actor, HttpServletRequest request) {
        long used = members.findById(actor.userId()).map(member -> assets.countAlbumSlots(member.getCoupleId())).orElse(0L);
        return ApiResponse.ok(new AlbumCapacity(used), RequestContext.requestId(request));
    }

    @DeleteMapping("/couples/current/album-photos/{assetId}")
    @Transactional
    ApiResponse<Void> delete(@RequestAttribute(AuthFilter.ACTOR_ATTRIBUTE) Actor actor,
            @PathVariable UUID assetId, @RequestParam("couple_id") UUID expectedCoupleId, HttpServletRequest request) {
        UUID coupleId = members.findById(actor.userId()).orElseThrow(() -> new ApiException(
                HttpStatus.FORBIDDEN, "RELATIONSHIP_REQUIRED", "完成配对后才能管理共同相册。")).getCoupleId();
        if (!coupleId.equals(expectedCoupleId)) throw new ApiException(
                HttpStatus.CONFLICT, "RELATIONSHIP_CHANGED", "情侣空间已变化，请刷新后重试。");
        lockCurrent(actor.userId(), coupleId);
        media.deleteAlbumPhoto(actor.userId(), coupleId, assetId);
        return ApiResponse.ok(null, RequestContext.requestId(request));
    }

    @PutMapping("/couples/current/album-order")
    @Transactional
    ApiResponse<AlbumOrder> reorder(@RequestAttribute(AuthFilter.ACTOR_ATTRIBUTE) Actor actor,
            @Valid @RequestBody ReorderPhotos body, HttpServletRequest request) {
        var couple = lockCurrent(actor.userId(), body.coupleId());
        if (couple.getVersion() != body.version()) throw new ApiException(
                HttpStatus.CONFLICT, "VERSION_CONFLICT", "相册已在另一台设备更新，请刷新后重试。");
        if (body.assetIds().stream().distinct().count() != body.assetIds().size()
                || assets.findSortableAlbumPhotos(couple.getId(), body.assetIds()).size() != body.assetIds().size())
            throw new ApiException(HttpStatus.BAD_REQUEST, "VALIDATION_ERROR", "照片已不在当前共同相册中，请刷新后重试。");
        couple.reorderAlbum(body.assetIds());
        couples.flush();
        return ApiResponse.ok(new AlbumOrder(couple.getAlbumOrder(), couple.getVersion()), RequestContext.requestId(request));
    }

    private CoupleSpaceEntity lockCurrent(UUID actor, UUID expected) {
        UUID current = members.findById(actor).orElseThrow(() -> new ApiException(
                HttpStatus.FORBIDDEN, "RELATIONSHIP_REQUIRED", "完成配对后才能管理共同相册。")).getCoupleId();
        if (!current.equals(expected)) throw new ApiException(HttpStatus.CONFLICT, "RELATIONSHIP_CHANGED", "情侣空间已变化，请刷新后重试。");
        var couple = couples.findLocked(current).orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "RESOURCE_NOT_FOUND", "情侣空间不存在。"));
        if (couple.getStatus() != DomainEnums.CoupleStatus.PAIRED) throw new ApiException(
                HttpStatus.CONFLICT, "RELATIONSHIP_CHANGED", "情侣空间已停止访问。");
        return couple;
    }

    private List<AlbumPhoto> photos(UUID actorId, UUID coupleId) {
        return assets.findTop100ByAlbumCoupleIdAndStatusNotOrderByCreatedAtDesc(coupleId, DomainEnums.MediaStatus.DELETED)
                .stream().filter(asset -> asset.getUploaderId().equals(actorId) || asset.getStatus() == DomainEnums.MediaStatus.READY)
                .map(asset -> new AlbumPhoto(asset.getId(), asset.getUploaderId(), asset.getStatus().name(), asset.getCreatedAt(),
                        media.accessUrlIfReady(actorId, asset), media.thumbnailUrlIfReady(actorId, asset), media.originalUrlIfReady(actorId, asset))).toList();
    }

    public record AddPhotos(@NotNull UUID coupleId, @NotEmpty @Size(max = 6) List<@NotNull UUID> assetIds) {}
    public record ReorderPhotos(@NotNull UUID coupleId, @NotNull @Min(0) Integer version, @NotEmpty @Size(max = 6) List<@NotNull UUID> assetIds) {}
    public record AlbumOrder(List<UUID> assetIds, int version) {}
    public record AlbumCapacity(long used) {}
    public record AlbumPhoto(UUID id, UUID uploaderId, String status, Instant createdAt, String accessUrl, String thumbnailUrl, String originalUrl) {}
}
