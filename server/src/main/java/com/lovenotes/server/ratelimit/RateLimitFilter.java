package com.lovenotes.server.ratelimit;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.lovenotes.server.auth.Actor;
import com.lovenotes.server.auth.AuthFilter;
import com.lovenotes.server.common.ApiErrorResponse;
import com.lovenotes.server.common.RequestIdFilter;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.time.Duration;
import java.util.Map;

@Component
@Order(Ordered.HIGHEST_PRECEDENCE + 20)
public class RateLimitFilter extends OncePerRequestFilter {
    private final RateLimitStore store;
    private final ObjectMapper mapper;
    private final boolean enabled;

    public RateLimitFilter(RateLimitStore store, ObjectMapper mapper,
                           @Value("${love-notes.rate-limit.enabled:false}") boolean enabled) {
        this.store = store;
        this.mapper = mapper;
        this.enabled = enabled;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        Rule rule = enabled ? rule(request) : null;
        if (rule == null) {
            chain.doFilter(request, response);
            return;
        }
        Actor actor = (Actor) request.getAttribute(AuthFilter.ACTOR_ATTRIBUTE);
        String subject = actor == null ? "ip:" + request.getRemoteAddr() : "user:" + actor.userId();
        RateLimitStore.Result result = store.increment(rule.name + ":" + subject, rule.window);
        response.setHeader("X-RateLimit-Limit", String.valueOf(rule.limit));
        response.setHeader("X-RateLimit-Remaining", String.valueOf(Math.max(0, rule.limit - result.count())));
        if (result.count() <= rule.limit) {
            chain.doFilter(request, response);
            return;
        }
        response.setStatus(429);
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        response.setHeader("Retry-After", String.valueOf(result.retryAfterSeconds()));
        String requestId = (String) request.getAttribute(RequestIdFilter.REQUEST_ID_ATTRIBUTE);
        mapper.writeValue(response.getWriter(), new ApiErrorResponse(new ApiErrorResponse.ErrorBody(
                "RATE_LIMITED", "操作太频繁，请稍后再试。",
                Map.of("retry_after", result.retryAfterSeconds()), requestId)));
    }

    private Rule rule(HttpServletRequest request) {
        String path = path(request);
        String method = request.getMethod();
        if (path.equals("/internal/admin/session") && "POST".equals(method)) return new Rule("ADMIN_LOGIN", 10, Duration.ofMinutes(1));
        if (path.startsWith("/internal/") || path.startsWith("/actuator/")) return null;
        if (path.startsWith("/auth/") && "POST".equals(method)) return new Rule("AUTH", 20, Duration.ofMinutes(1));
        if (path.matches("/couple-invitations/[^/]+/preview") && "GET".equals(method)) return new Rule("INVITE_PREVIEW", 60, Duration.ofMinutes(1));
        if (path.equals("/upload-sessions") && "POST".equals(method)) return new Rule("UPLOAD_SESSION", 120, Duration.ofHours(1));
        if (path.matches("/moments/[^/]+/comments") && "POST".equals(method)) return new Rule("COMMENT", 30, Duration.ofMinutes(1));
        if (path.equals("/pet/current/actions") && "POST".equals(method)) return new Rule("PET_ACTION", 60, Duration.ofMinutes(1));
        if (path.equals("/recaps/current/generate") && "POST".equals(method)) return new Rule("RECAP_GENERATE", 20, Duration.ofHours(1));
        if (path.matches("/media-assets/[^/]+/access-url") && "GET".equals(method)) return new Rule("MEDIA_ACCESS", 180, Duration.ofMinutes(1));
        if ("POST".equals(method) || "PUT".equals(method) || "PATCH".equals(method) || "DELETE".equals(method)) {
            return new Rule("MUTATION", 180, Duration.ofMinutes(1));
        }
        return null;
    }

    private String path(HttpServletRequest request) {
        String uri = request.getRequestURI();
        String context = request.getContextPath();
        return context != null && !context.isEmpty() && uri.startsWith(context) ? uri.substring(context.length()) : uri;
    }

    private record Rule(String name, long limit, Duration window) {}
}
