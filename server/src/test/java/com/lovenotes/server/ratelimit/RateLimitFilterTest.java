package com.lovenotes.server.ratelimit;

import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.FilterChain;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

import java.util.concurrent.atomic.AtomicInteger;

import static org.junit.jupiter.api.Assertions.*;

class RateLimitFilterTest {
    @Test
    void shouldLimitPublicLoginByRemoteAddressAndReturnRetryMetadata() throws Exception {
        RateLimitFilter filter = new RateLimitFilter(new InMemoryRateLimitStore(), new ObjectMapper(), true);
        AtomicInteger passed = new AtomicInteger();
        FilterChain chain = (request, response) -> passed.incrementAndGet();

        for (int i = 0; i < 20; i++) {
            MockHttpServletResponse response = new MockHttpServletResponse();
            filter.doFilter(loginRequest(), response, chain);
            assertEquals(200, response.getStatus());
        }

        MockHttpServletRequest blockedRequest = loginRequest();
        blockedRequest.setAttribute("loveNotesRequestId", "req_rate_limit_test");
        MockHttpServletResponse blocked = new MockHttpServletResponse();
        filter.doFilter(blockedRequest, blocked, chain);

        assertEquals(20, passed.get());
        assertEquals(429, blocked.getStatus());
        assertNotNull(blocked.getHeader("Retry-After"));
        assertEquals("0", blocked.getHeader("X-RateLimit-Remaining"));
        assertTrue(blocked.getContentAsString().contains("RATE_LIMITED"));
        assertTrue(blocked.getContentAsString().contains("retry_after"));
    }

    private MockHttpServletRequest loginRequest() {
        MockHttpServletRequest request = new MockHttpServletRequest("POST", "/api/v1/auth/wechat/session");
        request.setContextPath("/api/v1");
        request.setRemoteAddr("203.0.113.10");
        return request;
    }
}
