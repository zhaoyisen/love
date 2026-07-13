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
    private final AppMessageSourceRepository messageSources;
    private final ActiveCoupleMemberRepository members;

    public MessageService(AppMessageRepository messages, AppMessageSourceRepository messageSources, ActiveCoupleMemberRepository members) {
        this.messages = messages;
        this.messageSources = messageSources;
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
    public void notifyComment(MomentEntity moment, MomentCommentEntity comment) {
        if (moment.getCoupleId() == null) return;
        createForCoupleExcept(moment.getCoupleId(), comment.getAuthorId(), moment.getId(), DomainEnums.MessageType.COMMENT,
                "TA 留下了一条短评", truncate(comment.getBody(), 72), comment.getId());
    }

    @Transactional
    public long retractCommentNotifications(MomentCommentEntity comment) {
        long removed = 0;
        for (AppMessageSourceEntity source : messageSources.findBySourceId(comment.getId())) {
            AppMessageEntity message = messages.findById(source.getMessageId()).orElse(null);
            messageSources.deleteByMessageIdAndSourceId(source.getMessageId(), comment.getId());
            if (message == null) continue;
            if (messageSources.existsByMessageId(message.getId())) message.decrementAggregate();
            else { messages.delete(message); removed++; }
        }
        return removed;
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
        createForCoupleExcept(coupleId, actorId, momentId, type, title, summary, null);
    }

    private void createForCoupleExcept(UUID coupleId, UUID actorId, UUID momentId, DomainEnums.MessageType type,
                                       String title, String summary, UUID sourceId) {
        members.findByCoupleId(coupleId).stream()
                .map(ActiveCoupleMemberEntity::getUserId)
                .filter(userId -> !userId.equals(actorId))
                .forEach(recipient -> upsert(recipient, actorId, coupleId, momentId, type, title, summary, sourceId));
    }

    private void upsert(UUID recipient, UUID actorId, UUID coupleId, UUID momentId, DomainEnums.MessageType type,
                        String title, String summary, UUID sourceId) {
        String aggregateKey = type.name() + ":" + (momentId == null ? coupleId : momentId);
        AppMessageEntity message = messages.findByRecipientIdAndAggregateKey(recipient, aggregateKey).orElse(null);
        if (message == null) {
            message = new AppMessageEntity(recipient, actorId, coupleId, momentId, sourceId, type, title, summary);
            message.aggregateKey(aggregateKey);
            messages.save(message);
        } else {
            message.aggregate(summaryForCount(type, summary, message.getAggregateCount() + 1));
        }
        if (sourceId != null) {
            UUID messageId = message.getId();
            boolean exists = messageSources.findBySourceId(sourceId).stream().anyMatch(source -> source.getMessageId().equals(messageId));
            if (!exists) messageSources.save(new AppMessageSourceEntity(messageId, sourceId));
        }
    }

    private String summaryForCount(DomainEnums.MessageType type, String summary, int count) {
        if (count <= 1) return summary;
        return switch (type) { case COMMENT -> "TA 留下了 " + count + " 条短评"; case REACTION -> "TA 更新了 " + count + " 次回应"; default -> summary; };
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
                              UUID momentId, int aggregateCount, Instant readAt, Instant createdAt) {
        static MessageView from(AppMessageEntity message) {
            return new MessageView(message.getId(), message.getType(), message.getTitle(), message.getSummary(),
                    message.getActorId(), message.getMomentId(), message.getAggregateCount(), message.getReadAt(), message.getCreatedAt());
        }
    }
    public record MarkAllReadResult(long readCount) {}
}
