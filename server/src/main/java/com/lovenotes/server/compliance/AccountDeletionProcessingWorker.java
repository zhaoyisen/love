package com.lovenotes.server.compliance;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.Profile;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Component
@Profile("prod")
public class AccountDeletionProcessingWorker {
    private static final Logger log = LoggerFactory.getLogger(AccountDeletionProcessingWorker.class);
    private final AccountDeletionProcessingService processor;

    public AccountDeletionProcessingWorker(AccountDeletionProcessingService processor) {
        this.processor = processor;
    }

    @Scheduled(fixedDelayString = "${ACCOUNT_DELETION_POLL_MS:600000}")
    public void poll() {
        try {
            AccountDeletionProcessingService.ProcessingResult result = processor.runBatch();
            if (result.processed() > 0) {
                log.info("Account deletion processing completed, processed={}, completed={}, failed={}, trashed_moments={}, deleted_media_assets={}, deleted_comments={}, deleted_reactions={}",
                        result.processed(), result.completed(), result.failed(), result.trashedMoments(),
                        result.deletedMediaAssets(), result.deletedComments(), result.deletedReactions());
            }
        } catch (Exception exception) {
            log.warn("Account deletion processing will retry, reason={}", exception.getClass().getSimpleName());
        }
    }
}
