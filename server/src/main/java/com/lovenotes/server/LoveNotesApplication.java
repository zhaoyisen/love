package com.lovenotes.server;

import com.lovenotes.server.config.LoveNotesProperties;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.scheduling.annotation.EnableScheduling;

@SpringBootApplication
@EnableConfigurationProperties(LoveNotesProperties.class)
@EnableScheduling
public class LoveNotesApplication {
    public static void main(String[] args) {
        SpringApplication.run(LoveNotesApplication.class, args);
    }
}
