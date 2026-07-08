package com.lovenotes.server.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

import java.time.Duration;

@ConfigurationProperties(prefix = "love-notes")
public record LoveNotesProperties(
        Session session,
        Invitation invitation,
        Media media,
        Timeline timeline,
        Wechat wechat,
        Storage storage
) {
    public record Session(Duration accessTtl, Duration refreshTtl) {}
    public record Invitation(Duration ttl) {}
    public record Media(
            long imageMaxBytes,
            long videoMaxBytes,
            int uploadCredentialTtlSeconds,
            int trashRetentionDays,
            int orphanRetentionHours
    ) {}
    public record Timeline(String cursorSecret) {}
    public record Wechat(String appId, String appSecret, String sessionUrl) {}
    public record Storage(String provider, String bucket, String region, String secretId, String secretKey) {}
}
