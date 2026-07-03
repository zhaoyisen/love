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
                    mvn -version
                    docker version
                    docker compose version
                '''
            }
        }

        stage('Backend test') {
            steps {
                dir('server') {
                    sh 'mvn -B -ntp clean verify'
                }
            }
        }

        stage('Build image') {
            steps {
                sh '''
                    set -eu
                    docker build --pull --tag "love-notes-server:${IMAGE_TAG}" server
                '''
            }
        }

        stage('Validate Compose') {
            steps {
                sh '''
                    set -eu
                    IMAGE_TAG="${IMAGE_TAG}" docker compose \
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
                withCredentials([file(credentialsId: 'love-notes-prod-env', variable: 'PROD_ENV_FILE')]) {
                    sh '''
                        set -eu
                        IMAGE_TAG="${IMAGE_TAG}" docker compose \
                            --env-file "${PROD_ENV_FILE}" \
                            config --quiet
                        IMAGE_TAG="${IMAGE_TAG}" docker compose \
                            --env-file "${PROD_ENV_FILE}" \
                            up -d --no-deps --remove-orphans \
                            --wait --wait-timeout 180 api
                        docker compose \
                            --env-file "${PROD_ENV_FILE}" \
                            ps api
                    '''
                }
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
