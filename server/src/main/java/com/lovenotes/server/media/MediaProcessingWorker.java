package com.lovenotes.server.media;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.Profile;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.util.UUID;

@Component
@Profile("prod")
public class MediaProcessingWorker {
    private static final Logger log = LoggerFactory.getLogger(MediaProcessingWorker.class);
    private final MediaProcessingService processing;

    public MediaProcessingWorker(MediaProcessingService processing) {
        this.processing = processing;
    }

    @Scheduled(fixedDelayString = "${MEDIA_PROCESSING_POLL_MS:5000}")
    public void poll() {
        for (UUID assetId : processing.pendingIds()) {
            try {
                processing.process(assetId);
            } catch (Exception exception) {
                log.warn("Media processing will retry, asset_id={}, reason={}", assetId, exception.getClass().getSimpleName());
            }
        }
    }
}
