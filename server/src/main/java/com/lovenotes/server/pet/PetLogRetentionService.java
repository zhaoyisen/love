package com.lovenotes.server.pet;

import com.lovenotes.server.repository.PetActionLogRepository;
import com.lovenotes.server.repository.PetGrowthLedgerRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Duration;
import java.time.Instant;

@Service
public class PetLogRetentionService {
    private final PetActionLogRepository actionLogs;
    private final PetGrowthLedgerRepository growthLedger;

    public PetLogRetentionService(PetActionLogRepository actionLogs, PetGrowthLedgerRepository growthLedger) {
        this.actionLogs = actionLogs;
        this.growthLedger = growthLedger;
    }

    @Transactional
    public CleanupResult removeExpired() {
        Instant cutoff = Instant.now().minus(Duration.ofDays(30));
        return new CleanupResult(actionLogs.deleteByCreatedAtBefore(cutoff), growthLedger.deleteByCreatedAtBefore(cutoff));
    }

    public record CleanupResult(long actionLogs, long growthLedger) {}
}
