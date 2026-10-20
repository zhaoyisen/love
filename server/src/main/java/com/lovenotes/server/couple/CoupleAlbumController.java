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
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import org.springframework.http.HttpStatus;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

@RestController
public class CoupleAlbumController {
    private final MediaAssetRepository assets;
    private final ActiveCoupleMemberRepository members;
    private final MediaService media;

    public CoupleAlbumController(MediaAssetRepository assets, ActiveCoupleMemberRepository members, MediaService media) {
        this.assets = assets; this.members = members; this.media = media;
    }

    @GetMapping("/couples/current/album-photos")
    @Transactional(readOnly = true)
    ApiResponse<List<AlbumPhoto>> list(@RequestAttribute(AuthFilter.ACTOR_ATTRIBUTE) Actor actor, HttpServletRequest request) {
        var membership = members.findById(actor.userId());
        var photos = membership.map(member -> photos(actor.userId(), member.getCoupleId())).orElseGet(List::of);
        return ApiResponse.ok(photos, RequestContext.requestId(request));
    }

    @PostMapping("/couples/current/album-photos")
    @Transactional
    ApiResponse<List<AlbumPhoto>> add(@RequestAttribute(AuthFilter.ACTOR_ATTRIBUTE) Actor actor,
            @Valid @RequestBody AddPhotos body, HttpServletRequest request) {
        UUID coupleId = members.findById(actor.userId()).orElseThrow(() -> new ApiException(
                HttpStatus.FORBIDDEN, "RELATIONSHIP_REQUIRED", "完成配对后才能上传共同相册。")).getCoupleId();
        if (!coupleId.equals(body.coupleId())) throw new ApiException(
                HttpStatus.CONFLICT, "RELATIONSHIP_CHANGED", "情侣空间已变化，请刷新后重新上传。");
        for (UUID id : body.assetIds().stream().distinct().toList()) {
            MediaAssetEntity asset = media.getAuthorized(actor.userId(), id);
            if (!asset.getUploaderId().equals(actor.userId())) throw new ApiException(
                    HttpStatus.FORBIDDEN, "RESOURCE_FORBIDDEN", "只能添加自己上传的照片。");
            if (asset.getKind() != DomainEnums.MediaKind.IMAGE || asset.getMomentId() != null || asset.isProfileAvatar()
                    || (asset.getAlbumCoupleId() != null && !asset.getAlbumCoupleId().equals(coupleId)))
                throw new ApiException(HttpStatus.BAD_REQUEST, "VALIDATION_ERROR", "请选择新上传的相册照片。");
            if (asset.getStatus() != DomainEnums.MediaStatus.READY && asset.getStatus() != DomainEnums.MediaStatus.PROCESSING)
                throw new ApiException(HttpStatus.CONFLICT, "MEDIA_NOT_READY", "照片尚未上传完成或未通过安全处理。");
            asset.attachToAlbum(coupleId);
        }
        assets.flush();
        return ApiResponse.ok(photos(actor.userId(), coupleId), RequestContext.requestId(request));
    }

    private List<AlbumPhoto> photos(UUID actorId, UUID coupleId) {
        return assets.findTop100ByAlbumCoupleIdAndStatusNotOrderByCreatedAtDesc(coupleId, DomainEnums.MediaStatus.DELETED)
                .stream().filter(asset -> asset.getUploaderId().equals(actorId) || asset.getStatus() == DomainEnums.MediaStatus.READY)
                .map(asset -> new AlbumPhoto(asset.getId(), asset.getUploaderId(), asset.getStatus().name(), asset.getCreatedAt(),
                        media.accessUrlIfReady(actorId, asset), media.thumbnailUrlIfReady(actorId, asset), media.originalUrlIfReady(actorId, asset))).toList();
    }

    public record AddPhotos(@NotNull UUID coupleId, @NotEmpty @Size(max = 9) List<@NotNull UUID> assetIds) {}
    public record AlbumPhoto(UUID id, UUID uploaderId, String status, Instant createdAt, String accessUrl, String thumbnailUrl, String originalUrl) {}
}
