package com.lovenotes.server.recap;

import com.lovenotes.server.common.ApiException;
import com.lovenotes.server.compliance.AuditService;
import com.lovenotes.server.domain.*;
import com.lovenotes.server.repository.*;
import com.lovenotes.server.storage.ObjectStorage;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.*;
import java.util.*;
import java.util.function.Function;
import java.util.stream.Collectors;

@Service
public class RecapService {
    private static final ZoneId RECAP_ZONE = ZoneId.of("Asia/Shanghai");
    private static final Set<String> SENSITIVE_MOODS = Set.of("WRONGED", "ANGRY");
    private static final Set<String> SENSITIVE_EVENTS = Set.of("CONFLICT", "FIRST");

    private final AnnualRecapRepository recaps;
    private final AnnualRecapMomentRepository recapMoments;
    private final ActiveCoupleMemberRepository members;
    private final CoupleSpaceRepository couples;
    private final MomentRepository moments;
    private final MomentTagRepository tags;
    private final MediaAssetRepository assets;
    private final ObjectStorage storage;
    private final AuditService audit;

    public RecapService(AnnualRecapRepository recaps, AnnualRecapMomentRepository recapMoments,
                        ActiveCoupleMemberRepository members, CoupleSpaceRepository couples,
                        MomentRepository moments, MomentTagRepository tags, MediaAssetRepository assets,
                        ObjectStorage storage, AuditService audit) {
        this.recaps = recaps;
        this.recapMoments = recapMoments;
        this.members = members;
        this.couples = couples;
        this.moments = moments;
        this.tags = tags;
        this.assets = assets;
        this.storage = storage;
        this.audit = audit;
    }

    @Transactional
    public RecapView current(UUID actorId, int year) {
        UUID coupleId = requireActiveCouple(actorId);
        AnnualRecapEntity recap = ensureRecap(coupleId, safeYear(year));
        return view(actorId, recap);
    }

    @Transactional(readOnly = true)
    public CandidatePage candidates(UUID actorId, int year) {
        UUID coupleId = requireActiveCouple(actorId);
        CandidateSet candidateSet = candidateSet(coupleId, safeYear(year));
        return new CandidatePage(candidateSet.candidates().stream().map(moment -> momentView(actorId, moment)).toList(), candidateSet.excludedCount());
    }

    @Transactional
    public RecapView update(UUID actorId, int year, String title, List<UUID> selectedMomentIds) {
        UUID coupleId = requireActiveCouple(actorId);
        int recapYear = safeYear(year);
        String normalizedTitle = normalizeTitle(title, recapYear);
        auditText(normalizedTitle);
        CandidateSet candidateSet = candidateSet(coupleId, recapYear);
        Map<UUID, MomentEntity> allowed = candidateSet.candidates().stream().collect(Collectors.toMap(MomentEntity::getId, Function.identity()));
        List<UUID> selected = selectedMomentIds == null ? List.of() : selectedMomentIds;
        if (selected.isEmpty()) throw validation("请至少选择一个片段。");
        if (selected.size() > 30) throw validation("年度回顾最多选择 30 个片段。");
        if (new LinkedHashSet<>(selected).size() != selected.size()) throw validation("不能重复选择同一个片段。");
        if (selected.stream().anyMatch(id -> !allowed.containsKey(id))) {
            throw new ApiException(HttpStatus.FORBIDDEN, "RECAP_MOMENT_NOT_ALLOWED", "只能选择当前情侣空间内的共同可见候选片段。");
        }
        AnnualRecapEntity recap = ensureRecap(coupleId, recapYear);
        recap.updateDraft(normalizedTitle);
        recapMoments.deleteByRecapId(recap.getId());
        for (int index = 0; index < selected.size(); index++) {
            recapMoments.save(new AnnualRecapMomentEntity(recap.getId(), selected.get(index), index));
        }
        Map<String, Object> metadata = new LinkedHashMap<>();
        metadata.put("year", recapYear);
        metadata.put("selected_count", selected.size());
        metadata.put("excluded_count", candidateSet.excludedCount());
        audit.record(actorId, coupleId, "RECAP", recap.getId(), "RECAP_UPDATE", "SUCCESS",
                normalizedTitle, null, metadata);
        return view(actorId, recap);
    }

