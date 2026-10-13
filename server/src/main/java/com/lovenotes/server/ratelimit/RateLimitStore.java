package com.lovenotes.server.ratelimit;

import java.time.Duration;

public interface RateLimitStore {
    Result increment(String key, Duration window);

    record Result(long count, long retryAfterSeconds) {}
}
