package com.lovenotes.server.domain;
import com.lovenotes.server.common.UuidV7;
import jakarta.persistence.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;
import java.util.UUID;
@Entity @Table(name="app_message_source")
public class AppMessageSourceEntity {
 @Id @JdbcTypeCode(SqlTypes.BINARY) private UUID id;
 @Column(name="message_id",nullable=false) @JdbcTypeCode(SqlTypes.BINARY) private UUID messageId;
 @Column(name="source_id",nullable=false) @JdbcTypeCode(SqlTypes.BINARY) private UUID sourceId;
 protected AppMessageSourceEntity(){}
 public AppMessageSourceEntity(UUID messageId,UUID sourceId){this.id=UuidV7.next();this.messageId=messageId;this.sourceId=sourceId;}
 public UUID getMessageId(){return messageId;} public UUID getSourceId(){return sourceId;}
}
