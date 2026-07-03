package com.lovenotes.server.common;

import java.util.Map;

public record ApiErrorResponse(ErrorBody error) {
    public record ErrorBody(String code, String userMessage, Map<String, Object> details, String requestId) {}
}
