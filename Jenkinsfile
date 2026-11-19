pipeline {
    agent any

    environment {
        IMAGE_NAME = "notebook_api"
        CONTAINER_NAME = "notebook-api"
        APP_PORT = "4000"
        // Le .env de production (DATABASE_URL, JWT_SECRET, CLIENT_ORIGIN...) est stocké dans Jenkins :
        // Administrer Jenkins > Credentials > "Secret file" avec cet ID.
        ENV_CREDENTIALS_ID = "notebook-api-env"
        // Dossier du VPS où sont gardées les photos entre deux déploiements
        UPLOADS_VOLUME = "/opt/notebook/uploads"
        NETWORK = "notebook-network"
    }

    stages {
        stage('Docker Build') {
            steps {
                echo 'Construction de l\'image Docker...'
                sh 'docker build -t ${IMAGE_NAME}:latest .'
            }
        }

        stage('Deploy') {
            steps {
                echo 'Déploiement du conteneur...'
                script {
                    // 1. Arrêter et supprimer l'ancien conteneur s'il existe
                    sh "docker stop ${CONTAINER_NAME} || true"
                    sh "docker rm ${CONTAINER_NAME} || true"
                    
                    // 2. Lancer le nouveau conteneur
                    // Jenkins copie le .env secret dans un fichier temporaire ($API_ENV), supprimé après l'étape
                    withCredentials([file(credentialsId: env.ENV_CREDENTIALS_ID, variable: 'API_ENV')]) {
                        sh '''
                            docker run -d \
                            --name "$CONTAINER_NAME" \
                            --network "$NETWORK" \
                            -p "$APP_PORT:$APP_PORT" \
                            --env-file "$API_ENV" \
                            -e PORT="$APP_PORT" \
                            -v "$UPLOADS_VOLUME:/app/uploads" \
                            --restart unless-stopped \
                            "$IMAGE_NAME:latest"
                        '''
                    }
                }
            }
        }

        stage('Cleanup') {
            steps {
                echo 'Nettoyage des images inutilisées...'
                sh 'docker image prune -f'
            }
        }
    }

    post {
        success {
            echo '✅ Déploiement réussi !'
        }
        failure {
            echo '❌ Le déploiement a échoué. Vérifie les logs.'
        }
    }
}
