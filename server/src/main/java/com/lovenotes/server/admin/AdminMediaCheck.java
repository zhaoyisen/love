package com.lovenotes.server.admin;

import com.lovenotes.server.domain.MediaAssetEntity;
import jakarta.persistence.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;
import java.time.Instant;
import java.util.*;

@Entity
@Table(name="admin_media_check")
public class AdminMediaCheck {
    @Id @Column(name="asset_id") @JdbcTypeCode(SqlTypes.BINARY) UUID assetId;
    @Column(name="source_key",nullable=false,length=300) String sourceKey;
    @Column(name="display_key",length=300) String displayKey;
    @Column(name="thumbnail_key",length=300) String thumbnailKey;
    @Column(name="source_state",nullable=false,length=20) String sourceState;
    @Column(name="display_state",nullable=false,length=20) String displayState;
    @Column(name="thumbnail_state",nullable=false,length=20) String thumbnailState;
    @Column(name="checked_at",nullable=false) Instant checkedAt;
    protected AdminMediaCheck() {}
    AdminMediaCheck(MediaAssetEntity asset,String source,String display,String thumbnail) {
        assetId=asset.getId();sourceKey=asset.getStorageKey();displayKey=asset.getDisplayStorageKey();thumbnailKey=asset.getThumbnailStorageKey();
        sourceState=source;displayState=display;thumbnailState=thumbnail;checkedAt=Instant.now();
    }
    boolean matches(MediaAssetEntity asset) {
        return sourceKey.equals(asset.getStorageKey())&&Objects.equals(displayKey,asset.getDisplayStorageKey())&&Objects.equals(thumbnailKey,asset.getThumbnailStorageKey());
    }
}
