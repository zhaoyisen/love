package com.lovenotes.server.auth;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.context.annotation.Profile;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Component;

import java.time.Duration;
import java.util.Optional;

@Component
@Profile("prod")
public class RedisSessionTokenStore implements SessionTokenStore {
    private final StringRedisTemplate redis;
    private final ObjectMapper mapper;
    public RedisSessionTokenStore(StringRedisTemplate redis, ObjectMapper mapper) { this.redis = redis; this.mapper = mapper; }
    public void putAccess(String hash, StoredSession session, Duration ttl) { put("session:access:" + hash, session, ttl); }
    public void putRefresh(String hash, StoredSession session, Duration ttl) { put("session:refresh:" + hash, session, ttl); }
    public Optional<StoredSession> getAccess(String hash) { return get("session:access:" + hash); }
    public Optional<StoredSession> getRefresh(String hash) { return get("session:refresh:" + hash); }
    public void deleteRefresh(String hash) { redis.delete("session:refresh:" + hash); }
    private void put(String key, StoredSession value, Duration ttl) { try { redis.opsForValue().set(key, mapper.writeValueAsString(value), ttl); } catch (JsonProcessingException e) { throw new IllegalStateException(e); } }
    private Optional<StoredSession> get(String key) { String value = redis.opsForValue().get(key); if (value == null) return Optional.empty(); try { return Optional.of(mapper.readValue(value, StoredSession.class)); } catch (JsonProcessingException e) { redis.delete(key); return Optional.empty(); } }
}
