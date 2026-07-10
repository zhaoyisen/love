package com.lovenotes.server.domain;

public final class DomainEnums {
    private DomainEnums() {}

    public enum UserStatus { ACTIVE, DISABLED, DELETING }
    public enum CoupleStatus { PAIRED, FROZEN, ENDED }
    public enum InvitationStatus { ACTIVE, ACCEPTED, REVOKED, EXPIRED }
    public enum MomentType { IMAGE, VIDEO, TEXT }
    public enum Visibility { PRIVATE, SHARED }
    public enum MomentStatus { DRAFT, UPLOADING, PUBLISHED, PARTIAL_FAILED, TRASHED, PURGED }
    public enum MediaKind { IMAGE, VIDEO }
    public enum MediaStatus { CREATED, UPLOADED, PROCESSING, READY, BLOCKED, FAILED, DELETED }
    public enum DerivedAssetStatus { READY, DELETED, FAILED }
    public enum UploadStatus { CREATED, COMPLETED, EXPIRED }
    public enum TagType { MOOD, EVENT }
    public enum MessageType { MOMENT, REACTION, COMMENT, PET, SYSTEM }
    public enum PetAction { FEED, PLAY }
    public enum RecapStatus { DRAFT, READY }
    public enum FeedbackCategory { CONTENT_ISSUE, RIGHTS_COMPLAINT, PRIVACY_CONCERN, MODERATION_APPEAL, OTHER }
    public enum FeedbackStatus { OPEN, IN_REVIEW, RESOLVED, REJECTED }
    public enum DeletionRequestType { ACCOUNT_DELETION }
    public enum DeletionRequestStatus { PENDING, PROCESSING, COMPLETED, FAILED, CANCELED }
}
