FROM eclipse-temurin:21-jre-jammy

RUN command -v bash >/dev/null \
    && command -v grep >/dev/null \
    && groupadd --gid 10001 app \
    && useradd --uid 10001 --gid app --no-create-home --shell /usr/sbin/nologin app

WORKDIR /app

COPY --chown=10001:10001 target/love-notes-server-*.jar /app/app.jar

USER 10001:10001

EXPOSE 8080

ENV SPRING_PROFILES_ACTIVE=prod \
    JAVA_TOOL_OPTIONS="-XX:MaxRAMPercentage=75.0 -Dfile.encoding=UTF-8 -Duser.timezone=UTC"

ENTRYPOINT ["java", "-jar", "/app/app.jar"]
