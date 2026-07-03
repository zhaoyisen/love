package com.lovenotes.server.common;

import java.security.SecureRandom;
import java.time.Instant;
import java.util.UUID;

public final class UuidV7 {
    private static final SecureRandom RANDOM = new SecureRandom();

    private UuidV7() {}

    public static UUID next() {
        long millis = Instant.now().toEpochMilli();
        long most = ((millis & 0xFFFFFFFFFFFFL) << 16) | 0x7000L | (RANDOM.nextInt() & 0x0FFFL);
        long least = (RANDOM.nextLong() & 0x3FFFFFFFFFFFFFFFL) | 0x8000000000000000L;
        return new UUID(most, least);
    }
}
