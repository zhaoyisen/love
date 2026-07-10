package com.lovenotes.server.notification;

import com.lovenotes.server.compliance.AuditService;
import com.lovenotes.server.domain.NotificationPreferenceEntity;
import com.lovenotes.server.repository.NotificationPreferenceRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Map;
import java.util.UUID;

@Service
public class NotificationPreferenceService {
    private final NotificationPreferenceRepository preferences;
    private final AuditService audit;

    public NotificationPreferenceService(NotificationPreferenceRepository preferences, AuditService audit) {
        this.preferences = preferences;
        this.audit = audit;
    }

    @Transactional(readOnly = true)
    public NotificationPreferenceEntity current(UUID userId) {
        return preferences.findById(userId).orElseGet(() -> new NotificationPreferenceEntity(userId));
    }

    @Transactional
    public NotificationPreferenceEntity update(UUID userId, boolean momentNotice, boolean reactionNotice,
                                               boolean petNotice, boolean recapNotice) {
        NotificationPreferenceEntity preference = preferences.findById(userId)
                .orElseGet(() -> new NotificationPreferenceEntity(userId));
        preference.update(momentNotice, reactionNotice, petNotice, recapNotice);
        NotificationPreferenceEntity saved = preferences.save(preference);
        audit.record(userId, null, "NOTIFICATION_PREFERENCE", userId, "NOTIFICATION_PREFERENCE_UPDATE", "SUCCESS",
                null, null, Map.of("moment_notice", momentNotice, "reaction_notice", reactionNotice,
                        "pet_notice", petNotice, "recap_notice", recapNotice));
        return saved;
    }
}
