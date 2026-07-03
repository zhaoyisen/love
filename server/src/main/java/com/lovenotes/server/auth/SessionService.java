package com.lovenotes.server.auth;

import com.lovenotes.server.common.Hashing;
import com.lovenotes.server.config.LoveNotesProperties;
import com.lovenotes.server.domain.UserEntity;
import org.springframework.stereotype.Service;

import java.security.SecureRandom;
import java.time.Instant;
import java.util.Base64;
import java.util.UUID;

@Service
public class SessionService {
    private final SessionTokenStore store;
    private final LoveNotesProperties properties;
    private final SecureRandom random = new SecureRandom();
    public SessionService(SessionTokenStore store, LoveNotesProperties properties) { this.store = store; this.properties = properties; }

    public Tokens issue(UserEntity user) {
        String access = token(); String refresh = token();
        var session = new SessionTokenStore.StoredSession(user.getId().toString(), user.getSessionVersion(), Instant.now().getEpochSecond());
        store.putAccess(Hashing.sha256(access), session, properties.session().accessTtl());
        store.putRefresh(Hashing.sha256(refresh), session, properties.session().refreshTtl());
        return new Tokens(access, refresh, properties.session().accessTtl().toSeconds());
    }

    public Actor resolve(String rawAccessToken) {
        return store.getAccess(Hashing.sha256(rawAccessToken))
                .map(value -> new Actor(UUID.fromString(value.userId()), value.sessionVersion(), Instant.ofEpochSecond(value.authenticatedAtEpochSecond())))
                .orElse(null);
    }

    public RefreshSubject resolveRefresh(String rawRefreshToken) {
        String hash = Hashing.sha256(rawRefreshToken);
        var stored = store.getRefresh(hash).orElse(null);
        if (stored == null) return null;
        return new RefreshSubject(UUID.fromString(stored.userId()), stored.sessionVersion(), hash);
    }

    public Tokens rotate(String rawRefreshToken, UserEntity user) {
        RefreshSubject subject = resolveRefresh(rawRefreshToken);
        if (subject == null || !subject.userId().equals(user.getId()) || subject.sessionVersion() != user.getSessionVersion()) return null;
        store.deleteRefresh(subject.tokenHash());
        return issue(user);
    }

    private String token() { byte[] bytes = new byte[32]; random.nextBytes(bytes); return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes); }
    public record Tokens(String accessToken, String refreshToken, long expiresIn) {}
    public record RefreshSubject(UUID userId, int sessionVersion, String tokenHash) {}
}
