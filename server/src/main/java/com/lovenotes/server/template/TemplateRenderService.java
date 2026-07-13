package com.lovenotes.server.template;

import com.lovenotes.server.common.ApiException;
import com.lovenotes.server.compliance.AuditService;
import com.lovenotes.server.domain.DerivedAssetEntity;
import com.lovenotes.server.domain.DomainEnums;
import com.lovenotes.server.domain.MediaAssetEntity;
import com.lovenotes.server.repository.DerivedAssetRepository;
import com.lovenotes.server.repository.MediaAssetRepository;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;

@Service
public class TemplateRenderService {
    private static final Set<String> TEMPLATE_IDS = Set.of(
            "cream-film", "strawberry-diary", "moon-blue", "retro-polaroid", "travel-stamp", "minimal-memory");

    private final MediaAssetRepository assets;
    private final DerivedAssetRepository derivedAssets;
    private final AuditService audit;

    public TemplateRenderService(MediaAssetRepository assets, DerivedAssetRepository derivedAssets, AuditService audit) {
        this.assets = assets;
        this.derivedAssets = derivedAssets;
        this.audit = audit;
    }

    @Transactional
    public DerivedAssetEntity register(UUID actorId, RegisterCommand command) {
        List<UUID> sourceIds = normalizeSourceIds(command.sourceAssetIds());
        if (!TEMPLATE_IDS.contains(command.templateId())) {
            throw validation("图片模板不存在或当前版本不可用。");
        }
        if (command.templateVersion() != 1) {
            throw validation("图片模板版本不匹配，请返回编辑页刷新后重试。");
        }
        if (sourceIds.contains(command.renderedAssetId())) {
            throw validation("模板成图不能同时作为源图片。");
        }

        var existing = derivedAssets.findByRenderedMediaAssetId(command.renderedAssetId());
        if (existing.isPresent()) {
            if (!existing.get().getOwnerId().equals(actorId)) throw forbidden();
            return existing.get();
        }

        List<MediaAssetEntity> sources = assets.findByIdIn(sourceIds);
        if (sources.size() != sourceIds.size() || sources.stream().anyMatch(asset -> !isAvailableSource(asset, actorId))) {
            throw forbidden();
        }
        MediaAssetEntity rendered = assets.findById(command.renderedAssetId()).orElseThrow(this::forbidden);
        if (!isAvailableRenderOutput(rendered, actorId)) throw forbidden();

        DomainEnums.DerivedAssetStatus status = rendered.getStatus() == DomainEnums.MediaStatus.READY
                ? DomainEnums.DerivedAssetStatus.READY : DomainEnums.DerivedAssetStatus.PENDING;
        DerivedAssetEntity created = derivedAssets.save(new DerivedAssetEntity(actorId, sourceIds, rendered.getId(), rendered.getStorageKey(),
                command.templateId(), command.templateVersion(), command.renderConfig(), status));
        audit.record(actorId, null, "DERIVED_ASSET", created.getId(), "TEMPLATE_RENDER_REGISTER", "SUCCESS", null, null,
                java.util.Map.of("template_id", created.getTemplateId(), "template_version", created.getTemplateVersion(),
                        "source_asset_count", created.getSourceAssetIds().size(), "rendered_media_asset_id", rendered.getId().toString()));
        return created;
    }

    private List<UUID> normalizeSourceIds(List<UUID> values) {
        if (values == null || values.isEmpty() || values.size() > 9) throw validation("模板需要 1 至 9 张源图片。");
        LinkedHashSet<UUID> unique = new LinkedHashSet<>(values);
        if (unique.size() != values.size() || unique.contains(null)) throw validation("源图片不能重复或为空。");
        return List.copyOf(unique);
    }

    private boolean isAvailableSource(MediaAssetEntity asset, UUID actorId) {
        return asset.getUploaderId().equals(actorId)
                && asset.getMomentId() == null
                && asset.getKind() == DomainEnums.MediaKind.IMAGE
                && Set.of(DomainEnums.MediaStatus.READY, DomainEnums.MediaStatus.PROCESSING).contains(asset.getStatus());
    }

    private boolean isAvailableRenderOutput(MediaAssetEntity asset, UUID actorId) {
        return isAvailableSource(asset, actorId);
    }

    private ApiException validation(String message) {
        return new ApiException(HttpStatus.BAD_REQUEST, "VALIDATION_ERROR", message);
    }

    private ApiException forbidden() {
        return new ApiException(HttpStatus.FORBIDDEN, "RESOURCE_FORBIDDEN", "图片不存在或当前不可使用。");
    }

    public record RegisterCommand(List<UUID> sourceAssetIds, UUID renderedAssetId, String templateId,
                                  int templateVersion, String renderConfig) {}
}
