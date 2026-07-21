package com.lovenotes.server.pet;

import com.lovenotes.server.domain.*;
import com.lovenotes.server.repository.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.time.*;
import java.util.*;

@Service
public class PetGrowthService {
    static final ZoneId PET_ZONE = ZoneId.of("Asia/Shanghai");
    private final PetStateRepository pets;
    private final PetGrowthLedgerRepository ledger;
    private final PetActionLogRepository actionLogs;
    private final int dailyCap;
    private final int momentGrowth;
    private final int reactionGrowth;
    private final int bothActiveGrowth;
    private final int ruleVersion;

    public PetGrowthService(PetStateRepository pets, PetGrowthLedgerRepository ledger, PetActionLogRepository actionLogs,
                            @Value("${love-notes.pet.relationship-daily-cap:20}") int dailyCap,
                            @Value("${love-notes.pet.moment-growth:6}") int momentGrowth,
                            @Value("${love-notes.pet.reaction-growth:4}") int reactionGrowth,
                            @Value("${love-notes.pet.both-active-growth:6}") int bothActiveGrowth,
                            @Value("${love-notes.pet.rule-version:1}") int ruleVersion) {
        this.pets = pets; this.ledger = ledger; this.actionLogs = actionLogs; this.dailyCap = dailyCap;
        this.momentGrowth = momentGrowth; this.reactionGrowth = reactionGrowth;
        this.bothActiveGrowth = bothActiveGrowth; this.ruleVersion = ruleVersion;
    }

    @Transactional
    public int rewardMoment(MomentEntity moment) {
        if (moment.getStatus() != DomainEnums.MomentStatus.PUBLISHED || moment.getVisibility() != DomainEnums.Visibility.SHARED
                || moment.getCoupleId() == null || !effective(moment)) return 0;
        return award(moment.getCoupleId(), moment.getAuthorId(), DomainEnums.PetGrowthSource.MOMENT_CREATED,
                moment.getId(), momentGrowth, LocalDate.now(PET_ZONE));
    }

    @Transactional
    public int rewardReaction(MomentEntity moment, UUID actorId) {
        if (moment.getStatus() != DomainEnums.MomentStatus.PUBLISHED || moment.getCoupleId() == null
                || moment.getVisibility() != DomainEnums.Visibility.SHARED || !effective(moment)
                || actorId.equals(moment.getAuthorId())) return 0;
        return award(moment.getCoupleId(), actorId, DomainEnums.PetGrowthSource.PARTNER_REACTION,
                moment.getId(), reactionGrowth, LocalDate.now(PET_ZONE));
    }

    @Transactional
    public int reconcileMoment(MomentEntity moment) {
        return effective(moment) ? rewardMoment(moment) : -reverseMoment(moment);
    }

    @Transactional
    public int rewardBothActive(UUID coupleId, UUID actorId, LocalDate date) {
        if (actionLogs.countDistinctActorsForDate(coupleId, date) < 2) return 0;
        UUID sourceId = UUID.nameUUIDFromBytes((coupleId + ":both-active:" + date).getBytes(StandardCharsets.UTF_8));
        return award(coupleId, actorId, DomainEnums.PetGrowthSource.BOTH_ACTIVE, sourceId, bothActiveGrowth, date);
    }

    @Transactional
    public int reverseMoment(MomentEntity moment) {
        if (moment.getCoupleId() == null) return 0;
        PetStateEntity pet = pets.findByCoupleIdLocked(moment.getCoupleId()).orElse(null);
        if (pet == null) return 0;
        int reversed = 0;
        for (PetGrowthLedgerEntity entry : ledger.findByPetIdAndSourceId(pet.getId(), moment.getId())) {
            if (entry.getReversedAt() == null) {
                entry.reverse();
                reversed += pet.removeGrowthPreservingLevel(entry.getDelta());
            }
        }
        return reversed;
    }

    @Transactional
    public int restoreMoment(MomentEntity moment) {
        if (moment.getCoupleId() == null || moment.getVisibility() != DomainEnums.Visibility.SHARED) return 0;
        PetStateEntity pet = pets.findByCoupleIdLocked(moment.getCoupleId()).orElse(null);
        if (pet == null) return 0;
        List<PetGrowthLedgerEntity> entries = ledger.findByPetIdAndSourceId(pet.getId(), moment.getId());
        if (entries.isEmpty()) return rewardMoment(moment);
        int restored = 0;
        for (PetGrowthLedgerEntity entry : entries) {
            if (entry.getReversedAt() != null) {
                int remaining = Math.max(0, dailyCap - Math.toIntExact(ledger.activeGrowthForDate(moment.getCoupleId(), entry.getActionDate())));
                if (remaining < entry.getDelta()) continue;
                entry.restore();
                restored += pet.addGrowth(entry.getDelta());
            }
        }
        return restored;
    }

    @Transactional(readOnly = true)
    public int todayRelationshipGrowth(UUID coupleId) {
        return Math.toIntExact(ledger.activeGrowthForDate(coupleId, LocalDate.now(PET_ZONE)));
    }

    @Transactional(readOnly = true)
    public List<PetGrowthLedgerEntity> recent(UUID petId, int limit) {
        return ledger.findByPetIdAndReversedAtIsNullAndCreatedAtAfterOrderByCreatedAtDesc(
                petId, Instant.now().minus(Duration.ofDays(30)), PageRequest.of(0, limit));
    }

    public int dailyCap() { return dailyCap; }

    private int award(UUID coupleId, UUID actorId, DomainEnums.PetGrowthSource sourceType, UUID sourceId,
                      int requested, LocalDate actionDate) {
        PetStateEntity pet = pets.findByCoupleIdLocked(coupleId).orElse(null);
        if (pet == null || ledger.findByPetIdAndSourceTypeAndSourceIdAndRuleVersion(
                pet.getId(), sourceType, sourceId, ruleVersion).isPresent()) return 0;
        int remaining = Math.max(0, dailyCap - Math.toIntExact(ledger.activeGrowthForDate(coupleId, actionDate)));
        int delta = Math.min(requested, remaining);
        int applied = pet.addGrowth(delta);
        if (applied <= 0) return 0;
        ledger.save(new PetGrowthLedgerEntity(pet.getId(), coupleId, actorId, sourceType, sourceId,
                ruleVersion, actionDate, applied));
        return applied;
    }

    private boolean effective(MomentEntity moment) {
        return moment.getType() != DomainEnums.MomentType.TEXT
                || (moment.getBody() != null && moment.getBody().codePointCount(0, moment.getBody().length()) >= 20);
    }
}
