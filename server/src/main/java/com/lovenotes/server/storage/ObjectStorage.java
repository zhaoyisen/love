package com.lovenotes.server.storage;

import com.lovenotes.server.domain.DomainEnums;
import java.time.*;
import java.util.Collection;

public interface ObjectStorage {
    UploadCredential issueUploadCredential(String storageKey, Duration ttl);
    ObjectInfo stat(String storageKey, long expectedSize);
    String signedGetUrl(String storageKey, Duration ttl, String contentType);
    String signedVideoSnapshotUrl(String storageKey, Duration ttl);
    boolean requiresProcessing();
    ProcessingResult process(DomainEnums.MediaKind kind, String storageKey, String jobId);
    Derivatives createDerivatives(DomainEnums.MediaKind kind, String storageKey);
    default Derivatives regenerateDerivatives(DomainEnums.MediaKind kind, String storageKey) {return regenerateDerivatives(kind,storageKey,java.util.UUID.randomUUID().toString());}
    Derivatives regenerateDerivatives(DomainEnums.MediaKind kind, String storageKey, String generation);
    static Derivatives derivativeKeys(DomainEnums.MediaKind kind,String sourceKey,String generation) {
        String suffix=sourceKey.startsWith("original/")?sourceKey.substring("original/".length()):sourceKey;
        int extension=suffix.lastIndexOf('.');String stem=(extension<0?suffix:suffix.substring(0,extension))+(generation.isEmpty()?"":"-"+generation);
        return kind==DomainEnums.MediaKind.VIDEO?new Derivatives(sourceKey,"thumbnail/"+stem+".jpg"):new Derivatives("display/"+stem+".webp","thumbnail/"+stem+".webp");
    }
    ProcessingOutcome auditText(String text);
    void deleteObjects(Collection<String> storageKeys);

    record UploadCredential(String provider,String bucket,String region,String key,Credentials credentials,Instant expiresAt){}
    record Credentials(String tmpSecretId,String tmpSecretKey,String sessionToken,long startTime,long expiredTime){}
    record ObjectInfo(long size,String etag,String contentType){}
    record ProcessingResult(ProcessingOutcome outcome,String jobId,String displayKey,String thumbnailKey){}
    record Derivatives(String displayKey, String thumbnailKey) {}
    enum ProcessingOutcome { PENDING, READY, BLOCKED, FAILED }
}
