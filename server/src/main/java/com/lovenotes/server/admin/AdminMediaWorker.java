package com.lovenotes.server.admin;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.slf4j.LoggerFactory;

@Component
@ConditionalOnProperty(name="love-notes.admin.worker-enabled",havingValue="true",matchIfMissing=true)
public class AdminMediaWorker {
    private final AdminMediaTasks tasks;
    public AdminMediaWorker(AdminMediaTasks tasks) {this.tasks=tasks;}
    @Scheduled(fixedDelayString="${ADMIN_MEDIA_POLL_MS:1000}")
    public void poll() {
        for(var id:tasks.pending()) {
            try {tasks.processItem(id);}
            catch(Exception error) {
                LoggerFactory.getLogger(getClass()).warn("Admin media task failed: item={}, type={}",id,error.getClass().getSimpleName());
                tasks.fail(id);
            }
        }
    }
}
