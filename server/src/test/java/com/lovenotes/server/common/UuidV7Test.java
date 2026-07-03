package com.lovenotes.server.common;
import org.junit.jupiter.api.*;
class UuidV7Test {
    @Test void shouldGenerateVersionSevenVariantTwoUuid(){var id=UuidV7.next();Assertions.assertEquals(7,id.version());Assertions.assertEquals(2,id.variant());}
}
