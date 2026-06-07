job "holy-songs" {
  datacenters = ["${NOMAD_DATACENTERS}"]
  type        = "service"

  group "app" {
    count = 1

    network {
      port "http" {
        to = 8000
      }
    }

    service {
      name = "holy-songs"
      port = "http"

      tags = [
        "traefik.enable=true",
        "traefik.http.routers.holy-songs.rule=Host(`${HOLY_SONGS_DOMAIN}`)",
        "traefik.http.routers.holy-songs.entrypoints=${TRAEFIK_ENTRYPOINT}",
        "traefik.http.routers.holy-songs.tls=true",
        "traefik.http.routers.holy-songs.tls.certresolver=${TRAEFIK_CERT_RESOLVER}",
        "traefik.http.services.holy-songs.loadbalancer.server.port=8000",
      ]

      check {
        name     = "version"
        type     = "http"
        path     = "/api/version"
        interval = "30s"
        timeout  = "5s"
      }
    }

    task "app" {
      driver = "docker"

      config {
        image      = "${DEPLOY_REF}"
        ports      = ["http"]
        force_pull = true

        volumes = [
          "${CONTENT_REPO_HOST_PATH}:/app/content-repo",
        ]
      }

      env {
        SONGS_DIR                         = "/app/content-repo/songs"
        CONTENT_REPO_DIR                  = "/app/content-repo"
        SONGS_OUTPUT_DIR                  = "/app/dist/data"
        CORS_ORIGINS                      = "https://${HOLY_SONGS_DOMAIN}"
        HOLY_SONGS_ADMIN_TOKEN            = "${HOLY_SONGS_ADMIN_TOKEN}"
        GITHUB_TOKEN                      = "${GITHUB_TOKEN}"
        CONTENT_REPO_GIT_USER_NAME        = "${CONTENT_REPO_GIT_USER_NAME}"
        CONTENT_REPO_GIT_USER_EMAIL       = "${CONTENT_REPO_GIT_USER_EMAIL}"
        CONTENT_REPO_PUSH_REMOTE          = "${CONTENT_REPO_PUSH_REMOTE}"
        CONTENT_REPO_PUSH_BRANCH          = "${CONTENT_REPO_PUSH_BRANCH}"
      }

      resources {
        cpu    = 300
        memory = 512
      }
    }
  }
}
