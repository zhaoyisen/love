package com.lovenotes.server.compliance;

import com.lovenotes.server.common.ApiException;
import com.lovenotes.server.common.Hashing;
import com.lovenotes.server.config.LoveNotesProperties;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;

@Component
public class InternalOperationGuard {
    public static final String HEADER = "X-Internal-Operation-Token";
    private final LoveNotesProperties properties;

    public InternalOperationGuard(LoveNotesProperties properties) {
        this.properties = properties;
    }

    public void requireAuthorized(String token) {
        String expectedHash = properties.operations() == null ? null : properties.operations().internalTokenHash();
        if (expectedHash == null || expectedHash.isBlank()) {
            throw new ApiException(HttpStatus.FORBIDDEN, "INTERNAL_OPERATION_DISABLED", "内部运维接口未启用。");
        }
        if (token == null || token.isBlank() || !constantEquals(expectedHash.trim(), Hashing.sha256(token.trim()))) {
            throw new ApiException(HttpStatus.FORBIDDEN, "INTERNAL_OPERATION_FORBIDDEN", "内部运维凭证无效。");
        }
    }

    private boolean constantEquals(String expected, String actual) {
        return MessageDigest.isEqual(
                expected.getBytes(StandardCharsets.UTF_8),
                actual.getBytes(StandardCharsets.UTF_8));
    }
}
