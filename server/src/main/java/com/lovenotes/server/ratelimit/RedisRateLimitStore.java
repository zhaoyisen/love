package com.lovenotes.server.ratelimit;

import org.springframework.context.annotation.Profile;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Component;

import java.time.Duration;
import java.util.concurrent.TimeUnit;

@Component
@Profile("prod")
public class RedisRateLimitStore implements RateLimitStore {
    private final StringRedisTemplate redis;

    public RedisRateLimitStore(StringRedisTemplate redis) {
        this.redis = redis;
    }

    @Override
    public Result increment(String key, Duration window) {
        String redisKey = "love-notes:rate-limit:" + key;
        Long count = redis.opsForValue().increment(redisKey);
        if (count != null && count == 1L) redis.expire(redisKey, window);
        Long ttl = redis.getExpire(redisKey, TimeUnit.SECONDS);
        if (ttl == null || ttl < 1) {
            redis.expire(redisKey, window);
            ttl = Math.max(1, window.toSeconds());
        }
        return new Result(count == null ? 1 : count, ttl);
    }
}
