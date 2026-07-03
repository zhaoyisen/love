package com.lovenotes.server.idempotency;
import org.springframework.context.annotation.Profile;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Component;
import java.time.Duration;
import java.util.*;
@Component @Profile("prod")
public class RedisIdempotencyStore implements IdempotencyStore {
    private final StringRedisTemplate redis;
    public RedisIdempotencyStore(StringRedisTemplate redis){this.redis=redis;}
    public Optional<String> get(String key){return Optional.ofNullable(redis.opsForValue().get("idem:"+key));}
    public boolean putIfAbsent(String key,String value,Duration ttl){return Boolean.TRUE.equals(redis.opsForValue().setIfAbsent("idem:"+key,value,ttl));}
}
