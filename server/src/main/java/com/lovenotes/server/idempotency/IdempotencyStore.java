package com.lovenotes.server.idempotency;
import java.time.Duration;
import java.util.Optional;
public interface IdempotencyStore { Optional<String> get(String key); boolean putIfAbsent(String key, String value, Duration ttl); }
