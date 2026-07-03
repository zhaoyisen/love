package com.lovenotes.server.auth;
import java.time.Instant;
import java.util.UUID;
public record Actor(UUID userId, int sessionVersion, Instant authenticatedAt) {}
