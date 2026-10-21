package com.lovenotes.server.admin;

import jakarta.persistence.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;
import java.time.Instant;
import java.util.UUID;

@Entity @Table(name="admin_media_task")
public class AdminMediaTask {
    @Id @JdbcTypeCode(SqlTypes.BINARY) UUID id;
    @Column(name="account_id",nullable=false) @JdbcTypeCode(SqlTypes.BINARY) UUID accountId;
    @Column(nullable=false,length=20) String action;
    @Column(name="operator_name",nullable=false,length=60) String operatorName;
    @Column(name="selection_hash",nullable=false,length=64) String selectionHash;
    @Column(name="created_at",nullable=false) Instant createdAt;
    protected AdminMediaTask() {}
    AdminMediaTask(UUID id,UUID account,String action,String operator,String selectionHash) {
        this.id=id;accountId=account;this.action=action;operatorName=operator;this.selectionHash=selectionHash;createdAt=Instant.now();
    }
}
