package com.lovenotes.server.compliance;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.lovenotes.server.domain.AuditLogEntity;
import com.lovenotes.server.repository.AuditLogRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.util.Map;
import java.util.UUID;

@Service
public class AuditService {
    private final AuditLogRepository logs;
    private final ObjectMapper mapper;

    public AuditService(AuditLogRepository logs, ObjectMapper mapper) {
        this.logs = logs;
        this.mapper = mapper;
    }

    @Transactional(propagation = Propagation.MANDATORY)
    public void record(UUID actorId, UUID coupleId, String resourceType, UUID resourceId,
                       String action, String result, String reason, String requestId, Map<String, ?> metadata) {
        logs.save(new AuditLogEntity(
                actorId,
                coupleId,
                safe(resourceType, 40),
                resourceId,
                safe(action, 60),
                safe(result, 20),
                safeNullable(reason, 240),
                safeNullable(requestId, 80),
                metadataJson(metadata)));
    }

    private String metadataJson(Map<String, ?> metadata) {
        if (metadata == null || metadata.isEmpty()) return null;
        try {
            return mapper.writeValueAsString(metadata);
        } catch (JsonProcessingException e) {
            return "{\"serialization\":\"failed\"}";
        }
    }

    private String safe(String value, int max) {
        String normalized = value == null ? "UNKNOWN" : value.trim();
        return normalized.length() <= max ? normalized : normalized.substring(0, max);
    }

    private String safeNullable(String value, int max) {
        if (value == null || value.isBlank()) return null;
        String normalized = value.trim();
        return normalized.length() <= max ? normalized : normalized.substring(0, max);
    }
}
