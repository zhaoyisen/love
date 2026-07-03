package com.lovenotes.server.auth;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.lovenotes.server.common.*;
import jakarta.servlet.*;
import jakarta.servlet.http.*;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.http.*;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.Map;

@Component
@Order(Ordered.HIGHEST_PRECEDENCE + 10)
public class AuthFilter extends OncePerRequestFilter {
    public static final String ACTOR_ATTRIBUTE = "loveNotesActor";
    private final SessionService sessions;
    private final ObjectMapper mapper;
    public AuthFilter(SessionService sessions, ObjectMapper mapper) { this.sessions = sessions; this.mapper = mapper; }

    @Override protected boolean shouldNotFilter(HttpServletRequest request) {
        String uri = request.getRequestURI();
        String contextPath = request.getContextPath();
        String path = contextPath != null && !contextPath.isEmpty() && uri.startsWith(contextPath)
                ? uri.substring(contextPath.length()) : uri;
        return path.equals("/auth/wechat/session") || path.equals("/auth/refresh") || path.startsWith("/actuator/") ||
                path.startsWith("/v3/api-docs") || path.startsWith("/swagger-ui") ||
                (request.getMethod().equals("GET") && path.matches("/couple-invitations/[^/]+/preview"));
    }

    @Override protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain) throws ServletException, IOException {
        String authorization = request.getHeader(HttpHeaders.AUTHORIZATION);
        Actor actor = authorization != null && authorization.startsWith("Bearer ") ? sessions.resolve(authorization.substring(7)) : null;
        if (actor == null) {
            response.setStatus(HttpStatus.UNAUTHORIZED.value()); response.setContentType(MediaType.APPLICATION_JSON_VALUE);
            String requestId = (String) request.getAttribute(RequestIdFilter.REQUEST_ID_ATTRIBUTE);
            mapper.writeValue(response.getWriter(), new ApiErrorResponse(new ApiErrorResponse.ErrorBody("SESSION_EXPIRED", "登录状态已失效，请重新登录。", Map.of(), requestId)));
            return;
        }
        request.setAttribute(ACTOR_ATTRIBUTE, actor);
        chain.doFilter(request, response);
    }
}
