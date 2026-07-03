package com.lovenotes.server.storage;

import java.time.*;

public interface ObjectStorage {
    UploadCredential issueUploadCredential(String storageKey, Duration ttl);
    ObjectInfo stat(String storageKey, long expectedSize);
    String signedGetUrl(String storageKey, Duration ttl);

    record UploadCredential(String provider,String bucket,String region,String key,Credentials credentials,Instant expiresAt){}
    record Credentials(String tmpSecretId,String tmpSecretKey,String sessionToken,long startTime,long expiredTime){}
    record ObjectInfo(long size,String etag,String contentType){}
}
