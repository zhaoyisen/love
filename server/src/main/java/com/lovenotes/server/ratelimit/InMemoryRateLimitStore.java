package com.lovenotes.server.ratelimit;

import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

import java.time.Duration;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

@Component
@Profile({"dev", "test"})
public class InMemoryRateLimitStore implements RateLimitStore {
    private final Map<String, Counter> counters = new ConcurrentHashMap<>();

    @Override
    public synchronized Result increment(String key, Duration window) {
        long now = System.currentTimeMillis();
        Counter current = counters.get(key);
        if (current == null || current.expiresAtMillis <= now) {
            current = new Counter(0, now + window.toMillis());
        }
        Counter updated = new Counter(current.count + 1, current.expiresAtMillis);
        counters.put(key, updated);
        long retryAfter = Math.max(1, (updated.expiresAtMillis - now + 999) / 1000);
        return new Result(updated.count, retryAfter);
    }

    private record Counter(long count, long expiresAtMillis) {}
}
