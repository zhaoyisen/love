package com.lovenotes.server.pet;

import com.lovenotes.server.common.*;
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
    private final ActiveCoupleMemberRepository members;
    private final CoupleSpaceRepository couples;
    private final PetStateRepository pets;
    private final PetActionLogRepository logs;
    private final IdempotencyStore idempotency;
    private final MessageService messages;

    public PetService(ActiveCoupleMemberRepository members, CoupleSpaceRepository couples, PetStateRepository pets,
                      PetActionLogRepository logs, IdempotencyStore idempotency, MessageService messages) {
        this.members = members;
        this.couples = couples;
        this.pets = pets;
        this.logs = logs;
        this.idempotency = idempotency;
        this.messages = messages;
    }

    @Transactional
    public PetView current(UUID actorId) {
        UUID coupleId = requireActiveCouple(actorId);
        PetStateEntity pet = ensurePet(coupleId);
        return view(actorId, pet, null, 0);
    }

    @Transactional
    public PetActionResult act(UUID actorId, DomainEnums.PetAction action, String idempotencyKey) {
        UUID coupleId = requireActiveCouple(actorId);
        PetStateEntity pet = ensurePet(coupleId);
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

    private PetStateEntity ensurePet(UUID coupleId) {
        return pets.findByCoupleId(coupleId).orElseGet(() -> pets.save(new PetStateEntity(coupleId)));
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
        return new PetView(pet.getId(), pet.getName(), pet.getKind(), pet.getLevel(), pet.getGrowth(), fedToday, playedToday, logViews);
    }

    private String actionTitle(DomainEnums.PetAction action) {
        return action == DomainEnums.PetAction.FEED ? "TA 给团子喂了小饼干" : "TA 陪团子玩了一会儿";
    }

    private String actionSummary(DomainEnums.PetAction action) {
        return action == DomainEnums.PetAction.FEED ? "给团子喂了小饼干" : "陪团子玩了毛线球";
    }

    public record PetView(UUID id, String name, String kind, int level, int growth, boolean fedToday,
                          boolean playedToday, List<PetLogView> logs) {}
    public record PetLogView(UUID actorId, DomainEnums.PetAction action, int growthDelta, LocalDate actionDate,
                             Instant createdAt, boolean mine) {
        static PetLogView from(PetActionLogEntity log, UUID actorId) {
            return new PetLogView(log.getActorId(), log.getActionType(), log.getGrowthDelta(), log.getActionDate(),
                    log.getCreatedAt(), log.getActorId().equals(actorId));
        }
    }
    public record PetActionResult(PetView pet, boolean changed, int growthDelta) {}
}
