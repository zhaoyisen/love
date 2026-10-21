package com.lovenotes.server;

import com.lovenotes.server.config.LoveNotesProperties;
import org.junit.jupiter.api.Test;
import org.springframework.boot.context.properties.bind.Bindable;
import org.springframework.boot.context.properties.bind.Binder;
import org.springframework.boot.env.YamlPropertySourceLoader;
import org.springframework.boot.autoconfigure.web.ServerProperties;
import org.springframework.core.env.MapPropertySource;
import org.springframework.core.env.StandardEnvironment;
import org.springframework.core.io.ClassPathResource;

import java.io.IOException;
import java.time.Duration;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class ProductionConfigurationTest {
    private StandardEnvironment environment(Map<String, Object> values) throws IOException {
        var environment = new StandardEnvironment();
        environment.getPropertySources().remove(StandardEnvironment.SYSTEM_ENVIRONMENT_PROPERTY_SOURCE_NAME);
        environment.getPropertySources().remove(StandardEnvironment.SYSTEM_PROPERTIES_PROPERTY_SOURCE_NAME);
        environment.getPropertySources().addFirst(new MapPropertySource("test-environment", values));
        var loader = new YamlPropertySourceLoader();
        for (var source : loader.load("prod", new ClassPathResource("application-prod.yml"))) {
            environment.getPropertySources().addLast(source);
        }
        for (var source : loader.load("base", new ClassPathResource("application.yml"))) {
            environment.getPropertySources().addLast(source);
        }
        return environment;
    }

    @Test
    void bindsOperationalSettingsFromEnvironmentInsteadOfHardcodedDefaults() throws IOException {
        var environment = environment(Map.ofEntries(
                Map.entry("MYSQL_URL", "jdbc:mysql://test.invalid/db"),
                Map.entry("MYSQL_USERNAME", "test-user"),
                Map.entry("MYSQL_PASSWORD", "test-$-#-with space"),
                Map.entry("MYSQL_CONNECTION_TIMEOUT_MS", "7200"),
                Map.entry("REDIS_HOST", "redis.invalid"),
                Map.entry("WECHAT_APP_ID", "test-app"),
                Map.entry("WECHAT_APP_SECRET", "test-secret"),
                Map.entry("COS_BUCKET", "test-bucket"), Map.entry("COS_REGION", "test-region"),
                Map.entry("COS_SECRET_ID", "test-id"), Map.entry("COS_SECRET_KEY", "test-key"),
                Map.entry("TIMELINE_CURSOR_SECRET", "test-cursor-secret"),
                Map.entry("SESSION_ACCESS_TTL", "PT45M"),
                Map.entry("INVITATION_TTL", "PT12H"),
                Map.entry("IMAGE_MAX_BYTES", "123456"),
                Map.entry("VIDEO_MAX_BYTES", "654321"),
                Map.entry("VIDEO_MAX_DURATION_SECONDS", "91"),
                Map.entry("UPLOAD_CREDENTIAL_TTL_SECONDS", "900"),
                Map.entry("LOVE_NOTES_PET_MOMENT_GROWTH", "8"),
                Map.entry("ADMIN_MEDIA_WORKER_ENABLED", "false"),
                Map.entry("ADMIN_SESSION_TIMEOUT", "40m")
        ));
        var properties = Binder.get(environment).bind("love-notes", Bindable.of(LoveNotesProperties.class)).get();
        assertThat(properties.session().accessTtl()).isEqualTo(Duration.ofMinutes(45));
        assertThat(properties.invitation().ttl()).isEqualTo(Duration.ofHours(12));
        assertThat(properties.media().imageMaxBytes()).isEqualTo(123456);
        assertThat(properties.media().videoMaxBytes()).isEqualTo(654321);
        assertThat(properties.media().videoMaxDurationSeconds()).isEqualTo(91);
        assertThat(properties.media().uploadCredentialTtlSeconds()).isEqualTo(900);
        assertThat(properties.wechat().appId()).isEqualTo("test-app");
        assertThat(properties.timeline().cursorSecret()).isEqualTo("test-cursor-secret");
        assertThat(environment.getProperty("spring.datasource.password")).isEqualTo("test-$-#-with space");
        assertThat(environment.getProperty("spring.datasource.hikari.connection-timeout")).isEqualTo("7200");
        assertThat(environment.getProperty("love-notes.pet.moment-growth")).isEqualTo("8");
        assertThat(environment.getProperty("love-notes.admin.worker-enabled")).isEqualTo("false");
        assertThat(Binder.get(environment).bind("server", Bindable.of(ServerProperties.class)).get()
                .getServlet().getSession().getTimeout()).isEqualTo(Duration.ofMinutes(40));
    }

    @Test
    void productionSecretsHaveNoRealOrDevelopmentFallback() throws IOException {
        var environment = environment(Map.of());
        for (var key : new String[] { "spring.datasource.password", "love-notes.wechat.app-secret",
                "love-notes.storage.secret-key", "love-notes.timeline.cursor-secret" }) {
            assertThatThrownBy(() -> environment.getRequiredProperty(key)).isInstanceOf(IllegalArgumentException.class);
        }
    }
}
