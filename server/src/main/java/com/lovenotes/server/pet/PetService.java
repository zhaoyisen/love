package com.lovenotes.server.pet;

import com.lovenotes.server.common.*;
import com.lovenotes.server.compliance.AuditService;
import com.lovenotes.server.domain.*;
import com.lovenotes.server.idempotency.IdempotencyStore;
import com.lovenotes.server.message.MessageService;
import com.lovenotes.server.repository.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.*;
import java.util.*;

@Service
public class PetService {
    private static final ZoneId PET_ZONE = ZoneId.of("Asia/Shanghai");
    private static final int ACTION_GROWTH = 8;
    private static final Duration RENAME_COOLDOWN = Duration.ofDays(7);
    private static final Set<String> ADOPTABLE_KINDS = Set.of("云朵猫", "奶油狗", "小熊");
    private final ActiveCoupleMemberRepository members;
    private final CoupleSpaceRepository couples;
    private final PetStateRepository pets;
    private final PetAdoptionProposalRepository proposals;
    private final PetActionLogRepository logs;
    private final IdempotencyStore idempotency;
    private final MessageService messages;
    private final AuditService audit;
    private final PetGrowthService petGrowth;
    private final List<String> unlocks;

    public PetService(ActiveCoupleMemberRepository members, CoupleSpaceRepository couples, PetStateRepository pets,
                      PetAdoptionProposalRepository proposals, PetActionLogRepository logs, IdempotencyStore idempotency,
                      MessageService messages, AuditService audit, PetGrowthService petGrowth,
                      @Value("${love-notes.pet.unlocks:云朵围巾,星星抱枕,晚安动作,纪念相框,双人烟花}") String unlocks) {
        this.members = members;
        this.couples = couples;
        this.pets = pets;
        this.proposals = proposals;
        this.logs = logs;
        this.idempotency = idempotency;
        this.messages = messages;
        this.audit = audit;
        this.petGrowth = petGrowth;
        this.unlocks = Arrays.stream(unlocks.split(",")).map(String::trim).filter(value -> !value.isEmpty()).toList();
    }

    @Transactional
    public PetView current(UUID actorId) {
        UUID coupleId = requireActiveCouple(actorId);
        return pets.findByCoupleId(coupleId)
                .map(pet -> view(actorId, pet, null, 0))
                .orElseGet(() -> pendingView(actorId, proposals.findByCoupleId(coupleId).orElse(null)));
    }

