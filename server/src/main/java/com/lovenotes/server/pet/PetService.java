package com.lovenotes.server.pet;

import com.lovenotes.server.common.*;
import com.lovenotes.server.compliance.AuditService;
import com.lovenotes.server.domain.*;
import com.lovenotes.server.idempotency.IdempotencyStore;
import com.lovenotes.server.message.MessageService;
import com.lovenotes.server.repository.*;
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

    public PetService(ActiveCoupleMemberRepository members, CoupleSpaceRepository couples, PetStateRepository pets,
                      PetAdoptionProposalRepository proposals, PetActionLogRepository logs, IdempotencyStore idempotency,
                      MessageService messages, AuditService audit) {
        this.members = members;
        this.couples = couples;
        this.pets = pets;
        this.proposals = proposals;
        this.logs = logs;
        this.idempotency = idempotency;
        this.messages = messages;
        this.audit = audit;
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
        PetStateEntity pet = pets.findByCoupleId(coupleId).orElseThrow(this::petNotAdopted);
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
        logs.save(new PetActionLogEntity(pet.getId(), coupleId, actorId, action, today, ACTION_GROWTH));
        pet.addGrowth(ACTION_GROWTH);
        messages.notifyPet(coupleId, actorId, actionTitle(action), "TA " + actionSummary(action) + "，团子成长 +" + ACTION_GROWTH + "。");
        idempotency.putIfAbsent(key, "true|" + ACTION_GROWTH, Duration.ofHours(48));
        return new PetActionResult(view(actorId, pet, action, ACTION_GROWTH), true, ACTION_GROWTH);
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
        List<PetLogView> logViews = logs.findByPetIdOrderByCreatedAtDesc(pet.getId(), PageRequest.of(0, 20))
                .stream().map(log -> PetLogView.from(log, actorId)).toList();
        if (currentAction != null && logViews.stream().noneMatch(log -> log.actorId().equals(actorId) && log.action() == currentAction && log.createdAt().isAfter(Instant.now().minusSeconds(5)))) {
            logViews = new ArrayList<>(logViews);
            logViews.add(0, new PetLogView(actorId, currentAction, currentDelta, today, Instant.now(), true));
        }
        return new PetView(pet.getId(), pet.getName(), pet.getKind(), pet.getLevel(), pet.getGrowth(), fedToday, playedToday,
                logViews, "ADOPTED", null, renameAvailableAt(pet));
    }

    private PetView pendingView(UUID actorId, PetAdoptionProposalEntity proposal) {
        PetAdoptionView adoption = proposal == null ? null : new PetAdoptionView(proposal.getKind(), proposal.getName(),
                proposal.getProposerId().equals(actorId), proposal.getCreatedAt());
        return new PetView(null, null, null, 0, 0, false, false, List.of(), proposal == null ? "NOT_STARTED" : "PENDING_CONFIRMATION", adoption, null);
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
                          Instant renameAvailableAt) {}
    public record PetAdoptionView(String kind, String name, boolean proposedByMe, Instant createdAt) {}
    public record PetLogView(UUID actorId, DomainEnums.PetAction action, int growthDelta, LocalDate actionDate,
                             Instant createdAt, boolean mine) {
        static PetLogView from(PetActionLogEntity log, UUID actorId) {
            return new PetLogView(log.getActorId(), log.getActionType(), log.getGrowthDelta(), log.getActionDate(),
                    log.getCreatedAt(), log.getActorId().equals(actorId));
        }
    }
    public record PetActionResult(PetView pet, boolean changed, int growthDelta) {}
}
