package com.lovenotes.server.common;

import org.springframework.http.HttpStatus;

import java.util.Map;

public class ApiException extends RuntimeException {
    private final HttpStatus status;
    private final String code;
    private final String userMessage;
    private final Map<String, Object> details;

    public ApiException(HttpStatus status, String code, String userMessage) {
        this(status, code, userMessage, Map.of());
    }

    public ApiException(HttpStatus status, String code, String userMessage, Map<String, Object> details) {
        super(code);
        this.status = status;
        this.code = code;
        this.userMessage = userMessage;
        this.details = details;
    }

    public HttpStatus status() { return status; }
    public String code() { return code; }
    public String userMessage() { return userMessage; }
    public Map<String, Object> details() { return details; }
}