    @Transactional
    public PetActionResult act(UUID actorId, DomainEnums.PetAction action, String idempotencyKey) {
        UUID coupleId = requireActiveCouple(actorId);
        PetStateEntity pet = pets.findByCoupleIdLocked(coupleId).orElseThrow(this::petNotAdopted);
        String key = Hashing.sha256(actorId + ":pet:" + action + ":" + idempotencyKey);
        Optional<String> replay = idempotency.get(key);
        if (replay.isPresent()) {
            String[] parts = replay.get().split("\\|", 2);
            boolean changed = Boolean.parseBoolean(parts[0]);
            int delta = parts.length > 1 ? Integer.parseInt(parts[1]) : 0;
            return new PetActionResult(view(actorId, pet, changed ? action : null, delta), changed, delta);
        }
        LocalDate today = LocalDate.now(PET_ZONE);
        if (logs.existsByCoupleIdAndActorIdAndActionTypeAndActionDate(coupleId, actorId, action, today)) {
            idempotency.putIfAbsent(key, "false|0", Duration.ofHours(48));
            return new PetActionResult(view(actorId, pet, null, 0), false, 0);
        }
        int actionDelta = pet.addGrowth(ACTION_GROWTH);
        logs.save(new PetActionLogEntity(pet.getId(), coupleId, actorId, action, today, actionDelta));
        int togetherDelta = petGrowth.rewardBothActive(coupleId, actorId, today);
        int totalDelta = actionDelta + togetherDelta;
        messages.notifyPet(coupleId, actorId, actionTitle(action), "TA " + actionSummary(action) + (totalDelta > 0 ? "，共同成长 +" + totalDelta : "。"));
        idempotency.putIfAbsent(key, "true|" + totalDelta, Duration.ofHours(48));
        return new PetActionResult(view(actorId, pet, action, totalDelta), true, totalDelta);
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

    @Transactional
    public PetView propose(UUID actorId, String kind, String name) {
        UUID coupleId = requireActiveCouple(actorId);
        if (pets.findByCoupleId(coupleId).isPresent()) throw alreadyAdopted();
        String normalizedKind = requireKind(kind);
        String normalizedName = requireName(name);
        PetAdoptionProposalEntity proposal = proposals.findByCoupleId(coupleId).orElse(null);
        if (proposal == null) proposal = proposals.save(new PetAdoptionProposalEntity(coupleId, actorId, normalizedKind, normalizedName));
        else if (proposal.getProposerId().equals(actorId)) proposal.revise(normalizedKind, normalizedName);
        else throw new ApiException(HttpStatus.CONFLICT, "ADOPTION_CONFIRMATION_REQUIRED", "请先由对方确认当前领养方案，或请对方修改方案。");
        messages.notifyPet(coupleId, actorId, "TA 提议领养一只小伙伴", "想和你一起领养“" + normalizedName + "”（" + normalizedKind + "）。");
        audit.record(actorId, coupleId, "PET_ADOPTION", proposal.getId(), "PET_ADOPTION_PROPOSE", "SUCCESS", null, null, Map.of("kind", normalizedKind));
        return pendingView(actorId, proposal);
    }

    @Transactional
    public PetView confirm(UUID actorId) {
        UUID coupleId = requireActiveCouple(actorId);
        if (pets.findByCoupleId(coupleId).isPresent()) throw alreadyAdopted();
        PetAdoptionProposalEntity proposal = proposals.findByCoupleId(coupleId)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "ADOPTION_PROPOSAL_NOT_FOUND", "No adoption proposal is awaiting confirmation."));
        if (proposal.getProposerId().equals(actorId)) throw new ApiException(HttpStatus.BAD_REQUEST, "ADOPTION_SELF_CONFIRM_NOT_ALLOWED", "The other member must confirm the adoption proposal.");
        PetStateEntity pet = pets.save(new PetStateEntity(coupleId, proposal.getKind(), proposal.getName()));
        proposals.delete(proposal);
        messages.notifyPet(coupleId, actorId, "Adoption confirmed", pet.getName() + " has joined your shared space.");
        audit.record(actorId, coupleId, "PET", pet.getId(), "PET_ADOPTION_CONFIRM", "SUCCESS", null, null, Map.of("kind", pet.getKind()));
        return view(actorId, pet, null, 0);
    }

    @Transactional
    public PetView rename(UUID actorId, String name) {
        UUID coupleId = requireActiveCouple(actorId);
        PetStateEntity pet = pets.findByCoupleId(coupleId).orElseThrow(this::petNotAdopted);
        Instant availableAt = renameAvailableAt(pet);
        if (availableAt.isAfter(Instant.now())) {
            throw new ApiException(HttpStatus.CONFLICT, "PET_RENAME_COOLDOWN", "宠物改名冷却中，请稍后再试。", Map.of("available_at", availableAt));
        }
        String normalizedName = requireName(name);
        pet.rename(normalizedName);
        messages.notifyPet(coupleId, actorId, "TA 给小伙伴换了新名字", "从现在起，它叫“" + normalizedName + "”。");
        audit.record(actorId, coupleId, "PET", pet.getId(), "PET_RENAME", "SUCCESS", null, null, Map.of());
        return view(actorId, pet, null, 0);
    }

    private PetView view(UUID actorId, PetStateEntity pet, DomainEnums.PetAction currentAction, int currentDelta) {
        LocalDate today = LocalDate.now(PET_ZONE);
        boolean fedToday = logs.existsByCoupleIdAndActorIdAndActionTypeAndActionDate(pet.getCoupleId(), actorId, DomainEnums.PetAction.FEED, today)
                || currentAction == DomainEnums.PetAction.FEED;
        boolean playedToday = logs.existsByCoupleIdAndActorIdAndActionTypeAndActionDate(pet.getCoupleId(), actorId, DomainEnums.PetAction.PLAY, today)
                || currentAction == DomainEnums.PetAction.PLAY;
        Instant cutoff = Instant.now().minus(Duration.ofDays(30));
        List<PetLogView> logViews = new ArrayList<>();
        logViews.addAll(logs.findByPetIdAndCreatedAtAfterOrderByCreatedAtDesc(pet.getId(), cutoff, PageRequest.of(0, 20))
                .stream().map(log -> PetLogView.from(log, actorId)).toList());
        logViews.addAll(petGrowth.recent(pet.getId(), 20).stream().map(log -> PetLogView.from(log, actorId)).toList());
        logViews = new ArrayList<>(logViews.stream().sorted(Comparator.comparing(PetLogView::createdAt).reversed()).limit(20).toList());
        if (currentAction != null && logViews.stream().noneMatch(log -> log.actorId().equals(actorId) && log.action() == currentAction && log.createdAt().isAfter(Instant.now().minusSeconds(5)))) {
            logViews = new ArrayList<>(logViews);
            logViews.add(0, new PetLogView(actorId, currentAction, null, actionSummary(currentAction), currentDelta, today, Instant.now(), true));
        }
        int unlockedCount = Math.min(unlocks.size(), pet.getLevel() / 2);
        List<String> unlockedItems = unlocks.subList(0, unlockedCount);
        Integer nextUnlockLevel = unlockedCount < unlocks.size() ? (unlockedCount + 1) * 2 : null;
        String nextUnlockItem = unlockedCount < unlocks.size() ? unlocks.get(unlockedCount) : null;
        return new PetView(pet.getId(), pet.getName(), pet.getKind(), pet.getLevel(), pet.getGrowth(), fedToday, playedToday,
                logViews, "ADOPTED", null, renameAvailableAt(pet), PetStateEntity.MAX_LEVEL,
                pet.getLevel() >= PetStateEntity.MAX_LEVEL ? 100 : pet.getGrowth(), unlockedItems, nextUnlockLevel,
                nextUnlockItem, petGrowth.todayRelationshipGrowth(pet.getCoupleId()), petGrowth.dailyCap());
    }

    private PetView pendingView(UUID actorId, PetAdoptionProposalEntity proposal) {
        PetAdoptionView adoption = proposal == null ? null : new PetAdoptionView(proposal.getKind(), proposal.getName(),
                proposal.getProposerId().equals(actorId), proposal.getCreatedAt());
        return new PetView(null, null, null, 0, 0, false, false, List.of(), proposal == null ? "NOT_STARTED" : "PENDING_CONFIRMATION", adoption, null,
                PetStateEntity.MAX_LEVEL, 0, List.of(), 2, unlocks.isEmpty() ? null : unlocks.get(0), 0, petGrowth.dailyCap());
    }

    private Instant renameAvailableAt(PetStateEntity pet) {
        return pet.getLastRenamedAt() == null ? Instant.now() : pet.getLastRenamedAt().plus(RENAME_COOLDOWN);
    }

    private String requireKind(String kind) {
        String normalized = kind == null ? "" : kind.trim();
        if (!ADOPTABLE_KINDS.contains(normalized)) throw new ApiException(HttpStatus.BAD_REQUEST, "PET_KIND_INVALID", "请选择可领养的小伙伴。");
        return normalized;
    }

    private String requireName(String name) {
        String normalized = name == null ? "" : name.trim();
        if (normalized.isEmpty() || normalized.codePointCount(0, normalized.length()) > 30) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "PET_NAME_INVALID", "请填写 1 至 30 个字符的宠物名字。");
        }
        return normalized;
    }

    private String actionTitle(DomainEnums.PetAction action) {
        return action == DomainEnums.PetAction.FEED ? "TA 给团子喂了小饼干" : "TA 陪团子玩了一会儿";
    }

    private String actionSummary(DomainEnums.PetAction action) {
        return action == DomainEnums.PetAction.FEED ? "给团子喂了小饼干" : "陪团子玩了毛线球";
    }

    private ApiException petNotAdopted() { return new ApiException(HttpStatus.CONFLICT, "PET_NOT_ADOPTED", "请先完成双方确认后再和小伙伴互动。"); }
    private ApiException alreadyAdopted() { return new ApiException(HttpStatus.CONFLICT, "PET_ALREADY_ADOPTED", "你们已经完成领养，可以直接和小伙伴互动。"); }

    public record PetView(UUID id, String name, String kind, int level, int growth, boolean fedToday,
                          boolean playedToday, List<PetLogView> logs, String adoptionState, PetAdoptionView adoption,
                          Instant renameAvailableAt, int maxLevel, int growthPercent, List<String> unlockedItems,
                          Integer nextUnlockLevel, String nextUnlockItem, int relationshipGrowthToday,
                          int relationshipDailyCap) {}
    public record PetAdoptionView(String kind, String name, boolean proposedByMe, Instant createdAt) {}
    public record PetLogView(UUID actorId, DomainEnums.PetAction action, DomainEnums.PetGrowthSource source,
                             String summary, int growthDelta, LocalDate actionDate, Instant createdAt, boolean mine) {
        static PetLogView from(PetActionLogEntity log, UUID actorId) {
            String summary = log.getActionType() == DomainEnums.PetAction.FEED ? "喂了小饼干" : "陪它玩了毛线球";
            return new PetLogView(log.getActorId(), log.getActionType(), null, summary, log.getGrowthDelta(), log.getActionDate(),
                    log.getCreatedAt(), log.getActorId().equals(actorId));
        }
        static PetLogView from(PetGrowthLedgerEntity log, UUID actorId) {
            String summary = switch (log.getSourceType()) {
                case MOMENT_CREATED -> "记录了一个共同瞬间";
                case PARTNER_REACTION -> "回应了对方的记录";
                case BOTH_ACTIVE -> "你们今天都来陪它了";
            };
            return new PetLogView(log.getActorId(), null, log.getSourceType(), summary, log.getDelta(),
                    log.getActionDate(), log.getCreatedAt(), log.getActorId().equals(actorId));
        }
    }
    public record PetActionResult(PetView pet, boolean changed, int growthDelta) {}
}
