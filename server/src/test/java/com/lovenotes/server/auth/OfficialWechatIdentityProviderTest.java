package com.lovenotes.server.auth;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.lovenotes.server.common.ApiException;
import com.lovenotes.server.config.LoveNotesProperties;
import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.web.client.RestClient;

import java.io.IOException;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

class OfficialWechatIdentityProviderTest {
    private HttpServer server;
    private final AtomicInteger responseStatus = new AtomicInteger();
    private final AtomicReference<String> responseBody = new AtomicReference<>();
    private final AtomicReference<String> responseContentType = new AtomicReference<>();

    @BeforeEach
    void startWechatServer() throws IOException {
        responseStatus.set(200);
        responseBody.set("{}");
        responseContentType.set("application/json");
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/sns/jscode2session", exchange -> {
            byte[] body = responseBody.get().getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().set("Content-Type", responseContentType.get());
            exchange.sendResponseHeaders(responseStatus.get(), body.length);
            exchange.getResponseBody().write(body);
            exchange.close();
        });
        server.start();
    }

    @AfterEach
    void stopWechatServer() {
        server.stop(0);
    }

    @Test
    void shouldAcceptSuccessfulWechatResponseEvenWhenContentTypeIsTextPlain() {
        responseContentType.set("text/plain; charset=UTF-8");
        responseBody.set("{\"openid\":\"openid-123\",\"session_key\":\"ignored\"}");

        WechatIdentityProvider.Identity identity = provider().exchange("valid-code");

        assertEquals("wechat-mini:openid-123", identity.subject());
        assertEquals("微信用户", identity.nickname());
    }

    @Test
    void shouldReturnUnauthorizedWhenWechatRejectsCode() {
        responseBody.set("{\"errcode\":40029,\"errmsg\":\"invalid code\"}");

        ApiException exception = assertThrows(ApiException.class, () -> provider().exchange("invalid-code"));

        assertEquals(HttpStatus.UNAUTHORIZED, exception.status());
        assertEquals("WECHAT_CODE_INVALID", exception.code());
    }

    @Test
    void shouldReturnServiceUnavailableWhenWechatEndpointFails() {
        responseStatus.set(502);
        responseBody.set("bad gateway");

        ApiException exception = assertThrows(ApiException.class, () -> provider().exchange("valid-code"));

        assertEquals(HttpStatus.SERVICE_UNAVAILABLE, exception.status());
        assertEquals("PROVIDER_UNAVAILABLE", exception.code());
    }

    private OfficialWechatIdentityProvider provider() {
        return new OfficialWechatIdentityProvider(properties(), RestClient.builder(), new ObjectMapper());
    }

    private LoveNotesProperties properties() {
        return new LoveNotesProperties(
                new LoveNotesProperties.Session(Duration.ofMinutes(30), Duration.ofDays(30)),
                new LoveNotesProperties.Invitation(Duration.ofDays(1)),
                new LoveNotesProperties.Media(20, 200, 1800, 30, 24),
                new LoveNotesProperties.Timeline("test-secret"),
                new LoveNotesProperties.Wechat(
                        "wx-test-app-id",
                        "test-app-secret",
                        "http://127.0.0.1:" + server.getAddress().getPort() + "/sns/jscode2session"),
                new LoveNotesProperties.Storage("local", "bucket", "local", "", ""),
                new LoveNotesProperties.Operations(""));
    }
}
