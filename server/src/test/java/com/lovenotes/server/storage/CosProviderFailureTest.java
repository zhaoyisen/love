package com.lovenotes.server.storage;

import com.qcloud.cos.exception.CosClientException;
import com.qcloud.cos.exception.CosServiceException;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

class CosProviderFailureTest {
    @Test
    void shouldClassifyMissingCiRoleWithoutExposingCredentials() {
        CosServiceException failure = new CosServiceException("Access denied");
        failure.setStatusCode(403);
        failure.setErrorCode("AccessDenied");
        failure.setRequestId("request-123");

        CosProviderFailure.Diagnostic diagnostic = CosProviderFailure.inspect(failure);

        assertEquals("PERMISSION_OR_ROLE", diagnostic.category());
        assertEquals(403, diagnostic.status());
        assertEquals("AccessDenied", diagnostic.errorCode());
        assertEquals("request-123", diagnostic.requestId());
    }

    @Test
    void shouldClassifyBucketAndNetworkFailures() {
        CosServiceException missingBucket = new CosServiceException("Missing bucket");
        missingBucket.setStatusCode(404);
        missingBucket.setErrorCode("NoSuchBucket");

        assertEquals("BUCKET_OR_REGION", CosProviderFailure.inspect(missingBucket).category());
        assertEquals("CLIENT_OR_NETWORK", CosProviderFailure.inspect(new CosClientException("timeout")).category());
    }
}
