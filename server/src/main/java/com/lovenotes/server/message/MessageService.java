package com.lovenotes.server.message;

import com.lovenotes.server.common.ApiException;
import com.lovenotes.server.domain.*;
import com.lovenotes.server.repository.*;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.*;

@Service
public class MessageService {
    private final AppMessageRepository messages;
    private final ActiveCoupleMemberRepository members;

    public MessageService(AppMessageRepository messages, ActiveCoupleMemberRepository members) {
        this.messages = messages;
        this.members = members;
    }

    @Transactional(readOnly = true)
    public MessagePage list(UUID actorId, int limit) {
        if (limit < 1 || limit > 100) throw validation("分页大小不正确。");
        List<MessageView> items = messages.findByRecipientIdOrderByCreatedAtDesc(actorId, PageRequest.of(0, limit))
                .stream().map(MessageView::from).toList();
        return new MessagePage(items, messages.countByRecipientIdAndReadAtIsNull(actorId));
    }

    @Transactional
    public MessageView markRead(UUID actorId, UUID id) {
        AppMessageEntity message = messages.findByRecipientIdAndId(actorId, id).orElseThrow(this::notFound);
        message.markRead();
        return MessageView.from(message);
    }

    @Transactional
    public long markAllRead(UUID actorId) {
        List<AppMessageEntity> unread = messages.findByRecipientIdAndReadAtIsNull(actorId);
        unread.forEach(AppMessageEntity::markRead);
        return unread.size();
    }

    @Transactional
    public void notifySharedMoment(MomentEntity moment) {
        if (moment.getVisibility() != DomainEnums.Visibility.SHARED || moment.getStatus() != DomainEnums.MomentStatus.PUBLISHED
                || moment.getCoupleId() == null) return;
        String momentTitle = momentTitle(moment);
        createForCoupleExcept(moment.getCoupleId(), moment.getAuthorId(), moment.getId(), DomainEnums.MessageType.MOMENT,
                "TA 分享了新时刻", "「" + momentTitle + "」已加入你们的共同记录。");
    }

    @Transactional
    public void notifyReaction(MomentEntity moment, UUID actorId, String value) {
        if (moment.getCoupleId() == null) return;
        createForCoupleExcept(moment.getCoupleId(), actorId, moment.getId(), DomainEnums.MessageType.REACTION,
                "TA 回应了这段记录", "在「" + momentTitle(moment) + "」留下了" + value + "。");
    }

    @Transactional
    public void notifyComment(MomentEntity moment, UUID actorId, String body) {
        if (moment.getCoupleId() == null) return;
        createForCoupleExcept(moment.getCoupleId(), actorId, moment.getId(), DomainEnums.MessageType.COMMENT,
                "TA 留下了一条短评", truncate(body, 72));
    }

    @Transactional
    public void notifyPet(UUID coupleId, UUID actorId, String title, String summary) {
        createForCoupleExcept(coupleId, actorId, null, DomainEnums.MessageType.PET, title, summary);
    }

    @Transactional
    public void notifySystem(Collection<UUID> recipients, UUID actorId, UUID coupleId, String title, String summary) {
        recipients.stream()
                .filter(Objects::nonNull)
                .distinct()
                .forEach(recipient -> messages.save(new AppMessageEntity(
                        recipient, actorId, coupleId, null, DomainEnums.MessageType.SYSTEM, title, summary)));
    }

    private void createForCoupleExcept(UUID coupleId, UUID actorId, UUID momentId, DomainEnums.MessageType type,
                                       String title, String summary) {
        members.findByCoupleId(coupleId).stream()
                .map(ActiveCoupleMemberEntity::getUserId)
                .filter(userId -> !userId.equals(actorId))
                .forEach(recipient -> messages.save(new AppMessageEntity(recipient, actorId, coupleId, momentId, type, title, summary)));
    }

    private String momentTitle(MomentEntity moment) {
        return moment.getTitle() == null || moment.getTitle().isBlank() ? "一个普通却想记住的时刻" : moment.getTitle();
    }

    private String truncate(String value, int maxCodePoints) {
        String normalized = value == null ? "" : value.trim().replaceAll("\\s+", " ");
        if (normalized.codePointCount(0, normalized.length()) <= maxCodePoints) return normalized;
        int end = normalized.offsetByCodePoints(0, maxCodePoints);
        return normalized.substring(0, end) + "…";
    }

    private ApiException validation(String message) {
        return new ApiException(HttpStatus.BAD_REQUEST, "VALIDATION_ERROR", message);
    }

    private ApiException notFound() {
        return new ApiException(HttpStatus.NOT_FOUND, "MESSAGE_NOT_FOUND", "消息不存在或已经失效。");
    }

    public record MessagePage(List<MessageView> items, long unreadCount) {}
    public record MessageView(UUID id, DomainEnums.MessageType type, String title, String summary, UUID actorId,
                              UUID momentId, Instant readAt, Instant createdAt) {
        static MessageView from(AppMessageEntity message) {
            return new MessageView(message.getId(), message.getType(), message.getTitle(), message.getSummary(),
                    message.getActorId(), message.getMomentId(), message.getReadAt(), message.getCreatedAt());
        }
    }
    public record MarkAllReadResult(long readCount) {}
}
