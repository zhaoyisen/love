package com.lovenotes.server.auth;

import java.time.Duration;
import java.util.Optional;

public interface SessionTokenStore {
    void putAccess(String tokenHash, StoredSession session, Duration ttl);
    void putRefresh(String tokenHash, StoredSession session, Duration ttl);
    Optional<StoredSession> getAccess(String tokenHash);
    Optional<StoredSession> getRefresh(String tokenHash);
    void deleteRefresh(String tokenHash);
    record StoredSession(String userId, int sessionVersion, long authenticatedAtEpochSecond) {}
}
