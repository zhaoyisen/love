pipeline {
    agent { label 'linux-docker' }

    options {
        timestamps()
        disableConcurrentBuilds()
        timeout(time: 30, unit: 'MINUTES')
        buildDiscarder(logRotator(numToKeepStr: '20'))
    }

    environment {
        COMPOSE_PROJECT_NAME = 'love-notes'
        DEPLOY_DIR = '/opt/love-notes'
    }

    stages {
        stage('Checkout') {
            steps {
                checkout scm
                script {
                    env.IMAGE_TAG = sh(
                        script: 'git rev-parse --short=12 HEAD',
                        returnStdout: true
                    ).trim()
                }
            }
        }

        stage('Verify toolchain') {
            steps {
                sh '''
                    set -eu
                    java -version
                    docker version
                    docker compose version
                '''
            }
        }

        stage('Mini Program checks') {
            steps {
                sh '''
                    set -eu
                    if [ -f /.dockerenv ]; then
                        docker run --rm \
                            --user "$(id -u):$(id -g)" \
                            --env HOME=/tmp \
                            --env npm_config_cache="$WORKSPACE/.npm" \
                            --volumes-from "$(hostname)" \
                            --workdir "$WORKSPACE" \
                            node:20-bookworm-slim \
                            sh -c 'npm ci --ignore-scripts && node --test scripts/test-deployment.cjs && npm run validate && npm run typecheck'
                    else
                        docker run --rm \
                            --user "$(id -u):$(id -g)" \
                            --env HOME=/tmp \
                            --env npm_config_cache=/workspace/.npm \
                            --volume "$WORKSPACE:/workspace" \
                            --workdir /workspace \
                            node:20-bookworm-slim \
                            sh -c 'npm ci --ignore-scripts && node --test scripts/test-deployment.cjs && npm run validate && npm run typecheck'
                    fi
                '''
            }
        }

        stage('Backend test') {
            steps {
                sh '''
                    set -eu
                    if [ -f /.dockerenv ]; then
                        docker run --rm \
                            --user "$(id -u):$(id -g)" \
                            --env HOME=/tmp \
                            --env MAVEN_CONFIG="$WORKSPACE/.m2" \
                            --volumes-from "$(hostname)" \
                            --workdir "$WORKSPACE/server" \
                            maven:3.9-eclipse-temurin-21 \
                            mvn -B -ntp -Dmaven.repo.local="$WORKSPACE/.m2/repository" clean verify
                    else
                        docker run --rm \
                            --user "$(id -u):$(id -g)" \
                            --env HOME=/tmp \
                            --env MAVEN_CONFIG=/workspace/.m2 \
                            --volume "$WORKSPACE:/workspace" \
                            --workdir /workspace/server \
                            maven:3.9-eclipse-temurin-21 \
                            mvn -B -ntp -Dmaven.repo.local=/workspace/.m2/repository clean verify
                    fi
                '''
            }
        }

        stage('Build image') {
            steps {
                sh '''
                    set -eu
                    docker build --tag "love-notes-server:${IMAGE_TAG}" server
                '''
            }
        }

        stage('Validate Compose') {
            steps {
                sh '''
                    set -eu
                    APP_ENV_FILE="$WORKSPACE/server/.env.example" IMAGE_TAG="${IMAGE_TAG}" docker compose \
                        --env-file server/.env.example \
                        config --quiet
                '''
            }
        }

        stage('Deploy production') {
            when {
                anyOf {
                    branch 'main'
                    expression {
                        env.GIT_BRANCH == 'origin/main' || env.GIT_BRANCH == 'main'
                    }
                }
            }
            steps {
                sh 'sh scripts/deploy-production.sh'
            }
        }
    }

    post {
        always {
            junit allowEmptyResults: true,
                testResults: 'server/target/surefire-reports/*.xml'
            archiveArtifacts allowEmptyArchive: true,
                artifacts: 'server/target/*.jar',
                fingerprint: true
        }
    }
}
