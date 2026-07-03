package com.lovenotes.server.idempotency;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;
import java.time.*;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
@Component @Profile({"dev","test"})
public class InMemoryIdempotencyStore implements IdempotencyStore {
    private final ConcurrentHashMap<String, Entry> values = new ConcurrentHashMap<>();
    public Optional<String> get(String key) { Entry e=values.get(key); if(e==null||e.expiresAt.isBefore(Instant.now())){values.remove(key);return Optional.empty();} return Optional.of(e.value); }
    public boolean putIfAbsent(String key, String value, Duration ttl) { return values.putIfAbsent(key,new Entry(value,Instant.now().plus(ttl)))==null; }
    private record Entry(String value, Instant expiresAt) {}
}
