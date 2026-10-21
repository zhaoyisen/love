package com.lovenotes.server.admin;

import com.lovenotes.server.common.UuidV7;
import jakarta.persistence.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;
import java.time.Instant;
import java.util.UUID;

@Entity @Table(name="admin_media_task_item")
public class AdminMediaTaskItem {
    @Id @JdbcTypeCode(SqlTypes.BINARY) UUID id;
    @Column(name="task_id",nullable=false) @JdbcTypeCode(SqlTypes.BINARY) UUID taskId;
    @Column(name="asset_id",nullable=false) @JdbcTypeCode(SqlTypes.BINARY) UUID assetId;
    @Column(name="moment_id",nullable=false) @JdbcTypeCode(SqlTypes.BINARY) UUID momentId;
    @Column(nullable=false,length=20) String status;
    @Column(length=240) String message;
    @Column(name="updated_at",nullable=false) Instant updatedAt;
    protected AdminMediaTaskItem() {}
    AdminMediaTaskItem(UUID task,UUID asset,UUID moment) {id=UuidV7.next();taskId=task;assetId=asset;momentId=moment;status="PENDING";updatedAt=Instant.now();}
    void finish(String status,String message) {this.status=status;this.message=message;updatedAt=Instant.now();}
}