    @Transactional
    public RecapView generate(UUID actorId, int year) {
        UUID coupleId = requireActiveCouple(actorId);
        AnnualRecapEntity recap = ensureRecap(coupleId, safeYear(year));
        List<AnnualRecapMomentEntity> selected = recapMoments.findByRecapIdOrderBySortOrderAsc(recap.getId());
        if (selected.isEmpty()) {
            throw validation("请至少选择一个片段。");
        }
        recap.markReady();
        Map<String, Object> metadata = new LinkedHashMap<>();
        metadata.put("year", recap.getYear());
        metadata.put("selected_count", selected.size());
        audit.record(actorId, coupleId, "RECAP", recap.getId(), "RECAP_GENERATE", "SUCCESS",
                recap.getTitle(), null, metadata);
        return view(actorId, recap);
    }

    private UUID requireActiveCouple(UUID actorId) {
        UUID coupleId = members.findById(actorId)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "COUPLE_NOT_FOUND", "当前没有有效情侣空间。"))
                .getCoupleId();
        CoupleSpaceEntity couple = couples.findById(coupleId)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "COUPLE_NOT_FOUND", "当前没有有效情侣空间。"));
        if (couple.getStatus() != DomainEnums.CoupleStatus.PAIRED) {
            throw new ApiException(HttpStatus.NOT_FOUND, "COUPLE_NOT_FOUND", "当前没有有效情侣空间。");
        }
        return coupleId;
    }

    private AnnualRecapEntity ensureRecap(UUID coupleId, int year) {
        return recaps.findByCoupleIdAndYear(coupleId, year).orElseGet(() -> recaps.save(new AnnualRecapEntity(coupleId, year)));
    }

    private RecapView view(UUID actorId, AnnualRecapEntity recap) {
        List<AnnualRecapMomentEntity> links = recapMoments.findByRecapIdOrderBySortOrderAsc(recap.getId());
        List<UUID> linkedIds = links.stream().map(AnnualRecapMomentEntity::getMomentId).toList();
        Map<UUID, MomentEntity> selected = moments.findAllById(linkedIds).stream()
                .filter(moment -> moment.getCoupleId() != null && moment.getCoupleId().equals(recap.getCoupleId()))
                .filter(moment -> moment.getVisibility() == DomainEnums.Visibility.SHARED && moment.getStatus() == DomainEnums.MomentStatus.PUBLISHED)
                .collect(Collectors.toMap(MomentEntity::getId, Function.identity()));
        List<UUID> selectedIds = linkedIds.stream().filter(selected::containsKey).toList();
        List<MomentSummaryView> selectedViews = selectedIds.stream()
                .map(selected::get)
                .filter(Objects::nonNull)
                .map(moment -> momentView(actorId, moment))
                .toList();
        CandidateSet candidateSet = candidateSet(recap.getCoupleId(), recap.getYear());
        return new RecapView(recap.getId(), recap.getYear(), recap.getTitle(), recap.getStatus(), recap.getVersion(),
                recap.getGeneratedAt(), selectedIds, selectedViews, candidateSet.candidates().size(), candidateSet.excludedCount());
    }

    private CandidateSet candidateSet(UUID coupleId, int year) {
        ZonedDateTime start = LocalDate.of(year, 1, 1).atStartOfDay(RECAP_ZONE);
        ZonedDateTime end = start.plusYears(1);
        List<MomentEntity> allShared = moments.findByCoupleIdAndVisibilityAndStatusAndOccurredAtBetweenOrderByOccurredAtDescCreatedAtDesc(
                coupleId, DomainEnums.Visibility.SHARED, DomainEnums.MomentStatus.PUBLISHED, start.toInstant(), end.toInstant().minusMillis(1));
        List<MomentEntity> candidates = allShared.stream().filter(moment -> !sensitive(moment)).toList();
        return new CandidateSet(candidates, allShared.size() - candidates.size());
    }

    private boolean sensitive(MomentEntity moment) {
        List<MomentTagEntity> momentTags = tags.findByIdMomentId(moment.getId());
        return momentTags.stream().anyMatch(tag -> {
            String value = tag.getId().getTagValue();
            if (tag.getId().getTagType() == DomainEnums.TagType.MOOD) return SENSITIVE_MOODS.contains(value);
            return SENSITIVE_EVENTS.contains(value);
        });
    }

    private MomentSummaryView momentView(UUID actorId, MomentEntity moment) {
        List<MomentTagEntity> momentTags = tags.findByIdMomentId(moment.getId());
        String mood = momentTags.stream().filter(tag -> tag.getId().getTagType() == DomainEnums.TagType.MOOD)
                .map(tag -> tag.getId().getTagValue()).findFirst().orElse(null);
        List<String> events = momentTags.stream().filter(tag -> tag.getId().getTagType() == DomainEnums.TagType.EVENT)
                .map(tag -> tag.getId().getTagValue()).toList();
        List<MediaView> media = assets.findByMomentIdOrderByCreatedAtAsc(moment.getId()).stream().map(asset -> {
            boolean ready = asset.getStatus() == DomainEnums.MediaStatus.READY;
            String displayKey = asset.getDisplayStorageKey() == null ? asset.getStorageKey() : asset.getDisplayStorageKey();
            String displayContentType = asset.getDisplayStorageKey() == null ? asset.getMimeType() : "image/webp";
            return new MediaView(asset.getId(), asset.getKind(), asset.getStatus(),
                    ready ? storage.signedGetUrl(displayKey, Duration.ofMinutes(15), displayContentType) : null,
                    ready && asset.getThumbnailStorageKey() != null ? storage.signedGetUrl(asset.getThumbnailStorageKey(), Duration.ofMinutes(15), "image/webp") : null);
        }).toList();
        return new MomentSummaryView(moment.getId(), moment.getAuthorId(), moment.getType(), moment.getTitle(), moment.getBody(),
                moment.getOccurredAt(), moment.getVisibility(), moment.getStatus(), mood, events, media, moment.getAuthorId().equals(actorId));
    }

    private int safeYear(int year) {
        int current = LocalDate.now(RECAP_ZONE).getYear();
        if (year < 2000 || year > current + 1) throw validation("年份不正确。");
        return year;
    }

    private String normalizeTitle(String title, int year) {
        String normalized = title == null ? "" : title.trim();
        if (normalized.isBlank()) normalized = "我们的 " + year;
        if (normalized.codePointCount(0, normalized.length()) > 30) throw validation("标题最多 30 字。");
        return normalized;
    }

    private void auditText(String value) {
        if (!storage.requiresProcessing()) return;
        ObjectStorage.ProcessingOutcome outcome = storage.auditText(value);
        if (outcome == ObjectStorage.ProcessingOutcome.BLOCKED) {
            throw new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, "CONTENT_BLOCKED", "文字内容未通过安全检测，请修改后重试。");
        }
        if (outcome != ObjectStorage.ProcessingOutcome.READY) {
            throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE, "PROVIDER_UNAVAILABLE", "文字内容安全检测暂时不可用，请稍后重试。");
        }
    }

    private ApiException validation(String message) {
        return new ApiException(HttpStatus.BAD_REQUEST, "VALIDATION_ERROR", message);
    }

    private record CandidateSet(List<MomentEntity> candidates, int excludedCount) {}
    public record CandidatePage(List<MomentSummaryView> items, int excludedCount) {}
    public record RecapView(UUID id, int year, String title, DomainEnums.RecapStatus status, int version, Instant generatedAt,
                            List<UUID> selectedMomentIds, List<MomentSummaryView> selectedMoments,
                            int candidateCount, int excludedCount) {}
    public record MomentSummaryView(UUID id, UUID authorId, DomainEnums.MomentType type, String title, String body,
                                    Instant occurredAt, DomainEnums.Visibility visibility, DomainEnums.MomentStatus status,
                                    String mood, List<String> events, List<MediaView> media, boolean mine) {}
    public record MediaView(UUID id, DomainEnums.MediaKind kind, DomainEnums.MediaStatus status, String accessUrl, String thumbnailUrl) {}
}
