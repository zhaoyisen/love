package com.lovenotes.server.moment;

import com.lovenotes.server.common.ApiException;
import com.lovenotes.server.config.LoveNotesProperties;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Instant;
import java.util.Base64;
import java.util.UUID;

@Component
public class TimelineCursorCodec {
    private final byte[] secret;

    public TimelineCursorCodec(LoveNotesProperties properties) {
        this.secret = properties.timeline().cursorSecret().getBytes(StandardCharsets.UTF_8);
    }

    public String encode(Cursor cursor, String queryHash) {
        String payload = cursor.occurredAt().toEpochMilli() + ":" + cursor.createdAt().toEpochMilli()
                + ":" + cursor.id() + ":" + queryHash;
        String body = Base64.getUrlEncoder().withoutPadding()
                .encodeToString(payload.getBytes(StandardCharsets.UTF_8));
        return body + "." + Base64.getUrlEncoder().withoutPadding().encodeToString(sign(body));
    }

    public Cursor decode(String token, String expectedQueryHash) {
        try {
            String[] tokenParts = token.split("\\.", 2);
            if (tokenParts.length != 2) throw invalid();
            byte[] supplied = Base64.getUrlDecoder().decode(tokenParts[1]);
            if (!MessageDigest.isEqual(sign(tokenParts[0]), supplied)) throw invalid();
            String payload = new String(Base64.getUrlDecoder().decode(tokenParts[0]), StandardCharsets.UTF_8);
            String[] parts = payload.split(":", 4);
            if (parts.length != 4 || !MessageDigest.isEqual(
                    parts[3].getBytes(StandardCharsets.UTF_8),
                    expectedQueryHash.getBytes(StandardCharsets.UTF_8))) throw invalid();
            return new Cursor(
                    Instant.ofEpochMilli(Long.parseLong(parts[0])),
                    Instant.ofEpochMilli(Long.parseLong(parts[1])),
                    UUID.fromString(parts[2]));
        } catch (ApiException exception) {
            throw exception;
        } catch (Exception exception) {
            throw invalid();
        }
    }

    private byte[] sign(String value) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(secret, "HmacSHA256"));
            return mac.doFinal(value.getBytes(StandardCharsets.UTF_8));
        } catch (Exception exception) {
            throw new IllegalStateException("Unable to sign timeline cursor", exception);
        }
    }

    private ApiException invalid() {
        return new ApiException(HttpStatus.BAD_REQUEST, "INVALID_CURSOR", "分页位置已失效，请重新加载时间线。");
    }

    public record Cursor(Instant occurredAt, Instant createdAt, UUID id) {}
}
