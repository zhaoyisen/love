package com.lovenotes.server.auth;

import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

import java.time.*;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;

@Component
@Profile({"dev", "test"})
public class InMemorySessionTokenStore implements SessionTokenStore {
    private final ConcurrentHashMap<String, Entry> access = new ConcurrentHashMap<>();
    private final ConcurrentHashMap<String, Entry> refresh = new ConcurrentHashMap<>();
    public void putAccess(String hash, StoredSession session, Duration ttl) { access.put(hash, new Entry(session, Instant.now().plus(ttl))); }
    public void putRefresh(String hash, StoredSession session, Duration ttl) { refresh.put(hash, new Entry(session, Instant.now().plus(ttl))); }
    public Optional<StoredSession> getAccess(String hash) { return get(access, hash); }
    public Optional<StoredSession> getRefresh(String hash) { return get(refresh, hash); }
    public void deleteRefresh(String hash) { refresh.remove(hash); }
    private Optional<StoredSession> get(ConcurrentHashMap<String, Entry> map, String hash) {
        Entry entry = map.get(hash);
        if (entry == null || entry.expiresAt.isBefore(Instant.now())) { map.remove(hash); return Optional.empty(); }
        return Optional.of(entry.session);
    }
    private record Entry(StoredSession session, Instant expiresAt) {}
}
