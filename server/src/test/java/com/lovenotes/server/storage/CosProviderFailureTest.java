package com.lovenotes.server.storage;

import com.qcloud.cos.exception.CosClientException;
import com.qcloud.cos.exception.CosServiceException;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

class CosProviderFailureTest {
    @Test
    void shouldRetainOnlyBoundedRedactedParameterMessagesIncludingWrappedErrors() {
        var failure=new CosServiceException("raw response must not be logged");
        failure.setStatusCode(400);failure.setErrorCode("InvalidArgument");
        failure.setErrorMessage("invalid parameter: Width\r\nvalue=credential-value url=https://example.test/a?q-signature=hidden");
        assertEquals("REQUEST_PARAMETER",CosProviderFailure.inspect(failure).category());
        assertEquals("invalid parameter: Width  value=[redacted] url=[url]",
                CosProviderFailure.parameterMessage(new IllegalStateException(failure),"credential-value",null,""));
        failure.setErrorMessage("x".repeat(500));
        assertEquals(400,CosProviderFailure.parameterMessage(failure).length());
        failure.setErrorMessage(" ");assertNull(CosProviderFailure.parameterMessage(failure));
    }

    @Test
    void shouldSuppressSensitiveAndNonParameterProviderMessages() {
        var failure=new CosServiceException("raw message");failure.setErrorCode("InvalidArgument");
        for(String message:java.util.List.of("Authorization: Bearer private","q-signature=private","q-ak=private","SecretKey=private","token=private")) {
            failure.setErrorMessage(message);
            assertEquals("[redacted sensitive provider message]",CosProviderFailure.parameterMessage(failure));
        }
        failure.setErrorCode("AccessDenied");failure.setErrorMessage("do not log this message");
        assertNull(CosProviderFailure.parameterMessage(failure));
        assertNull(CosProviderFailure.parameterMessage(new CosClientException("private diagnostic")));
    }

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
    void shouldPreferTencentAccessDeniedCodeOverGenericHttpStatus() {
        CosServiceException failure = new CosServiceException("Access denied");
        failure.setStatusCode(401);
        failure.setErrorCode("AccessDenied");

        assertEquals("PERMISSION_OR_ROLE", CosProviderFailure.inspect(failure).category());
    }

    @Test
    void shouldClassifySignatureFailureAsCredentialFailure() {
        CosServiceException failure = new CosServiceException("Signature mismatch");
        failure.setStatusCode(401);
        failure.setErrorCode("SignatureDoesNotMatch");

        assertEquals("CREDENTIAL_OR_SIGNATURE", CosProviderFailure.inspect(failure).category());
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
