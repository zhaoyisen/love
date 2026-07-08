package com.lovenotes.server.media;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.Profile;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Component
@Profile("prod")
public class MediaCleanupWorker {
    private static final Logger log = LoggerFactory.getLogger(MediaCleanupWorker.class);
    private final MediaCleanupService cleanup;

    public MediaCleanupWorker(MediaCleanupService cleanup) {
        this.cleanup = cleanup;
    }

    @Scheduled(fixedDelayString = "${MEDIA_CLEANUP_POLL_MS:3600000}")
    public void poll() {
        try {
            MediaCleanupService.CleanupResult result = cleanup.runBatch();
            if (result.purgedMoments() > 0 || result.deletedAssets() > 0) {
                log.info("Media cleanup completed, purged_moments={}, deleted_assets={}",
                        result.purgedMoments(), result.deletedAssets());
            }
        } catch (Exception exception) {
            log.warn("Media cleanup will retry, reason={}", exception.getClass().getSimpleName());
        }
    }
}
