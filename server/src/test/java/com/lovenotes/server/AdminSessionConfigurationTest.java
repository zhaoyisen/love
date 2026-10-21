package com.lovenotes.server;

import com.lovenotes.server.admin.AdminSession;
import com.lovenotes.server.compliance.InternalOperationGuard;
import com.lovenotes.server.config.LoveNotesProperties;
import jakarta.servlet.http.HttpServletRequest;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpSession;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.*;

class AdminSessionConfigurationTest {
    @Test
    void loginKeepsTheSessionTimeoutConfiguredByTheContainer() {
        var request = mock(HttpServletRequest.class);
        var session = new MockHttpSession();
        session.setMaxInactiveInterval(40 * 60);
        when(request.getHeader("X-Admin-Request")).thenReturn("1");
        when(request.getSession(true)).thenReturn(session);
        var config = new LoveNotesProperties(null, null, null, null, null, null,
                new LoveNotesProperties.Operations("test-hash"));

        new AdminSession(mock(InternalOperationGuard.class), config).login(request, "test-token", "operator");

        assertThat(session.getMaxInactiveInterval()).isEqualTo(40 * 60);
    }
}
