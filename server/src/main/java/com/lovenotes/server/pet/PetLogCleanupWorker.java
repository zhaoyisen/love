package com.lovenotes.server.pet;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.Profile;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Component
@Profile("prod")
public class PetLogCleanupWorker {
    private static final Logger log = LoggerFactory.getLogger(PetLogCleanupWorker.class);
    private final PetLogRetentionService retention;

    public PetLogCleanupWorker(PetLogRetentionService retention) {
        this.retention = retention;
    }

    @Scheduled(fixedDelayString = "${PET_LOG_CLEANUP_POLL_MS:86400000}")
    public void poll() {
        try {
            PetLogRetentionService.CleanupResult result = retention.removeExpired();
            if (result.actionLogs() > 0 || result.growthLedger() > 0) {
                log.info("Pet logs beyond 30 days removed, actions={}, growth={}", result.actionLogs(), result.growthLedger());
            }
        } catch (Exception exception) {
            log.warn("Pet log cleanup will retry, reason={}", exception.getClass().getSimpleName());
        }
    }
}
