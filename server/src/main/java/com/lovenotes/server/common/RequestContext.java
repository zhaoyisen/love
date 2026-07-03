package com.lovenotes.server.common;
import jakarta.servlet.http.HttpServletRequest;
public final class RequestContext {
    private RequestContext() {}
    public static String requestId(HttpServletRequest request) { return (String) request.getAttribute(RequestIdFilter.REQUEST_ID_ATTRIBUTE); }
}
