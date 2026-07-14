package com.lovenotes.server.storage;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

class CosObjectStorageTest {
    @Test
    void shouldLimitTemporaryUploadCredentialToGeneratedMonthlyDirectory() {
        String key="original/user-123/2026/07/object-456.jpg";

        assertEquals("original/user-123/2026/07/*",CosObjectStorage.uploadScope(key));
    }

    @Test
    void shouldRejectStorageKeyWithoutDirectory() {
        assertThrows(IllegalArgumentException.class,()->CosObjectStorage.uploadScope("object.jpg"));
    }
}
