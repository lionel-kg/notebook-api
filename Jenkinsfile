pipeline {
    agent any

    environment {
        IMAGE_NAME = "notebook_api"
        CONTAINER_NAME = "notebook-api"
        APP_PORT = "4000"
        // Fichier .env de production présent sur le VPS (DATABASE_URL, JWT_SECRET, CLIENT_ORIGIN...)
        // À adapter au chemin réel sur ton serveur.
        ENV_FILE = "/opt/notebook/api.env"
        // Volume Docker où sont gardées les photos entre deux déploiements
        UPLOADS_VOLUME = "/opt/notebook/uploads"
        // Fichier présent sur le VPS avec POSTGRES_USER / POSTGRES_PASSWORD / POSTGRES_DB (voir deploy/db.env.example)
        DB_ENV_FILE = "/opt/notebook/db.env"
        NETWORK = "notebook-network"
    }

    stages {
        stage('Docker Build') {
            steps {
                echo 'Construction de l\'image Docker...'
                sh 'docker build -t ${IMAGE_NAME}:latest .'
            }
        }
        stage('Database') {
            steps {
                echo 'Démarrage de la base PostgreSQL...'
                // Crée le réseau partagé s'il n'existe pas encore
                sh 'docker network inspect ${NETWORK} >/dev/null 2>&1 || docker network create ${NETWORK}'
                // Ne recrée rien si la base tourne déjà ; attend qu'elle soit prête (healthcheck) avant de continuer.
                // Les données restent dans le volume notebook-pgdata.
                sh 'docker compose --env-file ${DB_ENV_FILE} up -d --wait'
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
                    // On passe le fichier .env présent sur le VPS
                    sh """
                        docker run -d \
                        --name ${CONTAINER_NAME} \
                        --network notebook-network \
                        -p ${APP_PORT}:${APP_PORT} \
                        --env-file ${ENV_FILE} \
                        -e PORT=${APP_PORT} \
                        -v ${UPLOADS_VOLUME}:/app/uploads \
                        --restart unless-stopped \
                        ${IMAGE_NAME}:latest
                    """
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
