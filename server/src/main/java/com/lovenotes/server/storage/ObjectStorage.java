package com.lovenotes.server.storage;

import com.lovenotes.server.domain.DomainEnums;
import java.time.*;
import java.util.Collection;

public interface ObjectStorage {
    UploadCredential issueUploadCredential(String storageKey, Duration ttl);
    ObjectInfo stat(String storageKey, long expectedSize);
    String signedGetUrl(String storageKey, Duration ttl);
    boolean requiresProcessing();
    ProcessingResult process(DomainEnums.MediaKind kind, String storageKey, String jobId);
    ProcessingOutcome auditText(String text);
    void deleteObjects(Collection<String> storageKeys);

    record UploadCredential(String provider,String bucket,String region,String key,Credentials credentials,Instant expiresAt){}
    record Credentials(String tmpSecretId,String tmpSecretKey,String sessionToken,long startTime,long expiredTime){}
    record ObjectInfo(long size,String etag,String contentType){}
    record ProcessingResult(ProcessingOutcome outcome,String jobId,String displayKey,String thumbnailKey){}
    enum ProcessingOutcome { PENDING, READY, BLOCKED, FAILED }
}
