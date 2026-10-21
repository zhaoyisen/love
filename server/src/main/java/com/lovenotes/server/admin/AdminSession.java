package com.lovenotes.server.admin;

import com.lovenotes.server.common.ApiException;
import com.lovenotes.server.compliance.InternalOperationGuard;
import com.lovenotes.server.config.LoveNotesProperties;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import java.net.URI;

@Component
public class AdminSession {
    private final InternalOperationGuard guard;
    private final LoveNotesProperties config;
    private static final String KEY="mediaAdmin";
    public AdminSession(InternalOperationGuard guard, LoveNotesProperties config) { this.guard=guard;this.config=config; }

    public String login(HttpServletRequest request,String token,String operator) {
        mutation(request);guard.requireAuthorized(token);
        var old=request.getSession(false);if(old!=null)old.invalidate();
        var session=request.getSession(true);
        session.setAttribute(KEY,operator);session.setAttribute(KEY+"Hash",config.operations().internalTokenHash());
        return operator;
    }
    public String require(HttpServletRequest request) {
        var session=request.getSession(false);
        String hash=config.operations()==null?null:config.operations().internalTokenHash();
        if(session==null||hash==null||hash.isBlank()||!hash.equals(session.getAttribute(KEY+"Hash"))||!(session.getAttribute(KEY) instanceof String operator))
            throw new ApiException(HttpStatus.UNAUTHORIZED,"ADMIN_SESSION_EXPIRED","请先登录管理端。");
        if(!request.getMethod().equals("GET"))mutation(request);
        return operator;
    }
    public void logout(HttpServletRequest request) { require(request);request.getSession(false).invalidate(); }
    private void mutation(HttpServletRequest request) {
        if(!"1".equals(request.getHeader("X-Admin-Request")))throw csrf();
        String origin=request.getHeader("Origin");
        if(origin!=null) {
            try {
                var actual=URI.create(origin);var expected=URI.create(request.getRequestURL().toString());
                if(!actual.getScheme().equalsIgnoreCase(expected.getScheme())||!actual.getAuthority().equalsIgnoreCase(expected.getAuthority()))throw csrf();
            } catch(IllegalArgumentException|NullPointerException error) { throw csrf(); }
        }
        if("cross-site".equals(request.getHeader("Sec-Fetch-Site")))throw csrf();
    }
    private ApiException csrf() { return new ApiException(HttpStatus.FORBIDDEN,"ADMIN_CSRF_REJECTED","请从管理端页面提交操作。"); }
}
