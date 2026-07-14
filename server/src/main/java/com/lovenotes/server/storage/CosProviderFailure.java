package com.lovenotes.server.storage;

import com.qcloud.cos.exception.CosClientException;
import com.qcloud.cos.exception.CosServiceException;

final class CosProviderFailure {
    private CosProviderFailure() {}

    static Diagnostic inspect(Throwable failure) {
        Throwable current = failure;
        while (current != null) {
            if (current instanceof CosServiceException service) {
                return new Diagnostic(
                        category(service.getStatusCode(), service.getErrorCode()),
                        service.getStatusCode(),
                        safe(service.getErrorCode()),
                        safe(service.getRequestId()),
                        service.getClass().getSimpleName());
            }
            if (current instanceof CosClientException client) {
                return new Diagnostic("CLIENT_OR_NETWORK", null, null, null, client.getClass().getSimpleName());
            }
            current = current.getCause();
        }
        return new Diagnostic("UNEXPECTED", null, null, null, failure.getClass().getSimpleName());
    }

    private static String category(int status, String errorCode) {
        String code = errorCode == null ? "" : errorCode.toLowerCase(java.util.Locale.ROOT);
        if (status == 401 || status == 403 || code.contains("accessdenied") || code.contains("signature")) {
            return "PERMISSION_OR_ROLE";
        }
        if (status == 404 || code.contains("nosuchbucket") || code.contains("invalidbucket")) {
            return "BUCKET_OR_REGION";
        }
        if (status == 429 || code.contains("frequency") || code.contains("quota")) {
            return "QUOTA_OR_RATE_LIMIT";
        }
        if (status >= 500) return "PROVIDER_5XX";
        return "PROVIDER_REJECTED";
    }

    private static String safe(String value) {
        if (value == null || value.isBlank()) return null;
        String normalized = value.trim();
        return normalized.length() <= 120 ? normalized : normalized.substring(0, 120);
    }

    record Diagnostic(String category, Integer status, String errorCode, String requestId, String exceptionType) {}
}
